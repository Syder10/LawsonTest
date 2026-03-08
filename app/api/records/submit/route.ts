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
  "Labels Stock": "labels_stock_records",
}

const fieldNameToColumn: Record<string, string> = {
  // Blowing Department - Daily Records (Preform Usage)
  "Opening Stock (BAGS)": "opening_stock_bags",
  "Quantity Received (BAGS)": "quantity_received_bags",
  "Preforms Used (BAGS)": "preforms_used_bags",
  "Remaining Balance (BAGS)": "closing_stock_bags",
  "Total Produced": "total_produced",
  "WASTE (PCS)": "waste_pcs",
  "Final Production": "final_production",
  "Bottles Given Out": "bottles_given_out",

  // Alcohol and Blending - Daily Usage of Alcohol And Stock Level
  "Opening Stock Level": "opening_stock_level",
  "Quantity Received": "quantity_received",
  "Total Stock": "total_stock",
  "Quantity Used": "quantity_used",
  "Remaining Stock Level": "remaining_stock",
  Destination: "destination",

  // Alcohol and Blending - Daily Records for Alcohol and Blending
  "Number of Alcohol Transferred (DRUMS)": "alcohol_transferred_drums",
  "Number of Alcohol Transferred (LITRES)": "alcohol_transferred_litres",
  "Number of Finished Products Transferred (TANKS)": "finished_products_transferred_tanks",
  "Number of Finished Products Transferred (LITRES)": "finished_products_transferred_litres",
  "Number of Staff Used": "number_of_staff",
  "Hourly Work": "hourly_work",

  // Alcohol and Blending - Ginger Production
  "Quantity of Raw Ginger (BAGS)": "quantity_raw_ginger_bags",
  "Quantity of Grinded Ginger": "quantity_grinded_ginger",
  "Quantity of Alcohol Used (Tanks)": "alcohol_used_tanks",
  "Quantity of Alcohol Used (Litres)": "alcohol_used_litres",
  "Quantity of Finished Product Transferred (Tanks)": "finished_product_tanks",
  "Quantity of Finished Product Transferred (Litres)": "finished_product_litres",

  // Alcohol and Blending - Extraction Monitoring Records
  "Beginning Date": "beginning_date",
  "Tank Number": "tank_number",
  Time: "time",
  "Alcohol Percentage": "alcohol_percentage",
  "Expected Maturity Date": "expected_maturity_date",
  "Prepared By": "prepared_by",
  "Remarks (To be filled)": "remarks",

  // Filling Line - Filling Line Daily Records
  Product: "product",
  "Bottles Wasted": "bottles_wasted",
  "Bottles Rejected": "bottles_rejected",
  "Total Production": "total_production",

  // Packaging - Packaging Daily Records
  "Quantity Of Cartons Produced": "quantity_cartons_produced",
  "Number of Cartons Wasted": "number_cartons_wasted",
  "Quantity Of Cartons Loaded": "quantity_cartons_loaded",

  // Concentrate - Daily Records Alcohol For Concentrate
  "Number of Tanks (70)": "number_tanks_70",
  "Alcohol Used (L) (70)": "alcohol_used_70_litres",
  "Water (L) (70)": "water_70_litres",
  "Number of Tanks (80)": "number_tanks_80",
  "Alcohol Used (L) (80)": "alcohol_used_80_litres",
  "Water (L) (80)": "water_80_litres",
  "Total Alcohol Used (L)": "total_alcohol_used_litres",

  // Concentrate - Herbs Stock
  "Type of Herb": "herb_type",
  "Available Stock": "available_stock",
  "Qty Received": "quantity_received",
  "Total Qty": "total_quantity",
  "Qty Used": "quantity_used",
  "Remaining Qty": "remaining_quantity",
  "Checked By": "checked_by",

  // Common fields
  Remarks: "remarks",
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, supervisorName, shift, group, department, recordType, productType, formData } = body

    console.log("[v0] Submission received:", { recordType, productType, date, supervisorName })
    console.log("[v0] Form data object:", formData)

    // Using the SSR client internally to grab the requesting user ID securely
    const { createClient: createSSRClient } = require('@/lib/supabase/server')
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()

    // Fallback to service role client for the actual insert to bypass complex RLS rules for this legacy table set, but we now have the user ID securely authenticated.
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const table = recordTypeToTable[recordType]
    if (!table) {
      console.error("[v0] Invalid record type:", recordType)
      return NextResponse.json({ error: "Invalid record type" }, { status: 400 })
    }

    const dbData: Record<string, any> = {
      date,
      supervisor_name: supervisorName,
      shift,
      group_number: group,
      department,
      record_type: recordType,
      user_id: user?.id || null, // Injects the authenticated uuid into the submission
    }

    if (productType) {
      dbData.product = productType
    }

    if (formData && typeof formData === "object") {
      Object.entries(formData).forEach(([fieldName, value]) => {
        if (value === "" || value === null || value === undefined) return

        const columnName = fieldNameToColumn[fieldName]
        if (columnName) {
          if (typeof value === "string" && !isNaN(Number(value)) && value !== "") {
            dbData[columnName] = Number(value)
          } else {
            dbData[columnName] = value
          }
        } else {
          console.log("[v0] Unmapped field:", fieldName)
        }
      })
    }

    console.log("[v0] Inserting into table:", table)
    console.log("[v0] Data to insert:", JSON.stringify(dbData, null, 2))

    const { data, error } = await supabase.from(table).insert([dbData]).select()

    if (error) {
      console.error("[v0] Supabase error - Code:", error.code, "Message:", error.message, "Details:", error.details)
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    console.log("[v0] Successfully inserted record:", data)

    // ── Live Stock Update ────────────────────────────────────────────────────
    if (table === "packaging_daily_records" && dbData.product) {
      const productKey = dbData.product as string

      const produced = Number(dbData.quantity_cartons_produced) || 0
      const loaded = Number(dbData.quantity_cartons_loaded) || 0

      const { data: stockRow, error: fetchErr } = await supabase
        .from("packaging_live_stocks")
        .select("available_stock")
        .ilike("product", productKey)
        .maybeSingle()

      if (fetchErr) {
        console.error("[v0] Live stock fetch error:", fetchErr)
      } else {
        const currentStock = stockRow?.available_stock ?? 0
        const newStock = currentStock + produced - loaded

        const { error: upsertErr } = await supabase
          .from("packaging_live_stocks")
          .upsert(
            {
              product: productKey,
              available_stock: newStock,
              last_produced: produced,
              last_loaded: loaded,
              last_updated_at: new Date().toISOString(),
            },
            { onConflict: "product" }
          )

        if (upsertErr) {
          console.error("[v0] Live stock upsert error:", upsertErr)
        } else {
          console.log(`[v0] Live stock updated for ${productKey}: ${currentStock} + ${produced} - ${loaded} = ${newStock}`)
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[v0] API error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to save record" }, { status: 500 })
  }
}
