/**
 * lib/domain/packaging-pivot.ts
 *
 * Domain model and aggregation logic for the Packaging Production Pivot Table.
 *
 * Transforms raw packaging_daily_records into an Excel-style pivot matrix:
 *   - Rows: Every date of a selected calendar month (1st through 28th/30th/31st)
 *   - Columns: Group 1, Group 2, Group 3, Part Time, and Daily Total
 *              (or Shift columns: Morning, Afternoon, Night, Daily Total)
 *   - Filters: Product (All, Bitters, Ginger), Shift (All, Morning, Afternoon, Night)
 *   - Values: Quantity of cartons produced
 */

import { type ShiftTone, shiftTone } from "@/lib/shift-config"
import type { Product } from "@/lib/db/types"

export interface PackagingDailyRow {
  date: string // YYYY-MM-DD
  shift: string // Morning | Afternoon | Night
  group_number: number | null
  product: Product | string
  quantity_cartons_produced: number
  number_cartons_wasted?: number | null
  quantity_cartons_loaded?: number | null
  is_part_time?: boolean | null
}

export interface DayPivotCell {
  cartons: number
  shifts: {
    shift: string
    cartons: number
    tone: ShiftTone
  }[]
}

export interface DayPivotRow {
  date: string // YYYY-MM-DD
  dayOfMonth: number // 1..31
  dayOfWeek: string // Mon, Tue, etc.
  isWeekend: boolean
  group1: DayPivotCell
  group2: DayPivotCell
  group3: DayPivotCell
  partTime: DayPivotCell
  byShift: {
    Morning: { cartons: number; groupNumber: number | null }
    Afternoon: { cartons: number; groupNumber: number | null }
    Night: { cartons: number; groupNumber: number | null }
  }
  total: number
}

export interface PackagingPivotSummary {
  totalCartons: number
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
  peakCartons: number
}

export interface PackagingPivotMatrix {
  year: number
  month: number // 1..12
  monthName: string
  productFilter: string // "All" | "Bitters" | "Ginger"
  shiftFilter: string // "" | "Morning" | "Afternoon" | "Night"
  rows: DayPivotRow[]
  summary: PackagingPivotSummary
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

/**
 * Builds the complete packaging pivot table matrix for a specific month.
 */
export function buildPackagingPivotMatrix({
  year,
  month,
  records,
  productFilter = "All",
  shiftFilter = "",
}: {
  year: number
  month: number
  records: PackagingDailyRow[]
  productFilter?: string
  shiftFilter?: string
}): PackagingPivotMatrix {
  const daysCount = getDaysInMonth(year, month)
  const monthName = MONTH_NAMES[month - 1] ?? `Month ${month}`

  // 1. Filter raw records by Product and Shift if requested
  const filtered = records.filter((r) => {
    if (productFilter && productFilter !== "All" && r.product !== productFilter) {
      return false
    }
    if (shiftFilter && r.shift !== shiftFilter) {
      return false
    }
    return true
  })

  // Index records by date: Map<YYYY-MM-DD, PackagingDailyRow[]>
  const dateMap = new Map<string, PackagingDailyRow[]>()
  for (const r of filtered) {
    const list = dateMap.get(r.date) ?? []
    list.push(r)
    dateMap.set(r.date, list)
  }

  // 2. Build rows for each day of the month
  const rows: DayPivotRow[] = []
  let group1Total = 0
  let group2Total = 0
  let group3Total = 0
  let partTimeTotal = 0
  let totalCartons = 0
  let peakDate: string | null = null
  let peakCartons = 0
  let operatingDays = 0

  for (let day = 1; day <= daysCount; day++) {
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    const dateObj = new Date(Date.UTC(year, month - 1, day))
    const dayOfWeek = DAYS_SHORT[dateObj.getUTCDay()]
    const isWeekend = dateObj.getUTCDay() === 0 // Sunday is rest day

    const dayRecords = dateMap.get(isoDate) ?? []

    // Cells for Group 1, Group 2, Group 3, Part Time
    const g1Cell: DayPivotCell = { cartons: 0, shifts: [] }
    const g2Cell: DayPivotCell = { cartons: 0, shifts: [] }
    const g3Cell: DayPivotCell = { cartons: 0, shifts: [] }
    const ptCell: DayPivotCell = { cartons: 0, shifts: [] }

    const byShift = {
      Morning: { cartons: 0, groupNumber: null as number | null },
      Afternoon: { cartons: 0, groupNumber: null as number | null },
      Night: { cartons: 0, groupNumber: null as number | null },
    }

    for (const rec of dayRecords) {
      const qty = Number(rec.quantity_cartons_produced) || 0
      if (qty <= 0 && !rec.shift) continue

      const shiftName = rec.shift || "Morning"
      const tone = shiftTone(shiftName)

      const addShiftToCell = (cell: DayPivotCell) => {
        cell.cartons += qty
        const existing = cell.shifts.find((s) => s.shift === shiftName)
        if (existing) {
          existing.cartons += qty
        } else {
          cell.shifts.push({ shift: shiftName, cartons: qty, tone })
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
        // Fallback for unassigned group
        addShiftToCell(ptCell)
      }

      // Populate byShift breakdown
      if (shiftName === "Morning" || shiftName === "Afternoon" || shiftName === "Night") {
        byShift[shiftName].cartons += qty
        if (rec.group_number) {
          byShift[shiftName].groupNumber = rec.group_number
        }
      }
    }

    const dayTotal = g1Cell.cartons + g2Cell.cartons + g3Cell.cartons + ptCell.cartons

    if (dayTotal > 0) {
      operatingDays += 1
      if (dayTotal > peakCartons) {
        peakCartons = dayTotal
        peakDate = isoDate
      }
    }

    group1Total += g1Cell.cartons
    group2Total += g2Cell.cartons
    group3Total += g3Cell.cartons
    partTimeTotal += ptCell.cartons
    totalCartons += dayTotal

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
  const safeTotal = totalCartons > 0 ? totalCartons : 1
  const group1Share = totalCartons > 0 ? (group1Total / safeTotal) * 100 : 0
  const group2Share = totalCartons > 0 ? (group2Total / safeTotal) * 100 : 0
  const group3Share = totalCartons > 0 ? (group3Total / safeTotal) * 100 : 0
  const partTimeShare = totalCartons > 0 ? (partTimeTotal / safeTotal) * 100 : 0
  const dailyAverage = operatingDays > 0 ? totalCartons / operatingDays : 0

  return {
    year,
    month,
    monthName,
    productFilter,
    shiftFilter,
    rows,
    summary: {
      totalCartons,
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
      peakCartons,
    },
  }
}

/**
 * Generates an Excel-compatible CSV string representation of the pivot matrix.
 */
export function exportPackagingPivotCsv(matrix: PackagingPivotMatrix, viewMode: "groups" | "shifts" = "groups"): string {
  const lines: string[] = []

  lines.push("LAWSON LIMITED COMPANY - PACKAGING PRODUCTION ANALYSIS")
  lines.push(`MONTH: ${matrix.monthName.toUpperCase()} ${matrix.year}`)
  lines.push(`PRODUCT FILTER: ${matrix.productFilter}`)
  if (matrix.shiftFilter) {
    lines.push(`SHIFT FILTER: ${matrix.shiftFilter}`)
  }
  lines.push("")

  if (viewMode === "groups") {
    // Header
    lines.push("Date,Day,Group 1,Group 2,Group 3,Part Time,Daily Total")

    // Rows
    for (const r of matrix.rows) {
      lines.push(
        [
          r.date,
          r.dayOfWeek,
          r.group1.cartons,
          r.group2.cartons,
          r.group3.cartons,
          r.partTime.cartons,
          r.total,
        ].join(",")
      )
    }

    // Totals
    lines.push(
      [
        "TOTAL",
        "",
        matrix.summary.group1Total,
        matrix.summary.group2Total,
        matrix.summary.group3Total,
        matrix.summary.partTimeTotal,
        matrix.summary.totalCartons,
      ].join(",")
    )
  } else {
    // Shift view
    lines.push("Date,Day,Morning,Afternoon,Night,Daily Total")

    for (const r of matrix.rows) {
      lines.push(
        [
          r.date,
          r.dayOfWeek,
          r.byShift.Morning.cartons,
          r.byShift.Afternoon.cartons,
          r.byShift.Night.cartons,
          r.total,
        ].join(",")
      )
    }

    const morningTotal = matrix.rows.reduce((s, r) => s + r.byShift.Morning.cartons, 0)
    const afternoonTotal = matrix.rows.reduce((s, r) => s + r.byShift.Afternoon.cartons, 0)
    const nightTotal = matrix.rows.reduce((s, r) => s + r.byShift.Night.cartons, 0)

    lines.push(
      [
        "TOTAL",
        "",
        morningTotal,
        afternoonTotal,
        nightTotal,
        matrix.summary.totalCartons,
      ].join(",")
    )
  }

  return lines.join("\n")
}
