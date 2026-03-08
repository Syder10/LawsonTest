import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const RECORD_TYPE_TO_TABLE_MAP: Record<string, { table: string; closingField: string }> = {
  "Daily Records (Preform Usage)": {
    table: "blowing_daily_records",
    closingField: "closing_stock_bags",
  },
  "Daily Usage of Alcohol And Stock Level": {
    table: "alcohol_stock_level_records",
    closingField: "remaining_stock",
  },
  "Herbs Stock": {
    table: "herbs_stock_records",
    closingField: "remaining_quantity",
  },
  "Caramel Stock": {
    table: "caramel_stock_records",
    closingField: "remaining_stock",
  },
  "Caps Stock": {
    table: "caps_stock_records",
    closingField: "remaining_stock",
  },
  "Labels Stock": {
    table: "labels_stock_records",
    closingField: "remaining_stock",
  },
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const recordType = searchParams.get("recordType")
    const date = searchParams.get("date")
    const department = searchParams.get("department")
    const herbType = searchParams.get("herbType")
    // Used by Caramel Stock and Labels Stock to fetch per-product previous remaining
    const product = searchParams.get("product")

    console.log("[v0] Previous stock API called with:", { recordType, date, department, herbType, product })

    if (!recordType || !date) {
      return NextResponse.json(
        { error: "Missing required parameters: recordType and date" },
        { status: 400 }
      )
    }

    const tableMapping = RECORD_TYPE_TO_TABLE_MAP[recordType]
    if (!tableMapping) {
      console.log("[v0] Record type does not support stock tracking:", recordType)
      return NextResponse.json({
        hasPrevious: false,
        previousStock: null,
        message: "This record type does not track stock levels",
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let query = supabase
      .from(tableMapping.table)
      .select("*")
      .eq("record_type", recordType)
      .lte("date", date)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })

    // Filter by herb type for Herbs Stock
    if (recordType === "Herbs Stock" && herbType) {
      query = query.eq("herb_type", herbType)
    }

    // Filter by product for Caramel Stock and Labels Stock
    if ((recordType === "Caramel Stock" || recordType === "Labels Stock") && product) {
      query = query.eq("product", product)
    }

    const { data, error } = await query.limit(1)

    if (error) {
      console.error("[v0] Supabase error fetching previous stock:", error)

      if (error.code === "PGRST116" || error.message?.includes("does not exist")) {
        return NextResponse.json({
          hasPrevious: false,
          previousStock: null,
          message: "Database table not yet created. Please run the schema migration.",
        })
      }

      return NextResponse.json(
        { error: "Failed to fetch previous stock", details: error.message },
        { status: 500 }
      )
    }

    console.log("[v0] Query results:", data)

    if (!data || data.length === 0) {
      console.log("[v0] No previous records found")
      return NextResponse.json({
        hasPrevious: false,
        previousStock: null,
        message: "No previous records found. Manual input allowed.",
      })
    }

    const previousRecord = data[0]
    const closingStock = previousRecord[tableMapping.closingField]

    console.log("[v0] Found previous record:", {
      date: previousRecord.date,
      shift: previousRecord.shift,
      product: previousRecord.product,
      closingStock,
    })

    return NextResponse.json({
      hasPrevious: true,
      previousStock: closingStock,
      previousDate: previousRecord.date,
      previousShift: previousRecord.shift,
      message: "Previous stock retrieved successfully",
    })
  } catch (error) {
    console.error("[v0] Unexpected error in previous-stock API:", error)

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
        hasPrevious: false,
        previousStock: null,
      },
      { status: 500 }
    )
  }
}
