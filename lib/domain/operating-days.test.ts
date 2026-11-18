import { describe, it, expect } from "vitest"
import {
  distinctDays,
  isOperatingDay,
  operatingDaysBetween,
  projectRunOut,
  usageSpanOperatingDays,
} from "@/lib/domain/operating-days"

// Reference calendar used throughout (all UTC — the app treats Ghana as UTC):
//   2026-08-20 Thu   2026-08-22 Sat   2026-08-23 Sun   2026-08-24 Mon
//   2026-08-29 Sat   2026-08-30 Sun   2026-08-31 Mon   2026-09-03 Thu
const MON = "2026-08-24"
const SAT = "2026-08-22"
const SUN = "2026-08-23"

describe("isOperatingDay", () => {
  it("returns true for Monday (plant open)", () => {
    expect(isOperatingDay(new Date("2026-08-24T12:00:00Z"))).toBe(true)
  })

  it("returns true for Saturday (lighter shifts, but still one operating day)", () => {
    expect(isOperatingDay(new Date("2026-08-22T12:00:00Z"))).toBe(true)
  })

  it("returns false for Sunday (plant closed)", () => {
    expect(isOperatingDay(new Date("2026-08-23T12:00:00Z"))).toBe(false)
  })

  it("returns false at the very start of Sunday UTC (00:00:00Z)", () => {
    expect(isOperatingDay(new Date("2026-08-23T00:00:00Z"))).toBe(false)
  })

  it("returns false at the very end of Sunday UTC (23:59:59Z)", () => {
    expect(isOperatingDay(new Date("2026-08-23T23:59:59Z"))).toBe(false)
  })

  it("uses UTC day-of-week, not local: 2026-08-24T00:30:00Z is Monday even where local time is still Sunday", () => {
    expect(isOperatingDay(new Date("2026-08-24T00:30:00Z"))).toBe(true)
  })

  it("returns true for all six Mon-Sat days of one week and false only for the Sunday", () => {
    const week = [
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]
    expect(week.map((d) => isOperatingDay(new Date(d + "T00:00:00Z")))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
    ])
  })
})

describe("operatingDaysBetween", () => {
  it("counts a single Monday as 1 operating day (range is inclusive on both ends)", () => {
    expect(operatingDaysBetween(MON, MON)).toBe(1)
  })

  it("counts a single Saturday as 1 operating day", () => {
    expect(operatingDaysBetween(SAT, SAT)).toBe(1)
  })

  it("counts a single Sunday as 0 operating days", () => {
    expect(operatingDaysBetween(SUN, SUN)).toBe(0)
  })

  it("counts Mon-Sun (7 calendar days) as 6 operating days", () => {
    expect(operatingDaysBetween("2026-08-24", "2026-08-30")).toBe(6)
  })

  it("counts Mon-Sat (6 calendar days) as 6 operating days", () => {
    expect(operatingDaysBetween("2026-08-24", "2026-08-29")).toBe(6)
  })

  it("counts two full weeks (Mon-Sun x2) as 12 operating days", () => {
    expect(operatingDaysBetween("2026-08-24", "2026-09-06")).toBe(12)
  })

  it("includes the Sunday-bounded ends correctly: Sun-Sun (8 days) is 6 operating days", () => {
    expect(operatingDaysBetween("2026-08-23", "2026-08-30")).toBe(6)
  })

  it("counts across a month boundary (Aug 31 Mon - Sep 6 Sun) as 6 operating days", () => {
    expect(operatingDaysBetween("2026-08-31", "2026-09-06")).toBe(6)
  })

  it("counts across a month boundary that starts mid-week (Aug 27 Thu - Sep 2 Wed) as 6 operating days", () => {
    // Thu, Fri, Sat = 3; Sun skipped; Mon, Tue, Wed = 3.
    expect(operatingDaysBetween("2026-08-27", "2026-09-02")).toBe(6)
  })

  it("counts a whole non-leap year (2026 has 365 days and 52 Sundays) as 313 operating days", () => {
    expect(operatingDaysBetween("2026-01-01", "2026-12-31")).toBe(313)
  })

  it("counts February of a leap year (2028: 29 days, 4 Sundays) as 25 operating days", () => {
    expect(operatingDaysBetween("2028-02-01", "2028-02-29")).toBe(25)
  })

  it("returns 0 when `from` is after `to` (empty range, no throw)", () => {
    expect(operatingDaysBetween("2026-08-29", "2026-08-24")).toBe(0)
  })

  it("returns 0 when `from` is one day after `to`", () => {
    expect(operatingDaysBetween("2026-08-25", "2026-08-24")).toBe(0)
  })
})

describe("projectRunOut - no measurable usage", () => {
  it("returns zero average and null projections when nothing was used in the window", () => {
    expect(projectRunOut(500, 0, 6, MON)).toEqual({
      avgPerOperatingDay: 0,
      operatingDaysLeft: null,
      runOutDate: null,
    })
  })

  it("returns zero average and null projections when the window has 0 operating days (avoids divide-by-zero)", () => {
    expect(projectRunOut(500, 120, 0, MON)).toEqual({
      avgPerOperatingDay: 0,
      operatingDaysLeft: null,
      runOutDate: null,
    })
  })

  it("treats a negative measured usage as no usage (nulls, never a negative burn rate)", () => {
    expect(projectRunOut(500, -60, 6, MON)).toEqual({
      avgPerOperatingDay: 0,
      operatingDaysLeft: null,
      runOutDate: null,
    })
  })
})

describe("projectRunOut - burn rate and operating days left", () => {
  it("computes avgPerOperatingDay as usedInWindow / operatingDaysInWindow", () => {
    expect(projectRunOut(100, 60, 6, MON).avgPerOperatingDay).toBe(10)
  })

  it("rounds avgPerOperatingDay to 2 decimal places (100/3 -> 33.33)", () => {
    expect(projectRunOut(1000, 100, 3, MON).avgPerOperatingDay).toBe(33.33)
  })

  it("rounds operatingDaysLeft to 1 decimal place (100 / (70/6) -> 8.6)", () => {
    expect(projectRunOut(100, 70, 6, MON).operatingDaysLeft).toBe(8.6)
  })

  it("computes operatingDaysLeft from the UNROUNDED average (50 / 33.333.. -> 1.5, not 50/33.33)", () => {
    const out = projectRunOut(50, 100, 3, MON)
    expect(out.avgPerOperatingDay).toBe(33.33)
    expect(out.operatingDaysLeft).toBe(1.5)
  })

  it("reports 0 operating days left when the remaining balance is already 0", () => {
    expect(projectRunOut(0, 60, 6, MON).operatingDaysLeft).toBe(0)
  })

  it("reports a negative operatingDaysLeft when the balance is already negative (over-issued stock)", () => {
    expect(projectRunOut(-20, 60, 6, MON).operatingDaysLeft).toBe(-2)
  })
})

describe("projectRunOut - run-out date walks operating days only", () => {
  it("returns the day the balance hits exactly zero (60 left at 10/day from Mon -> Sat)", () => {
    // Mon 24, Tue 25, Wed 26, Thu 27, Fri 28, Sat 29 = 6 operating days.
    expect(projectRunOut(60, 60, 6, MON).runOutDate).toBe("2026-08-29")
  })

  it("skips Sunday when walking forward (70 left at 10/day from Mon -> the following Mon, not Sunday)", () => {
    // 6 days to Sat 29, Sun 30 is closed, so the 7th operating day is Mon 31.
    expect(projectRunOut(70, 60, 6, MON).runOutDate).toBe("2026-08-31")
  })

  it("crosses a month boundary (100 left at 10/day from Mon 2026-08-24 -> Thu 2026-09-03)", () => {
    expect(projectRunOut(100, 60, 6, MON)).toEqual({
      avgPerOperatingDay: 10,
      operatingDaysLeft: 10,
      runOutDate: "2026-09-03",
    })
  })

  it("returns the first operating day when a single day's burn empties the stock", () => {
    expect(projectRunOut(10, 10, 1, MON).runOutDate).toBe("2026-08-24")
  })

  it("starts counting from the Monday when `fromISO` is a closed Sunday", () => {
    expect(projectRunOut(10, 10, 1, SUN).runOutDate).toBe("2026-08-24")
  })

  it("counts Saturday as a full operating day when `fromISO` is a Saturday", () => {
    // Sat 22 is day 1, Sun 23 skipped, Mon 24 is day 2.
    expect(projectRunOut(20, 10, 1, SAT).runOutDate).toBe("2026-08-24")
  })

  it("returns the first operating day when the balance is already 0", () => {
    expect(projectRunOut(0, 10, 1, MON).runOutDate).toBe("2026-08-24")
  })

  it("returns the first operating day when the balance is already negative", () => {
    expect(projectRunOut(-500, 10, 1, MON).runOutDate).toBe("2026-08-24")
  })

  it("returns the run-out date as a bare YYYY-MM-DD string (no time component)", () => {
    expect(projectRunOut(100, 60, 6, MON).runOutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("rolls a partial day into the next operating day (25 left at 10/day -> 3rd operating day)", () => {
    // Day 1 leaves 15, day 2 leaves 5, day 3 goes negative -> Wed 26.
    const out = projectRunOut(25, 10, 1, MON)
    expect(out.operatingDaysLeft).toBe(2.5)
    expect(out.runOutDate).toBe("2026-08-26")
  })
})

describe("projectRunOut - horizon", () => {
  it("suppresses the run-out date (but keeps the rate) when stock lasts beyond the default 180-day horizon", () => {
    expect(projectRunOut(1000, 1, 1, MON)).toEqual({
      avgPerOperatingDay: 1,
      operatingDaysLeft: 1000,
      runOutDate: null,
    })
  })

  it("still projects a date when stock runs out on exactly the last day of the horizon", () => {
    expect(projectRunOut(10, 10, 1, MON, 1).runOutDate).toBe("2026-08-24")
  })

  it("suppresses the run-out date when stock survives one day past a custom horizon", () => {
    const out = projectRunOut(100, 10, 1, MON, 1)
    expect(out.runOutDate).toBeNull()
    expect(out.operatingDaysLeft).toBe(10)
  })

  it("returns null for a horizon of 0 even when the stock is empty (the walk never runs)", () => {
    expect(projectRunOut(0, 10, 1, MON, 0).runOutDate).toBeNull()
  })

  it("projects a date inside a generous custom horizon", () => {
    expect(projectRunOut(1000, 1, 1, MON, 2000).runOutDate).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// usageSpanOperatingDays — the denominator of the burn rate.
//
// This is what a real report got wrong: 600 litres of alcohol with a single
// recorded day of 25 used showed "624d left", because the rate was divided by all
// 26 operating days in the filter window instead of the one day the data covers.
// ════════════════════════════════════════════════════════════════════════════
describe("usageSpanOperatingDays", () => {
  const TODAY = "2026-08-20" // Thursday

  it("is one day when usage was recorded on a single day", () => {
    expect(usageSpanOperatingDays(["2026-08-20"], TODAY, TODAY)).toBe(1)
  })

  it("ignores an empty run-up before the first recorded usage", () => {
    // A 30-day window whose only record is today must not be averaged over 26 days.
    expect(usageSpanOperatingDays(["2026-08-20"], TODAY, TODAY)).toBe(1)
    expect(operatingDaysBetween("2026-07-22", TODAY)).toBeGreaterThan(20)
  })

  it("spans from the first recorded day to the end of the window", () => {
    // Fri 14th → Thu 20th, skipping Sunday the 16th.
    expect(usageSpanOperatingDays(["2026-08-14", "2026-08-20"], TODAY, TODAY)).toBe(6)
  })

  it("takes the earliest date whatever order the rows arrive in", () => {
    const shuffled = ["2026-08-20", "2026-08-14", "2026-08-18"]
    expect(usageSpanOperatingDays(shuffled, TODAY, TODAY)).toBe(6)
  })

  it("never runs past today, even for a window that ends in the future", () => {
    expect(usageSpanOperatingDays(["2026-08-14"], "2026-12-31", TODAY)).toBe(6)
  })

  it("uses the window end when the window closed before today", () => {
    // A historical report: the span stops at the window, not at the present day.
    expect(usageSpanOperatingDays(["2026-08-14"], "2026-08-18", TODAY)).toBe(4)
  })

  it("is zero with no usage at all, which suppresses the projection entirely", () => {
    expect(usageSpanOperatingDays([], TODAY, TODAY)).toBe(0)
    expect(projectRunOut(600, 0, 0, TODAY).operatingDaysLeft).toBeNull()
  })

  it("stays at one day when the only usage post-dates the window end", () => {
    // Defensive: a backfilled row outside the window should not produce a negative
    // or zero span, which would divide by zero.
    expect(usageSpanOperatingDays(["2026-08-25"], "2026-08-20", TODAY)).toBe(1)
  })

  it("counts Sundays out of the span", () => {
    // Sat 15th → Mon 17th is two operating days, not three.
    expect(usageSpanOperatingDays(["2026-08-15"], "2026-08-17", "2026-08-17")).toBe(2)
  })
})

describe("distinctDays", () => {
  it("counts unique dates, not rows", () => {
    expect(distinctDays(["2026-08-20", "2026-08-20", "2026-08-19"])).toBe(2)
  })

  it("is zero for no usage", () => {
    expect(distinctDays([])).toBe(0)
  })
})
