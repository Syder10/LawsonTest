import { describe, it, expect } from "vitest"
import {
  AMBER_DAYS,
  RED_DAYS,
  buildMaterialStatus,
  burnLooksImplausible,
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
  burnDays: 10,
  sampleDays: 10,
  expectedPerDay: null,
  basis: "measured",
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
  // Fri 14th → Thu 20th August 2026 is SIX operating days (Sunday the 16th is not
  // one), so a sample recorded on those two dates spans 6 operating days.
  const SPAN_6 = ["2026-08-14", "2026-08-20"]
  const at = (over: { remaining: number; usedInWindow: number; usageDates?: string[] }) =>
    buildMaterialStatus({
      key: "caps",
      label: "Caps",
      unit: "pcs",
      usageDates: SPAN_6,
      windowEnd: FROM,
      fromISO: FROM,
      ...over,
    })

  const built = at({ remaining: 500, usedInWindow: 120 })

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
        "burnDays",
        "expectedPerDay",
        "key",
        "label",
        "level",
        "operatingDaysLeft",
        "remaining",
        "runOutDate",
        "basis",
        "sampleDays",
        "unit",
        "unitEach",
        "usedInWindow",
      ].sort(),
    )
  })

  it("derives the burn rate per OPERATING day, not per calendar day", () => {
    // 120 used over 6 operating days = 20/day, so 500 remaining lasts 25 days.
    expect(built.burnDays).toBe(6)
    expect(built.avgPerDay).toBe(20)
    expect(built.operatingDaysLeft).toBe(25)
  })

  it("reports how much data the projection rests on", () => {
    expect(built.sampleDays).toBe(2)
    expect(at({ remaining: 500, usedInWindow: 120, usageDates: [FROM] }).sampleDays).toBe(1)
  })

  it("sets the level from the projection rather than taking it on trust", () => {
    expect(built.level).toBe("none") // 25 days is comfortable
    const tight = at({ remaining: 60, usedInWindow: 120 })
    expect(tight.operatingDaysLeft).toBe(3)
    expect(tight.level).toBe("red")
  })

  it("reports no usage as null days and projects no run-out date", () => {
    const idle = at({ remaining: 40, usedInWindow: 0, usageDates: [] })
    expect(idle.operatingDaysLeft).toBeNull()
    expect(idle.runOutDate).toBeNull()
    expect(idle.avgPerDay).toBe(0)
    expect(idle.burnDays).toBe(0)
    expect(idle.level).toBe("none")
  })

  it("projects a real run-out date when stock is short", () => {
    const soon = at({ remaining: 40, usedInWindow: 120 })
    expect(soon.runOutDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(soon.runOutDate! >= FROM).toBe(true)
  })

  it("rounds remaining and usedInWindow to 2dp", () => {
    const messy = at({ remaining: 10.98765, usedInWindow: 3.14159 })
    expect(messy.remaining).toBe(10.99)
    expect(messy.usedInWindow).toBe(3.14)
  })

  // ── The 624-days bug ──────────────────────────────────────────────────────
  it("does not stretch one day of usage across an empty 30-day window", () => {
    // The original report: 600 drums of alcohol, one recorded day of 25 used, and a
    // "days left" of 624 — because the rate was divided by every Mon–Sat in the window
    // (26 of them), turning 25/day into 0.96/day. The denominator is now the day the
    // data actually covers, so the MEASURED rate is 25/day.
    const oneDay = buildMaterialStatus({
      key: "caps", label: "Caps", unit: "pcs", // no expected rate → measured is used
      remaining: 600, usedInWindow: 25,
      usageDates: ["2026-08-20"], windowEnd: "2026-08-20", fromISO: "2026-08-20",
    })
    expect(oneDay.burnDays).toBe(1)
    expect(oneDay.avgPerDay).toBe(25)
    expect(oneDay.operatingDaysLeft).toBe(24)
    expect(oneDay.sampleDays).toBe(1)
    expect(oneDay.basis).toBe("measured")
  })

  it("projects from the KNOWN rate when the records are too thin to trust", () => {
    // Same figures, but alcohol has a confirmed normal of 200 drums/day. One test row
    // measuring 25 is not a burn rate, and 24 days of cover would be eight times out —
    // 600 drums at 200/day is three days. The measured rate is still reported, because
    // that is what makes the bad entry visible.
    const oneDay = buildMaterialStatus({
      key: "alcohol", label: "Alcohol", unit: "drums",
      remaining: 600, usedInWindow: 25,
      usageDates: ["2026-08-20"], windowEnd: "2026-08-20", fromISO: "2026-08-20",
    })
    expect(oneDay.avgPerDay).toBe(25)
    expect(oneDay.expectedPerDay).toBe(200)
    expect(oneDay.basis).toBe("expected")
    expect(oneDay.operatingDaysLeft).toBe(3)
    expect(oneDay.level).toBe("red")
  })

  it("projects from the known rate when nothing was recorded at all", () => {
    // "No usage" is not the same as "no consumption". A plant that runs 200 drums a day
    // and has 3,000 in the yard has 15 days of cover whether or not anyone filed a form.
    const idle = buildMaterialStatus({
      key: "alcohol", label: "Alcohol", unit: "drums",
      remaining: 3000, usedInWindow: 0,
      usageDates: [], windowEnd: "2026-08-20", fromISO: "2026-08-20",
    })
    expect(idle.avgPerDay).toBe(0)
    expect(idle.basis).toBe("expected")
    expect(idle.operatingDaysLeft).toBe(15)
  })

  it("prefers a real measurement once there is enough of it", () => {
    // Six recorded days at 150/day is a trend, not noise — inside the plausible band,
    // so it wins over the expectation.
    const measured = buildMaterialStatus({
      key: "alcohol", label: "Alcohol", unit: "drums",
      remaining: 600, usedInWindow: 900,
      usageDates: ["2026-08-14", "2026-08-15", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"],
      windowEnd: "2026-08-20", fromISO: "2026-08-20",
    })
    expect(measured.burnDays).toBe(6)
    expect(measured.avgPerDay).toBe(150)
    expect(measured.basis).toBe("measured")
    expect(measured.operatingDaysLeft).toBe(4)
  })

  it("falls back to the known rate when a full sample is still absurd", () => {
    // Six days that average 8 drums against an expected 200: more likely litres typed
    // as drums, or a shift's figure entered as a day's, than an 8-drum day.
    const odd = buildMaterialStatus({
      key: "alcohol", label: "Alcohol", unit: "drums",
      remaining: 600, usedInWindow: 48,
      usageDates: ["2026-08-14", "2026-08-15", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"],
      windowEnd: "2026-08-20", fromISO: "2026-08-20",
    })
    expect(odd.avgPerDay).toBe(8)
    expect(odd.basis).toBe("expected")
    expect(odd.operatingDaysLeft).toBe(3)
  })

  it("still measures a genuinely intermittent material over its whole span", () => {
    // Used twice a week for three weeks: the span IS wide, so the low rate is real
    // rather than an artefact of missing records.
    const intermittent = buildMaterialStatus({
      key: "caramel", label: "Caramel", unit: "units",
      remaining: 100, usedInWindow: 36,
      usageDates: ["2026-08-03", "2026-08-06", "2026-08-10", "2026-08-13", "2026-08-17", "2026-08-20"],
      windowEnd: "2026-08-20", fromISO: "2026-08-20",
    })
    expect(intermittent.burnDays).toBe(16) // Mon 3rd → Thu 20th, minus Sundays
    expect(intermittent.avgPerDay).toBe(2.25)
    expect(intermittent.sampleDays).toBe(6)
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

// ════════════════════════════════════════════════════════════════════════════
// Units. Alcohol is counted in 250 L DRUMS on the floor and in the form, but the
// ledger's seed row said "litres" and every dashboard repeated it — so "600 drums
// of cover" was displayed as "600 litres", which for this plant is under an hour of
// production rather than three days.
// ════════════════════════════════════════════════════════════════════════════
describe("ledger units", () => {
  const alcohol = buildMaterialStatus({
    key: "alcohol", label: "Alcohol", unit: "litres", // caller's stale guess
    remaining: 600, usedInWindow: 400,
    usageDates: ["2026-08-18", "2026-08-20"], windowEnd: FROM, fromISO: FROM,
  })

  it("reports alcohol in drums whatever the caller passes", () => {
    expect(alcohol.unit).toBe("drums")
  })

  it("carries the litres-per-drum factor so a screen can show both", () => {
    expect(alcohol.unitEach).toEqual({ qty: 250, unit: "litres" })
    expect(alcohol.remaining * alcohol.unitEach!.qty).toBe(150_000)
  })

  it("reports every ledger material in the container it is counted in", () => {
    const at = (key: string) =>
      buildMaterialStatus({
        key, label: key, unit: "pcs", // deliberately stale
        remaining: 10, usedInWindow: 2,
        usageDates: [FROM], windowEnd: FROM, fromISO: FROM,
      })
    expect(at("caps").unit).toBe("boxes")
    expect(at("labels").unit).toBe("rolls")
    expect(at("caramel").unit).toBe("gallons")
    expect(at("herb").unit).toBe("sacks")
  })

  it("resolves per-product and per-variant row keys to their material's unit", () => {
    // Dashboard rows are keyed "labels_bitters", "caramel_ginger" — exactly the rows a
    // naive exact-match lookup would drop the unit on.
    const at = (key: string) =>
      buildMaterialStatus({
        key, label: key, unit: "pcs",
        remaining: 10, usedInWindow: 2,
        usageDates: [FROM], windowEnd: FROM, fromISO: FROM,
      })
    expect(at("labels_bitters").unit).toBe("rolls")
    expect(at("caramel_ginger").unit).toBe("gallons")
    expect(at("caramel_ginger").unitEach).toEqual({ qty: 20, unit: "litres" })
  })

  it("shows a second figure only where the count per container is confirmed", () => {
    const at = (key: string) =>
      buildMaterialStatus({
        key, label: key, unit: "pcs",
        remaining: 10, usedInWindow: 2,
        usageDates: [FROM], windowEnd: FROM, fromISO: FROM,
      })
    // All user-confirmed counts per container.
    expect(at("caps").unitEach).toEqual({ qty: 4000, unit: "pcs" })
    expect(at("labels").unitEach).toEqual({ qty: 4000, unit: "pcs" })
    expect(at("preform").unitEach).toEqual({ qty: 1008, unit: "pcs" })
    // Herb sacks have no stated weight, and the user asked for none to be shown. An
    // invented factor would be worse than a bare count.
    expect(at("herb").unitEach).toBeUndefined()
  })

  it("resolves the plural preforms key the procurement dashboard uses", () => {
    // The two dashboards disagree on the plural, which is exactly how a unit gets
    // dropped on one screen and not the other.
    const row = buildMaterialStatus({
      key: "preforms", label: "Preforms", unit: "bags",
      remaining: 10, usedInWindow: 2,
      usageDates: [FROM], windowEnd: FROM, fromISO: FROM,
    })
    expect(row.unit).toBe("bags")
    expect(row.unitEach).toEqual({ qty: 1008, unit: "pcs" })
  })

  it("leaves a material outside the ledger registry untouched", () => {
    const stamps = buildMaterialStatus({
      key: "tax_stamp", label: "Tax Stamps", unit: "pcs",
      remaining: 1000, usedInWindow: 100,
      usageDates: [FROM], windowEnd: FROM, fromISO: FROM,
    })
    expect(stamps.unit).toBe("pcs")
    expect(stamps.unitEach).toBeUndefined()
    expect(stamps.expectedPerDay).toBeNull()
  })
})

describe("burnLooksImplausible", () => {
  // ~100 drums a shift, two shifts — 200 drums/day (user-confirmed).
  it("knows the expected rate for alcohol", () => {
    expect(
      buildMaterialStatus({
        key: "alcohol", label: "Alcohol", unit: "drums",
        remaining: 600, usedInWindow: 200,
        usageDates: [FROM], windowEnd: FROM, fromISO: FROM,
      }).expectedPerDay,
    ).toBe(200)
  })

  it("accepts a rate in the normal band", () => {
    expect(burnLooksImplausible({ avgPerDay: 200, expectedPerDay: 200 })).toBe(false)
    expect(burnLooksImplausible({ avgPerDay: 120, expectedPerDay: 200 })).toBe(false)
    expect(burnLooksImplausible({ avgPerDay: 700, expectedPerDay: 200 })).toBe(false)
  })

  it("flags an order-of-magnitude slip in either direction", () => {
    // 25/day against an expected 200 — the shape of "a shift's usage entered once".
    expect(burnLooksImplausible({ avgPerDay: 25, expectedPerDay: 200 })).toBe(true)
    // 50,000/day — litres typed where drums were meant.
    expect(burnLooksImplausible({ avgPerDay: 50_000, expectedPerDay: 200 })).toBe(true)
  })

  it("says nothing where no expectation is known, or nothing was used", () => {
    expect(burnLooksImplausible({ avgPerDay: 1, expectedPerDay: null })).toBe(false)
    expect(burnLooksImplausible({ avgPerDay: 0, expectedPerDay: 200 })).toBe(false)
  })
})
