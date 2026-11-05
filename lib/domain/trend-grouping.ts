export type TrendGrouping = "day" | "week" | "month"

export interface TrendDataPoint {
  date: string // YYYY-MM-DD
  total: number
  bitters: number
  ginger: number
  noWorkReason?: string | null
}

export interface GroupedTrendPoint {
  key: string
  label: string
  total: number
  bitters: number
  ginger: number
  startDate: string
  noWorkReason?: string | null
}

/**
 * Returns the Monday (UTC) of the week containing `dateStr`.
 */
export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z")
  const day = d.getUTCDay() // 0 = Sunday, 1 = Monday, ...
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff))
  return monday.toISOString().slice(0, 10)
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * Pure function that aggregates daily trend points by Day, Week, or Month.
 * Does not mutate input. Never blends distinct metrics.
 */
export function groupTrendData(
  points: TrendDataPoint[],
  grouping: TrendGrouping,
): GroupedTrendPoint[] {
  if (points.length === 0) return []

  // Ensure points are sorted by date
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))

  if (grouping === "day") {
    return sorted.map((p) => {
      const d = new Date(p.date + "T00:00:00Z")
      const label = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`
      return {
        key: p.date,
        label,
        total: p.total,
        bitters: p.bitters,
        ginger: p.ginger,
        startDate: p.date,
        noWorkReason: p.noWorkReason,
      }
    })
  }

  if (grouping === "week") {
    const map = new Map<string, GroupedTrendPoint>()
    for (const p of sorted) {
      const monday = getMondayOfWeek(p.date)
      const existing = map.get(monday)
      if (existing) {
        existing.total += p.total
        existing.bitters += p.bitters
        existing.ginger += p.ginger
      } else {
        const d = new Date(monday + "T00:00:00Z")
        const label = `Wk ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`
        map.set(monday, {
          key: monday,
          label,
          total: p.total,
          bitters: p.bitters,
          ginger: p.ginger,
          startDate: monday,
        })
      }
    }
    return [...map.values()]
  }

  // grouping === "month"
  const map = new Map<string, GroupedTrendPoint>()
  for (const p of sorted) {
    const ym = p.date.slice(0, 7) // YYYY-MM
    const existing = map.get(ym)
    if (existing) {
      existing.total += p.total
      existing.bitters += p.bitters
      existing.ginger += p.ginger
    } else {
      const [yearStr, monthStr] = ym.split("-")
      const monthIdx = Number(monthStr) - 1
      const label = `${MONTH_NAMES[monthIdx]} ${yearStr}`
      map.set(ym, {
        key: ym,
        label,
        total: p.total,
        bitters: p.bitters,
        ginger: p.ginger,
        startDate: `${ym}-01`,
      })
    }
  }
  return [...map.values()]
}
