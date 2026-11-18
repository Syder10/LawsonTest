import { describe, expect, it } from "vitest"
import {
  MVP_BANNER_DAYS,
  PERIOD_ROLLOVER_HOUR,
  SYSTEM_START,
  activeMonthWindow,
  isBeforeRollover,
  monthWindow,
  mvpWindow,
  previousMonthWindow,
} from "@/lib/domain/period"
import { onTimeWindowCloseFor } from "@/lib/shift-config"

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

describe("SYSTEM_START", () => {
  it("is a valid calendar date", () => {
    expect(SYSTEM_START).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(`${SYSTEM_START}T00:00:00Z`))).toBe(false)
  })

  it("is not in the future", () => {
    // A floor after today would make every history scan return nothing — the streak,
    // the gap prompt and the MVP would all quietly read as "no data".
    expect(SYSTEM_START <= new Date().toISOString().slice(0, 10)).toBe(true)
  })
})

describe("the rollover hour", () => {
  // The reason this exists: a Night shift is dated by the day it STARTED, so the one
  // beginning 21:00 on 31 August is dated 31 August and its on-time window is
  // 04:00–05:30 on 1 September. At midnight that supervisor is not late — they are
  // not yet allowed to submit.
  it("waits until after the last Night window of the month has closed", () => {
    const close = onTimeWindowCloseFor("2026-08-31", "Night")
    expect(close).toBe("2026-09-01T05:30:00.000Z")
    const rollover = new Date(Date.UTC(2026, 8, 1, PERIOD_ROLLOVER_HOUR, 0, 0))
    expect(rollover.getTime()).toBeGreaterThan(new Date(close).getTime())
  })

  it("treats the small hours of the 1st as still last month", () => {
    expect(isBeforeRollover(new Date("2026-09-01T00:01:00Z"))).toBe(true)
    expect(isBeforeRollover(new Date("2026-09-01T05:00:00Z"))).toBe(true)
    expect(isBeforeRollover(new Date("2026-09-01T06:59:00Z"))).toBe(true)
    expect(isBeforeRollover(new Date("2026-09-01T07:00:00Z"))).toBe(false)
    // Only ever the 1st — the 2nd is unambiguously the new month.
    expect(isBeforeRollover(new Date("2026-09-02T02:00:00Z"))).toBe(false)
  })

  it("keeps the leaderboard on last month until the rollover", () => {
    // So a Night supervisor filing at 05:00 sees their record land on the board they
    // were competing on, instead of an empty new one.
    expect(activeMonthWindow(new Date("2026-09-01T05:00:00Z")).label).toBe("August 2026")
    expect(activeMonthWindow(new Date("2026-09-01T07:00:00Z")).label).toBe("September 2026")
    expect(activeMonthWindow(new Date("2026-08-31T23:00:00Z")).label).toBe("August 2026")
  })

  it("holds the MVP back until the rollover, then reveals it", () => {
    expect(mvpWindow(new Date("2026-09-01T00:05:00Z")).show).toBe(false)
    expect(mvpWindow(new Date("2026-09-01T05:00:00Z")).show).toBe(false)
    const revealed = mvpWindow(new Date("2026-09-01T07:00:00Z"))
    expect(revealed.show).toBe(true)
    expect(revealed.label).toBe("August 2026")
    expect(revealed.badge).toBe("mvp_2026_8")
  })

  it("never leaves a gap: the board and the MVP hand over at the same instant", () => {
    // One minute before the rollover the board says August and no MVP is claimed; one
    // minute after, the board is September and August has a winner. There is no
    // moment where the board has moved on but the month is undecided.
    const before = new Date("2026-09-01T06:59:00Z")
    const after = new Date("2026-09-01T07:01:00Z")
    expect(activeMonthWindow(before).label).toBe("August 2026")
    expect(mvpWindow(before).show).toBe(false)
    expect(activeMonthWindow(after).label).toBe("September 2026")
    expect(mvpWindow(after).show).toBe(true)
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
    expect(mvpWindow(at("2026-08-01T08:30:00Z")).show).toBe(true)
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
