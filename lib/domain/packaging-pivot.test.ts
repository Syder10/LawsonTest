import { describe, it, expect } from "vitest"
import {
  buildPackagingPivotMatrix,
  exportPackagingPivotCsv,
  getDaysInMonth,
  type PackagingDailyRow,
} from "./packaging-pivot"

describe("packaging-pivot domain logic", () => {
  it("getDaysInMonth handles leap years and different month lengths", () => {
    expect(getDaysInMonth(2026, 10)).toBe(31) // October
    expect(getDaysInMonth(2026, 11)).toBe(30) // November
    expect(getDaysInMonth(2026, 2)).toBe(28)  // Feb 2026 non-leap
    expect(getDaysInMonth(2024, 2)).toBe(29)  // Feb 2024 leap
  })

  it("builds empty month matrix with zero totals when no records exist", () => {
    const matrix = buildPackagingPivotMatrix({
      year: 2026,
      month: 10,
      records: [],
    })

    expect(matrix.rows).toHaveLength(31)
    expect(matrix.monthName).toBe("October")
    expect(matrix.summary.totalCartons).toBe(0)
    expect(matrix.summary.operatingDays).toBe(0)
    expect(matrix.summary.group1Total).toBe(0)
    expect(matrix.summary.group2Total).toBe(0)
    expect(matrix.summary.group3Total).toBe(0)
  })

  it("aggregates cartons correctly by group and by shift", () => {
    const records: PackagingDailyRow[] = [
      {
        date: "2026-10-01",
        shift: "Morning",
        group_number: 1,
        product: "Bitters",
        quantity_cartons_produced: 1000,
      },
      {
        date: "2026-10-01",
        shift: "Afternoon",
        group_number: 2,
        product: "Bitters",
        quantity_cartons_produced: 1200,
      },
      {
        date: "2026-10-01",
        shift: "Night",
        group_number: 3,
        product: "Bitters",
        quantity_cartons_produced: 800,
      },
      {
        date: "2026-10-02",
        shift: "Morning",
        group_number: 2,
        product: "Ginger",
        quantity_cartons_produced: 1500,
      },
      {
        date: "2026-10-02",
        shift: "Afternoon",
        group_number: null,
        product: "Ginger",
        quantity_cartons_produced: 500,
        is_part_time: true,
      },
    ]

    const matrix = buildPackagingPivotMatrix({
      year: 2026,
      month: 10,
      records,
    })

    expect(matrix.summary.totalCartons).toBe(5000)
    expect(matrix.summary.group1Total).toBe(1000)
    expect(matrix.summary.group2Total).toBe(2700)
    expect(matrix.summary.group3Total).toBe(800)
    expect(matrix.summary.partTimeTotal).toBe(500)
    expect(matrix.summary.operatingDays).toBe(2)
    expect(matrix.summary.dailyAverage).toBe(2500)
    expect(matrix.summary.peakDate).toBe("2026-10-01") // 3000 on day 1 vs 2000 on day 2
    expect(matrix.summary.peakCartons).toBe(3000)

    // Percentage shares
    expect(matrix.summary.group1Share).toBe(20) // 1000 / 5000 = 20%
    expect(matrix.summary.group2Share).toBe(54) // 2700 / 5000 = 54%
    expect(matrix.summary.group3Share).toBe(16) // 800 / 5000 = 16%
    expect(matrix.summary.partTimeShare).toBe(10) // 500 / 5000 = 10%

    // Day 1 row check
    const day1 = matrix.rows[0]
    expect(day1.group1.cartons).toBe(1000)
    expect(day1.group1.shifts[0].shift).toBe("Morning")
    expect(day1.group2.cartons).toBe(1200)
    expect(day1.group3.cartons).toBe(800)
    expect(day1.total).toBe(3000)
    expect(day1.byShift.Morning.cartons).toBe(1000)
    expect(day1.byShift.Afternoon.cartons).toBe(1200)
    expect(day1.byShift.Night.cartons).toBe(800)

    // Day 2 row check
    const day2 = matrix.rows[1]
    expect(day2.group1.cartons).toBe(0)
    expect(day2.group2.cartons).toBe(1500)
    expect(day2.partTime.cartons).toBe(500)
    expect(day2.total).toBe(2000)
  })

  it("filters correctly by product", () => {
    const records: PackagingDailyRow[] = [
      {
        date: "2026-10-05",
        shift: "Morning",
        group_number: 1,
        product: "Bitters",
        quantity_cartons_produced: 2000,
      },
      {
        date: "2026-10-05",
        shift: "Morning",
        group_number: 1,
        product: "Ginger",
        quantity_cartons_produced: 1000,
      },
    ]

    const bittersMatrix = buildPackagingPivotMatrix({
      year: 2026,
      month: 10,
      records,
      productFilter: "Bitters",
    })
    expect(bittersMatrix.summary.totalCartons).toBe(2000)
    expect(bittersMatrix.rows[4].group1.cartons).toBe(2000)

    const gingerMatrix = buildPackagingPivotMatrix({
      year: 2026,
      month: 10,
      records,
      productFilter: "Ginger",
    })
    expect(gingerMatrix.summary.totalCartons).toBe(1000)
    expect(gingerMatrix.rows[4].group1.cartons).toBe(1000)
  })

  it("filters correctly by shift", () => {
    const records: PackagingDailyRow[] = [
      {
        date: "2026-10-05",
        shift: "Morning",
        group_number: 1,
        product: "Bitters",
        quantity_cartons_produced: 1200,
      },
      {
        date: "2026-10-05",
        shift: "Night",
        group_number: 3,
        product: "Bitters",
        quantity_cartons_produced: 900,
      },
    ]

    const morningMatrix = buildPackagingPivotMatrix({
      year: 2026,
      month: 10,
      records,
      shiftFilter: "Morning",
    })
    expect(morningMatrix.summary.totalCartons).toBe(1200)
    expect(morningMatrix.rows[4].group1.cartons).toBe(1200)
    expect(morningMatrix.rows[4].group3.cartons).toBe(0)
  })

  it("exports valid CSV in groups and shifts view modes", () => {
    const records: PackagingDailyRow[] = [
      {
        date: "2026-10-01",
        shift: "Morning",
        group_number: 1,
        product: "Bitters",
        quantity_cartons_produced: 1000,
      },
    ]

    const matrix = buildPackagingPivotMatrix({
      year: 2026,
      month: 10,
      records,
    })

    const groupCsv = exportPackagingPivotCsv(matrix, "groups")
    expect(groupCsv).toContain("LAWSON LIMITED COMPANY - PACKAGING PRODUCTION ANALYSIS")
    expect(groupCsv).toContain("Date,Day,Group 1,Group 2,Group 3,Part Time,Daily Total")
    expect(groupCsv).toContain("2026-10-01,Thu,1000,0,0,0,1000")
    expect(groupCsv).toContain("TOTAL,,1000,0,0,0,1000")

    const shiftCsv = exportPackagingPivotCsv(matrix, "shifts")
    expect(shiftCsv).toContain("Date,Day,Morning,Afternoon,Night,Daily Total")
    expect(shiftCsv).toContain("2026-10-01,Thu,1000,0,0,1000")
  })

  it("aggregates multiple entries for the same shift within a group into one shift badge", () => {
    const records: PackagingDailyRow[] = [
      {
        date: "2026-10-03",
        shift: "Morning",
        group_number: 1,
        product: "Bitters",
        quantity_cartons_produced: 600,
      },
      {
        date: "2026-10-03",
        shift: "Morning",
        group_number: 1,
        product: "Ginger",
        quantity_cartons_produced: 400,
      },
    ]

    const matrix = buildPackagingPivotMatrix({
      year: 2026,
      month: 10,
      records,
    })

    const day3 = matrix.rows[2]
    expect(day3.group1.cartons).toBe(1000)
    expect(day3.group1.shifts).toHaveLength(1)
    expect(day3.group1.shifts[0].cartons).toBe(1000)
    expect(day3.group1.shifts[0].shift).toBe("Morning")
  })
})
