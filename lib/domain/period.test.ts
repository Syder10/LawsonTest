import { describe, expect, it } from "vitest"
import {
  MVP_BANNER_DAYS,
  monthWindow,
  mvpWindow,
  previousMonthWindow,
} from "@/lib/domain/period"

const at = (iso: string) => new Date(iso)

describe("monthWindow", () => {
  it("spans the whole calendar month", () => {
    const w = monthWindow(at("2026-08-14T09:00:00Z"))
    expect(w.start).toBe("2026-08-01")
    expect(w.end).toBe("2026-08-31")
    expect(w.label).toBe("August 2026")
    expect(w.month).toBe(8)
  })

  it("gets February right, including a leap year", () => {
    expect(monthWindow(at("2026-02-10T00:00:00Z")).end).toBe("2026-02-28")
    expect(monthWindow(at("2028-02-10T00:00:00Z")).end).toBe("2028-02-29")
  })

  it("includes the first and last instant of the month", () => {
    expect(monthWindow(at("2026-08-01T00:00:00Z")).start).toBe("2026-08-01")
    expect(monthWindow(at("2026-08-31T23:59:59Z")).end).toBe("2026-08-31")
  })

  it("is UTC, so a late-evening timestamp doesn't land in the next month", () => {
    // 23:30 on the 31st is still August, whatever the server's local zone says.
    expect(monthWindow(at("2026-08-31T23:30:00Z")).label).toBe("August 2026")
  })
})

describe("previousMonthWindow", () => {
  it("returns the month just finished", () => {
    const w = previousMonthWindow(at("2026-08-03T06:00:00Z"))
    expect(w.start).toBe("2026-07-01")
    expect(w.end).toBe("2026-07-31")
    expect(w.label).toBe("July 2026")
  })

  it("rolls the year back in January", () => {
    const w = previousMonthWindow(at("2026-01-02T06:00:00Z"))
    expect(w.label).toBe("December 2025")
    expect(w.start).toBe("2025-12-01")
    expect(w.end).toBe("2025-12-31")
  })
})

describe("mvpWindow", () => {
  it("celebrates the month that has FINISHED, not the one in progress", () => {
    // The bug this replaces: on the last day of the month the old rule judged that
    // same month — before its Afternoon and Night shifts had submitted — and wrote a
    // permanent badge for whoever opened the app first.
    const lastDay = mvpWindow(at("2026-08-31T08:00:00Z"))
    expect(lastDay.label).toBe("July 2026")
    expect(lastDay.end).toBe("2026-07-31")
  })

  it("shows for the first days of the new month and then stops", () => {
    expect(mvpWindow(at("2026-08-01T00:30:00Z")).show).toBe(true)
    expect(mvpWindow(at(`2026-08-0${MVP_BANNER_DAYS}T23:00:00Z`)).show).toBe(true)
    expect(mvpWindow(at("2026-08-08T09:00:00Z")).show).toBe(false)
    expect(mvpWindow(at("2026-08-20T09:00:00Z")).show).toBe(false)
  })

  it("keeps the window pointed at the same month for its whole run", () => {
    // Every day the banner is up must name ONE month, or two supervisors opening the
    // app on different days would see different winners.
    const labels = new Set<string>()
    for (let day = 1; day <= MVP_BANNER_DAYS; day++) {
      labels.add(mvpWindow(at(`2026-08-${String(day).padStart(2, "0")}T12:00:00Z`)).label)
    }
    expect([...labels]).toEqual(["July 2026"])
  })

  it("names the badge after the month it celebrates", () => {
    expect(mvpWindow(at("2026-08-02T12:00:00Z")).badge).toBe("mvp_2026_7")
    // January's banner celebrates December of the previous year.
    expect(mvpWindow(at("2026-01-03T12:00:00Z")).badge).toBe("mvp_2025_12")
  })

  it("never awards two badges for the same month", () => {
    const badges = new Set<string>()
    for (let day = 1; day <= MVP_BANNER_DAYS; day++) {
      badges.add(mvpWindow(at(`2026-03-${String(day).padStart(2, "0")}T12:00:00Z`)).badge)
    }
    expect(badges.size).toBe(1)
  })

  it("judges a closed window: its end is always in the past", () => {
    for (const day of ["01", "04", "07", "15", "28"]) {
      const now = at(`2026-08-${day}T12:00:00Z`)
      expect(mvpWindow(now).end < now.toISOString().slice(0, 10)).toBe(true)
    }
  })
})
