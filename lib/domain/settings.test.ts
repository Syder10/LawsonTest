import { describe, expect, it } from "vitest"
import {
  CONVERSION_COLUMNS,
  CONVERSION_FIELDS,
  DEFAULT_CONVERSIONS,
  DEFAULT_RECIPES,
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  cartonLitres,
  cartonsPerDay,
  conversionRow,
  recipeWarnings,
  recipesFromRows,
  settingsFromRow,
  totalCartonsPerDay,
  validateConversions,
  validateRecipes,
  validateSettings,
  type Conversions,
  type Recipes,
  type SettingsInput,
} from "@/lib/domain/settings"
import type { ProductRecipeRow } from "@/lib/db/types"

const valid: SettingsInput = {
  cartons_per_shift_bitters: 2500,
  cartons_per_shift_ginger: 500,
  shifts_per_day: 3,
  waste_allowance_pct: 0,
  alcohol_drums_per_day: 200,
}

const withConversions = (patch: Partial<Conversions>): Conversions => ({ ...DEFAULT_CONVERSIONS, ...patch })
const withRecipes = (patch: Partial<Recipes>): Recipes => ({ ...DEFAULT_RECIPES, ...patch })

describe("DEFAULT_SETTINGS", () => {
  it("matches the figures the business confirmed", () => {
    expect(DEFAULT_SETTINGS.cartonsPerShift).toEqual({ Bitters: 2500, Ginger: 500 })
    expect(DEFAULT_SETTINGS.shiftsPerDay).toBe(3)
    expect(DEFAULT_SETTINGS.alcoholDrumsPerDay).toBe(200)
  })

  it("carries no waste allowance until one is stated", () => {
    expect(DEFAULT_SETTINGS.wasteAllowance).toBe(0)
  })

  it("is itself a valid submission, so the form can never start out rejected", () => {
    expect(validateSettings(valid)).toBeNull()
  })
})

describe("cartonsPerDay", () => {
  it("multiplies the per-shift figure by the shift count", () => {
    expect(cartonsPerDay(DEFAULT_SETTINGS, "Bitters")).toBe(7500)
    expect(cartonsPerDay(DEFAULT_SETTINGS, "Ginger")).toBe(1500)
    expect(totalCartonsPerDay(DEFAULT_SETTINGS)).toBe(9000)
  })
})

describe("settingsFromRow", () => {
  it("falls back to the defaults when the row is missing", () => {
    // 0006 not applied yet: a stock dashboard running on confirmed figures beats one
    // that blanks out because a settings table is absent.
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS)
    expect(settingsFromRow(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it("converts the stored percentage into a fraction, once", () => {
    const s = settingsFromRow({ waste_allowance_pct: 2.5 })
    expect(s.wasteAllowance).toBe(0.025)
  })

  it("coerces PostgREST's numeric STRINGS", () => {
    // numeric comes back as a string; "2500" * 3 works but "2500" + 3 is "25003", and
    // one of those silently corrupts every derived rate.
    const s = settingsFromRow({
      cartons_per_shift_bitters: "3000" as unknown as number,
      shifts_per_day: "2" as unknown as number,
      alcohol_drums_per_day: "210.5" as unknown as number,
    })
    expect(s.cartonsPerShift.Bitters).toBe(3000)
    expect(s.shiftsPerDay).toBe(2)
    expect(s.alcoholDrumsPerDay).toBe(210.5)
    expect(cartonsPerDay(s, "Bitters")).toBe(6000)
  })

  it("falls back per FIELD, so one unreadable column doesn't discard the rest", () => {
    const s = settingsFromRow({ cartons_per_shift_bitters: 4000, shifts_per_day: null as unknown as number })
    expect(s.cartonsPerShift.Bitters).toBe(4000)
    expect(s.shiftsPerDay).toBe(DEFAULT_SETTINGS.shiftsPerDay)
  })
})

describe("validateSettings", () => {
  it("accepts the confirmed figures", () => {
    expect(validateSettings(valid)).toBeNull()
  })

  it("accepts a zero-Ginger forecast (a Bitters-only run is real)", () => {
    expect(validateSettings({ ...valid, cartons_per_shift_ginger: 0 })).toBeNull()
  })

  it("rejects a forecast of nothing at all", () => {
    // Zero cartons makes every expected rate zero, which renders as "no usage" on every
    // material — a wrong number that looks calm is worse than a rejected form.
    const problem = validateSettings({ ...valid, cartons_per_shift_bitters: 0, cartons_per_shift_ginger: 0 })
    expect(problem).toMatch(/cannot be zero/i)
  })

  it("rejects fractional cartons and shifts, and says which field", () => {
    expect(validateSettings({ ...valid, cartons_per_shift_bitters: 10.5 })).toMatch(/Bitters cartons per shift/)
    expect(validateSettings({ ...valid, shifts_per_day: 2.5 })).toMatch(/Shifts per day/)
  })

  it("allows a fractional waste percentage and alcohol figure", () => {
    expect(validateSettings({ ...valid, waste_allowance_pct: 1.75 })).toBeNull()
    expect(validateSettings({ ...valid, alcohol_drums_per_day: 212.5 })).toBeNull()
  })

  it("rejects anything outside the same range the database CHECKs", () => {
    expect(validateSettings({ ...valid, shifts_per_day: 0 })).toMatch(/Shifts per day/)
    expect(validateSettings({ ...valid, shifts_per_day: 4 })).toMatch(/Shifts per day/)
    expect(validateSettings({ ...valid, waste_allowance_pct: -1 })).toMatch(/Waste allowance/)
    expect(validateSettings({ ...valid, waste_allowance_pct: 51 })).toMatch(/Waste allowance/)
    expect(validateSettings({ ...valid, alcohol_drums_per_day: -5 })).toMatch(/Alcohol drums/)
  })

  it("rejects non-numbers rather than storing NaN", () => {
    expect(validateSettings({ ...valid, alcohol_drums_per_day: Number.NaN })).toMatch(/must be a number/)
    expect(validateSettings({ ...valid, cartons_per_shift_ginger: Number.POSITIVE_INFINITY })).toMatch(/must be a number/)
  })

  it("keeps its limits in step with what it enforces", () => {
    // The form renders min/max from SETTINGS_LIMITS, so a limit that disagrees with the
    // validator would let the browser accept what the server rejects.
    expect(validateSettings({ ...valid, shifts_per_day: SETTINGS_LIMITS.shiftsPerDay.max })).toBeNull()
    expect(validateSettings({ ...valid, waste_allowance_pct: SETTINGS_LIMITS.wastePct.max })).toBeNull()
    expect(validateSettings({ ...valid, alcohol_drums_per_day: SETTINGS_LIMITS.alcoholDrumsPerDay.max })).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Conversions — every number that turns one unit into another.
// ════════════════════════════════════════════════════════════════════════════
describe("conversions", () => {
  it("defaults to the confirmed figures, and they pass their own validator", () => {
    expect(DEFAULT_CONVERSIONS.bottlesPerCarton).toBe(12)
    expect(DEFAULT_CONVERSIONS.bottleLitres).toBe(0.75)
    expect(DEFAULT_CONVERSIONS.drumLitres).toBe(250)
    expect(DEFAULT_CONVERSIONS.gallonLitres).toBe(20)
    expect(DEFAULT_CONVERSIONS.capsPcsPerBox).toBe(4000)
    expect(DEFAULT_CONVERSIONS.preformPcsPerBag).toBe(1008)
    expect(validateConversions(DEFAULT_CONVERSIONS)).toBeNull()
  })

  it("has a field definition for EVERY conversion", () => {
    // The form renders inputs from CONVERSION_FIELDS and the route validates the same
    // list, so a conversion missing from it would be uneditable AND unvalidated — the
    // kind of gap that only shows up as a number nobody can change.
    const described = new Set(CONVERSION_FIELDS.map((f) => f.key))
    for (const key of Object.keys(DEFAULT_CONVERSIONS) as Array<keyof Conversions>) {
      expect(described.has(key), `CONVERSION_FIELDS covers ${key}`).toBe(true)
    }
    expect(described.size).toBe(Object.keys(DEFAULT_CONVERSIONS).length)
  })

  it("has a column for every conversion, and no duplicates", () => {
    const columns = Object.values(CONVERSION_COLUMNS)
    expect(Object.keys(CONVERSION_COLUMNS).sort()).toEqual(Object.keys(DEFAULT_CONVERSIONS).sort())
    expect(new Set(columns).size).toBe(columns.length)
  })

  it("turns the conversions into database columns", () => {
    const row = conversionRow(DEFAULT_CONVERSIONS)
    expect(row.bottles_per_carton).toBe(12)
    expect(row.rambo_litres).toBe(2500)
    // The round trip is what the admin form previews through.
    expect(settingsFromRow({ ...valid, ...row }).conversions).toEqual(DEFAULT_CONVERSIONS)
  })

  it("computes the carton from its bottles", () => {
    expect(cartonLitres(DEFAULT_CONVERSIONS)).toBe(9)
    expect(cartonLitres(withConversions({ bottlesPerCarton: 24 }))).toBe(18)
  })

  it("rejects a fractional count of a physical thing, and names it", () => {
    expect(validateConversions(withConversions({ capsPcsPerBox: 4000.5 }))).toMatch(/Caps per box/)
    expect(validateConversions(withConversions({ bottlesPerCarton: 12.5 }))).toMatch(/whole number/)
    // A per-bottle count may be fractional — half a litre per bottle is meaningful.
    expect(validateConversions(withConversions({ capsPerBottle: 0.5 }))).toBeNull()
  })

  it("rejects a zero or negative container, which would divide by nothing", () => {
    expect(validateConversions(withConversions({ drumLitres: 0 }))).toMatch(/Litres per alcohol drum/)
    expect(validateConversions(withConversions({ labelPcsPerRoll: -1 }))).toMatch(/Labels per roll/)
  })

  it("rejects a blank field rather than storing NaN", () => {
    expect(validateConversions(withConversions({ tankLitres: Number.NaN }))).toMatch(/must be a number/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Recipes — and the invariant that a recipe must fill its carton.
// ════════════════════════════════════════════════════════════════════════════
describe("validateRecipes", () => {
  it("accepts the confirmed recipes", () => {
    expect(validateRecipes(DEFAULT_RECIPES, DEFAULT_CONVERSIONS)).toBeNull()
  })

  it("rejects a recipe that does not fill its carton, and says by how much", () => {
    const short = withRecipes({
      Bitters: DEFAULT_RECIPES.Bitters.map((l) =>
        l.ingredient === "water" ? { ...l, litresPerCarton: 4 } : l,
      ),
    })
    const problem = validateRecipes(short, DEFAULT_CONVERSIONS)
    expect(problem).toMatch(/Bitters sums to 8.64 L per carton but a carton is 9 L/)
  })

  it("rejects a recipe that OVERFILLS, not only one that falls short", () => {
    const over = withRecipes({
      Ginger: [...DEFAULT_RECIPES.Ginger, { ingredient: "honey", label: "Honey", litresPerCarton: 1 }],
    })
    expect(validateRecipes(over, DEFAULT_CONVERSIONS)).toMatch(/Ginger sums to 10 L/)
  })

  it("catches a carton size changed out from under a recipe", () => {
    // The trigger in 0007 only fires on a RECIPE write, so this is the check that stops
    // an administrator editing bottles-per-carton and leaving every recipe short.
    expect(validateRecipes(DEFAULT_RECIPES, withConversions({ bottlesPerCarton: 24 }))).toMatch(
      /but a carton is 18 L/,
    )
  })

  it("tolerates binary floating point rather than rejecting a correct recipe", () => {
    // 2.5 + 2 + 4.36 + 0.1 + 0.04 is 8.999999999999998 in IEEE 754.
    expect(DEFAULT_RECIPES.Bitters.reduce((s, l) => s + l.litresPerCarton, 0)).not.toBe(9)
    expect(validateRecipes(DEFAULT_RECIPES, DEFAULT_CONVERSIONS)).toBeNull()
  })

  it("rejects an empty recipe rather than reading it as 'no ingredients needed'", () => {
    expect(validateRecipes(withRecipes({ Ginger: [] }), DEFAULT_CONVERSIONS)).toBe("Ginger has no recipe.")
  })

  it("rejects an ingredient code that nothing could look up", () => {
    const bad = (ingredient: string) =>
      validateRecipes(
        withRecipes({ Bitters: [{ ingredient, label: "Something", litresPerCarton: 9 }] }),
        DEFAULT_CONVERSIONS,
      )
    expect(bad("Raw Ethanol")).toMatch(/not a valid ingredient code/)
    expect(bad("")).toMatch(/\(blank\)/)
    expect(bad("2water")).toMatch(/not a valid ingredient code/)
    expect(bad("water")).toBeNull()
  })

  it("rejects a duplicated ingredient, which the primary key would reject anyway", () => {
    const twice = withRecipes({
      Bitters: [
        { ingredient: "water", label: "Water", litresPerCarton: 4.5 },
        { ingredient: "water", label: "Water again", litresPerCarton: 4.5 },
      ],
    })
    expect(validateRecipes(twice, DEFAULT_CONVERSIONS)).toBe("Bitters lists water twice.")
  })

  it("rejects a nameless or negative line", () => {
    expect(
      validateRecipes(
        withRecipes({ Bitters: [{ ingredient: "water", label: "  ", litresPerCarton: 9 }] }),
        DEFAULT_CONVERSIONS,
      ),
    ).toMatch(/needs a name/)
    expect(
      validateRecipes(
        withRecipes({
          Bitters: [
            { ingredient: "water", label: "Water", litresPerCarton: 10 },
            { ingredient: "spices", label: "Spices", litresPerCarton: -1 },
          ],
        }),
        DEFAULT_CONVERSIONS,
      ),
    ).toMatch(/zero or more litres/)
  })

  it("refuses a carton that holds nothing", () => {
    expect(validateRecipes(DEFAULT_RECIPES, withConversions({ bottlesPerCarton: 0 }))).toMatch(
      /more than zero litres/,
    )
  })
})

describe("recipesFromRows", () => {
  const row = (over: Partial<ProductRecipeRow>): ProductRecipeRow => ({
    product: "Bitters",
    ingredient: "water",
    label: "Water",
    litres_per_carton: 9,
    display_order: 1,
    ...over,
  })

  it("falls back to the confirmed recipes when the table is empty or absent", () => {
    // An empty set means "not configured" — reading it as an empty recipe would report
    // zero consumption for every ingredient and infinite cover.
    expect(recipesFromRows(null)).toEqual(DEFAULT_RECIPES)
    expect(recipesFromRows([])).toEqual(DEFAULT_RECIPES)
  })

  it("keeps a product's default when only the OTHER product is configured", () => {
    const recipes = recipesFromRows([row({})])
    expect(recipes.Bitters).toEqual([{ ingredient: "water", label: "Water", litresPerCarton: 9 }])
    expect(recipes.Ginger).toEqual(DEFAULT_RECIPES.Ginger)
  })

  it("coerces PostgREST's numeric STRINGS", () => {
    // "9" + 0.5 is "90.5", and a recipe total that concatenates is not a rounding error.
    const recipes = recipesFromRows([row({ litres_per_carton: "9" as unknown as number })])
    expect(recipes.Bitters[0].litresPerCarton).toBe(9)
  })

  it("orders by display_order, not by the order rows arrive in", () => {
    const recipes = recipesFromRows([
      row({ ingredient: "water", display_order: 3, litres_per_carton: 6 }),
      row({ ingredient: "alcohol", display_order: 1, litres_per_carton: 2 }),
      row({ ingredient: "spices", display_order: 2, litres_per_carton: 1 }),
    ])
    expect(recipes.Bitters.map((l) => l.ingredient)).toEqual(["alcohol", "spices", "water"])
  })

  it("drops a row whose quantity is not a number", () => {
    const recipes = recipesFromRows([
      row({ ingredient: "water", litres_per_carton: 9 }),
      row({ ingredient: "spices", litres_per_carton: "x" as unknown as number }),
    ])
    expect(recipes.Bitters.map((l) => l.ingredient)).toEqual(["water"])
  })
})

describe("recipeWarnings", () => {
  it("says nothing about the confirmed recipes", () => {
    expect(recipeWarnings(DEFAULT_RECIPES)).toEqual([])
  })

  it("warns when a line other calculations look up by name is missing", () => {
    // Removing or renaming the caramel line does not fail — caramel simply reads as no
    // expected usage, which is exactly the kind of silence worth saying out loud.
    const noCaramel = withRecipes({
      Bitters: DEFAULT_RECIPES.Bitters.filter((l) => l.ingredient !== "caramel"),
    })
    const warnings = recipeWarnings(noCaramel)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/Bitters has no "caramel" line/)
  })
})
