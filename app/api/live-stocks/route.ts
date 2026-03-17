import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Read persistent live stock values from packaging_live_stocks.
    // available_stock is updated on every Packaging Daily Records submission.
    // Formula: new available_stock = current available_stock + quantity_produced - quantity_loaded
    const { data: rows, error } = await supabase
      .from("packaging_live_stocks")
      .select("product, available_stock, last_produced, last_loaded, last_updated_at, minimum_threshold")

    if (error) {
      console.error("[v0] Supabase error:", error)
      return NextResponse.json({ error: "Failed to fetch live stocks" }, { status: 500 })
    }

    const liveStocks: Record<string, any> = {
      bitters: { quantityProduced: 0, quantityLoaded: 0, available: 0, minimumThreshold: 0 },
      ginger:  { quantityProduced: 0, quantityLoaded: 0, available: 0, minimumThreshold: 0 },
    }

    rows?.forEach((row: any) => {
      const key = row.product?.toLowerCase()
      if (key === "bitters" || key === "ginger") {
        liveStocks[key] = {
          quantityProduced: row.last_produced   ?? 0,
          quantityLoaded:   row.last_loaded     ?? 0,
          available:        row.available_stock ?? 0,
          lastUpdatedAt:    row.last_updated_at ?? null,
          minimumThreshold: row.minimum_threshold ?? 0,
        }
      }
    })

    return NextResponse.json(liveStocks)
  } catch (error) {
    console.error("[v0] API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
