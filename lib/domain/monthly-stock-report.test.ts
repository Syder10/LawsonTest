import { describe, expect, it } from "vitest"
import {
  calculateMonthlyStockBalance,
  buildWeeklyProductionTable,
  buildBranchDistributionMatrix,
  buildBranchStatement,
  buildReportCsvRows,
  computeUnassignedSales,
  formatPeriodTitle,
  formatQty,
  getMonthRange,
  ordinal,
  summarizeReturnsLog,
  type MonthlyReturnEvent,
  type MonthlyStockReport,
} from "./monthly-stock-report"

describe("Monthly Stock Report - Core Equations", () => {
  it("matches De-Ray Man Abitters July 2026 ground-truth figures", () => {
    const bitters = calculateMonthlyStockBalance({
      openingStock: 8127,
      totalProduced: 110704,
      totalSales: 94057,
      repackReturns: 2144,
      spoilageReturns: 106,
      donations: 102,
    })

    expect(bitters.goodsAvailable).toBe(118831)
    expect(bitters.totalReturns).toBe(2250)
    expect(bitters.actualSales).toBe(91807)
    expect(bitters.totalDistribution).toBe(92015)
    expect(bitters.closingStock).toBe(26816)
  })

  it("matches De-Ray Man Ginger Liquor July 2026 ground-truth figures", () => {
    const ginger = calculateMonthlyStockBalance({
      openingStock: 3768,
      totalProduced: 16022,
      totalSales: 12216,
      repackReturns: 688,
      spoilageReturns: 21,
      donations: 251,
    })

    expect(ginger.goodsAvailable).toBe(19790)
    expect(ginger.totalReturns).toBe(709)
    expect(ginger.actualSales).toBe(11507)
    expect(ginger.totalDistribution).toBe(11779)
    expect(ginger.closingStock).toBe(8011)
  })
})

describe("Weekly Production Table (Table 1)", () => {
  it("aggregates production into weeks and groups accurately", () => {
    const records = [
      { date: "2026-07-02", quantity_cartons_produced: 1000, group_number: 1 },
      { date: "2026-07-05", quantity_cartons_produced: 1500, group_number: 2 },
      { date: "2026-07-10", quantity_cartons_produced: 800, group_number: 3 },
      { date: "2026-07-25", quantity_cartons_produced: 600, group_number: 1, is_part_time: true }, // Part Time override
    ]

    const result = buildWeeklyProductionTable(records)
    expect(result.rows[0].group1).toBe(1000) // Week 1: 2nd
    expect(result.rows[0].group2).toBe(1500) // Week 1: 5th
    expect(result.rows[1].group3).toBe(800)  // Week 2: 10th
    expect(result.rows[3].partTime).toBe(600) // Week 4: 25th (is_part_time)
    expect(result.rows[3].group1).toBe(0)

    expect(result.totalGroup1).toBe(1000)
    expect(result.totalGroup2).toBe(1500)
    expect(result.totalGroup3).toBe(800)
    expect(result.totalPartTime).toBe(600)
    expect(result.grandTotal).toBe(3900)
  })
})

describe("Branch Distribution Matrix", () => {
  it("maps dispatches and returns across branches", () => {
    const matrix = buildBranchDistributionMatrix({
      dispatches: [
        { destination: "Head Office", cartons: 5000 },
        { destination: "Accra", cartons: 3000 },
      ],
      returns: [
        { sourceBranch: "Accra", repackCartons: 10, spoilageCartons: 5 },
      ],
      donations: 50,
    })

    const accra = matrix.find((b) => b.branch === "Accra")!
    expect(accra.totalSales).toBe(3000)
    expect(accra.repackReturns).toBe(10)
    expect(accra.spoilageReturns).toBe(5)
    expect(accra.totalReturns).toBe(15)
    expect(accra.actualSales).toBe(2985)

    const ho = matrix.find((b) => b.branch === "Head Office")!
    expect(ho.donations).toBe(50)
  })
})

describe("Date helpers", () => {
  it("computes proper start and end dates for leap and non-leap years", () => {
    expect(getMonthRange(2026, 7)).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31" })
    expect(getMonthRange(2024, 2)).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" })
  })
})

// ── Statement layout ───────────────────────────────────────────────────────

describe("Report period title", () => {
  it("uses the right ordinal for every month length", () => {
    expect(ordinal(1)).toBe("1st")
    expect(ordinal(2)).toBe("2nd")
    expect(ordinal(3)).toBe("3rd")
    expect(ordinal(11)).toBe("11th")
    expect(ordinal(12)).toBe("12th")
    expect(ordinal(13)).toBe("13th")
    expect(ordinal(21)).toBe("21st")
    expect(ordinal(22)).toBe("22nd")
    expect(ordinal(28)).toBe("28th")
    expect(ordinal(30)).toBe("30th")
    expect(ordinal(31)).toBe("31st")
  })

  it("reads 1ST - 31ST for July, 30TH for November, 28TH or 29TH for February", () => {
    expect(formatPeriodTitle(2026, 7)).toBe("STOCK REPORT FOR THE PERIOD 1ST - 31ST JULY, 2026")
    expect(formatPeriodTitle(2026, 11)).toBe("STOCK REPORT FOR THE PERIOD 1ST - 30TH NOVEMBER, 2026")
    expect(formatPeriodTitle(2026, 2)).toBe("STOCK REPORT FOR THE PERIOD 1ST - 28TH FEBRUARY, 2026")
    expect(formatPeriodTitle(2024, 2)).toBe("STOCK REPORT FOR THE PERIOD 1ST - 29TH FEBRUARY, 2024")
  })
})

describe("formatQty", () => {
  it("prints plain figures like the statement", () => {
    expect(formatQty(110704)).toBe("110704")
    expect(formatQty(-2250)).toBe("-2250")
    expect(formatQty(0)).toBe("0")
    expect(formatQty(12.5)).toBe("12.5")
    expect(formatQty(12.0)).toBe("12")
    expect(formatQty(null)).toBe("")
    expect(formatQty(undefined)).toBe("")
  })
})

// The July 2026 sample, rebuilt from its lines. Branch columns are kept as the
// sample prints them, except Techiman's actual sales, which the sample prints as
// 5750 although 5750 - 2 returned is 5748 (that is why its matrix total reads 91809
// while its summary page reads 91807).
function julyReport(extraDispatch: { destination: string; cartons: number }[] = []): MonthlyStockReport {
  const dispatches = [
    { destination: "Head Office", cartons: 46707 },
    { destination: "Accra", cartons: 15500 },
    { destination: "Bolgatanga", cartons: 3700 },
    { destination: "Cape Coast", cartons: 3000 },
    { destination: "Ho & Togo", cartons: 1500 },
    { destination: "Koforidua", cartons: 2400 },
    { destination: "Takoradi", cartons: 13400 },
    { destination: "Techiman", cartons: 5750 },
    { destination: "Wa", cartons: 2100 },
    ...extraDispatch,
  ]
  const ev = (id: string, source: string, repack: number, spoilage: number): MonthlyReturnEvent => ({
    id, date: "2026-07-03", formattedDate: "3rd", driverName: "Driver " + id, sourceBranch: source,
    vehicleReg: null, repackCartons: repack, spoilageCartons: spoilage, totalCartons: repack + spoilage, remarks: null,
  })
  const returnsLog = [
    ev("a", "Head Office", 2067, 21),
    ev("b", "Accra", 0, 29),
    ev("c", "Takoradi", 77, 54),
    ev("d", "Techiman", 0, 2),
  ]
  const totalSales = dispatches.reduce((s, d) => s + d.cartons, 0)
  const repackReturns = returnsLog.reduce((s, r) => s + r.repackCartons, 0)
  const spoilageReturns = returnsLog.reduce((s, r) => s + r.spoilageCartons, 0)
  const bal = calculateMonthlyStockBalance({
    openingStock: 8127, totalProduced: 110704, totalSales, repackReturns, spoilageReturns, donations: 102,
  })
  const branchMatrix = buildBranchDistributionMatrix({ dispatches, returns: returnsLog, donations: 102 })
  return {
    period: { year: 2026, month: 7, monthName: "July", startDate: "2026-07-01", endDate: "2026-07-31" },
    product: "Bitters",
    openingStock: 8127,
    totalProduced: 110704,
    goodsAvailable: bal.goodsAvailable,
    totalSales,
    unassignedSales: computeUnassignedSales(totalSales, branchMatrix),
    repackReturns,
    spoilageReturns,
    totalReturns: bal.totalReturns,
    actualSales: bal.actualSales,
    donations: 102,
    totalDistribution: bal.totalDistribution,
    closingStock: bal.closingStock,
    weeklyProduction: buildWeeklyProductionTable([]),
    returnsLog,
    branchMatrix,
  }
}

describe("Branch statement (page 3)", () => {
  const report = julyReport()
  const { columns, rows } = buildBranchStatement(report)
  const row = (key: string) => rows.find((r) => r.key === key)!
  const col = (branch: string) => columns.findIndex((c) => c.key === branch)

  it("has one column per branch and the sample's row order", () => {
    expect(columns).toHaveLength(10)
    expect(rows.map((r) => r.key)).toEqual([
      "opening", "production", "available", "gap", "distributions",
      "sales", "spoilage", "returns", "actual", "donations", "distribution", "balance",
    ])
  })

  it("reproduces the sample's per-branch figures", () => {
    const head = col("Head Office")
    expect(row("sales").cells[head]).toBe(46707)
    expect(row("returns").cells[head]).toBe(2088)
    expect(row("actual").cells[head]).toBe(44619)
    expect(row("donations").cells[head]).toBe(102)
    expect(row("distribution").cells[head]).toBe(44742)
    const tak = col("Takoradi")
    expect(row("returns").cells[tak]).toBe(131)
    expect(row("actual").cells[tak]).toBe(13269)
    expect(row("distribution").cells[tak]).toBe(13323)
    expect(row("distribution").cells[col("Accra")]).toBe(15500)
  })

  it("holds opening stock, production and goods available at Head Office and in the total", () => {
    const head = col("Head Office")
    expect(row("opening").cells[head]).toBe(8127)
    expect(row("opening").total).toBe(8127)
    expect(row("production").total).toBe(110704)
    expect(row("available").cells[head]).toBe(118831)
    expect(row("available").total).toBe(118831)
    expect(row("opening").cells.filter((c) => c !== null)).toHaveLength(1)
  })

  it("ends in the closing stock, as a total only", () => {
    expect(row("balance").total).toBe(26816)
    expect(row("balance").cells.every((c) => c === null)).toBe(true)
  })

  it("adds up: every branch line sums to the statement total", () => {
    for (const key of ["sales", "spoilage", "returns", "actual", "donations", "distribution"]) {
      const sum = row(key).cells.reduce<number>((s, c) => s + (c ?? 0), 0)
      expect(sum, key).toBe(row(key).total)
    }
    expect(row("sales").total).toBe(94057)
    expect(row("actual").total).toBe(91807)
    expect(row("distribution").total).toBe(92015)
  })

  it("keeps old, non-branch destinations visible so the lines still add up", () => {
    const withOld = julyReport([{ destination: "Kumasi Depot", cartons: 500 }])
    expect(withOld.unassignedSales).toBe(500)
    const stmt = buildBranchStatement(withOld)
    expect(stmt.columns).toHaveLength(11)
    expect(stmt.columns[10].key).toBe("__other")
    for (const key of ["sales", "actual", "distribution"]) {
      const r = stmt.rows.find((x) => x.key === key)!
      expect(r.cells.reduce<number>((s, c) => s + (c ?? 0), 0), key).toBe(r.total)
    }
  })
})

describe("Returns totals (Table 2)", () => {
  it("totals repacked, spoilage and the two together", () => {
    const t = summarizeReturnsLog(julyReport().returnsLog)
    expect(t).toEqual({ repacked: 2144, spoilage: 106, total: 2250 })
  })
})

describe("Unassigned sales", () => {
  it("is zero when every dispatch matched a branch and never negative", () => {
    const r = julyReport()
    expect(r.unassignedSales).toBe(0)
    expect(computeUnassignedSales(10, r.branchMatrix)).toBe(0)
  })
})

describe("CSV export follows the printed report", () => {
  const rows = buildReportCsvRows(julyReport())
  const flat = rows.map((r) => r.join("|"))

  it("starts with the company heading and the period", () => {
    expect(rows[0][0]).toBe("LAWSON LIMITED COMPANY")
    expect(rows[1][0]).toBe("DE-RAY MAN ABITTERS")
    expect(rows[2][0]).toBe("STOCK REPORT FOR THE PERIOD 1ST - 31ST JULY, 2026")
  })

  it("lists the statement lines in the sample's order", () => {
    const labels = ["Opening Stock", "Total Production(Table 1)", "Goods Available for Distribution", "DISTRIBUTION DETAILS",
      "TOTAL SALES", "Less Returns:", "Total Spoilage Returns", "Total Repackage Returns", "TOTAL RETURNS", "ACTUAL SALES",
      "Add:", "Donations", "Spoilage", "TOTAL DISTRIBUTION", "CLOSING STOCK", "NOTES", "TABLE 1 .", "TABLE 2.", "OPERATIONAL OFFICE"]
    let from = 0
    for (const label of labels) {
      const at = rows.findIndex((r, i) => i >= from && r[0] === label)
      expect(at, label).toBeGreaterThanOrEqual(from)
      from = at + 1
    }
  })

  it("shows total returns as a negative and the closing stock", () => {
    expect(flat).toContain("TOTAL RETURNS||-2250")
    expect(flat).toContain("CLOSING STOCK|||26816")
  })

  it("ends Table 2 with the three totals", () => {
    expect(flat).toContain("TOTAL|2144|106|2250|")
  })
})
