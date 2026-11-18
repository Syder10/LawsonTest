import { describe, it, expect } from "vitest"
import type { Product } from "@/lib/db/types"
import {
  BOTTLES_PER_CARTON,
  BOTTLE_LITRES,
  CARTON_LITRES,
  PRODUCT_BOM,
  VESSEL,
  bomFor,
  cartonsPerBatch,
  estimateUsage,
  recipeBalances,
  recipeLitres,
  vesselsPerCarton,
} from "@/lib/domain/bom"
import { DEFAULT_SETTINGS, type ProductionSettings } from "@/lib/domain/settings"

const PRODUCTS: Product[] = ["Bitters", "Ginger"]

describe("carton geometry", () => {
  it("is 12 bottles of 750 mL = 9 litres", () => {
    expect(BOTTLES_PER_CARTON).toBe(12)
    expect(BOTTLE_LITRES).toBe(0.75)
    expect(CARTON_LITRES).toBe(9)
  })
})

describe("vessels", () => {
  it("uses the plant's own containers, not generic litres", () => {
    expect(VESSEL.drum.litres).toBe(250)
    expect(VESSEL.tank.litres).toBe(1000)
    expect(VESSEL.rambo.litres).toBe(2500)
  })

  it("treats a 'gallon' as the 20 L drum it is on the floor, not a US gallon", () => {
    // 3.79 L would silently mis-scale every caramel figure by ~5×.
    expect(VESSEL.gallon.litres).toBe(20)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// The invariant that makes this data self-checking: a recipe must exactly fill
// the carton it claims to produce. This is what caught the original unit error.
// ════════════════════════════════════════════════════════════════════════════
describe("recipes fill exactly one carton", () => {
  it.each(PRODUCTS)("%s ingredients sum to 9 L", (product) => {
    expect(recipeLitres(product)).toBe(CARTON_LITRES)
    expect(recipeBalances(product)).toBe(true)
  })
})

describe("Bitters recipe (confirmed 2026-08-26)", () => {
  const bom = PRODUCT_BOM.Bitters
  const byKey = Object.fromEntries(bom.ingredients.map((i) => [i.key, i]))

  it("is a 900 L batch yielding exactly 100 cartons", () => {
    expect(bom.batchLitres).toBe(900)
    expect(bom.cartonsPerBatch).toBe(100)
    expect(cartonsPerBatch("Bitters")).toBe(100)
  })

  it("matches the stated per-tank quantities when scaled to a batch", () => {
    // 250 L ethanol · 200 L concentrate · 10 L spices · 4 L caramel · 436 L water
    const perBatch = estimateUsage("Bitters", 100)
    const litres = Object.fromEntries(perBatch.map((l) => [l.key, l.litres]))
    expect(litres.alcohol).toBe(250)
    expect(litres.concentrate).toBe(200)
    expect(litres.spices).toBe(10)
    expect(litres.caramel).toBe(4)
    expect(litres.water).toBe(436)
    expect(Object.values(litres).reduce((a, b) => a + b, 0)).toBe(900)
  })

  it("measures each ingredient in its own vessel", () => {
    // Compared by name and capacity rather than identity: capacities are settings
    // now, so each reading builds its own vessel object.
    expect(byKey.alcohol.vessel).toEqual(VESSEL.drum)
    expect(byKey.concentrate.vessel).toEqual(VESSEL.tank)
    expect(byKey.water.vessel).toEqual(VESSEL.rambo)
    expect(byKey.spices.vessel).toEqual(VESSEL.tank)
    expect(byKey.caramel.vessel).toEqual(VESSEL.gallon)
  })

  it("names no vessel after its capacity, which is editable", () => {
    for (const v of Object.values(VESSEL)) expect(v.name).not.toMatch(/\d/)
  })

  it("reproduces the original vessel factors that were correct", () => {
    // 2.5 L ÷ 250 L per drum = 0.01 drums per carton — the one factor the old
    // code got right, because it was the only one labelled with its real vessel.
    expect(vesselsPerCarton(byKey.alcohol)).toBe(0.01)
    // 0.04 L ÷ 20 L per gallon = 0.002 gallons — also correct once "gallon" is
    // understood as 20 L.
    expect(vesselsPerCarton(byKey.caramel)).toBe(0.002)
  })

  it("corrects the concentrate denominator", () => {
    // The old factor was 2/900 = 0.002222, using the BITTERS tank size. The
    // concentrate tank is 1000 L, so the correct vessel fraction is 2/1000 —
    // the old value overstated concentrate by ~11%.
    expect(vesselsPerCarton(byKey.concentrate)).toBe(0.002)
    expect(vesselsPerCarton(byKey.concentrate)).not.toBeCloseTo(2 / 900, 6)
  })

  it("fills its carton exactly", () => {
    expect(bom.fillsCarton).toBe(true)
    expect(bom.cartonLitres).toBe(CARTON_LITRES)
  })
})

describe("Ginger recipe (confirmed 2026-08-26)", () => {
  const bom = PRODUCT_BOM.Ginger
  const byKey = Object.fromEntries(bom.ingredients.map((i) => [i.key, i]))

  it("is a 1000 L batch — larger than Bitters' 900 L", () => {
    expect(bom.batchLitres).toBe(1000)
    expect(PRODUCT_BOM.Bitters.batchLitres).toBe(900)
  })

  it("yields a fractional carton count, and does NOT round it", () => {
    // 1000 L ÷ 9 L = 111.1 cartons. Rounding to 111 would misstate a batch's
    // yield and quietly break the per-batch reconciliation below.
    expect(cartonsPerBatch("Ginger")).toBeCloseTo(1000 / 9, 10)
    expect(Number.isInteger(cartonsPerBatch("Ginger"))).toBe(false)
  })

  it("matches the stated per-tank quantities when scaled to a batch", () => {
    // 300 L ethanol · 120 L GT juice · 10 L spices · 1.5 L caramel · 568.5 L water
    const perBatch = estimateUsage("Ginger", cartonsPerBatch("Ginger"))
    const litres = Object.fromEntries(perBatch.map((l) => [l.key, l.litres]))
    expect(litres.alcohol).toBe(300)
    expect(litres.gt_juice).toBe(120)
    expect(litres.spices).toBe(10)
    expect(litres.caramel).toBe(1.5)
    expect(litres.water).toBe(568.5)
    expect(Object.values(litres).reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 6)
  })

  it("carries GT juice and no concentrate", () => {
    expect(byKey.gt_juice).toBeDefined()
    expect(byKey.concentrate).toBeUndefined()
  })

  it("uses more ethanol per carton than Bitters", () => {
    const bitters = PRODUCT_BOM.Bitters.ingredients.find((i) => i.key === "alcohol")!
    expect(byKey.alcohol.litresPerCarton).toBeGreaterThan(bitters.litresPerCarton)
  })

  it("reproduces the original code's numerators exactly", () => {
    // Every Ginger figure was already correct; only the unit LABELS were wrong.
    expect(byKey.alcohol.litresPerCarton).toBe(2.7)
    expect(byKey.water.litresPerCarton).toBe(5.1165)
    expect(byKey.gt_juice.litresPerCarton).toBe(1.08)
    expect(byKey.spices.litresPerCarton).toBe(0.09)
    expect(byKey.caramel.litresPerCarton).toBe(0.0135)
  })

  it("fills its carton exactly, on a different batch size", () => {
    expect(bom.fillsCarton).toBe(true)
  })
})

describe("estimateUsage", () => {
  it("reports litres AND vessels, because procurement orders vessels", () => {
    const alcohol = estimateUsage("Bitters", 100).find((l) => l.key === "alcohol")!
    expect(alcohol.litres).toBe(250)
    expect(alcohol.vessels).toBe(1) // exactly one 250 L drum
    expect(alcohol.vessel?.name).toBe("drum")
  })

  it("scales linearly", () => {
    const one = estimateUsage("Bitters", 100)
    const two = estimateUsage("Bitters", 200)
    for (const [i, line] of one.entries()) {
      expect(two[i].litres).toBeCloseTo(line.litres * 2, 6)
    }
  })

  it("is all zeroes for zero cartons", () => {
    expect(estimateUsage("Ginger", 0).every((l) => l.litres === 0 && l.vessels === 0)).toBe(true)
  })

  it("keeps a single carton meaningful, unlike the old 2dp-only rounding", () => {
    // Previously every small ingredient collapsed to 0 for one carton because the
    // vessel fraction was rounded, not the litres. Litres stay legible now.
    const one = estimateUsage("Bitters", 1)
    expect(one.find((l) => l.key === "water")!.litres).toBe(4.36)
    expect(one.find((l) => l.key === "caramel")!.litres).toBe(0.04)
  })

  it("preserves ingredient order", () => {
    expect(estimateUsage("Bitters", 10).map((l) => l.key)).toEqual(
      PRODUCT_BOM.Bitters.ingredients.map((i) => i.key),
    )
  })

  it("does not mutate the source recipe", () => {
    const before = JSON.stringify(PRODUCT_BOM.Bitters)
    estimateUsage("Bitters", 12345)
    expect(JSON.stringify(PRODUCT_BOM.Bitters)).toBe(before)
  })

  it("excludes tax stamps and cartons — those rates live in the DB packaging_bom", () => {
    for (const p of PRODUCTS) {
      const keys = PRODUCT_BOM[p].ingredients.map((i) => i.key)
      expect(keys).not.toContain("tax_stamp")
      expect(keys).not.toContain("carton")
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// The recipe and every conversion are admin-editable, so the readings above have
// to follow a configuration rather than the constants they were written against.
// ════════════════════════════════════════════════════════════════════════════
describe("bomFor — an edited configuration", () => {
  const edit = (patch: Partial<ProductionSettings>): ProductionSettings => ({
    ...DEFAULT_SETTINGS,
    ...patch,
  })

  it("returns the confirmed defaults for the default settings", () => {
    expect(bomFor(DEFAULT_SETTINGS)).toEqual(PRODUCT_BOM)
  })

  it("follows an edited ingredient quantity", () => {
    const bom = bomFor(
      edit({
        recipes: {
          ...DEFAULT_SETTINGS.recipes,
          Bitters: [
            { ingredient: "alcohol", label: "Raw ethanol", litresPerCarton: 3 },
            { ingredient: "water", label: "Water", litresPerCarton: 6 },
          ],
        },
      }),
    )
    expect(bom.Bitters.ingredients.map((i) => i.key)).toEqual(["alcohol", "water"])
    expect(bom.Bitters.totalLitres).toBe(9)
    expect(bom.Bitters.fillsCarton).toBe(true)
    // Ginger is untouched by an edit to Bitters.
    expect(bom.Ginger).toEqual(PRODUCT_BOM.Ginger)
  })

  it("flags a recipe that no longer fills its carton instead of quietly scaling it", () => {
    const bom = bomFor(
      edit({
        recipes: {
          ...DEFAULT_SETTINGS.recipes,
          Ginger: [{ ingredient: "water", label: "Water", litresPerCarton: 8 }],
        },
      }),
    )
    expect(bom.Ginger.fillsCarton).toBe(false)
    expect(bom.Ginger.totalLitres).toBe(8)
    expect(bom.Ginger.cartonLitres).toBe(9)
  })

  it("moves the carton size, and with it what a recipe must sum to", () => {
    const settings = edit({
      conversions: { ...DEFAULT_SETTINGS.conversions, bottlesPerCarton: 24 },
    })
    const bom = bomFor(settings)
    expect(bom.Bitters.cartonLitres).toBe(18)
    // The stored recipe still describes a 9 L carton, so it must read as broken —
    // changing the carton without the recipe is exactly how the two drift apart.
    expect(bom.Bitters.fillsCarton).toBe(false)
    expect(bom.Bitters.cartonsPerBatch).toBe(50)
  })

  it("takes vessel capacities from the settings, so a re-tanked plant needs no deploy", () => {
    const bom = bomFor(
      edit({ conversions: { ...DEFAULT_SETTINGS.conversions, drumLitres: 200, gallonLitres: 25 } }),
    )
    const byKey = Object.fromEntries(bom.Bitters.ingredients.map((i) => [i.key, i]))
    expect(byKey.alcohol.vessel?.litres).toBe(200)
    // 2.5 L ÷ 200 L per drum = 0.0125 drums, up from 0.01.
    expect(vesselsPerCarton(byKey.alcohol)).toBe(0.0125)
    expect(byKey.caramel.vessel?.litres).toBe(25)
  })

  it("shows an unknown ingredient in litres only rather than guessing a container", () => {
    const bom = bomFor(
      edit({
        recipes: {
          ...DEFAULT_SETTINGS.recipes,
          Bitters: [
            { ingredient: "honey", label: "Honey", litresPerCarton: 1 },
            { ingredient: "water", label: "Water", litresPerCarton: 8 },
          ],
        },
      }),
    )
    const honey = bom.Bitters.ingredients.find((i) => i.key === "honey")!
    expect(honey.vessel).toBeNull()
    expect(vesselsPerCarton(honey)).toBeNull()
    expect(estimateUsage("Bitters", 100, bom).find((l) => l.key === "honey")!.vessels).toBeNull()
  })

  it("keeps the derived readings in step when passed a configuration", () => {
    const settings = edit({
      recipes: {
        ...DEFAULT_SETTINGS.recipes,
        Ginger: [{ ingredient: "water", label: "Water", litresPerCarton: 9 }],
      },
    })
    const bom = bomFor(settings)
    expect(recipeLitres("Ginger", bom)).toBe(9)
    expect(recipeBalances("Ginger", bom)).toBe(true)
    expect(cartonsPerBatch("Ginger", bom)).toBeCloseTo(1000 / 9, 10)
    expect(estimateUsage("Ginger", 10, bom).map((l) => l.key)).toEqual(["water"])
  })
})
