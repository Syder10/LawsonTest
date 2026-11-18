import { describe, it, expect } from "vitest"
import {
  completeShiftKeys,
  computeGaps,
  computeStreak,
  isRosteredShift,
  isValidOnTime,
  storageTable,
  type EnvelopeRow,
} from "@/lib/domain/gamification"
import { compulsoryRecordTypes, getRecordType } from "@/lib/domain/record-types"

// Fixtures use Blowing group 3, which the rotation puts on MORNING during the
// week of Monday 2026-04-13 (rotation offset 0). Morning's on-time window is
// 13:00–14:30 UTC, so a created_at of 13:30 on the record's own date is a valid,
// non-backdated, on-time submission.
const BLOWING_COMPULSORY = "Daily Records (Preform Usage)"
const at = (iso: string) => new Date(iso)

function row(
  date: string,
  shift = "Morning",
  overrides: Partial<EnvelopeRow> = {},
): EnvelopeRow {
  return {
    user_id: "user-1",
    department: "Blowing",
    group_number: 3,
    date,
    shift,
    created_at: `${date}T13:30:00Z`,
    supervisor_name: "Kofi",
    ...overrides,
  }
}

const byLabel = (label: string, rows: EnvelopeRow[]) => new Map([[label, rows]])

describe("registry assumptions these tests rely on", () => {
  it("has exactly one compulsory record type for Blowing", () => {
    const labels = compulsoryRecordTypes("Blowing").map((d) => d.label)
    expect(labels).toEqual([BLOWING_COMPULSORY])
  })

  it("has three compulsory record types for Filling Line", () => {
    expect(compulsoryRecordTypes("Filling Line")).toHaveLength(3)
  })

  it("has none for Concentrate", () => {
    expect(compulsoryRecordTypes("Concentrate")).toEqual([])
  })
})

describe("storageTable", () => {
  it("returns the dedicated table for table-backed types", () => {
    expect(storageTable(getRecordType(BLOWING_COMPULSORY)!)).toBe("blowing_daily_records")
  })

  it("routes consolidated stock types to stock_records", () => {
    expect(storageTable(getRecordType("Caps Stock")!)).toBe("stock_records")
  })
})

describe("isValidOnTime / isRosteredShift", () => {
  it("accepts a row filed inside its window on its own date", () => {
    expect(isValidOnTime(row("2026-04-13"))).toBe(true)
  })

  it("rejects a row filed outside the window", () => {
    expect(isValidOnTime(row("2026-04-13", "Morning", { created_at: "2026-04-13T18:00:00Z" }))).toBe(false)
  })

  it("rejects a backfilled row", () => {
    expect(isValidOnTime(row("2026-04-13", "Morning", { created_at: "2026-04-20T13:30:00Z" }))).toBe(false)
  })

  it("accepts a Night row filed in its next-morning window", () => {
    const night = row("2026-04-13", "Night", { created_at: "2026-04-14T04:30:00Z" })
    expect(isValidOnTime(night)).toBe(true)
  })

  it("confirms the rostered shift for the group that week", () => {
    expect(isRosteredShift(row("2026-04-13", "Morning"))).toBe(true)
    expect(isRosteredShift(row("2026-04-13", "Night"))).toBe(false)
  })

  it("cannot verify a roster without department and group", () => {
    expect(isRosteredShift(row("2026-04-13", "Morning", { department: "", group_number: null }))).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// computeStreak — derived from history, so a silently-missed day breaks it.
// ════════════════════════════════════════════════════════════════════════════
describe("computeStreak", () => {
  const dept = "Blowing"
  const group = 3

  it("counts every consecutive complete rostered day", () => {
    const rows = ["2026-04-13", "2026-04-14", "2026-04-15", "2026-04-16"].map((d) => row(d))
    // 15:00 — Morning's window (closes 14:30) has already shut today.
    const streak = computeStreak(byLabel(BLOWING_COMPULSORY, rows), [], dept, group, at("2026-04-16T15:00:00Z"))
    expect(streak).toBe(4)
  })

  it("breaks on a missed working day rather than skipping over it", () => {
    const rows = ["2026-04-13", "2026-04-14", "2026-04-16"].map((d) => row(d)) // 15th missing
    const streak = computeStreak(byLabel(BLOWING_COMPULSORY, rows), [], dept, group, at("2026-04-16T15:00:00Z"))
    expect(streak).toBe(1) // only today survives
  })

  it("ignores submissions tagged for a shift the group was not rostered on", () => {
    const rows = ["2026-04-15", "2026-04-16"].map((d) => row(d, "Afternoon"))
    const streak = computeStreak(byLabel(BLOWING_COMPULSORY, rows), [], dept, group, at("2026-04-16T15:00:00Z"))
    expect(streak).toBe(0)
  })

  it("ignores backdated submissions", () => {
    const rows = [row("2026-04-16", "Morning", { created_at: "2026-04-20T13:30:00Z" })]
    const streak = computeStreak(byLabel(BLOWING_COMPULSORY, rows), [], dept, group, at("2026-04-16T15:00:00Z"))
    expect(streak).toBe(0)
  })

  it("lets a valid no-work record complete a day", () => {
    const rows = ["2026-04-13", "2026-04-15", "2026-04-16"].map((d) => row(d))
    const noWork = [row("2026-04-14")] // same envelope shape
    const streak = computeStreak(byLabel(BLOWING_COMPULSORY, rows), noWork, dept, group, at("2026-04-16T15:00:00Z"))
    expect(streak).toBe(4)
  })

  it("leaves today pending — an unfilled open window neither counts nor breaks", () => {
    const rows = ["2026-04-13", "2026-04-14", "2026-04-15"].map((d) => row(d))
    // 10:00 — today's window has not opened yet, so today must not break the streak.
    const streak = computeStreak(byLabel(BLOWING_COMPULSORY, rows), [], dept, group, at("2026-04-16T10:00:00Z"))
    expect(streak).toBe(3)
  })

  it("skips Sundays and Saturdays the group is off, without breaking", () => {
    // Fri 17th + Sat 18th (G3 is on Morning, which DOES work Saturday), then
    // Sun 19th is skipped, and Mon 20th (G3 rotates to Afternoon) continues it.
    const rows = [row("2026-04-17"), row("2026-04-18"), row("2026-04-20", "Afternoon", { created_at: "2026-04-20T20:30:00Z" })]
    const streak = computeStreak(byLabel(BLOWING_COMPULSORY, rows), [], dept, group, at("2026-04-20T22:00:00Z"))
    expect(streak).toBe(3)
  })

  it("is 0 without a department or group", () => {
    const rows = [row("2026-04-16")]
    expect(computeStreak(byLabel(BLOWING_COMPULSORY, rows), [], null, group, at("2026-04-16T15:00:00Z"))).toBe(0)
    expect(computeStreak(byLabel(BLOWING_COMPULSORY, rows), [], dept, null, at("2026-04-16T15:00:00Z"))).toBe(0)
  })

  it("is 0 for a department with nothing compulsory", () => {
    expect(computeStreak(new Map(), [], "Concentrate", 3, at("2026-04-16T15:00:00Z"))).toBe(0)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// computeGaps — unresolved rostered days, up to YESTERDAY. Presence counts ANY
// row (a late backfill resolves a gap; on-time is NOT required).
// ════════════════════════════════════════════════════════════════════════════
describe("computeGaps", () => {
  const dept = "Blowing"
  const group = 3
  const now = at("2026-04-16T12:00:00Z") // Thursday

  it("reports every unfilled rostered day, most recent first", () => {
    const gaps = computeGaps(new Map(), [], dept, group, "2026-04-13", now)
    expect(gaps.map((g) => g.date)).toEqual(["2026-04-15", "2026-04-14", "2026-04-13"])
    expect(gaps.every((g) => g.shift === "Morning")).toBe(true)
    expect(gaps[0].missingTypes).toEqual([BLOWING_COMPULSORY])
  })

  it("never includes today — that is the normal submit flow's job", () => {
    const gaps = computeGaps(new Map(), [], dept, group, "2026-04-13", now)
    expect(gaps.map((g) => g.date)).not.toContain("2026-04-16")
  })

  it("treats a submitted day as resolved", () => {
    const gaps = computeGaps(byLabel(BLOWING_COMPULSORY, [row("2026-04-14")]), [], dept, group, "2026-04-13", now)
    expect(gaps.map((g) => g.date)).toEqual(["2026-04-15", "2026-04-13"])
  })

  it("resolves a gap with a LATE backfill, unlike the streak", () => {
    const late = [row("2026-04-14", "Morning", { created_at: "2026-04-30T09:00:00Z" })]
    const gaps = computeGaps(byLabel(BLOWING_COMPULSORY, late), [], dept, group, "2026-04-13", now)
    expect(gaps.map((g) => g.date)).not.toContain("2026-04-14")
  })

  it("does NOT let a wrong-shift row resolve the rostered shift's gap", () => {
    const wrong = [row("2026-04-14", "Night")]
    const gaps = computeGaps(byLabel(BLOWING_COMPULSORY, wrong), [], dept, group, "2026-04-13", now)
    expect(gaps.map((g) => g.date)).toContain("2026-04-14")
  })

  it("treats a no-work record as resolving the day", () => {
    const gaps = computeGaps(new Map(), [row("2026-04-13")], dept, group, "2026-04-13", now)
    expect(gaps.map((g) => g.date)).toEqual(["2026-04-15", "2026-04-14"])
  })

  it("skips Sundays and follows the roster into the next rotation week", () => {
    // Window 13–20 April. Sunday the 19th must be absent; Monday the 20th moves
    // group 3 from Morning to Afternoon.
    const gaps = computeGaps(new Map(), [], dept, group, "2026-04-13", at("2026-04-21T12:00:00Z"))
    const dates = gaps.map((g) => g.date)
    expect(dates).not.toContain("2026-04-19") // Sunday
    expect(dates).toContain("2026-04-18") // Saturday — Morning groups do work
    expect(gaps.find((g) => g.date === "2026-04-20")?.shift).toBe("Afternoon")
    expect(gaps.find((g) => g.date === "2026-04-17")?.shift).toBe("Morning")
  })

  it("lists only the compulsory types actually missing on a partly-filled day", () => {
    // Filling Line has three compulsory types; supply just one of them.
    const capsOnly = [
      { ...row("2026-04-14"), department: "Filling Line" },
    ]
    const gaps = computeGaps(
      byLabel("Caps Stock", capsOnly),
      [],
      "Filling Line",
      3,
      "2026-04-14",
      at("2026-04-15T12:00:00Z"),
    )
    expect(gaps).toHaveLength(1)
    expect(gaps[0].missingTypes).not.toContain("Caps Stock")
    expect(gaps[0].missingTypes.sort()).toEqual(["Filling Line Daily Records", "Labels Stock"])
  })

  it("returns nothing for a department with no compulsory records", () => {
    expect(computeGaps(new Map(), [], "Concentrate", 3, "2026-04-13", now)).toEqual([])
  })

  it("returns nothing without a department or group", () => {
    expect(computeGaps(new Map(), [], null, 3, "2026-04-13", now)).toEqual([])
    expect(computeGaps(new Map(), [], dept, null, "2026-04-13", now)).toEqual([])
  })
})

describe("completeShiftKeys", () => {
  const deptOfKey = (key: string) => key.split("|")[0]

  it("counts a key complete when the department's only compulsory type is present", () => {
    const key = "Blowing|3|2026-04-13|Morning"
    const sets = new Map([[BLOWING_COMPULSORY, new Set([key])]])
    expect(completeShiftKeys(sets, deptOfKey)).toEqual(new Set([key]))
  })

  it("requires EVERY compulsory type of the department", () => {
    const key = "Filling Line|3|2026-04-13|Morning"
    const partial = new Map([
      ["Caps Stock", new Set([key])],
      ["Labels Stock", new Set([key])],
      // "Filling Line Daily Records" missing
    ])
    expect(completeShiftKeys(partial, deptOfKey)).toEqual(new Set())

    const full = new Map(partial)
    full.set("Filling Line Daily Records", new Set([key]))
    expect(completeShiftKeys(full, deptOfKey)).toEqual(new Set([key]))
  })

  it("ignores keys whose department cannot be resolved", () => {
    const sets = new Map([[BLOWING_COMPULSORY, new Set(["ghost|1|2026-04-13|Morning"])]])
    expect(completeShiftKeys(sets, () => undefined)).toEqual(new Set())
  })

  it("ignores departments with no compulsory requirement", () => {
    const sets = new Map([["Herbs Stock", new Set(["Concentrate|1|2026-04-13|Morning"])]])
    expect(completeShiftKeys(sets, deptOfKey)).toEqual(new Set())
  })
})

// The night-dating convention applied to the nag list. A Night shift dated 20/08
// stays submittable until 05:30 on 21/08 — by which point the calendar has
// already rolled it into "yesterday", so a naive "up to yesterday" bound would
// tell the supervisor they missed a shift they are still inside the window for.
describe("computeGaps — a Night shift still inside its window is not a gap", () => {
  // Blowing group 2 is rostered NIGHT during the week of Monday 2026-04-13.
  const dept = "Blowing"
  const group = 2

  it("stays silent while the 04:00–05:30 window is still open", () => {
    // 04:30 on the 15th: the 14th's Night shift does not close until 05:30 today.
    const gaps = computeGaps(new Map(), [], dept, group, "2026-04-13", at("2026-04-15T04:30:00Z"))
    expect(gaps.map((g) => g.date)).toEqual(["2026-04-13"])
    expect(gaps[0].shift).toBe("Night")
  })

  it("reports the shift once its window has closed", () => {
    const gaps = computeGaps(new Map(), [], dept, group, "2026-04-13", at("2026-04-15T10:00:00Z"))
    expect(gaps.map((g) => g.date)).toEqual(["2026-04-14", "2026-04-13"])
  })

  it("still reports a Morning shift during those same small hours", () => {
    // Group 3 is on Morning that week; its 14th window closed at 14:30 on the
    // 14th, so at 04:30 on the 15th it is genuinely missed and must be reported.
    const gaps = computeGaps(new Map(), [], dept, 3, "2026-04-13", at("2026-04-15T04:30:00Z"))
    expect(gaps.map((g) => g.date)).toEqual(["2026-04-14", "2026-04-13"])
    expect(gaps[0].shift).toBe("Morning")
  })
})
