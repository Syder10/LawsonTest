import { describe, it, expect } from "vitest"
import {
  NIGHT_ROLLOVER_HOUR,
  ON_TIME_WINDOWS,
  ON_TIME_WINDOW_LABEL,
  SHIFT_ORDER,
  SHIFT_RANK,
  buildOnTimeWindowInfo,
  currentGhanaShift,
  expectedShiftForGroup,
  isBackdated,
  isDayOff,
  isEarlyBird,
  isOnTime,
  isSaturdayOff,
  isWindowOpenNow,
  onTimeWindowCloseFor,
  shiftDateFor,
  shiftOnTimeAndNotBackdated,
  shiftRank,
  weekRotationOffset,
} from "@/lib/shift-config"

// Ghana is UTC+0, so every date here is written in explicit UTC. Never use local
// time in these tests — the results would depend on the machine's timezone.
const at = (iso: string) => new Date(iso)

describe("shift ordering", () => {
  it("ranks Morning -> Afternoon -> Night, mirroring the DB shift_rank()", () => {
    expect(shiftRank("Morning")).toBe(1)
    expect(shiftRank("Afternoon")).toBe(2)
    expect(shiftRank("Night")).toBe(3)
  })

  it("ranks an unknown shift 0 rather than throwing", () => {
    expect(shiftRank("Twilight")).toBe(0)
  })

  it("keeps SHIFT_ORDER and SHIFT_RANK consistent with each other", () => {
    expect([...SHIFT_ORDER]).toEqual(["Morning", "Afternoon", "Night"])
    SHIFT_ORDER.forEach((shift, i) => expect(SHIFT_RANK[shift]).toBe(i + 1))
  })
})

// ════════════════════════════════════════════════════════════════════════════
// The shift-date convention: a record belongs to the day its shift STARTED.
// This is the rule that keeps one calendar date holding one Morning + one
// Afternoon + one Night record, which the derived stock ledger depends on.
// ════════════════════════════════════════════════════════════════════════════
describe("shiftDateFor — night shifts are dated by their START day", () => {
  it("dates a Night shift filed at 04:30 to the PREVIOUS day", () => {
    // Shift began 20/08 21:00, closes 21/08 ~05:00. Filed at 04:30 on the 21st.
    expect(shiftDateFor("Night", at("2026-08-21T04:30:00Z"))).toBe("2026-08-20")
  })

  it("dates a Night shift filed the evening it starts to that same day", () => {
    expect(shiftDateFor("Night", at("2026-08-20T21:30:00Z"))).toBe("2026-08-20")
  })

  it("rolls back right up to the boundary, and stops at it", () => {
    expect(shiftDateFor("Night", at("2026-08-21T05:59:59Z"))).toBe("2026-08-20")
    // 06:00 is the rollover: we are no longer in the previous night's tail.
    expect(shiftDateFor("Night", at("2026-08-21T06:00:00Z"))).toBe("2026-08-21")
    expect(NIGHT_ROLLOVER_HOUR).toBe(6)
  })

  it("never rolls back Morning or Afternoon, even before 06:00", () => {
    expect(shiftDateFor("Morning", at("2026-08-21T04:30:00Z"))).toBe("2026-08-21")
    expect(shiftDateFor("Afternoon", at("2026-08-21T04:30:00Z"))).toBe("2026-08-21")
    expect(shiftDateFor("Afternoon", at("2026-08-21T20:15:00Z"))).toBe("2026-08-21")
  })

  it("rolls back correctly across a month boundary", () => {
    expect(shiftDateFor("Night", at("2026-09-01T02:00:00Z"))).toBe("2026-08-31")
  })

  it("rolls back correctly across a year boundary", () => {
    expect(shiftDateFor("Night", at("2027-01-01T03:00:00Z"))).toBe("2026-12-31")
  })

  it("puts all three of a working day's shifts on ONE date", () => {
    // The whole point of the convention. A day's Morning and Afternoon are filed
    // on 20/08; its Night shift is filed at 04:30 on 21/08 — all dated 20/08.
    const morning = shiftDateFor("Morning", at("2026-08-20T13:30:00Z"))
    const afternoon = shiftDateFor("Afternoon", at("2026-08-20T20:30:00Z"))
    const night = shiftDateFor("Night", at("2026-08-21T04:30:00Z"))
    expect(new Set([morning, afternoon, night])).toEqual(new Set(["2026-08-20"]))
  })
})

describe("currentGhanaShift", () => {
  it("treats pre-06:00 as the tail of yesterday's Night shift", () => {
    expect(currentGhanaShift(at("2026-08-21T04:30:00Z"))).toEqual({
      shift: "Night",
      shiftDate: "2026-08-20",
    })
  })

  it("maps each block of the day to its shift", () => {
    expect(currentGhanaShift(at("2026-08-21T06:00:00Z")).shift).toBe("Morning")
    expect(currentGhanaShift(at("2026-08-21T13:59:00Z")).shift).toBe("Morning")
    expect(currentGhanaShift(at("2026-08-21T14:00:00Z")).shift).toBe("Afternoon")
    expect(currentGhanaShift(at("2026-08-21T20:59:00Z")).shift).toBe("Afternoon")
    expect(currentGhanaShift(at("2026-08-21T21:00:00Z")).shift).toBe("Night")
  })

  it("keys an evening Night shift to the current day", () => {
    expect(currentGhanaShift(at("2026-08-21T21:00:00Z")).shiftDate).toBe("2026-08-21")
  })

  it("agrees with shiftDateFor for the shift it reports", () => {
    for (const iso of [
      "2026-08-21T04:30:00Z",
      "2026-08-21T09:00:00Z",
      "2026-08-21T15:00:00Z",
      "2026-08-21T22:00:00Z",
    ]) {
      const { shift, shiftDate } = currentGhanaShift(at(iso))
      expect(shiftDateFor(shift, at(iso))).toBe(shiftDate)
    }
  })
})

describe("on-time windows", () => {
  it("exposes a label for every configured window", () => {
    for (const shift of SHIFT_ORDER) {
      expect(ON_TIME_WINDOWS[shift]).toBeDefined()
      expect(ON_TIME_WINDOW_LABEL[shift]).toBeTruthy()
    }
  })

  it("accepts submissions inside the window, inclusive of both edges", () => {
    expect(isOnTime("2026-08-20T13:00:00Z", "Morning")).toBe(true)
    expect(isOnTime("2026-08-20T14:30:00Z", "Morning")).toBe(true)
  })

  it("rejects submissions a minute either side of the window", () => {
    expect(isOnTime("2026-08-20T12:59:00Z", "Morning")).toBe(false)
    expect(isOnTime("2026-08-20T14:31:00Z", "Morning")).toBe(false)
  })

  it("uses the right window per shift", () => {
    expect(isOnTime("2026-08-20T20:30:00Z", "Afternoon")).toBe(true)
    expect(isOnTime("2026-08-20T20:30:00Z", "Morning")).toBe(false)
    expect(isOnTime("2026-08-21T04:30:00Z", "Night")).toBe(true)
  })

  it("returns false for an unknown shift instead of throwing", () => {
    expect(isOnTime("2026-08-20T13:00:00Z", "Twilight")).toBe(false)
    expect(isWindowOpenNow("Twilight", at("2026-08-20T13:00:00Z"))).toBe(false)
  })

  it("treats only the first 30 minutes as early-bird", () => {
    expect(isEarlyBird("2026-08-20T13:00:00Z", "Morning")).toBe(true)
    expect(isEarlyBird("2026-08-20T13:29:00Z", "Morning")).toBe(true)
    expect(isEarlyBird("2026-08-20T13:30:00Z", "Morning")).toBe(false)
  })

  it("reports whether the window is open at a given moment", () => {
    expect(isWindowOpenNow("Morning", at("2026-08-20T13:10:00Z"))).toBe(true)
    expect(isWindowOpenNow("Morning", at("2026-08-20T16:00:00Z"))).toBe(false)
  })
})

describe("onTimeWindowCloseFor", () => {
  it("closes a Morning window the same afternoon", () => {
    expect(onTimeWindowCloseFor("2026-08-20", "Morning")).toBe("2026-08-20T14:30:00.000Z")
  })

  it("closes an Afternoon window the same evening", () => {
    expect(onTimeWindowCloseFor("2026-08-20", "Afternoon")).toBe("2026-08-20T21:30:00.000Z")
  })

  it("closes a Night window the FOLLOWING morning, since Night is dated by its start day", () => {
    expect(onTimeWindowCloseFor("2026-08-20", "Night")).toBe("2026-08-21T05:30:00.000Z")
  })

  it("rolls a Night close across a month boundary", () => {
    expect(onTimeWindowCloseFor("2026-08-31", "Night")).toBe("2026-09-01T05:30:00.000Z")
  })

  it("lands exactly on the last on-time instant", () => {
    const close = onTimeWindowCloseFor("2026-08-20", "Night")
    expect(isOnTime(close, "Night")).toBe(true)
    const aMinuteLater = new Date(new Date(close).getTime() + 60_000).toISOString()
    expect(isOnTime(aMinuteLater, "Night")).toBe(false)
  })

  it("falls back to end of day for an unknown shift", () => {
    expect(onTimeWindowCloseFor("2026-08-20", "Twilight")).toBe("2026-08-20T23:59:59.999Z")
  })
})

describe("buildOnTimeWindowInfo", () => {
  it("puts the Night window on the FOLLOWING morning when filed in the evening", () => {
    const info = buildOnTimeWindowInfo(at("2026-08-20T21:30:00Z"), "Night")
    expect(info.openIso).toBe("2026-08-21T04:00:00.000Z")
    expect(info.closeIso).toBe("2026-08-21T05:30:00.000Z")
  })

  it("keeps the Night window on today once it is already that morning", () => {
    const info = buildOnTimeWindowInfo(at("2026-08-21T04:10:00Z"), "Night")
    expect(info.openIso).toBe("2026-08-21T04:00:00.000Z")
  })

  it("builds a same-day window for Morning", () => {
    const info = buildOnTimeWindowInfo(at("2026-08-20T10:00:00Z"), "Morning")
    expect(info.openIso).toBe("2026-08-20T13:00:00.000Z")
    expect(info.closeIso).toBe("2026-08-20T14:30:00.000Z")
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Rotation. Anchor Monday 2026-04-13 = offset 0, repeating every 3 weeks.
// Alcohol and Blending runs its own 2-week cycle from Monday 2025-05-05.
// ════════════════════════════════════════════════════════════════════════════
describe("weekRotationOffset", () => {
  it("is 0 for the anchor week and advances weekly, wrapping every 3", () => {
    expect(weekRotationOffset(at("2026-04-13T00:00:00Z"))).toBe(0)
    expect(weekRotationOffset(at("2026-04-20T00:00:00Z"))).toBe(1)
    expect(weekRotationOffset(at("2026-04-27T00:00:00Z"))).toBe(2)
    expect(weekRotationOffset(at("2026-05-04T00:00:00Z"))).toBe(0)
  })

  it("is constant for every day of a week, Monday through Sunday", () => {
    const offsets = ["13", "14", "15", "16", "17", "18", "19"].map((d) =>
      weekRotationOffset(at(`2026-04-${d}T12:00:00Z`)),
    )
    expect(offsets).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it("handles weeks before the anchor without going negative", () => {
    expect(weekRotationOffset(at("2026-04-06T12:00:00Z"))).toBe(2)
  })
})

describe("expectedShiftForGroup", () => {
  it("assigns the three standard groups distinct shifts each week", () => {
    const week0 = at("2026-04-13T12:00:00Z")
    expect(expectedShiftForGroup("Blowing", 1, week0)).toBe("Afternoon")
    expect(expectedShiftForGroup("Blowing", 2, week0)).toBe("Night")
    expect(expectedShiftForGroup("Blowing", 3, week0)).toBe("Morning")
  })

  it("rotates the standard departments over three weeks", () => {
    expect(expectedShiftForGroup("Packaging", 1, at("2026-04-20T12:00:00Z"))).toBe("Night")
    expect(expectedShiftForGroup("Packaging", 1, at("2026-04-27T12:00:00Z"))).toBe("Morning")
    expect(expectedShiftForGroup("Packaging", 1, at("2026-05-04T12:00:00Z"))).toBe("Afternoon")
  })

  it("never assigns a standard group the Night shift more than once per cycle", () => {
    for (const monday of ["2026-04-13", "2026-04-20", "2026-04-27"]) {
      const shifts = [1, 2, 3].map((g) => expectedShiftForGroup("Filling Line", g, at(`${monday}T12:00:00Z`)))
      expect(new Set(shifts).size).toBe(3)
    }
  })

  it("swaps Alcohol and Blending's two groups weekly on its own anchor", () => {
    const dept = "Alcohol and Blending"
    expect(expectedShiftForGroup(dept, 1, at("2026-04-13T12:00:00Z"))).toBe("Afternoon")
    expect(expectedShiftForGroup(dept, 2, at("2026-04-13T12:00:00Z"))).toBe("Morning")
    expect(expectedShiftForGroup(dept, 1, at("2026-04-20T12:00:00Z"))).toBe("Morning")
    expect(expectedShiftForGroup(dept, 2, at("2026-04-20T12:00:00Z"))).toBe("Afternoon")
  })

  it("never puts Alcohol and Blending on Night", () => {
    for (const monday of ["2026-04-13", "2026-04-20", "2026-04-27", "2026-05-04"]) {
      for (const g of [1, 2]) {
        expect(expectedShiftForGroup("Alcohol and Blending", g, at(`${monday}T12:00:00Z`))).not.toBe("Night")
      }
    }
  })

  it("matches the department name case-insensitively", () => {
    expect(expectedShiftForGroup("alcohol and blending", 1, at("2026-04-13T12:00:00Z"))).toBe("Afternoon")
  })

  it("returns null for a group the department does not have", () => {
    expect(expectedShiftForGroup("Alcohol and Blending", 3, at("2026-04-13T12:00:00Z"))).toBeNull()
  })
})

describe("Saturday and Sunday off rules", () => {
  const saturday = at("2026-04-18T12:00:00Z") // Saturday of rotation week 0
  const sunday = at("2026-04-19T12:00:00Z")

  it("gives every department's Night group Saturday off", () => {
    // Blowing group 2 is on Night in week 0.
    expect(isSaturdayOff("Blowing", 2, saturday)).toBe(true)
  })

  it("keeps standard departments' Morning and Afternoon groups working Saturday", () => {
    expect(isSaturdayOff("Blowing", 3, saturday)).toBe(false) // Morning
    expect(isSaturdayOff("Blowing", 1, saturday)).toBe(false) // Afternoon
  })

  it("also gives Alcohol and Blending's Afternoon group Saturday off, leaving Morning only", () => {
    // Week 0 for Blending: G1 = Afternoon (off), G2 = Morning (works).
    expect(isSaturdayOff("Alcohol and Blending", 1, saturday)).toBe(true)
    expect(isSaturdayOff("Alcohol and Blending", 2, saturday)).toBe(false)
  })

  it("is not a Saturday rule on any other weekday", () => {
    expect(isSaturdayOff("Blowing", 2, at("2026-04-17T12:00:00Z"))).toBe(false)
  })

  it("treats Sunday as off for everyone", () => {
    expect(isDayOff("Blowing", 1, sunday)).toBe(true)
    expect(isDayOff("Alcohol and Blending", 2, sunday)).toBe(true)
    expect(isDayOff(null, null, sunday)).toBe(true)
  })

  it("defers to the Saturday rule via isDayOff", () => {
    expect(isDayOff("Blowing", 2, saturday)).toBe(true)
    expect(isDayOff("Blowing", 3, saturday)).toBe(false)
  })

  it("treats a normal weekday as a working day", () => {
    expect(isDayOff("Blowing", 1, at("2026-04-15T12:00:00Z"))).toBe(false)
  })
})

describe("isBackdated", () => {
  it("is false when the record was filed on the day it is for", () => {
    expect(isBackdated("2026-08-20", "2026-08-20T13:30:00Z", "Morning")).toBe(false)
  })

  it("forgives a Night record filed the next morning — that is the normal case", () => {
    // Shift started 20/08; its on-time window is 04:00–05:30 on the 21st.
    expect(isBackdated("2026-08-20", "2026-08-21T04:30:00Z", "Night")).toBe(false)
  })

  it("does NOT extend the night grace to a two-day gap", () => {
    expect(isBackdated("2026-08-20", "2026-08-22T04:30:00Z", "Night")).toBe(true)
  })

  it("does NOT extend the night grace to other shifts", () => {
    expect(isBackdated("2026-08-20", "2026-08-21T04:30:00Z", "Morning")).toBe(true)
  })

  it("flags a backfill filed days later", () => {
    expect(isBackdated("2026-08-10", "2026-08-20T13:30:00Z", "Morning")).toBe(true)
  })
})

describe("shiftOnTimeAndNotBackdated", () => {
  it("passes when at least one row is both on-time and not backdated", () => {
    const rows = [
      { date: "2026-08-20", created_at: "2026-08-25T13:30:00Z" }, // backdated
      { date: "2026-08-20", created_at: "2026-08-20T13:30:00Z" }, // good
    ]
    expect(shiftOnTimeAndNotBackdated(rows, "Morning")).toBe(true)
  })

  it("fails when every row is late or backdated", () => {
    const rows = [
      { date: "2026-08-20", created_at: "2026-08-20T18:00:00Z" }, // outside window
      { date: "2026-08-20", created_at: "2026-08-25T13:30:00Z" }, // backdated
    ]
    expect(shiftOnTimeAndNotBackdated(rows, "Morning")).toBe(false)
  })

  it("fails on an empty set", () => {
    expect(shiftOnTimeAndNotBackdated([], "Morning")).toBe(false)
  })
})
