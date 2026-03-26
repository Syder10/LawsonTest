import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

const ALLOWED_TABLES = new Set([
  "blowing_daily_records", "alcohol_stock_level_records",
  "alcohol_blending_daily_records", "ginger_production_records",
  "extraction_monitoring_records", "caramel_stock_records",
  "filling_line_daily_records", "caps_stock_records",
  "labels_stock_records", "packaging_daily_records",
  "concentrate_alcohol_records", "herbs_stock_records",
])

export async function GET(request: NextRequest) {
  try {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: profile } = await ssrClient
      .from("profiles").select("role").eq("id", user.id).single()

    if (profile?.role !== "manager" && profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const table = new URL(request.url).searchParams.get("table")
    if (!table || !ALLOWED_TABLES.has(table)) {
      return NextResponse.json({ error: "Invalid table" }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get total count
    const { count } = await supabase
      .from(table).select("*", { count: "exact", head: true })

    // Get most recent record date
    const { data: latest } = await supabase
      .from(table).select("date").order("date", { ascending: false }).limit(1)

    return NextResponse.json({ count: count ?? 0, lastDate: latest?.[0]?.date ?? null })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
