import { describe, it, expect } from "vitest"
import {
  AMBER_DAYS,
  RED_DAYS,
  buildMaterialStatus,
  byUrgency,
  levelFromDays,
  type MaterialStatus,
} from "@/lib/domain/stock-status"

// A Thursday, so the run-out walk crosses a Sunday within a couple of weeks.
const FROM = "2026-08-20"

const row = (over: Partial<MaterialStatus> = {}): MaterialStatus => ({
  key: "alcohol",
  label: "Alcohol",
  unit: "litres",
  remaining: 100,
  usedInWindow: 10,
  avgPerDay: 1,
  operatingDaysLeft: 100,
  runOutDate: null,
  level: "none",
  ...over,
})

describe("levelFromDays", () => {
  it("is red at or below the red threshold", () => {
    expect(levelFromDays(0)).toBe("red")
    expect(levelFromDays(RED_DAYS)).toBe("red")
  })

  it("is yellow between the thresholds, inclusive of the amber edge", () => {
    expect(levelFromDays(RED_DAYS + 0.1)).toBe("yellow")
    expect(levelFromDays(AMBER_DAYS)).toBe("yellow")
  })

  it("is none above the amber threshold", () => {
    expect(levelFromDays(AMBER_DAYS + 0.1)).toBe("none")
    expect(levelFromDays(999)).toBe("none")
  })

  it("treats unmeasurable usage as none, not as an alert", () => {
    // null means "nothing was consumed in the window", which is not a shortage.
    expect(levelFromDays(null)).toBe("none")
  })
})

// ════════════════════════════════════════════════════════════════════════════
// The regression this module exists to prevent.
//
// /api/analytics/report used to emit `daysLeft` while the manager UI read
// `operatingDaysLeft`. Because `undefined !== null`, the "Days left" column
// rendered NaN for every material and the urgency sort silently did nothing —
// the stock alerting was entirely dead while looking healthy. These tests fail
// if the field is ever renamed on one side again.
// ════════════════════════════════════════════════════════════════════════════
describe("buildMaterialStatus — the contract", () => {
  const built = buildMaterialStatus({
    key: "caps",
    label: "Caps",
    unit: "pcs",
    remaining: 500,
    usedInWindow: 120,
    operatingDaysInWindow: 6,
    fromISO: FROM,
  })

  it("names the field operatingDaysLeft", () => {
    expect(built).toHaveProperty("operatingDaysLeft")
    expect(typeof built.operatingDaysLeft).toBe("number")
  })

  it("does NOT emit the old daysLeft name", () => {
    expect(built).not.toHaveProperty("daysLeft")
  })

  it("emits exactly the agreed key set", () => {
    expect(Object.keys(built).sort()).toEqual(
      [
        "avgPerDay",
        "key",
        "label",
        "level",
        "operatingDaysLeft",
        "remaining",
        "runOutDate",
        "unit",
        "usedInWindow",
      ].sort(),
    )
  })

  it("derives the burn rate per OPERATING day, not per calendar day", () => {
    // 120 used over 6 operating days = 20/day, so 500 remaining lasts 25 days.
    expect(built.avgPerDay).toBe(20)
    expect(built.operatingDaysLeft).toBe(25)
  })

  it("sets the level from the projection rather than taking it on trust", () => {
    expect(built.level).toBe("none") // 25 days is comfortable
    const tight = buildMaterialStatus({
      key: "caps", label: "Caps", unit: "pcs",
      remaining: 60, usedInWindow: 120, operatingDaysInWindow: 6, fromISO: FROM,
    })
    expect(tight.operatingDaysLeft).toBe(3)
    expect(tight.level).toBe("red")
  })

  it("reports no usage as null days and projects no run-out date", () => {
    const idle = buildMaterialStatus({
      key: "herb", label: "Herb", unit: "units",
      remaining: 40, usedInWindow: 0, operatingDaysInWindow: 6, fromISO: FROM,
    })
    expect(idle.operatingDaysLeft).toBeNull()
    expect(idle.runOutDate).toBeNull()
    expect(idle.avgPerDay).toBe(0)
    expect(idle.level).toBe("none")
  })

  it("projects a real run-out date when stock is short", () => {
    const soon = buildMaterialStatus({
      key: "caps", label: "Caps", unit: "pcs",
      remaining: 40, usedInWindow: 120, operatingDaysInWindow: 6, fromISO: FROM,
    })
    expect(soon.runOutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(soon.runOutDate! >= FROM).toBe(true)
  })

  it("rounds remaining and usedInWindow to 2dp", () => {
    const messy = buildMaterialStatus({
      key: "alcohol", label: "Alcohol", unit: "litres",
      remaining: 10.98765, usedInWindow: 3.14159, operatingDaysInWindow: 6, fromISO: FROM,
    })
    expect(messy.remaining).toBe(10.99)
    expect(messy.usedInWindow).toBe(3.14)
  })
})

describe("byUrgency", () => {
  it("puts reds before yellows before the rest", () => {
    const sorted = [row({ key: "c", level: "none" }), row({ key: "a", level: "red" }), row({ key: "b", level: "yellow" })]
      .sort(byUrgency)
      .map((m) => m.key)
    expect(sorted).toEqual(["a", "b", "c"])
  })

  it("breaks ties by soonest to run out", () => {
    const sorted = [
      row({ key: "later", level: "red", operatingDaysLeft: 5 }),
      row({ key: "sooner", level: "red", operatingDaysLeft: 1 }),
    ].sort(byUrgency).map((m) => m.key)
    expect(sorted).toEqual(["sooner", "later"])
  })

  it("sorts materials with no measurable usage last", () => {
    const sorted = [
      row({ key: "idle", level: "none", operatingDaysLeft: null }),
      row({ key: "plenty", level: "none", operatingDaysLeft: 300 }),
    ].sort(byUrgency).map((m) => m.key)
    expect(sorted).toEqual(["plenty", "idle"])
  })

  it("actually reorders — the old sort was a silent no-op", () => {
    // Guard against a comparator that compiles but never swaps anything.
    const input = [row({ key: "ok", level: "none" }), row({ key: "critical", level: "red", operatingDaysLeft: 2 })]
    expect(input.map((m) => m.key)).toEqual(["ok", "critical"])
    expect([...input].sort(byUrgency).map((m) => m.key)).toEqual(["critical", "ok"])
  })
})
