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
