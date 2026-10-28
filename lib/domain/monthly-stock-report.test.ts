import { describe, expect, it } from "vitest"
import {
  calculateMonthlyStockBalance,
  buildWeeklyProductionTable,
  buildBranchDistributionMatrix,
  getMonthRange,
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
