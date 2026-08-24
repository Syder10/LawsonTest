import { describe, it, expect } from "vitest"
import type { Product } from "@/lib/db/types"
import {
  BITTERS_BOM,
  CARTON_BOM,
  GINGER_BOM,
  estimateMaterialUsage,
} from "@/lib/domain/bom"

describe("BITTERS_BOM factors", () => {
  it("uses 0.01 drums of alcohol per carton", () => {
    expect(BITTERS_BOM.alcohol).toEqual({ factor: 0.01, unit: "drums" })
  })

  it("uses 2 litres of concentrate per 900 cartons", () => {
    expect(BITTERS_BOM.concentrate.factor).toBe(2 / 900)
    expect(BITTERS_BOM.concentrate.unit).toBe("litres")
  })

  it("uses 0.1 litres of spices per 1000 cartons", () => {
    expect(BITTERS_BOM.spices.factor).toBe(0.0001)
  })

  it("uses 0.002 gallons of caramel per carton", () => {
    expect(BITTERS_BOM.caramel).toEqual({ factor: 0.002, unit: "gallons" })
  })

  it("uses 4.36 litres of water per 2500 cartons", () => {
    expect(BITTERS_BOM.water.factor).toBe(4.36 / 2500)
  })

  it("covers exactly the five soft (untracked) bitters inputs", () => {
    expect(Object.keys(BITTERS_BOM)).toEqual([
      "alcohol",
      "concentrate",
      "spices",
      "caramel",
      "water",
    ])
  })
})

describe("GINGER_BOM factors", () => {
  it("uses 2.7 drums of alcohol per 250 cartons (a higher alcohol rate than bitters)", () => {
    expect(GINGER_BOM.alcohol.factor).toBe(2.7 / 250)
    expect(GINGER_BOM.alcohol.factor).toBeGreaterThan(BITTERS_BOM.alcohol.factor)
  })

  it("uses 5.1165 litres of water per 2500 cartons", () => {
    expect(GINGER_BOM.water.factor).toBe(5.1165 / 2500)
  })

  it("uses 1.08 litres of GT juice per carton", () => {
    expect(GINGER_BOM.gt_juice).toEqual({ factor: 1.08, unit: "litres" })
  })

  it("uses 0.09 litres of spices per 1000 cartons", () => {
    expect(GINGER_BOM.spices.factor).toBe(0.09 / 1000)
  })

  it("uses 0.0135 gallons of caramel per 20 cartons", () => {
    expect(GINGER_BOM.caramel.factor).toBe(0.0135 / 20)
    expect(GINGER_BOM.caramel.unit).toBe("gallons")
  })

  it("covers exactly the five soft (untracked) ginger inputs, including gt_juice", () => {
    expect(Object.keys(GINGER_BOM)).toEqual([
      "alcohol",
      "water",
      "gt_juice",
      "spices",
      "caramel",
    ])
  })

  it("has no concentrate line (concentrate is bitters-only)", () => {
    expect(GINGER_BOM.concentrate).toBeUndefined()
  })
})

describe("CARTON_BOM registry", () => {
  it("maps both products to their BOMs and nothing else", () => {
    expect(Object.keys(CARTON_BOM)).toEqual(["Bitters", "Ginger"])
    expect(CARTON_BOM.Bitters).toBe(BITTERS_BOM)
    expect(CARTON_BOM.Ginger).toBe(GINGER_BOM)
  })

  it("gives every material a positive factor and a non-empty unit", () => {
    for (const [product, bom] of Object.entries(CARTON_BOM)) {
      for (const [material, { factor, unit }] of Object.entries(bom)) {
        expect(factor, `${product}/${material} factor`).toBeGreaterThan(0)
        expect(unit, `${product}/${material} unit`).not.toBe("")
      }
    }
  })

  it("does NOT include tax stamps or cartons (those rates live in the DB packaging_bom table)", () => {
    for (const bom of Object.values(CARTON_BOM)) {
      expect(Object.keys(bom)).not.toContain("tax_stamp")
      expect(Object.keys(bom)).not.toContain("cartons")
    }
  })
})

describe("estimateMaterialUsage - Bitters", () => {
  it("estimates a 900-carton batch across all five inputs", () => {
    expect(estimateMaterialUsage("Bitters", 900)).toEqual({
      alcohol: { amount: 9, unit: "drums" },
      concentrate: { amount: 2, unit: "litres" },
      spices: { amount: 0.09, unit: "litres" },
      caramel: { amount: 1.8, unit: "gallons" },
      water: { amount: 1.57, unit: "litres" },
    })
  })

  it("scales linearly: 1800 cartons uses twice the alcohol of 900", () => {
    const single = estimateMaterialUsage("Bitters", 900)
    const double = estimateMaterialUsage("Bitters", 1800)
    expect(double.alcohol.amount).toBe(single.alcohol.amount * 2)
  })

  it("returns 0 for every material when 0 cartons were produced", () => {
    const out = estimateMaterialUsage("Bitters", 0)
    expect(Object.values(out).map((m) => m.amount)).toEqual([0, 0, 0, 0, 0])
  })

  it("rounds amounts to 2 decimal places, collapsing sub-0.005 inputs to 0 for a single carton", () => {
    // NOTE: intended precision limit of the 2dp rounding - a 1-carton estimate is
    // meaningless for the small-factor inputs. Documented, not a bug.
    expect(estimateMaterialUsage("Bitters", 1)).toEqual({
      alcohol: { amount: 0.01, unit: "drums" },
      concentrate: { amount: 0, unit: "litres" },
      spices: { amount: 0, unit: "litres" },
      caramel: { amount: 0, unit: "gallons" },
      water: { amount: 0, unit: "litres" },
    })
  })

  it("rounds half up at the 2dp boundary (2500 cartons of water = 4.36 -> 4.36)", () => {
    expect(estimateMaterialUsage("Bitters", 2500).water.amount).toBe(4.36)
  })

  it("absorbs floating-point drift: 900 x (2/900) rounds to exactly 2", () => {
    expect(estimateMaterialUsage("Bitters", 900).concentrate.amount).toBe(2)
  })
})

describe("estimateMaterialUsage - Ginger", () => {
  it("estimates a 250-carton batch across all five inputs", () => {
    expect(estimateMaterialUsage("Ginger", 250)).toEqual({
      alcohol: { amount: 2.7, unit: "drums" },
      water: { amount: 0.51, unit: "litres" },
      gt_juice: { amount: 270, unit: "litres" },
      spices: { amount: 0.02, unit: "litres" },
      caramel: { amount: 0.17, unit: "gallons" },
    })
  })

  it("uses more alcohol than bitters for the same carton count", () => {
    const bitters = estimateMaterialUsage("Bitters", 1000)
    const ginger = estimateMaterialUsage("Ginger", 1000)
    expect(ginger.alcohol.amount).toBeGreaterThan(bitters.alcohol.amount)
  })

  it("returns 0 for every material when 0 cartons were produced", () => {
    const out = estimateMaterialUsage("Ginger", 0)
    expect(Object.values(out).map((m) => m.amount)).toEqual([0, 0, 0, 0, 0])
  })
})

describe("estimateMaterialUsage - shape and safety", () => {
  it("returns the same material keys as the product's BOM, in the same order", () => {
    expect(Object.keys(estimateMaterialUsage("Ginger", 100))).toEqual(Object.keys(GINGER_BOM))
    expect(Object.keys(estimateMaterialUsage("Bitters", 100))).toEqual(Object.keys(BITTERS_BOM))
  })

  it("carries the BOM unit through unchanged for every material", () => {
    const out = estimateMaterialUsage("Bitters", 500)
    for (const [material, { unit }] of Object.entries(BITTERS_BOM)) {
      expect(out[material].unit, `unit for ${material}`).toBe(unit)
    }
  })

  it("does not mutate the source BOM", () => {
    const before = JSON.stringify(BITTERS_BOM)
    estimateMaterialUsage("Bitters", 12345)
    expect(JSON.stringify(BITTERS_BOM)).toBe(before)
  })

  it("throws for a product outside the registry (no silent empty estimate)", () => {
    // NOTE: documenting current behaviour. `Object.entries(undefined)` throws, so
    // an unknown product is a TypeError rather than {} - the Product union is the
    // only guard.
    expect(() => estimateMaterialUsage("Vodka" as Product, 100)).toThrow(TypeError)
  })

  it("returns NaN amounts for a NaN carton count rather than throwing", () => {
    expect(estimateMaterialUsage("Bitters", Number.NaN).alcohol.amount).toBeNaN()
  })
})
