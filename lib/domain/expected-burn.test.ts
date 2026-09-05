import { describe, expect, it } from "vitest"
import { BOTTLES_PER_CARTON } from "@/lib/domain/bom"
import {
  ALCOHOL_DRUMS_PER_DAY,
  CAPS_PER_BOTTLE,
  FORECAST_CARTONS_PER_SHIFT,
  LABELS_PER_BOTTLE,
  SHIFTS_PER_DAY,
  STAMPS_PER_CARTON_RATE,
  WASTE_ALLOWANCE,
  expectedDailyBurn,
  stampsPerCarton,
} from "@/lib/domain/expected-burn"
import { DEFAULT_SETTINGS, cartonsPerDay, totalCartonsPerDay, type Conversions } from "@/lib/domain/settings"
import { LEDGER_UNITS } from "@/lib/domain/materials"

// These rates drive every days-left projection until a material has weeks of records,
// so an arithmetic slip here is a wrong reorder decision rather than a wrong pixel.
// The forecast (3,000 cartons a shift, three shifts) and the one-per-bottle ratios are
// user-confirmed; everything else is derived from them and from the BOM.

const TOTAL_PER_DAY = totalCartonsPerDay(DEFAULT_SETTINGS)
const PER_PRODUCT = {
  Bitters: cartonsPerDay(DEFAULT_SETTINGS, "Bitters"),
  Ginger: cartonsPerDay(DEFAULT_SETTINGS, "Ginger"),
}

describe("the forecast defaults", () => {
  it("is three shifts of 3,000 cartons, split 2,500 Bitters / 500 Ginger", () => {
    expect(FORECAST_CARTONS_PER_SHIFT).toEqual({ Bitters: 2500, Ginger: 500 })
    expect(SHIFTS_PER_DAY).toBe(3)
    expect(TOTAL_PER_DAY).toBe(9000)
  })

  it("carries the 5:1 mix through to the day, not an even split", () => {
    // The mix matters: an even split understated Bitters labels by 40% and overstated
    // Ginger's by 3×, and either way that is a wrong reorder decision.
    expect(PER_PRODUCT).toEqual({ Bitters: 7500, Ginger: 1500 })
  })

  it("does not silently include a waste allowance nobody has stated", () => {
    // The business asked for waste to be included; until the rate is known this is
    // zero, because a plausible-looking 2% would move every reorder point.
    expect(WASTE_ALLOWANCE).toBe(0)
  })
})

describe("expectedDailyBurn — per-bottle materials", () => {
  const bottlesPerDay = TOTAL_PER_DAY * BOTTLES_PER_CARTON

  it("expects 108,000 bottles a day at the stated forecast", () => {
    expect(bottlesPerDay).toBe(108_000)
  })

  it("counts caps in boxes of 4,000, one per bottle", () => {
    expect(LEDGER_UNITS.caps.each).toEqual({ qty: 4000, unit: "pcs" })
    expect(expectedDailyBurn("caps")).toBe((bottlesPerDay * CAPS_PER_BOTTLE) / 4000)
    expect(expectedDailyBurn("caps")).toBe(27)
  })

  it("counts labels in rolls of 4,000, one per bottle, at each product's real volume", () => {
    const rolls = (cartons: number) => (cartons * BOTTLES_PER_CARTON * LABELS_PER_BOTTLE) / 4000
    expect(expectedDailyBurn("labels_bitters")).toBe(rolls(7500))
    expect(expectedDailyBurn("labels_ginger")).toBe(rolls(1500))
    expect(expectedDailyBurn("labels_bitters")).toBe(22.5)
    expect(expectedDailyBurn("labels_ginger")).toBe(4.5)
  })

  it("counts preforms in bags of 1,008, one bottle each", () => {
    expect(expectedDailyBurn("preform")).toBeCloseTo(bottlesPerDay / 1008, 2)
    expect(expectedDailyBurn("preform")).toBe(107.14)
  })

  it("resolves the plural preforms key the procurement dashboard uses", () => {
    expect(expectedDailyBurn("preforms")).toBe(expectedDailyBurn("preform"))
  })
})

describe("expectedDailyBurn — recipe and packaging materials", () => {
  it("derives caramel from the recipe, in 20 L gallons", () => {
    // Bitters uses 0.04 L per carton over 7,500 cartons; Ginger 0.0135 over 1,500.
    expect(expectedDailyBurn("caramel_bitters")).toBe((7500 * 0.04) / 20)
    expect(expectedDailyBurn("caramel_bitters")).toBe(15)
    expect(expectedDailyBurn("caramel_ginger")).toBe(1.01)
  })

  it("gives caramel no rate without a product, since the recipes differ", () => {
    expect(expectedDailyBurn("caramel")).toBeNull()
  })

  it("stamps every bottle, so the rate is the plant's whole bottle output", () => {
    // 12 per carton for BOTH products (user-confirmed): the earlier 9/6 split would
    // have left a third of Bitters bottles and half of Ginger's unstamped.
    expect(STAMPS_PER_CARTON_RATE).toBe(12)
    expect(expectedDailyBurn("tax_stamp")).toBe(TOTAL_PER_DAY * BOTTLES_PER_CARTON)
    expect(expectedDailyBurn("tax_stamp")).toBe(108_000)
  })

  it("expects one carton box per carton produced — a box IS a carton here", () => {
    expect(expectedDailyBurn("carton_bitters")).toBe(7500)
    expect(expectedDailyBurn("carton_ginger")).toBe(1500)
  })
})

describe("expectedDailyBurn — what is deliberately left out", () => {
  it("keeps the business's own alcohol figure rather than the recipe's", () => {
    // The ledger covers alcohol drawn for extraction and ginger production too, which
    // the per-carton BOM does not account for — hence 200 drums, not the ~94 blending
    // alone implies at 7,500 Bitters + 1,500 Ginger cartons.
    expect(expectedDailyBurn("alcohol")).toBe(ALCOHOL_DRUMS_PER_DAY)
    expect(expectedDailyBurn("alcohol")).toBe(200)
  })

  it("has no rate for herbs, which feed extraction rather than a carton", () => {
    expect(expectedDailyBurn("herb")).toBeNull()
    expect(expectedDailyBurn("herb_alligator_pepper")).toBeNull()
  })

  it("has no rate for PPE, which is issued to people, not consumed per carton", () => {
    for (const key of ["seal_tape", "hair_net", "nose_mask", "gloves"]) {
      expect(expectedDailyBurn(key), key).toBeNull()
    }
  })

  it("returns null for anything unknown rather than a zero that reads as a real rate", () => {
    expect(expectedDailyBurn("nonsense")).toBeNull()
    expect(expectedDailyBurn("")).toBeNull()
  })
})

describe("every rate is stated in the unit the ledger counts", () => {
  it("never returns a piece count for a material counted in containers", () => {
    // The failure this guards: expecting 108,000 caps a day against a balance of 27
    // boxes would read as 4,000 days of cover.
    const caps = expectedDailyBurn("caps")!
    const rolls = expectedDailyBurn("labels_bitters")!
    const bags = expectedDailyBurn("preform")!
    expect(caps).toBeLessThan(1000)
    expect(rolls).toBeLessThan(1000)
    expect(bags).toBeLessThan(1000)
  })

  it("is positive wherever it is not null", () => {
    for (const key of [
      "alcohol", "caps", "labels_bitters", "labels_ginger",
      "caramel_bitters", "caramel_ginger", "preform", "tax_stamp",
      "carton_bitters", "carton_ginger",
    ]) {
      expect(expectedDailyBurn(key), key).toBeGreaterThan(0)
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Settings-driven: the whole point of the admin page is that these move together.
// ════════════════════════════════════════════════════════════════════════════
describe("expectedDailyBurn — with custom settings", () => {
  const doubled = {
    ...DEFAULT_SETTINGS,
    cartonsPerShift: { Bitters: 5000, Ginger: 1000 },
  }

  it("scales every derived rate with the forecast", () => {
    // toBeCloseTo, not toBe: each rate is rounded to 2dp on the way out, so doubling a
    // rounded 107.14 (214.28) is not bit-identical to rounding the doubled input
    // (214.29). The scaling is what matters, not the last decimal place.
    for (const key of ["caps", "labels_bitters", "preform", "tax_stamp", "carton_ginger"]) {
      expect(expectedDailyBurn(key, doubled)!, key).toBeCloseTo(expectedDailyBurn(key)! * 2, 1)
    }
  })

  it("does NOT scale alcohol with cartons — it has its own stated figure", () => {
    // The ledger covers extraction and ginger production too, so cartons alone cannot
    // move it. Changing the forecast must not silently change the alcohol expectation.
    expect(expectedDailyBurn("alcohol", doubled)).toBe(DEFAULT_SETTINGS.alcoholDrumsPerDay)
    const thirstier = { ...DEFAULT_SETTINGS, alcoholDrumsPerDay: 260 }
    expect(expectedDailyBurn("alcohol", thirstier)).toBe(260)
  })

  it("applies the waste allowance to bottle-level materials only", () => {
    const withWaste = { ...DEFAULT_SETTINGS, wasteAllowance: 0.05 }
    // Preforms, caps and labels: a wasted bottle consumed all three.
    for (const key of ["caps", "preform", "labels_ginger"]) {
      expect(expectedDailyBurn(key, withWaste)!, key).toBeCloseTo(expectedDailyBurn(key)! * 1.05, 1)
    }
    // A wasted bottle never reached a carton box or a tax stamp.
    expect(expectedDailyBurn("carton_bitters", withWaste)).toBe(expectedDailyBurn("carton_bitters"))
    expect(expectedDailyBurn("tax_stamp", withWaste)).toBe(expectedDailyBurn("tax_stamp"))
  })

  it("follows a changed shift count", () => {
    const twoShifts = { ...DEFAULT_SETTINGS, shiftsPerDay: 2 }
    expect(expectedDailyBurn("caps", twoShifts)).toBe(18)
    expect(totalCartonsPerDay(twoShifts)).toBe(6000)
  })

  it("reads zero rates rather than crashing on a zero forecast", () => {
    // The DB forbids it and the form rejects it; this only proves the maths is safe.
    const idle = { ...DEFAULT_SETTINGS, cartonsPerShift: { Bitters: 0, Ginger: 0 } }
    expect(expectedDailyBurn("caps", idle)).toBe(0)
    expect(expectedDailyBurn("alcohol", idle)).toBe(200)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// The CONVERSIONS are editable too, and every rate above is stated in a container.
// A rate that ignored a changed container size would be wrong by that factor.
// ════════════════════════════════════════════════════════════════════════════
describe("expectedDailyBurn — with edited conversions", () => {
  const convert = (patch: Partial<Conversions>) => ({
    ...DEFAULT_SETTINGS,
    conversions: { ...DEFAULT_SETTINGS.conversions, ...patch },
  })

  it("halves the boxes of caps when a box holds twice as many", () => {
    // 108,000 caps a day ÷ 8,000 per box = 13.5 boxes, down from 27.
    expect(expectedDailyBurn("caps", convert({ capsPcsPerBox: 8000 }))).toBe(13.5)
  })

  it("follows the pieces per roll and per bag", () => {
    expect(expectedDailyBurn("labels_bitters", convert({ labelPcsPerRoll: 2000 }))).toBe(
      expectedDailyBurn("labels_bitters")! * 2,
    )
    expect(expectedDailyBurn("preform", convert({ preformPcsPerBag: 504 }))).toBeCloseTo(
      expectedDailyBurn("preform")! * 2,
      1,
    )
  })

  it("moves every per-bottle material when a carton holds more bottles", () => {
    const bigger = convert({ bottlesPerCarton: 24 })
    // Same cartons, twice the bottles: caps, labels, preforms and stamps all double.
    for (const key of ["caps", "labels_ginger", "preform", "tax_stamp"]) {
      expect(expectedDailyBurn(key, bigger)!, key).toBeCloseTo(expectedDailyBurn(key)! * 2, 1)
    }
    // Carton boxes are per carton, not per bottle, so they do NOT move.
    expect(expectedDailyBurn("carton_bitters", bigger)).toBe(expectedDailyBurn("carton_bitters"))
  })

  it("follows a changed count of caps or labels per bottle", () => {
    expect(expectedDailyBurn("caps", convert({ capsPerBottle: 2 }))).toBe(expectedDailyBurn("caps")! * 2)
    // Two labels a bottle (a body and a neck label) is a real possibility.
    expect(expectedDailyBurn("labels_bitters", convert({ labelsPerBottle: 2 }))).toBe(
      expectedDailyBurn("labels_bitters")! * 2,
    )
  })

  it("counts caramel in whatever a gallon holds", () => {
    // 7,500 Bitters cartons × 0.04 L = 300 L; in 10 L drums that is 30, not 15.
    expect(expectedDailyBurn("caramel_bitters")).toBe(15)
    expect(expectedDailyBurn("caramel_bitters", convert({ gallonLitres: 10 }))).toBe(30)
  })

  it("derives caramel from the EDITED recipe, not a compiled-in figure", () => {
    const doubleCaramel = {
      ...DEFAULT_SETTINGS,
      recipes: {
        ...DEFAULT_SETTINGS.recipes,
        Bitters: DEFAULT_SETTINGS.recipes.Bitters.map((l) =>
          l.ingredient === "caramel" ? { ...l, litresPerCarton: 0.08 } : l,
        ),
      },
    }
    expect(expectedDailyBurn("caramel_bitters", doubleCaramel)).toBe(30)
  })

  it("reads no caramel rate when the recipe line has been renamed away", () => {
    // A renamed line does not fail — it silently stops being found, which is why the
    // settings page warns about it.
    const renamed = {
      ...DEFAULT_SETTINGS,
      recipes: {
        ...DEFAULT_SETTINGS.recipes,
        Ginger: DEFAULT_SETTINGS.recipes.Ginger.map((l) =>
          l.ingredient === "caramel" ? { ...l, ingredient: "colouring" } : l,
        ),
      },
    }
    expect(expectedDailyBurn("caramel_ginger", renamed)).toBe(0)
  })

  it("keeps stamps at one per bottle unless that is changed", () => {
    expect(expectedDailyBurn("tax_stamp")).toBe(108_000)
    expect(expectedDailyBurn("tax_stamp", convert({ stampsPerBottle: 0.5 }))).toBe(54_000)
  })
})

describe("stampsPerCarton", () => {
  it("is the bottles in a carton, because every bottle is stamped", () => {
    expect(stampsPerCarton(DEFAULT_SETTINGS.conversions)).toBe(12)
    expect(STAMPS_PER_CARTON_RATE).toBe(12)
  })

  it("follows both the carton size and the per-bottle count", () => {
    // This is the rate written to packaging_bom, which is what the ledger DEDUCTS —
    // so it has to move with the settings or balances drift from projections.
    expect(stampsPerCarton({ ...DEFAULT_SETTINGS.conversions, bottlesPerCarton: 24 })).toBe(24)
    expect(stampsPerCarton({ ...DEFAULT_SETTINGS.conversions, stampsPerBottle: 0 })).toBe(0)
  })
})
