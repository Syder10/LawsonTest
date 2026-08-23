// Shape of GET /api/analytics/report and /api/analytics/day-detail.

export type Level = "red" | "yellow" | "none"

export interface MaterialStatus {
  key: string
  label: string
  unit: string
  remaining: number
  usedInWindow: number
  avgPerDay: number
  /** Operating days (Mon–Sat) of stock left; null if no measurable usage. */
  operatingDaysLeft: number | null
  /** Projected calendar date the stock hits zero; null if none / far off. */
  runOutDate: string | null
  level: Level
}

export interface AnalyticsReport {
  filters: { from: string; to: string; shift: string | null; department: string | null; product: string | null }
  windowDays: number
  totals: {
    production_cartons: number
    bitters_cartons: number
    ginger_cartons: number
    cartons_loaded: number
    alcohol_used: number
    preforms_used: number
  }
  finishedGoods: { bitters: number; ginger: number }
  byDay: { date: string; total: number; bitters: number; ginger: number }[]
  byShift: { shift: string; total: number; bitters: number; ginger: number }[]
  materials: MaterialStatus[]
  thresholds: { redDays: number; amberDays: number }
  last_updated: string
}

export interface DayDetail {
  date: string
  shift: string | null
  department: string | null
  totalRecords: number
  groups: { recordType: string; department: string; rows: Record<string, unknown>[] }[]
}
