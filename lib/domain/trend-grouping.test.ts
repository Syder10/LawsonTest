import { describe, it, expect } from "vitest"
import {
  groupTrendData,
  getMondayOfWeek,
  type TrendDataPoint,
} from "./trend-grouping"

describe("trend-grouping domain", () => {
  describe("getMondayOfWeek", () => {
    it("returns Monday when date is already a Monday", () => {
      // 2026-10-19 is Monday
      expect(getMondayOfWeek("2026-10-19")).toBe("2026-10-19")
    })

    it("returns previous Monday when date is mid-week", () => {
      // 2026-10-21 is Wednesday
      expect(getMondayOfWeek("2026-10-21")).toBe("2026-10-19")
    })

    it("returns previous Monday when date is Sunday", () => {
      // 2026-10-25 is Sunday
      expect(getMondayOfWeek("2026-10-25")).toBe("2026-10-19")
    })
  })

  describe("groupTrendData", () => {
    const samplePoints: TrendDataPoint[] = [
      { date: "2026-10-19", total: 100, bitters: 60, ginger: 40 }, // Week 1 (Mon)
      { date: "2026-10-20", total: 150, bitters: 100, ginger: 50 }, // Week 1 (Tue)
      { date: "2026-10-26", total: 200, bitters: 120, ginger: 80 }, // Week 2 (Mon)
      { date: "2026-11-02", total: 300, bitters: 200, ginger: 100 }, // Nov Week 1 (Mon)
    ]

    it("handles empty data gracefully", () => {
      expect(groupTrendData([], "day")).toEqual([])
      expect(groupTrendData([], "week")).toEqual([])
      expect(groupTrendData([], "month")).toEqual([])
    })

    it("groups by day without blending distinct days", () => {
      const grouped = groupTrendData(samplePoints, "day")
      expect(grouped).toHaveLength(4)
      expect(grouped[0].key).toBe("2026-10-19")
      expect(grouped[0].total).toBe(100)
      expect(grouped[0].bitters).toBe(60)
      expect(grouped[0].ginger).toBe(40)
      expect(grouped[0].startDate).toBe("2026-10-19")
    })

    it("groups by week, aggregating sums within the same ISO calendar week", () => {
      const grouped = groupTrendData(samplePoints, "week")
      expect(grouped).toHaveLength(3) // 2026-10-19, 2026-10-26, 2026-11-02

      // First week (combines 2026-10-19 and 2026-10-20)
      expect(grouped[0].key).toBe("2026-10-19")
      expect(grouped[0].total).toBe(250) // 100 + 150
      expect(grouped[0].bitters).toBe(160) // 60 + 100
      expect(grouped[0].ginger).toBe(90) // 40 + 50
      expect(grouped[0].startDate).toBe("2026-10-19")

      // Second week
      expect(grouped[1].key).toBe("2026-10-26")
      expect(grouped[1].total).toBe(200)

      // Third week
      expect(grouped[2].key).toBe("2026-11-02")
      expect(grouped[2].total).toBe(300)
    })

    it("groups by month, aggregating sums within each calendar month", () => {
      const grouped = groupTrendData(samplePoints, "month")
      expect(grouped).toHaveLength(2) // Oct 2026, Nov 2026

      // Oct 2026: 100 + 150 + 200 = 450
      expect(grouped[0].key).toBe("2026-10")
      expect(grouped[0].label).toBe("Oct 2026")
      expect(grouped[0].total).toBe(450)
      expect(grouped[0].bitters).toBe(280) // 60 + 100 + 120
      expect(grouped[0].ginger).toBe(170) // 40 + 50 + 80
      expect(grouped[0].startDate).toBe("2026-10-01")

      // Nov 2026: 300
      expect(grouped[1].key).toBe("2026-11")
      expect(grouped[1].label).toBe("Nov 2026")
      expect(grouped[1].total).toBe(300)
      expect(grouped[1].startDate).toBe("2026-11-01")
    })
  })
})
