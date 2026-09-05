import { NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { bomFor } from "@/lib/domain/bom"
import { operatingDaysBetween } from "@/lib/domain/operating-days"
import { settingsFromRow } from "@/lib/domain/settings"
import { buildMaterialStatus, THRESHOLD_PAYLOAD, type MaterialStatus } from "@/lib/domain/stock-status"
import type { DepartmentReport, KpiValue, OverviewReport } from "@/lib/domain/analytics-contract"
import {
  allMaterials,
  columnsFor,
  deptMetrics,
  evaluate,
  sourceTables,
  trendSeries,
  type DeptMaterial,
} from "@/lib/domain/dept-metrics"
import { SHIFT_ORDER } from "@/lib/shift-config"
import type { Product, Shift } from "@/lib/db/types"

// ============================================================================
// Filterable analytics for the manager dashboard.
//
// TWO SCOPES, one endpoint:
//
//   no department  -> "overview": company-wide production, finished goods, and
//                     every ledger material.
//   a department   -> "department": THAT department's own metrics and only the
//                     materials it is responsible for.
//
// WHY THE SCOPES DIFFER
// ---------------------
// `department` PARTITIONS the data, it does not slice it: each record type belongs
// to exactly one department. The previous version applied `.eq("department", …)`
// to every query, so selecting (say) Blowing zeroed out packaging cartons, alcohol,
// caps, labels and caramel, while `remaining` and `finishedGoods` stayed global.
// Every material then reported usedInWindow 0 -> avgPerDay 0 -> daysLeft null ->
// level "none", i.e. "no risk", for materials that were actually being consumed.
// A half-empty, internally inconsistent dashboard for 4 of the 5 departments.
//
// What each department measures, which tables it owns and which materials it
// carries all come from lib/domain/dept-metrics — the single registry, which
// derives table membership from the record-type registry. The response shape lives
// in lib/domain/analytics-contract, shared with the components that read it.
// ============================================================================

const daysBetween = (from: string, to: string) =>
  Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1)

type Row = Record<string, unknown>
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0)

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
  const departmentParam = url.searchParams.get("department")
  const product = url.searchParams.get("product") as Product | null
  const opDays = operatingDaysBetween(from, to)

  const filters = {
    from,
    to,
    shift: shift ?? null,
    department: departmentParam ?? null,
    product: product ?? null,
  }
  const common = {
    filters,
    windowDays: daysBetween(from, to),
    operatingDaysInWindow: opDays,
    thresholds: THRESHOLD_PAYLOAD,
    last_updated: new Date().toISOString(),
  }

  // Current balance for a ledger material, via the derived-ledger RPC. Coerced
  // with Number(): PostgREST serialises numeric as a STRING, which would break
  // the arithmetic downstream.
  const remaining = async (material: string, prod?: Product | null, variant?: string | null) =>
    Number(
      (
        await supabase.rpc("stock_remaining_asof", {
          p_material: material,
          p_date: today,
          p_product: prod ?? null,
          p_variant: variant ?? null,
        })
      ).data ?? 0,
    )

  // Windowed movement totals for a ledger material, plus the dates that actually
  // recorded consumption — the burn rate is measured over the span those dates cover,
  // not over every Mon–Sat in the filter window (see usageSpanOperatingDays).
  const movement = async (m: DeptMaterial): Promise<{ used: number; received: number; usedOn: string[] }> => {
    if (m.material === "preform") {
      let q = supabase
        .from("blowing_daily_records")
        .select("date, quantity_received_bags, preforms_used_bags")
        .gte("date", from)
        .lte("date", to)
      if (shift) q = q.eq("shift", shift)
      const rows = ((await q).data ?? []) as Row[]
      return {
        used: rows.reduce((s, r) => s + num(r.preforms_used_bags), 0),
        received: rows.reduce((s, r) => s + num(r.quantity_received_bags), 0),
        usedOn: rows.filter((r) => num(r.preforms_used_bags) > 0).map((r) => String(r.date)),
      }
    }

    // tax_stamp / carton are never recorded as used — consumption is DERIVED from
    // cartons produced × packaging_bom. Mirror that here so "used in window" and
    // the balance agree.
    if (m.material === "tax_stamp" || m.material === "carton") {
      let q = supabase
        .from("packaging_daily_records")
        .select("date, product, quantity_cartons_produced")
        .gte("date", from)
        .lte("date", to)
      if (shift) q = q.eq("shift", shift)
      if (m.product) q = q.eq("product", m.product)
      const rows = ((await q).data ?? []) as Row[]
      const { data: bom } = await supabase.from("packaging_bom").select("product, stamps_per_carton, cartons_per_carton")
      const rate = (p: unknown) => {
        const row = (bom ?? []).find((b) => b.product === p)
        if (!row) return 0
        return m.material === "tax_stamp" ? num(row.stamps_per_carton) : num(row.cartons_per_carton)
      }
      return {
        used: rows.reduce((s, r) => s + num(r.quantity_cartons_produced) * rate(r.product), 0),
        received: 0, // receipts are logged in raw_materials_received, not here
        usedOn: rows.filter((r) => num(r.quantity_cartons_produced) > 0).map((r) => String(r.date)),
      }
    }

    let q = supabase
      .from("stock_records")
      .select("date, quantity_received, quantity_used")
      .eq("material", m.material)
      .gte("date", from)
      .lte("date", to)
    if (shift) q = q.eq("shift", shift)
    if (m.product) q = q.eq("product", m.product)
    if (m.perVariant) {
      // Herb rows are per variant; the tile aggregates them.
    }
    const rows = ((await q).data ?? []) as Row[]
    return {
      used: rows.reduce((s, r) => s + num(r.quantity_used), 0),
      received: rows.reduce((s, r) => s + num(r.quantity_received), 0),
      usedOn: rows.filter((r) => num(r.quantity_used) > 0).map((r) => String(r.date)),
    }
  }

  // The admin-editable forecast, read once for the whole report. A missing row (0006
  // not applied) degrades to the confirmed defaults rather than zeroing every rate.
  const [settingsRes, recipesRes] = await Promise.all([
    supabase.from("app_settings").select("*").maybeSingle(),
    supabase.from("product_recipes").select("product, ingredient, label, litres_per_carton, display_order"),
  ])
  const settings = settingsFromRow(settingsRes.data, recipesRes.data)
  const configuredBom = bomFor(settings)

  const materialStatus = async (m: DeptMaterial): Promise<MaterialStatus> => {
    const [rem, mv] = await Promise.all([remaining(m.material, m.product ?? null), movement(m)])
    return buildMaterialStatus({
      key: m.key,
      label: m.label,
      unit: m.unit,
      remaining: rem,
      usedInWindow: mv.used,
      usageDates: mv.usedOn,
      windowEnd: to,
      fromISO: today,
      settings,
    })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DEPARTMENT SCOPE
  // ══════════════════════════════════════════════════════════════════════════
  const def = departmentParam ? deptMetrics(departmentParam) : undefined
  if (departmentParam && def) {
    const tables = sourceTables(def.department)

    // Fetch each owned table ONCE with just the columns its KPIs need.
    const perTable = new Map<string, Row[]>()
    await Promise.all(
      tables.map(async (table) => {
        const cols = columnsFor(def.department, table)
        if (cols.length === 0) {
          perTable.set(table, [])
          return
        }
        const select = ["date", "shift", ...cols].join(", ")
        let q = (supabase.from(table) as any).select(select).gte("date", from).lte("date", to)
        // Every production table stamps `department`, so scoping by it is correct
        // HERE — unlike the old code, which applied it to unrelated tables too.
        q = q.eq("department", def.department)
        if (shift) q = q.eq("shift", shift)
        if (def.productSplit && product) q = q.eq("product", product)
        const { data } = await q
        perTable.set(table, (data ?? []) as Row[])
      }),
    )

    const kpis: KpiValue[] = def.kpis.map((kpi) => {
      const rows = perTable.get(kpi.table) ?? []
      const sums: Record<string, number> = {}
      for (const r of rows) {
        for (const [k, v] of Object.entries(r)) {
          if (k === "date" || k === "shift") continue
          sums[k] = (sums[k] ?? 0) + num(v)
        }
      }
      return {
        key: kpi.key,
        label: kpi.label,
        unit: kpi.unit,
        value: evaluate(kpi.compute, sums, rows.length),
        goodDirection: kpi.goodDirection,
        hint: kpi.hint,
      }
    })

    // Per-day / per-shift series from THIS department's own trend measure.
    const trend = trendSeries(def.department)
    const trendRows = trend ? (perTable.get(trend.table) ?? []) : []
    const dayMap = new Map<string, { total: number; bitters: number; ginger: number }>()
    for (const r of trendRows) {
      const date = String(r.date)
      const v = trend ? num(r[trend.column]) : 0
      const d = dayMap.get(date) ?? { total: 0, bitters: 0, ginger: 0 }
      d.total += v
      if (def.productSplit && r.product === "Bitters") d.bitters += v
      if (def.productSplit && r.product === "Ginger") d.ginger += v
      dayMap.set(date, d)
    }
    const byDay = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }))

    const byShift = SHIFT_ORDER.map((s) => {
      const rows = trendRows.filter((r) => r.shift === s)
      const sum = (pred: (r: Row) => boolean) =>
        rows.filter(pred).reduce((x, r) => x + (trend ? num(r[trend.column]) : 0), 0)
      return {
        shift: s,
        total: sum(() => true),
        bitters: def.productSplit ? sum((r) => r.product === "Bitters") : 0,
        ginger: def.productSplit ? sum((r) => r.product === "Ginger") : 0,
      }
    })

    const materials = await Promise.all(def.materials.map(materialStatus))

    const payload: DepartmentReport = {
      ...common,
      scope: "department",
      department: def.department,
      summary: def.summary,
      productSplit: def.productSplit,
      kpis,
      trend: { label: trend?.label ?? "Output", unit: trend?.unit },
      byDay,
      byShift,
      materials,
    }
    return NextResponse.json(payload)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // OVERVIEW SCOPE — company-wide
  // ══════════════════════════════════════════════════════════════════════════
  const scopeWindow = (q: any, opts: { product?: boolean } = {}) => {
    q = q.gte("date", from).lte("date", to)
    if (shift) q = q.eq("shift", shift)
    if (opts.product && product) q = q.eq("product", product)
    return q
  }

  const [pkgRes, alcRes, preRes] = await Promise.all([
    scopeWindow(
      supabase
        .from("packaging_daily_records")
        .select("date, shift, product, quantity_cartons_produced, quantity_cartons_loaded"),
      { product: true },
    ),
    scopeWindow(supabase.from("stock_records").select("quantity_used").eq("material", "alcohol")),
    scopeWindow(supabase.from("blowing_daily_records").select("preforms_used_bags")),
  ])

  const pkg = (pkgRes.data ?? []) as Row[]
  const ofProduct = (p: string) => pkg.filter((r) => r.product === p)
  const sumProduced = (rows: Row[]) => rows.reduce((s, r) => s + num(r.quantity_cartons_produced), 0)

  const dayMap = new Map<string, { total: number; bitters: number; ginger: number }>()
  for (const r of pkg) {
    const date = String(r.date)
    const v = num(r.quantity_cartons_produced)
    const d = dayMap.get(date) ?? { total: 0, bitters: 0, ginger: 0 }
    d.total += v
    if (r.product === "Bitters") d.bitters += v
    if (r.product === "Ginger") d.ginger += v
    dayMap.set(date, d)
  }
  const byDay = [...dayMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }))

  const byShift = SHIFT_ORDER.map((s) => {
    const rows = pkg.filter((r) => r.shift === s)
    return {
      shift: s,
      total: sumProduced(rows),
      bitters: sumProduced(rows.filter((r) => r.product === "Bitters")),
      ginger: sumProduced(rows.filter((r) => r.product === "Ginger")),
    }
  })

  const [materials, fgRes] = await Promise.all([
    Promise.all(allMaterials().map(materialStatus)),
    supabase.rpc("finished_goods_stock"),
  ])
  const fg = fgRes.data ?? []

  const payload: OverviewReport = {
    ...common,
    scope: "overview",
    totals: {
      production_cartons: sumProduced(pkg),
      bitters_cartons: sumProduced(ofProduct("Bitters")),
      ginger_cartons: sumProduced(ofProduct("Ginger")),
      cartons_loaded: pkg.reduce((s, r) => s + num(r.quantity_cartons_loaded), 0),
      alcohol_used: ((alcRes.data ?? []) as Row[]).reduce((s, r) => s + num(r.quantity_used), 0),
      preforms_used: ((preRes.data ?? []) as Row[]).reduce((s, r) => s + num(r.preforms_used_bags), 0),
    },
    finishedGoods: {
      bitters: Number(fg.find((r) => r.product === "Bitters")?.available ?? 0),
      ginger: Number(fg.find((r) => r.product === "Ginger")?.available ?? 0),
    },
    // The configured recipe, resolved from the same settings the material rates used.
    bom: [configuredBom.Bitters, configuredBom.Ginger],
    byDay,
    byShift,
    materials,
  }
  return NextResponse.json(payload)
}
