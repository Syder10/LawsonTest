import { describe, it, expect } from "vitest"
import type { Product } from "@/lib/db/types"
import {
  BOTTLES_PER_CARTON,
  BOTTLE_LITRES,
  CARTON_LITRES,
  PRODUCT_BOM,
  VESSEL,
  cartonsPerBatch,
  estimateUsage,
  recipeBalances,
  recipeLitres,
  vesselsPerCarton,
} from "@/lib/domain/bom"

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
    expect(byKey.alcohol.vessel).toBe(VESSEL.drum)
    expect(byKey.concentrate.vessel).toBe(VESSEL.tank)
    expect(byKey.water.vessel).toBe(VESSEL.rambo)
    expect(byKey.spices.vessel).toBe(VESSEL.tank)
    expect(byKey.caramel.vessel).toBe(VESSEL.gallon)
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

  it("is fully confirmed", () => {
    expect(bom.confirmed).toBe(true)
    expect(bom.ingredients.every((i) => i.confirmed)).toBe(true)
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

  it("is fully confirmed", () => {
    expect(bom.confirmed).toBe(true)
  })
})

describe("estimateUsage", () => {
  it("reports litres AND vessels, because procurement orders vessels", () => {
    const alcohol = estimateUsage("Bitters", 100).find((l) => l.key === "alcohol")!
    expect(alcohol.litres).toBe(250)
    expect(alcohol.vessels).toBe(1) // exactly one 250 L drum
    expect(alcohol.vessel.name).toBe("drum")
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

  it("carries the confirmed flag through, so the UI can warn per ingredient", () => {
    expect(estimateUsage("Bitters", 10).every((l) => l.confirmed)).toBe(true)
    expect(estimateUsage("Ginger", 10).every((l) => l.confirmed)).toBe(true)
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
