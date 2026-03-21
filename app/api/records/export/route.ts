import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { generateExcelWorkbook } from "@/lib/excel-generator"

const recordTypeToTable: Record<string, string> = {
  "Daily Records (Preform Usage)":          "blowing_daily_records",
  "Daily Usage of Alcohol And Stock Level": "alcohol_stock_level_records",
  "Daily Records for Alcohol and Blending": "alcohol_blending_daily_records",
  "Ginger Production":                      "ginger_production_records",
  "Extraction Monitoring Records":          "extraction_monitoring_records",
  "Filling Line Daily Records":             "filling_line_daily_records",
  "Packaging Daily Records":                "packaging_daily_records",
  "Daily Records Alcohol For Concentrate":  "concentrate_alcohol_records",
  "Herbs Stock":                            "herbs_stock_records",
  "Caramel Stock":                          "caramel_stock_records",
  "Caps Stock":                             "caps_stock_records",
  "Labels Stock":                           "labels_stock_records",
}

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
      .order("date",       { ascending: false })
      .order("created_at", { ascending: false })

    if (userId) query = query.eq("user_id", userId)
    if (startDate) query = query.gte("date", startDate)
    if (endDate)   query = query.lte("date", endDate)

    const { data, error } = await query
    if (error) {
      console.error(`Error fetching ${table}:`, error.message)
      return []
    }
    return data || []
  } catch (err) {
    console.error(`Exception fetching ${table}:`, err)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    // Auth check — only logged-in users can export
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get("userId")
    const month           = searchParams.get("month") // format: YYYY-MM

    // Managers/admins can export anyone; supervisors only their own data
    const { data: profile } = await ssrClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const isManagerOrAdmin = profile?.role === "manager" || profile?.role === "admin"
    const exportUserId = isManagerOrAdmin
      ? (requestedUserId || null)   // null = all users
      : user.id                      // supervisors always get own data only

    let startDate: string | null = null
    let endDate: string | null = null
    if (month) {
      const [y, m] = month.split("-").map(Number)
      startDate = new Date(y, m - 1, 1).toISOString().split("T")[0]
      endDate   = new Date(y, m,     0).toISOString().split("T")[0]
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch all tables in parallel
    const entries  = Object.entries(recordTypeToTable)
    const results  = await Promise.all(
      entries.map(([, table]) => fetchTableData(supabase, table, exportUserId, startDate, endDate))
    )

    const recordsByType: Record<string, any[]> = {}
    entries.forEach(([recordType], i) => {
      if (results[i].length > 0) recordsByType[recordType] = results[i]
    })

    if (Object.keys(recordsByType).length === 0) {
      return NextResponse.json({ error: "No records found for this period." }, { status: 404 })
    }

    // Generate real .xlsx file
    const workbook = await generateExcelWorkbook(recordsByType)
    const buffer   = await workbook.xlsx.writeBuffer()

    const label    = month ? `_${month}` : ""
    const filename = `lawson_production_records${label}_${new Date().toISOString().split("T")[0]}.xlsx`

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
