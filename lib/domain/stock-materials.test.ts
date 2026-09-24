import { describe, it, expect } from "vitest"
import {
  STOCK_MATERIALS,
  materialDescriptorForKey,
  stockMaterialKeys,
  isReconcilable,
} from "@/lib/domain/stock-materials"

describe("materialDescriptorForKey", () => {
  it("splits per-product cartons to the shared material code + product", () => {
    const d = materialDescriptorForKey("carton_bitters")
    expect(d).toMatchObject({ material: "carton", product: "Bitters", kind: "derived" })
  })

  it("folds the manager cartons_* alias onto the same descriptor", () => {
    expect(materialDescriptorForKey("cartons_ginger")).toEqual(
      materialDescriptorForKey("carton_ginger"),
    )
    expect(materialDescriptorForKey("cartons_ginger")).toMatchObject({
      material: "carton",
      product: "Ginger",
    })
  })

  it("maps the preforms row key onto the preform material code", () => {
    expect(materialDescriptorForKey("preforms")).toMatchObject({
      material: "preform",
      product: null,
      kind: "ledger",
    })
  })

  it("takes ledger material units from the ledger-unit registry", () => {
    expect(materialDescriptorForKey("alcohol")?.unit).toBe("drums")
    expect(materialDescriptorForKey("caramel_bitters")?.unit).toBe("gallons")
  })

  it("marks PPE as consumable", () => {
    expect(materialDescriptorForKey("seal_tape")?.kind).toBe("consumable")
    expect(materialDescriptorForKey("gloves")?.kind).toBe("consumable")
  })

  it("returns null for an unknown key", () => {
    expect(materialDescriptorForKey("nonsense")).toBeNull()
  })
})

describe("isReconcilable", () => {
  it("is true for ledger and derived materials, false for consumable PPE", () => {
    expect(isReconcilable(materialDescriptorForKey("alcohol")!)).toBe(true)
    expect(isReconcilable(materialDescriptorForKey("tax_stamp")!)).toBe(true)
    expect(isReconcilable(materialDescriptorForKey("hair_net")!)).toBe(false)
  })
})

describe("stockMaterialKeys", () => {
  it("lists every descriptor key once", () => {
    const keys = stockMaterialKeys()
    expect(keys).toHaveLength(STOCK_MATERIALS.length)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain("tax_stamp")
    expect(keys).toContain("caramel_ginger")
  })
})
