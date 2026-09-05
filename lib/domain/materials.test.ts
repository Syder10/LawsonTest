import { describe, it, expect } from "vitest"
import {
  ALL_MATERIAL_TYPES,
  GLOVES_PACKS_PER_BOX,
  HAIRNET_PACKS_PER_BOX,
  NOSEMASK_PACKS_PER_BOX,
  PPE_TYPES,
  STAMP_COILS_PER_BOX,
  STAMP_PCS_PER_BOX,
  STAMP_PCS_PER_COIL,
  TAPE_PCS_PER_BOX,
  ledgerUnitFor,
  pcsPerBox,
  pcsPerBoxFor,
  stampPcsPerBox,
  type MaterialType,
} from "@/lib/domain/materials"
import { DEFAULT_CONVERSIONS, type Conversions } from "@/lib/domain/settings"

describe("tax stamp conversions", () => {
  it("puts 6 coils in a stamp box", () => {
    expect(STAMP_COILS_PER_BOX).toBe(6)
  })

  it("puts 15,000 stamps on a coil", () => {
    expect(STAMP_PCS_PER_COIL).toBe(15_000)
  })

  it("derives 90,000 stamps per box from coils x pcs-per-coil", () => {
    expect(STAMP_PCS_PER_BOX).toBe(90_000)
    expect(STAMP_PCS_PER_BOX).toBe(STAMP_COILS_PER_BOX * STAMP_PCS_PER_COIL)
  })
})

describe("PPE box conversions", () => {
  it("puts 24 rolls of seal tape in a box", () => {
    expect(TAPE_PCS_PER_BOX).toBe(24)
  })

  it("puts 10 hairnet packs in a box", () => {
    expect(HAIRNET_PACKS_PER_BOX).toBe(10)
  })

  it("puts 40 nose-mask packs in a box (the largest PPE box)", () => {
    expect(NOSEMASK_PACKS_PER_BOX).toBe(40)
  })

  it("puts 10 glove packs in a box", () => {
    expect(GLOVES_PACKS_PER_BOX).toBe(10)
  })
})

describe("PPE_TYPES / ALL_MATERIAL_TYPES", () => {
  it("lists the four PPE material types", () => {
    expect(PPE_TYPES).toEqual(["seal_tape", "hair_net", "nose_mask", "gloves"])
  })

  it("lists all seven material types with the stock materials first and PPE last", () => {
    expect(ALL_MATERIAL_TYPES).toEqual([
      "tax_stamp",
      "carton_bitters",
      "carton_ginger",
      "seal_tape",
      "hair_net",
      "nose_mask",
      "gloves",
    ])
  })

  it("contains no duplicates", () => {
    expect(new Set(ALL_MATERIAL_TYPES).size).toBe(ALL_MATERIAL_TYPES.length)
  })

  it("includes every PPE type in ALL_MATERIAL_TYPES", () => {
    for (const ppe of PPE_TYPES) {
      expect(ALL_MATERIAL_TYPES).toContain(ppe)
    }
  })

  it("classifies exactly three material types as non-PPE (stamps and the two cartons)", () => {
    const nonPpe = ALL_MATERIAL_TYPES.filter((m) => !PPE_TYPES.includes(m))
    expect(nonPpe).toEqual(["tax_stamp", "carton_bitters", "carton_ginger"])
  })
})

describe("pcsPerBox", () => {
  it("returns 24 for seal tape", () => {
    expect(pcsPerBox("seal_tape")).toBe(TAPE_PCS_PER_BOX)
  })

  it("returns 10 for hair nets", () => {
    expect(pcsPerBox("hair_net")).toBe(HAIRNET_PACKS_PER_BOX)
  })

  it("returns 40 for nose masks", () => {
    expect(pcsPerBox("nose_mask")).toBe(NOSEMASK_PACKS_PER_BOX)
  })

  it("returns 10 for gloves", () => {
    expect(pcsPerBox("gloves")).toBe(GLOVES_PACKS_PER_BOX)
  })

  it("returns 1 for tax stamps (stamp boxes are converted via STAMP_PCS_PER_BOX, not here)", () => {
    // NOTE: pcsPerBox deliberately does NOT return 90,000 for tax_stamp - stamp
    // receipts are entered as boxes -> coils -> pcs by the procurement route.
    expect(pcsPerBox("tax_stamp")).toBe(1)
  })

  it("returns 1 for both carton types (cartons are received as pieces)", () => {
    expect(pcsPerBox("carton_bitters")).toBe(1)
    expect(pcsPerBox("carton_ginger")).toBe(1)
  })

  it("returns a conversion greater than 1 for every PPE type", () => {
    for (const ppe of PPE_TYPES) {
      expect(pcsPerBox(ppe), `pcsPerBox(${ppe})`).toBeGreaterThan(1)
    }
  })

  it("returns exactly 1 for every non-PPE material type", () => {
    for (const m of ALL_MATERIAL_TYPES.filter((m) => !PPE_TYPES.includes(m))) {
      expect(pcsPerBox(m), `pcsPerBox(${m})`).toBe(1)
    }
  })

  it("returns a positive integer for every declared material type", () => {
    for (const m of ALL_MATERIAL_TYPES) {
      const n = pcsPerBox(m)
      expect(Number.isInteger(n), `pcsPerBox(${m}) is an integer`).toBe(true)
      expect(n, `pcsPerBox(${m})`).toBeGreaterThan(0)
    }
  })

  it("falls back to 1 for an unrecognised material rather than throwing", () => {
    expect(pcsPerBox("apron" as MaterialType)).toBe(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Every figure above is a DEFAULT: the live pack sizes and container contents are
// admin-editable, and the procurement route writes a box→pieces conversion INTO the
// row it stores. A stale factor there is a permanently wrong balance.
// ════════════════════════════════════════════════════════════════════════════
describe("settings-driven conversions", () => {
  const convert = (patch: Partial<Conversions>): Conversions => ({ ...DEFAULT_CONVERSIONS, ...patch })

  it("agrees with the defaults when handed the default conversions", () => {
    expect(stampPcsPerBox(DEFAULT_CONVERSIONS)).toBe(STAMP_PCS_PER_BOX)
    for (const m of ALL_MATERIAL_TYPES) {
      expect(pcsPerBoxFor(m, DEFAULT_CONVERSIONS), m).toBe(pcsPerBox(m))
    }
  })

  it("follows an edited pack size", () => {
    expect(stampPcsPerBox(convert({ stampCoilsPerBox: 4, stampPcsPerCoil: 10_000 }))).toBe(40_000)
    expect(pcsPerBoxFor("gloves", convert({ glovesPacksPerBox: 20 }))).toBe(20)
    expect(pcsPerBoxFor("seal_tape", convert({ tapePcsPerBox: 36 }))).toBe(36)
  })

  it("still returns 1 for the materials counted in pieces already", () => {
    expect(pcsPerBoxFor("carton_bitters", convert({ tapePcsPerBox: 99 }))).toBe(1)
    expect(pcsPerBoxFor("tax_stamp", DEFAULT_CONVERSIONS)).toBe(1)
  })

  it("takes the count per container from the settings, not from the constant", () => {
    // The unit WORD stays in code (it keys the entry-form labels); only the quantity
    // moves, and it must move on every screen at once.
    expect(ledgerUnitFor("alcohol", convert({ drumLitres: 200 }))).toEqual({
      unit: "drums",
      each: { qty: 200, unit: "litres" },
    })
    expect(ledgerUnitFor("caps", convert({ capsPcsPerBox: 5000 }))?.each?.qty).toBe(5000)
    expect(ledgerUnitFor("caramel_ginger", convert({ gallonLitres: 25 }))?.each?.qty).toBe(25)
    // Prefixed and aliased keys resolve the same way.
    expect(ledgerUnitFor("preforms", convert({ preformPcsPerBag: 500 }))?.each?.qty).toBe(500)
    expect(ledgerUnitFor("labels_bitters", convert({ labelPcsPerRoll: 1000 }))?.each?.qty).toBe(1000)
  })

  it("leaves a material with no stated content bare, whatever the settings say", () => {
    // Herb sacks have no stated weight and the business asked for none to be shown.
    expect(ledgerUnitFor("herb_alligator_pepper", DEFAULT_CONVERSIONS)).toEqual({ unit: "sacks" })
  })

  it("keeps the default when no conversions are passed", () => {
    expect(ledgerUnitFor("alcohol")?.each?.qty).toBe(DEFAULT_CONVERSIONS.drumLitres)
  })
})
