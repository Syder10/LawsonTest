import { describe, it, expect } from "vitest"
import { alertLevel, daysRemaining, THRESHOLDS, WEEK_DAYS } from "@/lib/domain/stock-thresholds"

// NOTE: this module is documented as NOT CURRENTLY IN USE (live alerts use the
// operating-days rule). These tests pin its behaviour so the salvaged threshold
// table cannot drift silently before it is wired in as "Level 2".

describe("THRESHOLDS table", () => {
  it("holds exactly the ten salvaged per-material thresholds", () => {
    expect(Object.keys(THRESHOLDS)).toEqual([
      "alcohol",
      "caps",
      "preforms",
      "labels_bitters",
      "labels_ginger",
      "caramel_bitters",
      "caramel_ginger",
      "cartons_bitters",
      "cartons_ginger",
      "tax_stamp",
    ])
  })

  it("sets yellow at exactly twice red for every material (red = 1 week, yellow = 2 weeks)", () => {
    for (const [key, t] of Object.entries(THRESHOLDS)) {
      expect(t.yellow, `yellow threshold for ${key}`).toBe(t.red * 2)
    }
  })

  it("keeps every red threshold strictly positive so daysRemaining can divide by it", () => {
    for (const [key, t] of Object.entries(THRESHOLDS)) {
      expect(t.red, `red threshold for ${key}`).toBeGreaterThan(0)
    }
  })

  it("pins the alcohol thresholds in drums", () => {
    expect(THRESHOLDS.alcohol).toEqual({ red: 700, yellow: 1400 })
  })

  it("pins the tax_stamp thresholds in boxes (the smallest table entry)", () => {
    expect(THRESHOLDS.tax_stamp).toEqual({ red: 7, yellow: 14 })
  })

  it("defines WEEK_DAYS as 6 (Mon-Sat operating week)", () => {
    expect(WEEK_DAYS).toBe(6)
  })
})

describe("alertLevel", () => {
  it("returns red exactly AT the red threshold (boundary is inclusive)", () => {
    expect(alertLevel(700, "alcohol")).toBe("red")
  })

  it("returns red just below the red threshold", () => {
    expect(alertLevel(699.99, "alcohol")).toBe("red")
  })

  it("returns yellow just above the red threshold", () => {
    expect(alertLevel(700.01, "alcohol")).toBe("yellow")
  })

  it("returns yellow exactly AT the yellow threshold (boundary is inclusive)", () => {
    expect(alertLevel(1400, "alcohol")).toBe("yellow")
  })

  it("returns none just above the yellow threshold", () => {
    expect(alertLevel(1400.01, "alcohol")).toBe("none")
  })

  it("returns red for zero stock", () => {
    expect(alertLevel(0, "caps")).toBe("red")
  })

  it("returns red for negative stock", () => {
    expect(alertLevel(-1, "caps")).toBe("red")
  })

  it("returns none for a material that has no threshold entry", () => {
    expect(alertLevel(1, "gloves")).toBe("none")
  })

  it("returns none for an empty material key", () => {
    expect(alertLevel(0, "")).toBe("none")
  })

  it("is key-sensitive: the singular 'carton_bitters' key used by lib/domain/materials.ts has no threshold entry", () => {
    // NOTE: the table key is the PLURAL `cartons_bitters`, while MaterialType in
    // lib/domain/materials.ts uses `carton_bitters`. Wiring these two together
    // will need a key translation - documenting the mismatch, not endorsing it.
    expect(alertLevel(0, "carton_bitters")).toBe("none")
    expect(alertLevel(0, "cartons_bitters")).toBe("red")
  })

  it("returns none (not a crash) for a key that collides with an Object.prototype member", () => {
    // NOTE: THRESHOLDS is a plain object literal, so THRESHOLDS["toString"]
    // resolves to the inherited function and passes the `if (!t)` guard. The
    // subsequent numeric comparisons against `undefined` are all false, so this
    // happens to degrade to "none". See the daysRemaining test below, where the
    // same inheritance leak is NOT harmless.
    expect(alertLevel(1, "toString")).toBe("none")
    expect(alertLevel(1, "constructor")).toBe("none")
  })
})

describe("daysRemaining", () => {
  it("reports exactly one operating week of stock when the balance equals the red threshold", () => {
    expect(daysRemaining(700, "alcohol")).toBe(6)
  })

  it("reports exactly two operating weeks of stock when the balance equals the yellow threshold", () => {
    expect(daysRemaining(1400, "alcohol")).toBe(12)
  })

  it("reports half a week (3 days) for half the red threshold", () => {
    expect(daysRemaining(350, "alcohol")).toBe(3)
  })

  it("reports 0 days for zero stock", () => {
    expect(daysRemaining(0, "alcohol")).toBe(0)
  })

  it("reports negative days for a negative balance", () => {
    expect(daysRemaining(-700, "alcohol")).toBe(-6)
  })

  it("rounds to one decimal place (100 boxes of caps / 90 * 6 = 6.666.. -> 6.7)", () => {
    expect(daysRemaining(100, "caps")).toBe(6.7)
  })

  it("rounds a large ratio to one decimal place (1000 stamp boxes / 7 * 6 -> 857.1)", () => {
    expect(daysRemaining(1000, "tax_stamp")).toBe(857.1)
  })

  it("returns null for a material that has no threshold entry", () => {
    expect(daysRemaining(500, "preform")).toBeNull()
  })

  it("returns null for an empty material key", () => {
    expect(daysRemaining(500, "")).toBeNull()
  })

  it("returns null for a key that collides with an Object.prototype member", () => {
    // Guarded by Object.hasOwn: a plain-object lookup would resolve to the
    // inherited function, pass the truthiness check, and yield
    // `remaining / undefined` = NaN, which callers would format as "NaN days".
    expect(daysRemaining(500, "toString")).toBeNull()
    expect(daysRemaining(500, "valueOf")).toBeNull()
  })

  it("agrees with alertLevel at the boundaries: <=6 days is red, <=12 days is yellow", () => {
    for (const key of Object.keys(THRESHOLDS)) {
      const red = THRESHOLDS[key].red
      expect(daysRemaining(red, key), `days at red threshold for ${key}`).toBe(WEEK_DAYS)
      expect(alertLevel(red, key), `level at red threshold for ${key}`).toBe("red")
      expect(daysRemaining(red * 2, key), `days at yellow threshold for ${key}`).toBe(WEEK_DAYS * 2)
      expect(alertLevel(red * 2, key), `level at yellow threshold for ${key}`).toBe("yellow")
    }
  })
})
