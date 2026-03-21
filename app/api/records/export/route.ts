import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { generateExcelWorkbook } from "@/lib/excel-generator"

// Department → record types + tables mapping
const DEPARTMENT_RECORDS: Record<string, { label: string; table: string }[]> = {
  "Blowing": [
    { label: "Daily Records (Preform Usage)",          table: "blowing_daily_records" },
  ],
  "Alcohol and Blending": [
    { label: "Daily Usage of Alcohol And Stock Level", table: "alcohol_stock_level_records" },
    { label: "Daily Records for Alcohol and Blending", table: "alcohol_blending_daily_records" },
    { label: "Ginger Production",                      table: "ginger_production_records" },
    { label: "Extraction Monitoring Records",          table: "extraction_monitoring_records" },
    { label: "Caramel Stock",                          table: "caramel_stock_records" },
  ],
  "Filling Line": [
    { label: "Filling Line Daily Records",             table: "filling_line_daily_records" },
    { label: "Caps Stock",                             table: "caps_stock_records" },
    { label: "Labels Stock",                           table: "labels_stock_records" },
  ],
  "Packaging": [
    { label: "Packaging Daily Records",                table: "packaging_daily_records" },
  ],
  "Concentrate": [
    { label: "Daily Records Alcohol For Concentrate",  table: "concentrate_alcohol_records" },
    { label: "Herbs Stock",                            table: "herbs_stock_records" },
  ],
}

const ALL_RECORDS = Object.values(DEPARTMENT_RECORDS).flat()

// Strip these internal columns from every exported row
const STRIP_COLUMNS = new Set(["user_id", "updated_at"])

async function fetchTableData(
  supabase: ReturnType<typeof createClient>,
  table: string,
  userId: string | null,
  startDate: string | null,
  endDate: string | null
) {
  try {
    let query = supabase
      .from(table)
      .select("*")
      .order("date",       { ascending: true })
      .order("created_at", { ascending: true })

    if (userId)    query = query.eq("user_id", userId)
    if (startDate) query = query.gte("date", startDate)
    if (endDate)   query = query.lte("date", endDate)

    const { data, error } = await query
    if (error) {
      console.error(`Error fetching ${table}:`, error.message)
      return []
    }

    // Strip internal columns
    return (data || []).map((row: Record<string, unknown>) => {
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) {
        if (!STRIP_COLUMNS.has(k)) clean[k] = v
      }
      return clean
    })
  } catch (err) {
    console.error(`Exception fetching ${table}:`, err)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedUserId  = searchParams.get("userId")
    const month            = searchParams.get("month") // YYYY-MM

    // Fetch caller's profile — need role AND department
    const { data: profile } = await ssrClient
      .from("profiles")
      .select("role, department, full_name")
      .eq("id", user.id)
      .single()

    const isManagerOrAdmin = profile?.role === "manager" || profile?.role === "admin"
    const userDepartment   = profile?.department as string | null

    // Supervisors are always locked to their own records
    const exportUserId = isManagerOrAdmin ? (requestedUserId || null) : user.id

    // Supervisors export only their department's tables; managers export all
    const recordsToExport = isManagerOrAdmin
      ? ALL_RECORDS
      : userDepartment && DEPARTMENT_RECORDS[userDepartment]
        ? DEPARTMENT_RECORDS[userDepartment]
        : ALL_RECORDS

    // Supervisors always get a month filter — default to current month if not supplied
    const effectiveMonth = month || (() => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    })()
    const resolvedMonth = isManagerOrAdmin ? month : effectiveMonth

    let startDate: string | null = null
    let endDate:   string | null = null
    if (resolvedMonth) {
      const [y, m] = resolvedMonth.split("-").map(Number)
      startDate = new Date(y, m - 1, 1).toISOString().split("T")[0]
      endDate   = new Date(y, m,     0).toISOString().split("T")[0]
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch only the relevant tables in parallel
    const results = await Promise.all(
      recordsToExport.map(({ table }) =>
        fetchTableData(supabase, table, exportUserId, startDate, endDate)
      )
    )

    const recordsByType: Record<string, any[]> = {}
    recordsToExport.forEach(({ label }, i) => {
      if (results[i].length > 0) recordsByType[label] = results[i]
    })

    if (Object.keys(recordsByType).length === 0) {
      return NextResponse.json(
        { error: "No records found for this period." },
        { status: 404 }
      )
    }

    // Generate .xlsx
    const workbook = await generateExcelWorkbook(recordsByType)
    const buffer   = await workbook.xlsx.writeBuffer()

    // e.g. lawson_john_mensah_2026-03.xlsx
    const nameSlug   = profile?.full_name
      ? profile.full_name.toLowerCase().replace(/\s+/g, "_")
      : "records"
    const periodSlug = resolvedMonth || new Date().toISOString().split("T")[0]
    const filename   = `lawson_${nameSlug}_${periodSlug}.xlsx`

    return new NextResponse(buffer as Buffer, {
      headers: {
        "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Export error:", error)
    return NextResponse.json({ error: "Failed to export records" }, { status: 500 })
  }
}
