import type { Product } from "@/lib/db/types"
import { DEPARTMENTS, recordTypesForDepartment } from "@/lib/domain/record-types"

// ============================================================================
// Per-department metric definitions.
//
// WHY THIS EXISTS
// ---------------
// `department` PARTITIONS the data rather than slicing it: each record type
// belongs to exactly one department, so there is no single set of metrics you can
// filter by department. The old report route applied `.eq("department", …)` to
// every query, which zeroed out every table that didn't belong to the selected
// department while leaving `remaining` and `finishedGoods` global — producing a
// half-empty, internally inconsistent dashboard for 4 of the 5 departments, and
// reporting "no usage" for materials that were actually being consumed.
//
// So selecting a department cannot mean "the same metrics, filtered". It has to
// mean "this department's own metrics". That is what this registry declares.
//
// Membership is DERIVED from the record-type registry (see `sourceTables`), so
// this file cannot drift from lib/domain/record-types.ts.
// ============================================================================

export type Department = (typeof DEPARTMENTS)[number]

/** How a KPI is computed from its source rows. */
export type Computation =
  | { kind: "sum"; column: string }
  /** numerator ÷ denominator, as a percentage. Guards divide-by-zero. */
  | { kind: "rate"; numerator: string; denominator: string }
  /** numerator ÷ denominator, as a plain ratio (e.g. litres per bag). */
  | { kind: "ratio"; numerator: string; denominator: string }
  /** Number of matching rows. */
  | { kind: "count" }

export interface DeptKpi {
  key: string
  /** Sentence case, no trailing colon. */
  label: string
  /** Table the columns belong to. Must be one of the department's own tables. */
  table: string
  compute: Computation
  unit?: string
  /** Whether a rising value is good — drives delta colouring, not the value. */
  goodDirection?: "up" | "down"
  /** Short explanation surfaced as a tooltip / sub-line. */
  hint?: string
}

export interface DeptMaterial {
  /** Canonical key — see materialKey(). */
  key: string
  /** stock_materials.code */
  material: string
  product?: Product
  label: string
  unit: string
  /** Herb is keyed per `variant`, so its rows are expanded at query time. */
  perVariant?: true
}

export interface DeptMetricsDef {
  department: Department
  /** One-line description of what this department does, for the dashboard header. */
  summary: string
  /**
   * Can these metrics be split by product (Bitters/Ginger)? False where the
   * source table has no `product` column at all — Blowing and Concentrate — in
   * which case the product filter and the two-series charts do not apply.
   */
  productSplit: boolean
  /**
   * Which KPI drives the per-day trend chart. Must name a KPI in `kpis` whose
   * compute is a `sum` — a rate cannot be summed across days.
   *
   * Every department needs its own: "cartons per day" is meaningless for Blowing,
   * which makes bottles, and litres for Concentrate. The previous dashboard
   * charted packaging cartons regardless of the selected department, which is why
   * choosing anything other than Packaging produced an empty chart.
   */
  trendKpi: string
  kpis: DeptKpi[]
  materials: DeptMaterial[]
}

// ── Canonical material keys ─────────────────────────────────────────────────
// ONE convention: the stock_materials code, plus a lower-cased product suffix
// when the material tracks product. The two report routes previously disagreed
// (`cartons_bitters` vs `carton_bitters`, `preforms` vs `preform`), and
// reconcile-modal papered over both spellings instead of the keys being fixed.
export function materialKey(material: string, product?: Product | null): string {
  return product ? `${material}_${product.toLowerCase()}` : material
}

const M = {
  alcohol: { key: materialKey("alcohol"), material: "alcohol", label: "Alcohol", unit: "litres" },
  preform: { key: materialKey("preform"), material: "preform", label: "Preforms", unit: "bags" },
  caps: { key: materialKey("caps"), material: "caps", label: "Caps", unit: "pcs" },
  labelsBitters: { key: materialKey("labels", "Bitters"), material: "labels", product: "Bitters" as Product, label: "Labels — Bitters", unit: "pcs" },
  labelsGinger: { key: materialKey("labels", "Ginger"), material: "labels", product: "Ginger" as Product, label: "Labels — Ginger", unit: "pcs" },
  caramelBitters: { key: materialKey("caramel", "Bitters"), material: "caramel", product: "Bitters" as Product, label: "Caramel — Bitters", unit: "units" },
  caramelGinger: { key: materialKey("caramel", "Ginger"), material: "caramel", product: "Ginger" as Product, label: "Caramel — Ginger", unit: "units" },
  taxStamp: { key: materialKey("tax_stamp"), material: "tax_stamp", label: "Tax Stamps", unit: "pcs" },
  cartonBitters: { key: materialKey("carton", "Bitters"), material: "carton", product: "Bitters" as Product, label: "Cartons — Bitters", unit: "pcs" },
  cartonGinger: { key: materialKey("carton", "Ginger"), material: "carton", product: "Ginger" as Product, label: "Cartons — Ginger", unit: "pcs" },
  herb: { key: materialKey("herb"), material: "herb", label: "Herbs", unit: "units", perVariant: true as const },
} satisfies Record<string, DeptMaterial>

// ============================================================================
// The registry
// ============================================================================

export const DEPT_METRICS: Record<Department, DeptMetricsDef> = {
  Blowing: {
    department: "Blowing",
    summary: "Blows bottles from preforms and hands them to the Filling Line.",
    // blowing_daily_records has no `product` column.
    productSplit: false,
    trendKpi: "bottles_blown",
    kpis: [
      { key: "bottles_blown", label: "Bottles blown", table: "blowing_daily_records", compute: { kind: "sum", column: "total_produced" }, unit: "bottles", goodDirection: "up" },
      { key: "net_output", label: "Net output", table: "blowing_daily_records", compute: { kind: "sum", column: "final_production" }, unit: "bottles", goodDirection: "up", hint: "Produced minus waste (computed by the database)." },
      { key: "waste", label: "Waste", table: "blowing_daily_records", compute: { kind: "sum", column: "waste_pcs" }, unit: "bottles", goodDirection: "down" },
      { key: "waste_rate", label: "Waste rate", table: "blowing_daily_records", compute: { kind: "rate", numerator: "waste_pcs", denominator: "total_produced" }, unit: "%", goodDirection: "down" },
      {
        key: "handed_over", label: "Handed to Filling", table: "blowing_daily_records",
        compute: { kind: "sum", column: "bottles_given_out" }, unit: "bottles",
        hint: "Compare with the Filling Line's bottles filled — a persistent gap is a real loss no dashboard showed before.",
      },
      { key: "preforms_used", label: "Preforms used", table: "blowing_daily_records", compute: { kind: "sum", column: "preforms_used_bags" }, unit: "bags", goodDirection: "down" },
    ],
    materials: [M.preform],
  },

  "Alcohol and Blending": {
    department: "Alcohol and Blending",
    summary: "Owns the alcohol ledger, blends Bitters, and runs the ginger line and extraction tanks.",
    // Only the blending record carries a product, and only ever 'Bitters'.
    productSplit: false,
    trendKpi: "blend_output",
    kpis: [
      { key: "alcohol_used", label: "Alcohol used", table: "stock_records", compute: { kind: "sum", column: "quantity_used" }, unit: "litres", goodDirection: "down" },
      { key: "alcohol_received", label: "Alcohol received", table: "stock_records", compute: { kind: "sum", column: "quantity_received" }, unit: "litres" },
      { key: "transferred_litres", label: "Alcohol transferred", table: "alcohol_blending_daily_records", compute: { kind: "sum", column: "alcohol_transferred_litres" }, unit: "litres", hint: "Drums × 250, computed by the database." },
      { key: "blend_output", label: "Finished blend", table: "alcohol_blending_daily_records", compute: { kind: "sum", column: "finished_products_transferred_litres" }, unit: "litres", goodDirection: "up", hint: "Tanks × 900, computed by the database." },
      { key: "ginger_output", label: "Ginger output", table: "ginger_production_records", compute: { kind: "sum", column: "finished_product_litres" }, unit: "litres", goodDirection: "up" },
      { key: "ginger_yield", label: "Ginger yield", table: "ginger_production_records", compute: { kind: "ratio", numerator: "finished_product_litres", denominator: "quantity_raw_ginger_bags" }, unit: "L / bag", goodDirection: "up" },
      { key: "grind_ratio", label: "Grind ratio", table: "ginger_production_records", compute: { kind: "ratio", numerator: "quantity_grinded_ginger", denominator: "quantity_raw_ginger_bags" }, goodDirection: "up" },
      { key: "tanks_started", label: "Extraction tanks started", table: "extraction_monitoring_records", compute: { kind: "count" }, unit: "tanks" },
    ],
    materials: [M.alcohol, M.caramelBitters, M.caramelGinger],
  },

  "Filling Line": {
    department: "Filling Line",
    summary: "Fills, caps and labels bottles for both products.",
    productSplit: true,
    trendKpi: "bottles_filled",
    kpis: [
      { key: "bottles_filled", label: "Bottles filled", table: "filling_line_daily_records", compute: { kind: "sum", column: "total_production" }, unit: "bottles", goodDirection: "up" },
      { key: "bottles_wasted", label: "Bottles wasted", table: "filling_line_daily_records", compute: { kind: "sum", column: "bottles_wasted" }, unit: "bottles", goodDirection: "down" },
      { key: "bottles_rejected", label: "Bottles rejected", table: "filling_line_daily_records", compute: { kind: "sum", column: "bottles_rejected" }, unit: "bottles", goodDirection: "down" },
      {
        key: "reject_rate", label: "Loss rate", table: "filling_line_daily_records",
        compute: { kind: "rate", numerator: "bottles_wasted", denominator: "total_production" },
        unit: "%", goodDirection: "down", hint: "Wasted as a share of bottles filled.",
      },
      { key: "staff", label: "Staff on shift", table: "filling_line_daily_records", compute: { kind: "sum", column: "number_of_staff" }, unit: "people" },
    ],
    materials: [M.caps, M.labelsBitters, M.labelsGinger],
  },

  Packaging: {
    department: "Packaging",
    summary: "Packs finished bottles into cartons, applies tax stamps, and loads out.",
    productSplit: true,
    trendKpi: "cartons_produced",
    kpis: [
      { key: "cartons_produced", label: "Cartons produced", table: "packaging_daily_records", compute: { kind: "sum", column: "quantity_cartons_produced" }, unit: "cartons", goodDirection: "up" },
      { key: "cartons_loaded", label: "Cartons loaded out", table: "packaging_daily_records", compute: { kind: "sum", column: "quantity_cartons_loaded" }, unit: "cartons" },
      { key: "cartons_wasted", label: "Cartons wasted", table: "packaging_daily_records", compute: { kind: "sum", column: "number_cartons_wasted" }, unit: "cartons", goodDirection: "down" },
      { key: "carton_waste_rate", label: "Carton waste rate", table: "packaging_daily_records", compute: { kind: "rate", numerator: "number_cartons_wasted", denominator: "quantity_cartons_produced" }, unit: "%", goodDirection: "down" },
      { key: "staff", label: "Staff on shift", table: "packaging_daily_records", compute: { kind: "sum", column: "number_of_staff" }, unit: "people" },
    ],
    // Stamp and carton CONSUMPTION is never recorded — it is derived from cartons
    // produced × packaging_bom by stock_balance_core.
    materials: [M.taxStamp, M.cartonBitters, M.cartonGinger],
  },

  Concentrate: {
    department: "Concentrate",
    summary: "Dilutes alcohol to 70% and 80% strength and manages the herb store.",
    // concentrate_alcohol_records has no `product` column.
    productSplit: false,
    trendKpi: "alcohol_used",
    kpis: [
      { key: "alcohol_used", label: "Alcohol used", table: "concentrate_alcohol_records", compute: { kind: "sum", column: "total_alcohol_used_litres" }, unit: "litres", hint: "70% + 80%, computed by the database." },
      { key: "tanks_70", label: "Tanks at 70%", table: "concentrate_alcohol_records", compute: { kind: "sum", column: "number_tanks_70" }, unit: "tanks" },
      { key: "tanks_80", label: "Tanks at 80%", table: "concentrate_alcohol_records", compute: { kind: "sum", column: "number_tanks_80" }, unit: "tanks" },
      {
        key: "dilution_70", label: "Dilution at 70%", table: "concentrate_alcohol_records",
        compute: { kind: "ratio", numerator: "water_70_litres", denominator: "alcohol_used_70_litres" },
        unit: "L water / L alcohol", hint: "The real quality signal for this department — drift here changes the product.",
      },
      {
        key: "dilution_80", label: "Dilution at 80%", table: "concentrate_alcohol_records",
        compute: { kind: "ratio", numerator: "water_80_litres", denominator: "alcohol_used_80_litres" },
        unit: "L water / L alcohol",
      },
    ],
    materials: [M.herb],
  },
}

// ── Lookups ─────────────────────────────────────────────────────────────────

/** Strict type guard — `department` is an FK value, so exact match. */
export function isDepartment(value: string): value is Department {
  return (DEPARTMENTS as readonly string[]).includes(value)
}

/**
 * Look up a department's metrics, tolerating casing.
 *
 * Deliberately more forgiving than isDepartment(): stored values are always the
 * canonical FK spelling, but this also receives raw query params. Matching
 * case-insensitively here keeps it consistent with recordTypesForDepartment(),
 * which is already case-insensitive — otherwise `?department=packaging` would
 * resolve source tables but find no metrics.
 */
export function deptMetrics(department: string): DeptMetricsDef | undefined {
  if (isDepartment(department)) return DEPT_METRICS[department]
  const lower = department.toLowerCase()
  const match = DEPARTMENTS.find((d) => d.toLowerCase() === lower)
  return match ? DEPT_METRICS[match] : undefined
}

/**
 * The tables a department's records actually live in, DERIVED from the
 * record-type registry rather than restated here. `stock_records` appears once
 * however many materials the department records into it.
 */
export function sourceTables(department: string): string[] {
  const tables = recordTypesForDepartment(department).map((def) =>
    def.storage.kind === "table" ? def.storage.table : "stock_records",
  )
  return [...new Set(tables)]
}

/** Canonical material keys a department is responsible for. */
export function deptMaterialKeys(department: string): string[] {
  return deptMetrics(department)?.materials.map((m) => m.key) ?? []
}

/** Every material key across all departments, deduped — the company-wide view. */
export function allMaterialKeys(): string[] {
  return [...new Set(Object.values(DEPT_METRICS).flatMap((d) => d.materials.map((m) => m.key)))]
}

/** Every distinct material definition across all departments. */
export function allMaterials(): DeptMaterial[] {
  const seen = new Map<string, DeptMaterial>()
  for (const d of Object.values(DEPT_METRICS)) {
    for (const m of d.materials) if (!seen.has(m.key)) seen.set(m.key, m)
  }
  return [...seen.values()]
}

/** Whether a Bitters/Ginger split is meaningful for this department. */
export function hasProductSplit(department: string): boolean {
  return deptMetrics(department)?.productSplit ?? false
}

/** Safe rate/ratio evaluation — returns null rather than NaN or Infinity. */
export function evaluate(compute: Computation, sums: Record<string, number>, rowCount: number): number | null {
  switch (compute.kind) {
    case "count":
      return rowCount
    case "sum":
      return sums[compute.column] ?? 0
    case "rate": {
      const d = sums[compute.denominator] ?? 0
      if (d === 0) return null
      return Math.round(((sums[compute.numerator] ?? 0) / d) * 1000) / 10
    }
    case "ratio": {
      const d = sums[compute.denominator] ?? 0
      if (d === 0) return null
      return Math.round(((sums[compute.numerator] ?? 0) / d) * 100) / 100
    }
  }
}

/** Every column a department's KPIs need from a given table. */
export function columnsFor(department: string, table: string): string[] {
  const def = deptMetrics(department)
  if (!def) return []
  const cols = new Set<string>()
  for (const k of def.kpis) {
    if (k.table !== table) continue
    if (k.compute.kind === "sum") cols.add(k.compute.column)
    if (k.compute.kind === "rate" || k.compute.kind === "ratio") {
      cols.add(k.compute.numerator)
      cols.add(k.compute.denominator)
    }
  }
  return [...cols]
}

/**
 * The KPI charted per day for this department, resolved to a concrete
 * table + column. Undefined if the named KPI is missing or is not a `sum`
 * (a rate cannot be aggregated across days).
 */
export function trendSeries(
  department: string,
): { key: string; label: string; table: string; column: string; unit?: string } | undefined {
  const def = deptMetrics(department)
  if (!def) return undefined
  const kpi = def.kpis.find((k) => k.key === def.trendKpi)
  if (!kpi || kpi.compute.kind !== "sum") return undefined
  return { key: kpi.key, label: kpi.label, table: kpi.table, column: kpi.compute.column, unit: kpi.unit }
}
