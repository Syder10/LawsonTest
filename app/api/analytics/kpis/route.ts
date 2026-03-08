import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const getEmptyKPIs = () => ({
  total_production_cartons: 0,
  bitters_cartons: 0,
  ginger_cartons: 0,
  total_alcohol_used_litres: 0,
  current_alcohol_balance: 0,
  current_preform_balance: 0,
  total_preforms_used: 0,
  alcohol_used_for_bitters_drums: 0,
  total_concentrate_used_litres: 0,
  total_spices_used_litres: 0,
  total_caramel_used_gallons: 0,
  total_water_litres: 0,
  alcohol_used_for_ginger_drums: 0,
  ginger_water_used_litres: 0,
  ginger_gt_juice_litres: 0,
  ginger_spices_used_litres: 0,
  ginger_caramel_used_gallons: 0,
  live_bitters_stock: 0,
  live_ginger_stock: 0,
  caps_remaining: 0,
  labels_bitters_remaining: 0,
  labels_ginger_remaining: 0,
  caramel_bitters_remaining: 0,
  caramel_ginger_remaining: 0,
  total_caps_used: 0,
  total_labels_bitters_used: 0,
  total_labels_ginger_used: 0,
  total_bottles_bitters: 0,
  total_bottles_ginger: 0,
  monthly_trend: [] as { month: string; total: number; bitters: number; ginger: number }[],
  last_updated: new Date().toISOString(),
})

export async function GET(request: Request) {
  try {
    console.log("[v0] Fetching KPIs from Supabase...")

    const url = new URL(request.url)
    const year = url.searchParams.get("year") ? Number(url.searchParams.get("year")) : undefined
    const month = url.searchParams.get("month") ? Number(url.searchParams.get("month")) : undefined

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error("[v0] Missing Supabase environment variables")
      return NextResponse.json(getEmptyKPIs())
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let startDateStr: string | undefined
    let endDateStr: string | undefined
    if (year && month) {
      startDateStr = new Date(year, month - 1, 1).toISOString().split("T")[0]
      endDateStr = new Date(year, month, 0).toISOString().split("T")[0]
    }

    const applyDateFilter = (q: any) =>
      startDateStr && endDateStr ? q.gte("date", startDateStr).lte("date", endDateStr) : q

    // Packaging
    const { data: packaging } = await applyDateFilter(
      supabase.from("packaging_daily_records").select("quantity_cartons_produced, quantity_cartons_loaded, product, date")
    )
    const total_production = packaging?.reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0) || 0
    const bitters_cartons = packaging?.filter((r: any) => r.product === "Bitters").reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0) || 0
    const ginger_cartons = packaging?.filter((r: any) => r.product === "Ginger").reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0) || 0
    const total_bottles_bitters = bitters_cartons * 12
    const total_bottles_ginger = ginger_cartons * 12

    // Alcohol
    const { data: alcoholStock } = await applyDateFilter(
      supabase.from("alcohol_stock_level_records").select("quantity_used, date")
    )
    const total_alcohol_used = alcoholStock?.reduce((s: number, r: any) => s + (r.quantity_used || 0), 0) || 0

    const { data: currentAlcohol } = await supabase
      .from("alcohol_stock_level_records")
      .select("remaining_stock")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
    const current_alcohol_balance = currentAlcohol?.[0]?.remaining_stock || 0

    // Preforms
    const { data: currentPreform } = await supabase
      .from("blowing_daily_records")
      .select("closing_stock_bags")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
    const current_preform_balance = currentPreform?.[0]?.closing_stock_bags || 0

    const { data: preforms } = await applyDateFilter(
      supabase.from("blowing_daily_records").select("preforms_used_bags, date")
    )
    const total_preforms_used = preforms?.reduce((s: number, r: any) => s + (r.preforms_used_bags || 0), 0) || 0

    // Live packaging stocks
    const { data: liveStocks } = await supabase
      .from("packaging_live_stocks")
      .select("product, available_stock")
    const live_bitters_stock = liveStocks?.find((r: any) => r.product?.toLowerCase() === "bitters")?.available_stock || 0
    const live_ginger_stock = liveStocks?.find((r: any) => r.product?.toLowerCase() === "ginger")?.available_stock || 0

    // Caps
    const { data: capsLatest } = await supabase
      .from("caps_stock_records")
      .select("remaining_stock")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
    const caps_remaining = capsLatest?.[0]?.remaining_stock || 0

    const { data: capsUsed } = await applyDateFilter(
      supabase.from("caps_stock_records").select("quantity_used, date")
    )
    const total_caps_used = capsUsed?.reduce((s: number, r: any) => s + (r.quantity_used || 0), 0) || 0

    // Labels
    const { data: labelsBittersLatest } = await supabase
      .from("labels_stock_records")
      .select("remaining_stock")
      .ilike("product", "Bitters")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
    const labels_bitters_remaining = labelsBittersLatest?.[0]?.remaining_stock || 0

    const { data: labelsGingerLatest } = await supabase
      .from("labels_stock_records")
      .select("remaining_stock")
      .ilike("product", "Ginger")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
    const labels_ginger_remaining = labelsGingerLatest?.[0]?.remaining_stock || 0

    const { data: labelsUsed } = await applyDateFilter(
      supabase.from("labels_stock_records").select("quantity_used, product, date")
    )
    const total_labels_bitters_used = labelsUsed?.filter((r: any) => r.product?.toLowerCase() === "bitters").reduce((s: number, r: any) => s + (r.quantity_used || 0), 0) || 0
    const total_labels_ginger_used = labelsUsed?.filter((r: any) => r.product?.toLowerCase() === "ginger").reduce((s: number, r: any) => s + (r.quantity_used || 0), 0) || 0

    // Caramel
    const { data: caramelBittersLatest } = await supabase
      .from("caramel_stock_records")
      .select("remaining_stock")
      .ilike("product", "Bitters")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
    const caramel_bitters_remaining = caramelBittersLatest?.[0]?.remaining_stock || 0

    const { data: caramelGingerLatest } = await supabase
      .from("caramel_stock_records")
      .select("remaining_stock")
      .ilike("product", "Ginger")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
    const caramel_ginger_remaining = caramelGingerLatest?.[0]?.remaining_stock || 0

    // Monthly trend — last 6 months
    const now = new Date()
    const monthly_trend: { month: string; total: number; bitters: number; ginger: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mStart = d.toISOString().split("T")[0]
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0]
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" })
      const { data: mPkg } = await supabase
        .from("packaging_daily_records")
        .select("quantity_cartons_produced, product")
        .gte("date", mStart)
        .lte("date", mEnd)
      const mTotal = mPkg?.reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0) || 0
      const mBitters = mPkg?.filter((r: any) => r.product === "Bitters").reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0) || 0
      const mGinger = mPkg?.filter((r: any) => r.product === "Ginger").reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0) || 0
      monthly_trend.push({ month: label, total: mTotal, bitters: mBitters, ginger: mGinger })
    }

    // Derived material metrics
    const alcohol_used_for_bitters = bitters_cartons * 0.01
    const total_concentrate = bitters_cartons * 2
    const total_spices = bitters_cartons * 0.1
    const total_caramel = bitters_cartons * 0.002
    const total_water = bitters_cartons * 4.36
    const alcohol_used_for_ginger = (ginger_cartons * 2.7) / 250
    const ginger_water = ginger_cartons * 5.1165
    const ginger_gt_juice = ginger_cartons * 1.08
    const ginger_spices = ginger_cartons * 0.09
    const ginger_caramel = (ginger_cartons * 0.0135) / 20

    const kpis = {
      total_production_cartons: Math.round(total_production),
      bitters_cartons: Math.round(bitters_cartons),
      ginger_cartons: Math.round(ginger_cartons),
      total_alcohol_used_litres: Math.round(total_alcohol_used * 100) / 100,
      current_alcohol_balance: Math.round(current_alcohol_balance * 100) / 100,
      current_preform_balance: Math.round(current_preform_balance),
      total_preforms_used: Math.round(total_preforms_used),
      alcohol_used_for_bitters_drums: Math.round(alcohol_used_for_bitters * 100) / 100,
      total_concentrate_used_litres: Math.round(total_concentrate * 100) / 100,
      total_spices_used_litres: Math.round(total_spices * 100) / 100,
      total_caramel_used_gallons: Math.round(total_caramel * 100) / 100,
      total_water_litres: Math.round(total_water * 100) / 100,
      alcohol_used_for_ginger_drums: Math.round(alcohol_used_for_ginger * 100) / 100,
      ginger_water_used_litres: Math.round(ginger_water * 100) / 100,
      ginger_gt_juice_litres: Math.round(ginger_gt_juice * 100) / 100,
      ginger_spices_used_litres: Math.round(ginger_spices * 100) / 100,
      ginger_caramel_used_gallons: Math.round(ginger_caramel * 100) / 100,
      live_bitters_stock: Math.round(live_bitters_stock),
      live_ginger_stock: Math.round(live_ginger_stock),
      caps_remaining: Math.round(caps_remaining),
      labels_bitters_remaining: Math.round(labels_bitters_remaining),
      labels_ginger_remaining: Math.round(labels_ginger_remaining),
      caramel_bitters_remaining: Math.round(caramel_bitters_remaining),
      caramel_ginger_remaining: Math.round(caramel_ginger_remaining),
      total_caps_used: Math.round(total_caps_used),
      total_labels_bitters_used: Math.round(total_labels_bitters_used),
      total_labels_ginger_used: Math.round(total_labels_ginger_used),
      total_bottles_bitters: Math.round(total_bottles_bitters),
      total_bottles_ginger: Math.round(total_bottles_ginger),
      monthly_trend,
      last_updated: new Date().toISOString(),
    }

    console.log("[v0] KPIs calculated successfully")
    return NextResponse.json(kpis)
  } catch (error) {
    console.error("[v0] Error fetching KPIs:", error)
    return NextResponse.json(getEmptyKPIs())
  }
}
