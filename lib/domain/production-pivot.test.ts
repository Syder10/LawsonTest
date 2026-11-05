import { describe, it, expect } from "vitest"
import {
  buildProductionPivotMatrix,
  exportProductionPivotCsv,
  getDaysInMonth,
  type GenericProductionRecord,
} from "./production-pivot"

describe("production-pivot domain logic", () => {
  it("getDaysInMonth handles leap years and different month lengths", () => {
    expect(getDaysInMonth(2026, 10)).toBe(31) // October
    expect(getDaysInMonth(2026, 11)).toBe(30) // November
    expect(getDaysInMonth(2026, 2)).toBe(28) // Feb 2026 non-leap
    expect(getDaysInMonth(2024, 2)).toBe(29) // Feb 2024 leap
  })

  it("builds empty month matrix with zero totals when no records exist", () => {
    const matrix = buildProductionPivotMatrix({
      year: 2026,
      month: 10,
      records: [] as GenericProductionRecord[],
      valueExtractor: () => 0,
      unit: "bags",
    })

    expect(matrix.rows).toHaveLength(31)
    expect(matrix.monthName).toBe("October")
    expect(matrix.summary.totalValue).toBe(0)
    expect(matrix.summary.operatingDays).toBe(0)
    expect(matrix.summary.group1Total).toBe(0)
    expect(matrix.summary.group2Total).toBe(0)
    expect(matrix.summary.group3Total).toBe(0)
    expect(matrix.summary.partTimeTotal).toBe(0)
  })

  it("aggregates Blowing preforms used bags correctly by group and by shift", () => {
    const records = [
      {
        date: "2026-10-01",
        shift: "Morning",
        group_number: 1,
        preforms_used_bags: 10,
        final_production: 10000,
      },
      {
        date: "2026-10-01",
        shift: "Afternoon",
        group_number: 2,
        preforms_used_bags: 12,
        final_production: 12000,
      },
      {
        date: "2026-10-01",
        shift: "Night",
        group_number: 3,
        preforms_used_bags: 8,
        final_production: 8000,
      },
      {
        date: "2026-10-02",
        shift: "Morning",
        group_number: 2,
        preforms_used_bags: 15,
        final_production: 15000,
      },
      {
        date: "2026-10-02",
        shift: "Afternoon",
        group_number: null,
        is_part_time: true,
        preforms_used_bags: 5,
        final_production: 5000,
      },
    ]

    const preformsMatrix = buildProductionPivotMatrix({
      year: 2026,
      month: 10,
      records,
      valueExtractor: (r) => r.preforms_used_bags,
      unit: "bags",
    })

    expect(preformsMatrix.summary.totalValue).toBe(50)
    expect(preformsMatrix.summary.group1Total).toBe(10)
    expect(preformsMatrix.summary.group2Total).toBe(27)
    expect(preformsMatrix.summary.group3Total).toBe(8)
    expect(preformsMatrix.summary.partTimeTotal).toBe(5)
    expect(preformsMatrix.summary.operatingDays).toBe(2)
    expect(preformsMatrix.summary.dailyAverage).toBe(25)
    expect(preformsMatrix.summary.peakDate).toBe("2026-10-01") // 30 on day 1 vs 20 on day 2
    expect(preformsMatrix.summary.peakValue).toBe(30)

    // Percentage shares
    expect(preformsMatrix.summary.group1Share).toBe(20) // 10 / 50 = 20%
    expect(preformsMatrix.summary.group2Share).toBe(54) // 27 / 50 = 54%
    expect(preformsMatrix.summary.group3Share).toBe(16) // 8 / 50 = 16%
    expect(preformsMatrix.summary.partTimeShare).toBe(10) // 5 / 50 = 10%

    // Net output matrix check
    const netOutputMatrix = buildProductionPivotMatrix({
      year: 2026,
      month: 10,
      records,
      valueExtractor: (r) => r.final_production,
      unit: "bottles",
    })
    expect(netOutputMatrix.summary.totalValue).toBe(50000)
    expect(netOutputMatrix.summary.group1Total).toBe(10000)
    expect(netOutputMatrix.summary.group2Total).toBe(27000)
  })

  it("filters correctly by product and shift", () => {
    const records = [
      {
        date: "2026-10-01",
        shift: "Morning",
        group_number: 1,
        product: "Bitters",
        total_production: 2000,
      },
      {
        date: "2026-10-01",
        shift: "Morning",
        group_number: 1,
        product: "Ginger",
        total_production: 1500,
      },
      {
        date: "2026-10-01",
        shift: "Night",
        group_number: 3,
        product: "Bitters",
        total_production: 1000,
      },
    ]

    const bittersOnly = buildProductionPivotMatrix({
      year: 2026,
      month: 10,
      records,
      valueExtractor: (r) => r.total_production,
      productFilter: "Bitters",
      unit: "bottles",
    })
    expect(bittersOnly.summary.totalValue).toBe(3000)

    const morningOnly = buildProductionPivotMatrix({
      year: 2026,
      month: 10,
      records,
      valueExtractor: (r) => r.total_production,
      shiftFilter: "Morning",
      unit: "bottles",
    })
    expect(morningOnly.summary.totalValue).toBe(3500)
  })

  it("exports valid CSV text with headers and rows", () => {
    const matrix = buildProductionPivotMatrix({
      year: 2026,
      month: 10,
      records: [
        {
          date: "2026-10-01",
          shift: "Morning",
          group_number: 1,
          value: 120,
        },
      ],
      valueExtractor: (r) => r.value,
      unit: "drums",
    })

    const csvGroups = exportProductionPivotCsv(matrix, "groups", "Alcohol Used")
    expect(csvGroups).toContain("Production Pivot Analysis - October 2026")
    expect(csvGroups).toContain("Metric: Alcohol Used (drums)")
    expect(csvGroups).toContain("Date,Day,Group 1,Group 2,Group 3,Part Time,Daily Total")
    expect(csvGroups).toContain("2026-10-01,Thu,120,0,0,0,120")
    expect(csvGroups).toContain("Monthly Total,,120,0,0,0,120")

    const csvShifts = exportProductionPivotCsv(matrix, "shifts", "Alcohol Used")
    expect(csvShifts).toContain("Date,Day,Morning,Afternoon,Night,Daily Total")
    expect(csvShifts).toContain("2026-10-01,Thu,120,0,0,120")

    // Test 2-group export (Alcohol and Blending)
    const csv2Groups = exportProductionPivotCsv(matrix, "groups", "Alcohol Used", { groupCount: 2 })
    expect(csv2Groups).toContain("Date,Day,Group 1,Group 2,Part Time,Daily Total")
    expect(csv2Groups).not.toContain("Group 3")
    expect(csv2Groups).toContain("2026-10-01,Thu,120,0,0,120")
  })
})
