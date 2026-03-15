import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

const recordTypeToTable: Record<string, string> = {
  "Daily Records (Preform Usage)": "blowing_daily_records",
  "Daily Usage of Alcohol And Stock Level": "alcohol_stock_level_records",
  "Daily Records for Alcohol and Blending": "alcohol_blending_daily_records",
  "Ginger Production": "ginger_production_records",
  "Extraction Monitoring Records": "extraction_monitoring_records",
  "Filling Line Daily Records": "filling_line_daily_records",
  "Packaging Daily Records": "packaging_daily_records",
  "Daily Records Alcohol For Concentrate": "concentrate_alcohol_records",
  "Herbs Stock": "herbs_stock_records",
  "Caramel Stock": "caramel_stock_records",
  "Caps Stock": "caps_stock_records",
  "Labels Stock": "labels_stock_records"
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return ""

  const headers = Object.keys(data[0])
  const csvHeaders = headers
    .map((h) =>
      h
        .replace(/_/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(",")

  const csvRows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header]
        if (value === null || value === undefined) return ""
        if (typeof value === "string" && value.includes(",")) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      })
      .join(","),
  )

  return [csvHeaders, ...csvRows].join("\n")
}

async function fetchTableData(supabase: any, table: string, userId: string | null, startDate: string | null, endDate: string | null) {
  try {
    let query = supabase.from(table).select("*, profiles ( supervisor_id, full_name, email )").order("created_at", { ascending: false })

    if (userId) {
      query = query.eq('user_id', userId)
    }

    if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate)
    }

    const { data, error } = await query

    if (error) {
      console.error(`Error fetching from ${table}:`, error.message)
      return []
    }

    // Map data to gently hoist the supervisor_id from the joined profiles table
    return (data || []).map((row: any) => {
      const { profiles, ...rest } = row
      
      let supervisorId = ""
      if (profiles) {
        // Fallback to email prefix if supervisor_id is missing
        supervisorId = profiles.supervisor_id || (profiles.email ? profiles.email.split('@')[0] : '')
      }
      
      // We replace user_id with our preferred short identifier
      delete rest.user_id
      return {
        "Supervisor ID": supervisorId,
        ...rest
      }
    })
  } catch (err) {
    console.error(`Exception fetching from ${table}:`, err)
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('userId')
    const monthStr = searchParams.get('month') // e.g. "2023-10"

    let startDate = null
    let endDate = null

    if (monthStr) {
      const [year, month] = monthStr.split('-')
      if (year && month) {
        startDate = `${year}-${month}-01`
        // Get last day of month
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate()
        endDate = `${year}-${month}-${lastDay}`
      }
    }

    const allData: Record<string, any[]> = {}
    let totalRecords = 0

    for (const [recordType, table] of Object.entries(recordTypeToTable)) {
      const data = await fetchTableData(supabase, table, userId, startDate, endDate)
      if (data.length > 0) {
        allData[recordType] = data
        totalRecords += data.length
      }
    }

    let excelContent = "PRODUCTION RECORDS EXPORT\n"
    excelContent += `Date Generated: ${new Date().toLocaleString()}\n`
    if (userId) excelContent += `Filtered by User ID: ${userId}\n`
    if (monthStr) excelContent += `Filtered by Month: ${monthStr}\n`
    excelContent += `Total Records: ${totalRecords}\n\n`

    excelContent += "SUMMARY BY RECORD TYPE\n"
    excelContent += "Record Type,Count\n"
    for (const [recordType, data] of Object.entries(allData)) {
      excelContent += `"${recordType}",${data.length}\n`
    }
    excelContent += "\n\n"

    for (const [recordType, data] of Object.entries(allData)) {
      excelContent += `\n\n${"=".repeat(100)}\n`
      excelContent += `${recordType} (${data.length} records)\n`
      excelContent += `${"=".repeat(100)}\n\n`
      excelContent += convertToCSV(data)
      excelContent += "\n"
    }

    const buffer = Buffer.from(excelContent, "utf-8")

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="production_records_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error("Export error:", error)
    return NextResponse.json({ error: "Failed to export records" }, { status: 500 })
  }
}

