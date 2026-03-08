import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

const recordTypeToTable: Record<string, string> = {
  "Daily Records (Preform Usage)": "blowing_daily_records",
  "Daily Usage of Alcohol And Stock Level": "alcohol_stock_level_records",
}

const tableToClosingField: Record<string, string> = {
  blowing_daily_records: "closing_stock_bags",
  alcohol_stock_level_records: "remaining_stock",
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const recordType = searchParams.get("recordType")
    const product = searchParams.get("product")

    if (!recordType) {
      return NextResponse.json({ error: "Record type is required" }, { status: 400 })
    }

    const table = recordTypeToTable[recordType]
    if (!table) {
      return NextResponse.json({ error: "No stock tracking for this record type" }, { status: 400 })
    }

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    let query = supabase.from(table).select("*").order("created_at", { ascending: false }).limit(1)

    if (product && product !== "default") {
      query = query.eq("product", product)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const lastRecord = data?.[0]
    const closingField = tableToClosingField[table]

    return NextResponse.json({
      previousClosingStock: lastRecord ? lastRecord[closingField] : null,
      lastRecordDate: lastRecord ? lastRecord.date : null,
    })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
