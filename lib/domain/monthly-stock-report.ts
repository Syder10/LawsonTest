import type { Product } from "@/lib/db/types"
import { DISPATCH_BRANCHES, type DispatchBranch } from "@/lib/domain/dispatch"

export interface MonthlyStockParams {
  year: number
  month: number // 1..12
  product: Product
}

export interface WeeklyProductionRow {
  week: number
  label: string
  dateRange: string
  group1: number
  group2: number
  group3: number
  partTime: number
  total: number
}

export interface WeeklyProductionSummary {
  rows: WeeklyProductionRow[]
  totalGroup1: number
  totalGroup2: number
  totalGroup3: number
  totalPartTime: number
  grandTotal: number
}

export interface MonthlyReturnEvent {
  id: string
  date: string
  formattedDate: string
  driverName: string
  sourceBranch: string
  vehicleReg: string | null
  repackCartons: number
  spoilageCartons: number
  totalCartons: number
  remarks: string | null
}

export interface BranchDistributionRow {
  branch: DispatchBranch
  totalSales: number
  repackReturns: number
  spoilageReturns: number
  totalReturns: number
  actualSales: number
  donations: number
  totalDistribution: number
  percentageOfSales: number
}

export interface MonthlyStockReport {
  period: {
    year: number
    month: number
    monthName: string
    startDate: string
    endDate: string
  }
  product: Product
  // Core Reconciliation
  openingStock: number
  totalProduced: number
  goodsAvailable: number
  totalSales: number
  /**
   * Dispatched cartons whose destination is not one of DISPATCH_BRANCHES. Older
   * dispatches pre-date the branch list (the DB check is NOT VALID on purpose), so
   * they count in `totalSales` but have no branch column. Surfacing the remainder
   * keeps the branch lines adding up to TOTAL SALES instead of silently hiding it.
   */
  unassignedSales: number
  repackReturns: number
  spoilageReturns: number
  totalReturns: number
  actualSales: number
  donations: number
  totalDistribution: number
  closingStock: number

  // Detailed Tables
  weeklyProduction: WeeklyProductionSummary
  returnsLog: MonthlyReturnEvent[]
  branchMatrix: BranchDistributionRow[]
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

export function getMonthName(month: number): string {
  return MONTH_NAMES[Math.max(0, Math.min(11, month - 1))] ?? "Unknown"
}

export function getMonthRange(year: number, month: number): { startDate: string; endDate: string } {
  const y = Math.floor(year)
  const m = Math.floor(month)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, "0")
  return {
    startDate: `${y}-${pad(m)}-01`,
    endDate: `${y}-${pad(m)}-${pad(lastDay)}`,
  }
}

/**
 * Calculates the core stock balance equations as specified in the business report:
 * 1. Goods Available = Opening Stock + Total Production
 * 2. Actual Sales = Total Sales - Total Returns
 * 3. Total Distribution = Actual Sales + Donations + Spoilage Returns
 *    (= Total Sales - Repack Returns + Donations)
 * 4. Closing Stock = Goods Available - Total Distribution
 */
export function calculateMonthlyStockBalance(input: {
  openingStock: number
  totalProduced: number
  totalSales: number
  repackReturns: number
  spoilageReturns: number
  donations: number
}): {
  goodsAvailable: number
  totalReturns: number
  actualSales: number
  totalDistribution: number
  closingStock: number
} {
  const openingStock = Number(input.openingStock) || 0
  const totalProduced = Number(input.totalProduced) || 0
  const totalSales = Number(input.totalSales) || 0
  const repackReturns = Number(input.repackReturns) || 0
  const spoilageReturns = Number(input.spoilageReturns) || 0
  const donations = Number(input.donations) || 0

  const goodsAvailable = openingStock + totalProduced
  const totalReturns = repackReturns + spoilageReturns
  const actualSales = totalSales - totalReturns

  // Total Distribution = Actual Sales + Donations + Spoilage
  // Since Actual Sales = Total Sales - Repack - Spoilage:
  // Total Distribution = Total Sales - Repack + Donations
  const totalDistribution = actualSales + donations + spoilageReturns
  const closingStock = goodsAvailable - totalDistribution

  return {
    goodsAvailable,
    totalReturns,
    actualSales,
    totalDistribution,
    closingStock,
  }
}

/** Assigns a day in the month (1..31) to Week 1 through 5. */
export function getWeekBucketForDay(dayOfMonth: number): { week: number; label: string; dateRange: string } {
  if (dayOfMonth <= 7) return { week: 1, label: "Week 1", dateRange: "1st - 7th" }
  if (dayOfMonth <= 14) return { week: 2, label: "Week 2", dateRange: "8th - 14th" }
  if (dayOfMonth <= 21) return { week: 3, label: "Week 3", dateRange: "15th - 21st" }
  if (dayOfMonth <= 28) return { week: 4, label: "Week 4", dateRange: "22nd - 28th" }
  return { week: 5, label: "Week 5", dateRange: "29th - End" }
}

/**
 * Builds Table 1: Weekly Production per Groups (Group 1, 2, 3, Part Time)
 */
export function buildWeeklyProductionTable(
  records: {
    date: string
    quantity_cartons_produced: number
    group_number?: number | null
    is_part_time?: boolean | null
  }[],
): WeeklyProductionSummary {
  const weeksMap = new Map<number, { group1: number; group2: number; group3: number; partTime: number }>()

  for (let w = 1; w <= 5; w++) {
    weeksMap.set(w, { group1: 0, group2: 0, group3: 0, partTime: 0 })
  }

  for (const rec of records) {
    const day = parseInt(rec.date.slice(8, 10), 10) || 1
    const { week } = getWeekBucketForDay(day)
    const slot = weeksMap.get(week)!
    const qty = Number(rec.quantity_cartons_produced) || 0

    if (rec.is_part_time) {
      slot.partTime += qty
    } else if (rec.group_number === 1) {
      slot.group1 += qty
    } else if (rec.group_number === 2) {
      slot.group2 += qty
    } else if (rec.group_number === 3) {
      slot.group3 += qty
    } else {
      slot.partTime += qty
    }
  }

  let totalGroup1 = 0
  let totalGroup2 = 0
  let totalGroup3 = 0
  let totalPartTime = 0

  const rows: WeeklyProductionRow[] = []

  for (let w = 1; w <= 5; w++) {
    const slot = weeksMap.get(w)!
    const total = slot.group1 + slot.group2 + slot.group3 + slot.partTime
    totalGroup1 += slot.group1
    totalGroup2 += slot.group2
    totalGroup3 += slot.group3
    totalPartTime += slot.partTime

    const meta = getWeekBucketForDay(w === 1 ? 1 : w === 2 ? 8 : w === 3 ? 15 : w === 4 ? 22 : 29)
    rows.push({
      week: w,
      label: meta.label,
      dateRange: meta.dateRange,
      group1: slot.group1,
      group2: slot.group2,
      group3: slot.group3,
      partTime: slot.partTime,
      total,
    })
  }

  return {
    rows,
    totalGroup1,
    totalGroup2,
    totalGroup3,
    totalPartTime,
    grandTotal: totalGroup1 + totalGroup2 + totalGroup3 + totalPartTime,
  }
}

/**
 * Builds the Branch-by-Branch Distribution Matrix across all 10 branches.
 */
export function buildBranchDistributionMatrix(input: {
  dispatches: { destination: string; cartons: number }[]
  returns: { sourceBranch?: string | null; repackCartons: number; spoilageCartons: number }[]
  donations: number
}): BranchDistributionRow[] {
  const branchMap = new Map<
    DispatchBranch,
    { totalSales: number; repackReturns: number; spoilageReturns: number }
  >()

  for (const b of DISPATCH_BRANCHES) {
    branchMap.set(b, { totalSales: 0, repackReturns: 0, spoilageReturns: 0 })
  }

  for (const d of input.dispatches) {
    // Normalise branch destination names (e.g. "Ho" -> "Ho & Togo", "Accra Branch" -> "Accra")
    const match = DISPATCH_BRANCHES.find(
      (b) => b.toLowerCase() === d.destination.trim().toLowerCase() ||
             d.destination.toLowerCase().startsWith(b.toLowerCase()) ||
             b.toLowerCase().startsWith(d.destination.toLowerCase()),
    )
    if (match) {
      const slot = branchMap.get(match)!
      slot.totalSales += Number(d.cartons) || 0
    }
  }

  for (const r of input.returns) {
    const src = r.sourceBranch?.trim() || "Head Office"
    const match = DISPATCH_BRANCHES.find(
      (b) => b.toLowerCase() === src.toLowerCase() ||
             src.toLowerCase().startsWith(b.toLowerCase()) ||
             b.toLowerCase().startsWith(src.toLowerCase()) ||
             (src.toLowerCase().includes("office") && b === "Head Office"),
    ) ?? "Head Office"

    const slot = branchMap.get(match)!
    slot.repackReturns += Number(r.repackCartons) || 0
    slot.spoilageReturns += Number(r.spoilageCartons) || 0
  }

  const allSales = Array.from(branchMap.values()).reduce((sum, b) => sum + b.totalSales, 0)

  return DISPATCH_BRANCHES.map((branch) => {
    const slot = branchMap.get(branch)!
    const totalReturns = slot.repackReturns + slot.spoilageReturns
    const actualSales = slot.totalSales - totalReturns
    // Donations in operational reports are attributed to Head Office disbursement
    const branchDonations = branch === "Head Office" ? input.donations : 0
    const totalDistribution = actualSales + branchDonations + slot.spoilageReturns
    const percentageOfSales = allSales > 0 ? (slot.totalSales / allSales) * 100 : 0

    return {
      branch,
      totalSales: slot.totalSales,
      repackReturns: slot.repackReturns,
      spoilageReturns: slot.spoilageReturns,
      totalReturns,
      actualSales,
      donations: branchDonations,
      totalDistribution,
      percentageOfSales: Math.round(percentageOfSales * 10) / 10,
    }
  })
}

// ============================================================================
// Statement layout — the shape of the printed "Stock Report" (3 pages):
//   1. the summary statement with Notes / Table 1 (weekly production),
//   2. Table 2 (returns),
//   3. the branch-by-branch matrix.
// Everything here is pure presentation of an already-computed MonthlyStockReport.
// No figure is recalculated: totals come from the report, and the tests assert the
// per-branch columns add up to them.
// ============================================================================

export const PRODUCT_REPORT_NAMES: Record<Product, string> = {
  Bitters: "DE-RAY MAN ABITTERS",
  Ginger: "DE-RAY MAN GINGER LIQUOR",
}

/** 1 -> "1st", 22 -> "22nd", 11 -> "11th", 31 -> "31st". */
export function ordinal(n: number): string {
  const v = Math.abs(Math.trunc(n))
  const lastTwo = v % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${v}th`
  switch (v % 10) {
    case 1: return `${v}st`
    case 2: return `${v}nd`
    case 3: return `${v}rd`
    default: return `${v}th`
  }
}

/** "STOCK REPORT FOR THE PERIOD 1ST - 31ST JULY, 2026" (30TH, 28TH, 29TH as the month needs). */
export function formatPeriodTitle(year: number, month: number): string {
  const last = parseInt(getMonthRange(year, month).endDate.slice(8, 10), 10)
  return `STOCK REPORT FOR THE PERIOD ${ordinal(1)} - ${ordinal(last)} ${getMonthName(month)}, ${year}`.toUpperCase()
}

/** Cartons as printed on the statement: plain figures, no thousands separator, no trailing zeros. */
export function formatQty(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return ""
  const rounded = Math.round(n * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
}

/** Dispatched cartons that no branch column claims; never negative. */
export function computeUnassignedSales(totalSales: number, matrix: BranchDistributionRow[]): number {
  const assigned = matrix.reduce((sum, b) => sum + b.totalSales, 0)
  const rest = Math.round((totalSales - assigned) * 100) / 100
  return rest > 0 ? rest : 0
}

export interface ReturnsTotals {
  repacked: number
  spoilage: number
  /** repacked + spoilage — the figure under the third green cell of Table 2. */
  total: number
}

export function summarizeReturnsLog(log: Pick<MonthlyReturnEvent, "repackCartons" | "spoilageCartons">[]): ReturnsTotals {
  let repacked = 0
  let spoilage = 0
  for (const r of log) {
    repacked += Number(r.repackCartons) || 0
    spoilage += Number(r.spoilageCartons) || 0
  }
  return { repacked, spoilage, total: repacked + spoilage }
}

export interface StatementColumn {
  key: string
  /** Two-line header: name over "OFFICE" / "BRANCH". */
  line1: string
  line2: string
}

export type StatementRowKind = "line" | "section" | "spacer" | "total"

export interface StatementRow {
  key: string
  label: string
  kind: StatementRowKind
  /** One entry per column; null leaves the cell blank. */
  cells: (number | null)[]
  /** The TOTAL CARTONS column; null leaves it blank. */
  total: number | null
}

const BRANCH_HEADER: Record<DispatchBranch, [string, string]> = {
  "Head Office": ["HEAD", "OFFICE"],
  "Accra": ["ACCRA", "BRANCH"],
  "Bolgatanga": ["BOLGA", "BRANCH"],
  "Cape Coast": ["CAPE CST", "BRANCH"],
  "Ho & Togo": ["HO & TOGO", "BRANCH"],
  "Koforidua": ["K'DUA", "BRANCH"],
  "Takoradi": ["TAKORADI", "BRANCH"],
  "Tarkwa": ["TARKWA", "BRANCH"],
  "Techiman": ["TECHIMAN", "BRANCH"],
  "Wa": ["WA", "BRANCH"],
}

/**
 * Page 3: the branch matrix, laid out like the printed sheet — branches across,
 * lines down. Opening stock, production and goods available are held at Head
 * Office, so they sit in that column and in the total; the stock balance is a
 * single figure in the total column.
 */
export function buildBranchStatement(report: MonthlyStockReport): { columns: StatementColumn[]; rows: StatementRow[] } {
  const branches = report.branchMatrix
  const hasOther = report.unassignedSales > 0

  const columns: StatementColumn[] = branches.map((b) => ({
    key: b.branch,
    line1: BRANCH_HEADER[b.branch]?.[0] ?? b.branch.toUpperCase(),
    line2: BRANCH_HEADER[b.branch]?.[1] ?? "BRANCH",
  }))
  if (hasOther) columns.push({ key: "__other", line1: "OTHER", line2: "DESTINATIONS" })

  const headIndex = branches.findIndex((b) => b.branch === "Head Office")
  const blank = (): (number | null)[] => columns.map(() => null)
  const perBranch = (pick: (b: BranchDistributionRow) => number, other: number | null): (number | null)[] => {
    const cells: (number | null)[] = branches.map(pick)
    if (hasOther) cells.push(other)
    return cells
  }
  const atHeadOffice = (value: number): (number | null)[] => {
    const cells = blank()
    if (headIndex >= 0) cells[headIndex] = value
    return cells
  }

  const rows: StatementRow[] = [
    { key: "opening", label: "A. OPENING STOCK", kind: "line", cells: atHeadOffice(report.openingStock), total: report.openingStock },
    { key: "production", label: "B. PRODUCTION COMPLETED", kind: "line", cells: atHeadOffice(report.totalProduced), total: report.totalProduced },
    { key: "available", label: "C. GOODS AVAILABLE FOR DISTRIBUTION (A+B)", kind: "total", cells: atHeadOffice(report.goodsAvailable), total: report.goodsAvailable },
    { key: "gap", label: "", kind: "spacer", cells: blank(), total: null },
    { key: "distributions", label: "DISTRIBUTIONS", kind: "section", cells: blank(), total: null },
    { key: "sales", label: "Total Sales", kind: "line", cells: perBranch((b) => b.totalSales, report.unassignedSales), total: report.totalSales },
    { key: "spoilage", label: "i) Spoilage Returns", kind: "line", cells: perBranch((b) => b.spoilageReturns, null), total: report.spoilageReturns },
    { key: "returns", label: "Total Returns", kind: "line", cells: perBranch((b) => b.totalReturns, null), total: report.totalReturns },
    { key: "actual", label: "ii) Actual Sales (TS-TR)", kind: "line", cells: perBranch((b) => b.actualSales, report.unassignedSales), total: report.actualSales },
    { key: "donations", label: "iii) Donations", kind: "line", cells: perBranch((b) => b.donations, null), total: report.donations },
    { key: "distribution", label: "D. TOTAL DISTRIBUTION (I + II + III)", kind: "total", cells: perBranch((b) => b.totalDistribution, report.unassignedSales), total: report.totalDistribution },
    { key: "balance", label: "E. STOCK BALANCE (C-D)", kind: "total", cells: blank(), total: report.closingStock },
  ]

  return { columns, rows }
}

/**
 * The CSV export, in the order and wording of the printed report: statement,
 * Table 1, Table 2, then the branch matrix. Returns plain rows; the caller
 * handles quoting and the download.
 */
export function buildReportCsvRows(report: MonthlyStockReport): (string | number)[][] {
  const rows: (string | number)[][] = []
  const monthUpper = report.period.monthName.toUpperCase()

  rows.push(["LAWSON LIMITED COMPANY"])
  rows.push([PRODUCT_REPORT_NAMES[report.product]])
  rows.push([formatPeriodTitle(report.period.year, report.period.month)])
  rows.push([])

  rows.push(["", "Quantity(Units)", "Quantity(Units)", "Quantity(Units)"])
  rows.push(["Opening Stock", "", report.openingStock])
  rows.push(["Total Production(Table 1)", "", "", report.totalProduced])
  rows.push(["Goods Available for Distribution", "", "", "", report.goodsAvailable])
  rows.push([])
  rows.push(["DISTRIBUTION DETAILS"])
  for (const b of report.branchMatrix) rows.push([b.branch, b.totalSales])
  if (report.unassignedSales > 0) rows.push(["Other destinations", report.unassignedSales])
  rows.push(["TOTAL SALES", "", report.totalSales])
  rows.push(["Less Returns:"])
  rows.push(["Total Spoilage Returns", report.spoilageReturns])
  rows.push(["Total Repackage Returns", "", report.repackReturns])
  rows.push(["TOTAL RETURNS", "", -report.totalReturns])
  rows.push(["ACTUAL SALES", "", report.actualSales])
  rows.push(["Add:"])
  rows.push(["Donations", "", report.donations])
  rows.push(["Spoilage", "", report.spoilageReturns])
  rows.push(["TOTAL DISTRIBUTION", "", "", report.totalDistribution])
  rows.push(["CLOSING STOCK", "", "", report.closingStock])
  rows.push([])

  const wp = report.weeklyProduction
  rows.push(["NOTES"])
  rows.push(["TABLE 1 ."])
  rows.push(["WEEKLY", "GROUP 1", "GROUP 2", "GROUP 3", "PART TIME", "TOTAL"])
  for (const w of wp.rows) rows.push([w.week, w.group1, w.group2, w.group3, w.partTime, w.total])
  rows.push(["TOTAL", wp.totalGroup1, wp.totalGroup2, wp.totalGroup3, wp.totalPartTime, wp.grandTotal])
  rows.push([])

  const rt = summarizeReturnsLog(report.returnsLog)
  rows.push(["TABLE 2.", "RETURNS"])
  rows.push([`DATES: ${monthUpper}`, "REPACKED", "SPOILAGE", "SALES OR DRIVERS NAME", "SOURCE"])
  for (const r of report.returnsLog) {
    rows.push([
      r.formattedDate,
      r.repackCartons > 0 ? r.repackCartons : "",
      r.spoilageCartons > 0 ? r.spoilageCartons : "",
      r.driverName,
      r.sourceBranch,
    ])
  }
  rows.push(["TOTAL", rt.repacked, rt.spoilage, rt.total, ""])
  rows.push([])

  const { columns, rows: matrixRows } = buildBranchStatement(report)
  rows.push(["LAWSON LIMITED COMPANY"])
  rows.push([PRODUCT_REPORT_NAMES[report.product]])
  rows.push([formatPeriodTitle(report.period.year, report.period.month)])
  rows.push([])
  rows.push(["OPERATIONAL OFFICE", ...columns.map((c) => `${c.line1} ${c.line2}`), "TOTAL CARTONS"])
  for (const r of matrixRows) {
    rows.push([r.label, ...r.cells.map((c) => (c === null ? "" : c)), r.total === null ? "" : r.total])
  }

  return rows
}
