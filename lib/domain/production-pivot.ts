/**
 * lib/domain/production-pivot.ts
 *
 * Generic Excel-style monthly pivot matrix builder for department production records:
 *   - Blowing (preforms used bags, net output bottles)
 *   - Filling Line (bottles produced/filled)
 *   - Alcohol & Blending (alcohol used drums/litres, finished products transferred tanks/litres)
 *
 * Implements the single source of truth for:
 *   - Monthly date generation (1..28/29/30/31)
 *   - Group aggregation (Group 1, 2, 3, Part Time)
 *   - Shift aggregation (Morning, Afternoon, Night)
 *   - Summary stats (% shares, daily average, peak date)
 *   - CSV export
 */

import { type ShiftTone, shiftTone } from "@/lib/shift-config"

export interface GenericProductionRecord {
  date: string // YYYY-MM-DD
  shift: string // Morning | Afternoon | Night
  group_number?: number | null
  product?: string | null
  is_part_time?: boolean | null
}

export interface ProductionPivotCell {
  value: number
  shifts: {
    shift: string
    value: number
    tone: ShiftTone
  }[]
}

export interface ProductionPivotRow {
  date: string // YYYY-MM-DD
  dayOfMonth: number // 1..31
  dayOfWeek: string // Sun, Mon, etc.
  isWeekend: boolean
  group1: ProductionPivotCell
  group2: ProductionPivotCell
  group3: ProductionPivotCell
  partTime: ProductionPivotCell
  byShift: {
    Morning: { value: number; groupNumber: number | null }
    Afternoon: { value: number; groupNumber: number | null }
    Night: { value: number; groupNumber: number | null }
  }
  total: number
}

export interface ProductionPivotSummary {
  totalValue: number
  group1Total: number
  group2Total: number
  group3Total: number
  partTimeTotal: number
  group1Share: number // 0..100
  group2Share: number // 0..100
  group3Share: number // 0..100
  partTimeShare: number // 0..100
  dailyAverage: number
  operatingDays: number
  peakDate: string | null
  peakValue: number
}

export interface ProductionPivotMatrix {
  year: number
  month: number // 1..12
  monthName: string
  productFilter: string
  shiftFilter: string
  unit: string
  rows: ProductionPivotRow[]
  summary: ProductionPivotSummary
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Returns the total number of days in a given year and month (1..12). */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Formats integer numbers with commas. */
export const fmtNum = (n: number) => new Intl.NumberFormat().format(Math.round(n))

/** Formats decimal numbers to 1 decimal place. */
export const fmtDec1 = (n: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n)

/**
 * Builds a monthly pivot matrix for any department production record.
 */
export function buildProductionPivotMatrix<T extends GenericProductionRecord>({
  year,
  month,
  records,
  valueExtractor,
  productFilter = "All",
  shiftFilter = "",
  unit = "units",
}: {
  year: number
  month: number
  records: T[]
  valueExtractor: (r: T) => number
  productFilter?: string
  shiftFilter?: string
  unit?: string
}): ProductionPivotMatrix {
  const daysCount = getDaysInMonth(year, month)
  const monthName = MONTH_NAMES[month - 1] ?? `Month ${month}`

  // 1. Filter raw records by Product and Shift if requested
  const filtered = records.filter((r) => {
    if (productFilter && productFilter !== "All" && r.product && r.product !== productFilter) {
      return false
    }
    if (shiftFilter && r.shift !== shiftFilter) {
      return false
    }
    return true
  })

  // Index records by date: Map<YYYY-MM-DD, T[]>
  const dateMap = new Map<string, T[]>()
  for (const r of filtered) {
    const list = dateMap.get(r.date) ?? []
    list.push(r)
    dateMap.set(r.date, list)
  }

  // 2. Build rows for each day of the month
  const rows: ProductionPivotRow[] = []
  let group1Total = 0
  let group2Total = 0
  let group3Total = 0
  let partTimeTotal = 0
  let totalValue = 0
  let peakDate: string | null = null
  let peakValue = 0
  let operatingDays = 0

  for (let day = 1; day <= daysCount; day++) {
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const dateObj = new Date(Date.UTC(year, month - 1, day))
    const dayOfWeek = DAYS_SHORT[dateObj.getUTCDay()]
    const isWeekend = dateObj.getUTCDay() === 0 // Sunday is rest day

    const dayRecords = dateMap.get(isoDate) ?? []

    const g1Cell: ProductionPivotCell = { value: 0, shifts: [] }
    const g2Cell: ProductionPivotCell = { value: 0, shifts: [] }
    const g3Cell: ProductionPivotCell = { value: 0, shifts: [] }
    const ptCell: ProductionPivotCell = { value: 0, shifts: [] }

    const byShift = {
      Morning: { value: 0, groupNumber: null as number | null },
      Afternoon: { value: 0, groupNumber: null as number | null },
      Night: { value: 0, groupNumber: null as number | null },
    }

    for (const rec of dayRecords) {
      const qty = Number(valueExtractor(rec)) || 0
      if (qty <= 0 && !rec.shift) continue

      const shiftName = rec.shift || "Morning"
      const tone = shiftTone(shiftName)

      const addShiftToCell = (cell: ProductionPivotCell) => {
        cell.value += qty
        const existing = cell.shifts.find((s) => s.shift === shiftName)
        if (existing) {
          existing.value += qty
        } else {
          cell.shifts.push({ shift: shiftName, value: qty, tone })
        }
      }

      if (rec.is_part_time) {
        addShiftToCell(ptCell)
      } else if (rec.group_number === 1) {
        addShiftToCell(g1Cell)
      } else if (rec.group_number === 2) {
        addShiftToCell(g2Cell)
      } else if (rec.group_number === 3) {
        addShiftToCell(g3Cell)
      } else {
        // Fallback for unassigned group or external
        addShiftToCell(ptCell)
      }

      // Populate byShift breakdown
      if (shiftName === "Morning" || shiftName === "Afternoon" || shiftName === "Night") {
        byShift[shiftName].value += qty
        if (rec.group_number) {
          byShift[shiftName].groupNumber = rec.group_number
        }
      }
    }

    const dayTotal = g1Cell.value + g2Cell.value + g3Cell.value + ptCell.value

    if (dayTotal > 0) {
      operatingDays += 1
      if (dayTotal > peakValue) {
        peakValue = dayTotal
        peakDate = isoDate
      }
    }

    group1Total += g1Cell.value
    group2Total += g2Cell.value
    group3Total += g3Cell.value
    partTimeTotal += ptCell.value
    totalValue += dayTotal

    rows.push({
      date: isoDate,
      dayOfMonth: day,
      dayOfWeek,
      isWeekend,
      group1: g1Cell,
      group2: g2Cell,
      group3: g3Cell,
      partTime: ptCell,
      byShift,
      total: dayTotal,
    })
  }

  // 3. Compute percentage shares
  const safeTotal = totalValue > 0 ? totalValue : 1
  const group1Share = totalValue > 0 ? (group1Total / safeTotal) * 100 : 0
  const group2Share = totalValue > 0 ? (group2Total / safeTotal) * 100 : 0
  const group3Share = totalValue > 0 ? (group3Total / safeTotal) * 100 : 0
  const partTimeShare = totalValue > 0 ? (partTimeTotal / safeTotal) * 100 : 0
  const dailyAverage = operatingDays > 0 ? totalValue / operatingDays : 0

  return {
    year,
    month,
    monthName,
    productFilter,
    shiftFilter,
    unit,
    rows,
    summary: {
      totalValue,
      group1Total,
      group2Total,
      group3Total,
      partTimeTotal,
      group1Share,
      group2Share,
      group3Share,
      partTimeShare,
      dailyAverage,
      operatingDays,
      peakDate,
      peakValue,
    },
  }
}

/**
 * Exports a production pivot matrix to standard CSV text.
 */
export function exportProductionPivotCsv(
  matrix: ProductionPivotMatrix,
  viewMode: "groups" | "shifts",
  valueLabel = "Output",
  options?: { groupCount?: 2 | 3 }
): string {
  const lines: string[] = []
  const groupCount = options?.groupCount ?? 3

  lines.push(`Production Pivot Analysis - ${matrix.monthName} ${matrix.year}`)
  lines.push(`Metric: ${valueLabel} (${matrix.unit})`)
  if (matrix.productFilter && matrix.productFilter !== "All") {
    lines.push(`Product Filter: ${matrix.productFilter}`)
  }
  if (matrix.shiftFilter) {
    lines.push(`Shift Filter: ${matrix.shiftFilter}`)
  }
  lines.push("")

  if (viewMode === "groups") {
    if (groupCount === 2) {
      lines.push("Date,Day,Group 1,Group 2,Part Time,Daily Total")
      for (const r of matrix.rows) {
        lines.push(
          [
            r.date,
            r.dayOfWeek,
            r.group1.value,
            r.group2.value,
            r.partTime.value,
            r.total,
          ].join(",")
        )
      }
      lines.push(
        [
          "Monthly Total",
          "",
          matrix.summary.group1Total,
          matrix.summary.group2Total,
          matrix.summary.partTimeTotal,
          matrix.summary.totalValue,
        ].join(",")
      )
      lines.push(
        [
          "% Share",
          "",
          `${matrix.summary.group1Share.toFixed(1)}%`,
          `${matrix.summary.group2Share.toFixed(1)}%`,
          `${matrix.summary.partTimeShare.toFixed(1)}%`,
          "100.0%",
        ].join(",")
      )
    } else {
      lines.push("Date,Day,Group 1,Group 2,Group 3,Part Time,Daily Total")
      for (const r of matrix.rows) {
        lines.push(
          [
            r.date,
            r.dayOfWeek,
            r.group1.value,
            r.group2.value,
            r.group3.value,
            r.partTime.value,
            r.total,
          ].join(",")
        )
      }
      lines.push(
        [
          "Monthly Total",
          "",
          matrix.summary.group1Total,
          matrix.summary.group2Total,
          matrix.summary.group3Total,
          matrix.summary.partTimeTotal,
          matrix.summary.totalValue,
        ].join(",")
      )
      lines.push(
        [
          "% Share",
          "",
          `${matrix.summary.group1Share.toFixed(1)}%`,
          `${matrix.summary.group2Share.toFixed(1)}%`,
          `${matrix.summary.group3Share.toFixed(1)}%`,
          `${matrix.summary.partTimeShare.toFixed(1)}%`,
          "100.0%",
        ].join(",")
      )
    }
  } else {
    lines.push("Date,Day,Morning,Afternoon,Night,Daily Total")
    for (const r of matrix.rows) {
      lines.push(
        [
          r.date,
          r.dayOfWeek,
          r.byShift.Morning.value,
          r.byShift.Afternoon.value,
          r.byShift.Night.value,
          r.total,
        ].join(",")
      )
    }
    const morningTotal = matrix.rows.reduce((s, r) => s + r.byShift.Morning.value, 0)
    const afternoonTotal = matrix.rows.reduce((s, r) => s + r.byShift.Afternoon.value, 0)
    const nightTotal = matrix.rows.reduce((s, r) => s + r.byShift.Night.value, 0)
    lines.push(
      ["Monthly Total", "", morningTotal, afternoonTotal, nightTotal, matrix.summary.totalValue].join(
        ","
      )
    )
  }

  return lines.join("\n")
}
