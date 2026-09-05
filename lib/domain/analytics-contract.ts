import type { MaterialStatus } from "@/lib/domain/stock-status"
import type { ProductBom } from "@/lib/domain/bom"

// ============================================================================
// The wire contract for GET /api/analytics/report.
//
// Declared HERE, in neutral domain code, so the route that produces it and the
// components that consume it import the SAME types. The last time a response
// shape was declared independently on both sides they drifted — the route emitted
// `daysLeft` while the UI read `operatingDaysLeft` — and the manager's whole
// "Days left" column silently rendered NaN. One definition, no drift.
// ============================================================================

export interface KpiValue {
  key: string
  label: string
  unit?: string
  /**
   * null means "not computable" — a rate with no production, a ratio with a zero
   * denominator. Never NaN, never Infinity; the UI renders it as "—".
   */
  value: number | null
  goodDirection?: "up" | "down"
  hint?: string
}

export interface DaySeriesPoint {
  date: string
  total: number
  /** 0 when the department has no product column — check `productSplit` first. */
  bitters: number
  ginger: number
}

export interface ShiftSeriesPoint {
  shift: string
  total: number
  bitters: number
  ginger: number
}

export interface ReportCommon {
  filters: {
    from: string
    to: string
    shift: string | null
    department: string | null
    product: string | null
  }
  /** Calendar days in the window. */
  windowDays: number
  /** Operating days (Mon–Sat) in the window — the basis for every burn rate. */
  operatingDaysInWindow: number
  materials: MaterialStatus[]
  thresholds: { redDays: number; amberDays: number }
  last_updated: string
}

/** No department selected: company-wide production and every ledger material. */
export interface OverviewReport extends ReportCommon {
  scope: "overview"
  totals: {
    production_cartons: number
    bitters_cartons: number
    ginger_cartons: number
    cartons_loaded: number
    alcohol_used: number
    preforms_used: number
  }
  /** Cumulative on-hand, all-time — deliberately NOT scoped by the date filter. */
  finishedGoods: { bitters: number; ginger: number }
  /**
   * The bill of materials as CONFIGURED, one entry per product. Sent with the report
   * rather than derived on the client so the panel shows the recipe the reports
   * themselves projected with — the recipe is admin-editable, and a client holding its
   * own copy of it is how the two would come to disagree.
   */
  bom: ProductBom[]
  byDay: DaySeriesPoint[]
  byShift: ShiftSeriesPoint[]
}

/** A department selected: that department's own metrics and materials only. */
export interface DepartmentReport extends ReportCommon {
  scope: "department"
  department: string
  summary: string
  /**
   * False when the source table has no `product` column at all (Blowing,
   * Concentrate) or when only one product ever appears (Alcohol and Blending).
   * The UI must not render a Bitters/Ginger split when this is false — the series
   * would be fabricated.
   */
  productSplit: boolean
  kpis: KpiValue[]
  /** What the trend chart plots, so its axis can be labelled honestly. */
  trend: { label: string; unit?: string }
  byDay: DaySeriesPoint[]
  byShift: ShiftSeriesPoint[]
}

export type AnalyticsResponse = OverviewReport | DepartmentReport

/** Narrowing helper, so callers don't test the discriminant by hand. */
export function isDepartmentReport(r: AnalyticsResponse): r is DepartmentReport {
  return r.scope === "department"
}

export interface DayDetail {
  date: string
  shift: string | null
  department: string | null
  totalRecords: number
  groups: { recordType: string; department: string; rows: Record<string, unknown>[] }[]
}
