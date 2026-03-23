import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

// ── Simple in-memory rate limiter: max 1 submission per user per 5 seconds ──
const lastSubmitTime = new Map<string, number>()
const RATE_LIMIT_MS = 20000

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

// Map each record type to the department it belongs to
const recordTypeToDepartment: Record<string, string> = {
  "Daily Records (Preform Usage)":          "Blowing",
  "Daily Usage of Alcohol And Stock Level": "Alcohol and Blending",
  "Daily Records for Alcohol and Blending": "Alcohol and Blending",
  "Ginger Production":                      "Alcohol and Blending",
  "Extraction Monitoring Records":          "Alcohol and Blending",
  "Caramel Stock":                          "Alcohol and Blending",
  "Filling Line Daily Records":             "Filling Line",
  "Caps Stock":                             "Filling Line",
  "Labels Stock":                           "Filling Line",
  "Packaging Daily Records":                "Packaging",
  "Daily Records Alcohol For Concentrate":  "Concentrate",
  "Herbs Stock":                            "Concentrate",
}

const fieldNameToColumn: Record<string, string> = {
  // Blowing Department
  "Opening Stock (BAGS)":           "opening_stock_bags",
  "Quantity Received (BAGS)":       "quantity_received_bags",
  "Preforms Used (BAGS)":           "preforms_used_bags",
  "Remaining Balance (BAGS)":       "closing_stock_bags",
  "Total Produced":                 "total_produced",
  "WASTE (PCS)":                    "waste_pcs",
  "Final Production":               "final_production",
  "Bottles Given Out":              "bottles_given_out",

  // Alcohol and Blending
  "Opening Stock Level":            "opening_stock_level",
  "Quantity Received":              "quantity_received",
  "Total Stock":                    "total_stock",
  "Quantity Used":                  "quantity_used",
  "Remaining Stock Level":          "remaining_stock",

  "Number of Alcohol Transferred (DRUMS)":              "alcohol_transferred_drums",
  "Number of Alcohol Transferred (LITRES)":             "alcohol_transferred_litres",
  "Number of Finished Products Transferred (TANKS)":    "finished_products_transferred_tanks",
  "Number of Staff Transferred (LITRES)":               "finished_products_transferred_litres",

  "Quantity of Raw Ginger (BAGS)":                      "quantity_raw_ginger_bags",
  "Quantity of Grinded Ginger":                         "quantity_grinded_ginger",
  "Quantity of Alcohol Used (Tanks)":                   "alcohol_used_tanks",
  "Quantity of Alcohol Used (Litres)":                  "alcohol_used_litres",
  "Quantity of Finished Product Transferred (Tanks)":   "finished_product_tanks",
  "Quantity of Finished Product Transferred (Litres)":  "finished_product_litres",

  "Beginning Date":                 "beginning_date",
  "Tank Number":                    "tank_number",
  "Time":                           "time",
  "Alcohol Percentage":             "alcohol_percentage",
  "Expected Maturity Date":         "expected_maturity_date",
  "Prepared By":                    "prepared_by",

  // Filling Line
  "Product":                        "product",
  "Bottles Wasted":                 "bottles_wasted",
  "Bottles Rejected":               "bottles_rejected",
  "Total Production":               "total_production",

  // Packaging
  "Quantity Of Cartons Produced":   "quantity_cartons_produced",
  "Number of Cartons Wasted":       "number_cartons_wasted",
  "Quantity Of Cartons Loaded":     "quantity_cartons_loaded",

  // Concentrate
  "Number of Tanks (70)":           "number_tanks_70",
  "Alcohol Used (L) (70)":          "alcohol_used_70_litres",
  "Water (L) (70)":                 "water_70_litres",
  "Number of Tanks (80)":           "number_tanks_80",
  "Alcohol Used (L) (80)":          "alcohol_used_80_litres",
  "Water (L) (80)":                 "water_80_litres",
  "Total Alcohol Used (L)":         "total_alcohol_used_litres",

  // Herbs Stock
  "Type of Herb":                   "herb_type",
  "Available Stock":                "available_stock",
  "Qty Received":                   "quantity_received",
  "Total Qty":                      "total_quantity",
  "Qty Used":                       "quantity_used",
  "Remaining Qty":                  "remaining_quantity",
  "Checked By":                     "checked_by",

  // Common
  "Number of Staff Used":           "number_of_staff",
  "Hourly Work":                    "hourly_work",
  "Destination":                    "destination",
  "Remarks":                        "remarks",
  "Remarks (To be filled)":         "remarks",
}

export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth check ──────────────────────────────────────────────────────────
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ── 2. Rate limit ──────────────────────────────────────────────────────────
    // We check here but only COMMIT the timestamp after a successful insert,
    // so that multi-tank submissions (Extraction) don't trip the limit mid-loop.
    const now = Date.now()
    const last = lastSubmitTime.get(user.id) ?? 0
    if (now - last < RATE_LIMIT_MS) {
      return NextResponse.json(
        { error: "Please wait a moment before submitting again." },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { date, supervisorName, shift, group, department, recordType, productType, formData } = body

    // ── 3. Validate record type ────────────────────────────────────────────────
    const table = recordTypeToTable[recordType]
    if (!table) {
      return NextResponse.json({ error: "Invalid record type" }, { status: 400 })
    }

    // ── 4. Department guard — supervisors can only submit for their own dept ───
    const { data: profile } = await ssrClient
      .from("profiles")
      .select("department, role")
      .eq("id", user.id)
      .single()

    const isManagerOrAdmin = profile?.role === "manager" || profile?.role === "admin"
    const allowedDept = profile?.department?.toLowerCase()
    const submittedDept = department?.toLowerCase()
    const expectedDept = recordTypeToDepartment[recordType]?.toLowerCase()

    if (!isManagerOrAdmin) {
      if (allowedDept && allowedDept !== submittedDept) {
        return NextResponse.json(
          { error: "You can only submit records for your own department." },
          { status: 403 }
        )
      }
      if (expectedDept && allowedDept && allowedDept !== expectedDept) {
        return NextResponse.json(
          { error: `This record type belongs to the ${recordTypeToDepartment[recordType]} department.` },
          { status: 403 }
        )
      }
    }

    // ── 5. Build the DB row ────────────────────────────────────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const dbData: Record<string, unknown> = {
      user_id:         user.id,
      date,
      supervisor_name: supervisorName,
      shift,
      group_number:    group,
      department,
      record_type:     recordType,
    }

    if (productType) dbData.product = productType

    if (formData && typeof formData === "object") {
      Object.entries(formData).forEach(([fieldName, value]) => {
        if (value === "" || value === null || value === undefined) return
        const columnName = fieldNameToColumn[fieldName]
        if (columnName) {
          dbData[columnName] =
            typeof value === "string" && !isNaN(Number(value)) && value !== ""
              ? Number(value)
              : value
        } else {
          console.log("[submit] Unmapped field:", fieldName)
        }
      })
    }

    const { data, error } = await supabase.from(table).insert([dbData]).select()

    if (error) {
      console.error("[submit] Supabase error:", error.message)
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    // Commit the rate limit timestamp only on success
    lastSubmitTime.set(user.id, now)

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[submit] API error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to save record" }, { status: 500 })
  }
}
