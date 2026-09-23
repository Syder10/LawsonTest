import type { Product } from "@/lib/db/types"

// ============================================================================
// Cartons produced, rolled up from packaging_daily_records.
//
// The finished-goods numerator (quantity_cartons_produced) is read by both the
// manager overview and the stock dashboard. Declaring the rollup once, here, keeps
// the two from drifting the way daysLeft/operatingDaysLeft once did (NFR-2).
//
// Every quantity is Number()-coerced: PostgREST serialises numeric as a string, so
// a raw + would concatenate instead of adding.
// ============================================================================

/** Window totals: cartons produced per product and across both. */
export interface ProducedTotals {
  bitters: number
  ginger: number
  total: number
}

/** One day's produced cartons, per product and total. */
export interface ProducedDay {
  date: string
  total: number
  bitters: number
  ginger: number
}

/** The columns this module reads off a packaging row; other columns are ignored. */
type PackagingRow = Record<string, unknown>

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0)
const isProduct = (v: unknown, p: Product): boolean => v === p

export function cartonsProducedTotals(rows: ReadonlyArray<PackagingRow>): ProducedTotals {
  let bitters = 0
  let ginger = 0
  let total = 0
  for (const r of rows) {
    const q = num(r.quantity_cartons_produced)
    total += q
    if (isProduct(r.product, "Bitters")) bitters += q
    else if (isProduct(r.product, "Ginger")) ginger += q
  }
  return { bitters, ginger, total }
}

export function cartonsProducedByDay(rows: ReadonlyArray<PackagingRow>): ProducedDay[] {
  const byDate = new Map<string, ProducedDay>()
  for (const r of rows) {
    const date = String(r.date)
    const q = num(r.quantity_cartons_produced)
    const d = byDate.get(date) ?? { date, total: 0, bitters: 0, ginger: 0 }
    d.total += q
    if (isProduct(r.product, "Bitters")) d.bitters += q
    else if (isProduct(r.product, "Ginger")) d.ginger += q
    byDate.set(date, d)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
