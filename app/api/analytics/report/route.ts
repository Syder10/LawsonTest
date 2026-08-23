import { NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { operatingDaysBetween, projectRunOut } from "@/lib/domain/operating-days"
import type { Product, Shift } from "@/lib/db/types"

// ============================================================================
// Comprehensive, filterable analytics report for the manager dashboard.
//
// Filters (query params): from, to (YYYY-MM-DD) or date (single day);
//   shift (Morning|Afternoon|Night), department, product (Bitters|Ginger).
//
// Returns: windowed production/usage totals, live finished-goods on hand, a
// per-day series, a per-shift breakdown, and a materials table with current
// stock and an operating-day run-out projection (avg burn / operating day, days
// left, and a projected run-out DATE — Mon–Sat, closed Sundays). Alert level is
// derived from operating-days-left. Managers/admins read all rows via RLS.
// ============================================================================

const RED_DAYS = 6 // ≤ ~1 working week
const AMBER_DAYS = 12 // ≤ ~2 working weeks

const STAMPS_PER_CARTON: Record<Product, number> = { Bitters: 9, Ginger: 6 }

type Level = "red" | "yellow" | "none"
const levelFromDays = (days: number | null): Level =>
  days === null ? "none" : days <= RED_DAYS ? "red" : days <= AMBER_DAYS ? "yellow" : "none"

const daysBetween = (from: string, to: string) =>
  Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1)

// Sum a numeric column.
function agg(rows: { date: string }[] | null, pick: (r: any) => number) {
  let sum = 0
  for (const r of rows ?? []) sum += pick(r) || 0
  return { sum }
}

export async function GET(request: Request) {
  const auth = await requireStaff()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const supabase = auth.ctx.supabase

  const url = new URL(request.url)
  const single = url.searchParams.get("date")
  const today = new Date().toISOString().slice(0, 10)
  const from = single || url.searchParams.get("from") || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  const to = single || url.searchParams.get("to") || today
  const shift = url.searchParams.get("shift") as Shift | null
  const department = url.searchParams.get("department")
  const product = url.searchParams.get("product") as Product | null

  // Apply the common window + optional shift/department filters to a query.
  const scope = (q: any, opts: { product?: boolean } = {}) => {
    q = q.gte("date", from).lte("date", to)
    if (shift) q = q.eq("shift", shift)
    if (department) q = q.eq("department", department)
    if (opts.product && product) q = q.eq("product", product)
    return q
  }

  // ── Fetch windowed rows ─────────────────────────────────────────────────
  const [pkgRes, alcRes, preRes, capsRes, labRes, carRes] = await Promise.all([
    scope(supabase.from("packaging_daily_records").select("date, shift, product, quantity_cartons_produced, quantity_cartons_loaded"), { product: true }),
    scope(supabase.from("stock_records").select("date, shift, quantity_used").eq("material", "alcohol")),
    scope(supabase.from("blowing_daily_records").select("date, shift, preforms_used_bags")),
    scope(supabase.from("stock_records").select("date, shift, quantity_used").eq("material", "caps")),
    scope(supabase.from("stock_records").select("date, shift, product, quantity_used").eq("material", "labels"), { product: true }),
    scope(supabase.from("stock_records").select("date, shift, product, quantity_used").eq("material", "caramel"), { product: true }),
  ])
  const pkg = pkgRes.data ?? []
  const bitters = pkg.filter((p: any) => p.product === "Bitters")
  const ginger = pkg.filter((p: any) => p.product === "Ginger")

  // ── Current remaining (as of today) via the derived-ledger balance ────────
  const remaining = async (material: string, prod?: Product) =>
    Number((await supabase.rpc("stock_remaining_asof", { p_material: material, p_date: today, p_product: prod ?? null, p_variant: null })).data ?? 0)
  const { data: preformRemainRaw } = await supabase.rpc("stock_remaining_asof", { p_material: "preform", p_date: today })
  const preformRemain = Number(preformRemainRaw ?? 0)

  const [alcRemain, capsRemain, labBitRemain, labGinRemain, carBitRemain, carGinRemain, cartonBitRemain, cartonGinRemain, stampRemain] = await Promise.all([
    remaining("alcohol"), remaining("caps"), remaining("labels", "Bitters"),
    remaining("labels", "Ginger"), remaining("caramel", "Bitters"), remaining("caramel", "Ginger"),
    remaining("carton", "Bitters"), remaining("carton", "Ginger"), remaining("tax_stamp"),
  ])

  const opDays = operatingDaysBetween(from, to)

  // ── Build a material row: remaining + operating-day run-out projection ─────
  const material = (key: string, label: string, unit: string, rem: number, used: { sum: number }) => {
    const ro = projectRunOut(rem, used.sum, opDays, today)
    return {
      key, label, unit, remaining: Math.round(rem * 100) / 100,
      usedInWindow: Math.round(used.sum * 100) / 100,
      avgPerDay: ro.avgPerOperatingDay, daysLeft: ro.operatingDaysLeft, runOutDate: ro.runOutDate,
      level: levelFromDays(ro.operatingDaysLeft),
    }
  }

  const stampUsed = {
    sum: bitters.reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0) * STAMPS_PER_CARTON.Bitters, 0)
       + ginger.reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0) * STAMPS_PER_CARTON.Ginger, 0),
  }

  const materials = [
    material("alcohol", "Alcohol", "litres", alcRemain, agg(alcRes.data, (r) => r.quantity_used)),
    material("preforms", "Preforms", "bags", preformRemain, agg(preRes.data, (r) => r.preforms_used_bags)),
    material("caps", "Caps", "pcs", capsRemain, agg(capsRes.data, (r) => r.quantity_used)),
    material("labels_bitters", "Labels — Bitters", "pcs", labBitRemain, agg((labRes.data ?? []).filter((r: any) => r.product === "Bitters"), (r) => r.quantity_used)),
    material("labels_ginger", "Labels — Ginger", "pcs", labGinRemain, agg((labRes.data ?? []).filter((r: any) => r.product === "Ginger"), (r) => r.quantity_used)),
    material("caramel_bitters", "Caramel — Bitters", "units", carBitRemain, agg((carRes.data ?? []).filter((r: any) => r.product === "Bitters"), (r) => r.quantity_used)),
    material("caramel_ginger", "Caramel — Ginger", "units", carGinRemain, agg((carRes.data ?? []).filter((r: any) => r.product === "Ginger"), (r) => r.quantity_used)),
    material("cartons_bitters", "Cartons — Bitters", "pcs", cartonBitRemain, agg(bitters, (r) => r.quantity_cartons_produced)),
    material("cartons_ginger", "Cartons — Ginger", "pcs", cartonGinRemain, agg(ginger, (r) => r.quantity_cartons_produced)),
    material("tax_stamp", "Tax Stamps", "pcs", stampRemain, stampUsed),
  ]

  // ── Per-day production series ──────────────────────────────────────────────
  const dayMap = new Map<string, { total: number; bitters: number; ginger: number }>()
  for (const r of pkg) {
    const d = dayMap.get(r.date) ?? { total: 0, bitters: 0, ginger: 0 }
    d.total += r.quantity_cartons_produced || 0
    if (r.product === "Bitters") d.bitters += r.quantity_cartons_produced || 0
    if (r.product === "Ginger") d.ginger += r.quantity_cartons_produced || 0
    dayMap.set(r.date, d)
  }
  const byDay = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }))

  // ── Per-shift breakdown ────────────────────────────────────────────────────
  const SHIFTS: Shift[] = ["Morning", "Afternoon", "Night"]
  const byShift = SHIFTS.map((s) => {
    const rows = pkg.filter((r: any) => r.shift === s)
    return {
      shift: s,
      total: rows.reduce((x: number, r: any) => x + (r.quantity_cartons_produced || 0), 0),
      bitters: rows.filter((r: any) => r.product === "Bitters").reduce((x: number, r: any) => x + (r.quantity_cartons_produced || 0), 0),
      ginger: rows.filter((r: any) => r.product === "Ginger").reduce((x: number, r: any) => x + (r.quantity_cartons_produced || 0), 0),
    }
  })

  // ── Live finished-goods on-hand (derived: Σ produced − Σ loaded, all-time) ─
  const { data: fg } = await supabase.rpc("finished_goods_stock")
  const finishedGoods = {
    bitters: fg?.find((r) => r.product === "Bitters")?.available ?? 0,
    ginger: fg?.find((r) => r.product === "Ginger")?.available ?? 0,
  }

  return NextResponse.json({
    filters: { from, to, shift: shift ?? null, department: department ?? null, product: product ?? null },
    windowDays: daysBetween(from, to),
    totals: {
      production_cartons: pkg.reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0),
      bitters_cartons: bitters.reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0),
      ginger_cartons: ginger.reduce((s: number, r: any) => s + (r.quantity_cartons_produced || 0), 0),
      cartons_loaded: pkg.reduce((s: number, r: any) => s + (r.quantity_cartons_loaded || 0), 0),
      alcohol_used: agg(alcRes.data, (r) => r.quantity_used).sum,
      preforms_used: agg(preRes.data, (r) => r.preforms_used_bags).sum,
    },
    finishedGoods,
    byDay,
    byShift,
    materials,
    thresholds: { redDays: RED_DAYS, amberDays: AMBER_DAYS },
    last_updated: new Date().toISOString(),
  })
}
