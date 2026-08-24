import { describe, it, expect } from "vitest"
import {
  DEPARTMENTS,
  RECORD_TYPES,
  compulsoryRecordTypes,
  departmentAllows,
  departmentsWithCompulsory,
  getRecordType,
  recordTypesForDepartment,
} from "@/lib/domain/record-types"

const labels = (defs: { label: string }[]) => defs.map((d) => d.label)

describe("DEPARTMENTS", () => {
  it("lists the five canonical departments in display order", () => {
    expect([...DEPARTMENTS]).toEqual([
      "Blowing",
      "Alcohol and Blending",
      "Filling Line",
      "Packaging",
      "Concentrate",
    ])
  })

  it("gives every department at least one record type", () => {
    for (const dept of DEPARTMENTS) {
      expect(recordTypesForDepartment(dept).length, `record types for ${dept}`).toBeGreaterThan(0)
    }
  })

  it("never references a department outside the canonical list", () => {
    const referenced = new Set(RECORD_TYPES.flatMap((r) => r.departments))
    for (const dept of referenced) {
      expect(DEPARTMENTS as readonly string[]).toContain(dept)
    }
  })
})

describe("RECORD_TYPES registry invariants", () => {
  it("holds 12 record types", () => {
    expect(RECORD_TYPES).toHaveLength(12)
  })

  it("has unique labels (labels are the canonical key stored in history)", () => {
    expect(new Set(labels(RECORD_TYPES)).size).toBe(RECORD_TYPES.length)
  })

  it("gives every record type at least one owning department", () => {
    for (const r of RECORD_TYPES) {
      expect(r.departments.length, `departments for ${r.label}`).toBeGreaterThan(0)
    }
  })

  it("maps each production table to exactly one record type", () => {
    const tables = RECORD_TYPES.filter((r) => r.storage.kind === "table").map((r) =>
      r.storage.kind === "table" ? r.storage.table : "",
    )
    expect(tables).toHaveLength(7)
    expect(new Set(tables).size).toBe(7)
  })

  it("maps each stock material to exactly one record type", () => {
    const materials = RECORD_TYPES.filter((r) => r.storage.kind === "stock").map((r) =>
      r.storage.kind === "stock" ? r.storage.material : "",
    )
    expect(materials.sort()).toEqual(["alcohol", "caps", "caramel", "herb", "labels"])
  })

  it("marks every stock-backed record type as a continuity record", () => {
    for (const r of RECORD_TYPES.filter((r) => r.storage.kind === "stock")) {
      expect(r.stockContinuity, `stockContinuity for ${r.label}`).toBe(true)
    }
  })

  it("only sets continuityField on table-backed continuity records (Blowing is the sole case)", () => {
    const withField = RECORD_TYPES.filter((r) => r.continuityField)
    expect(labels(withField)).toEqual(["Daily Records (Preform Usage)"])
    expect(withField[0].storage).toEqual({ kind: "table", table: "blowing_daily_records" })
    expect(withField[0].continuityField).toBe("closing_stock_bags")
  })

  it("requires a continuityField on every table-backed continuity record", () => {
    for (const r of RECORD_TYPES.filter((r) => r.stockContinuity && r.storage.kind === "table")) {
      expect(r.continuityField, `continuityField for ${r.label}`).toBeTruthy()
    }
  })

  it("never sets continuityField on stock-backed records (the ledger derives the balance)", () => {
    for (const r of RECORD_TYPES.filter((r) => r.storage.kind === "stock")) {
      expect(r.continuityField, `continuityField for ${r.label}`).toBeUndefined()
    }
  })

  it("only ever uses Bitters and/or Ginger in the products list", () => {
    for (const r of RECORD_TYPES) {
      for (const p of r.products) {
        expect(["Bitters", "Ginger"], `product on ${r.label}`).toContain(p)
      }
    }
  })

  it("files these four record types per-product for both products", () => {
    const both = RECORD_TYPES.filter((r) => r.products.length === 2)
    expect(labels(both)).toEqual([
      "Caramel Stock",
      "Filling Line Daily Records",
      "Labels Stock",
      "Packaging Daily Records",
    ])
  })

  it("files these two record types for Bitters only", () => {
    const bittersOnly = RECORD_TYPES.filter(
      (r) => r.products.length === 1 && r.products[0] === "Bitters",
    )
    expect(labels(bittersOnly)).toEqual([
      "Daily Records for Alcohol and Blending",
      "Extraction Monitoring Records",
    ])
  })
})

describe("getRecordType", () => {
  it("finds a table-backed record type by its exact label", () => {
    const def = getRecordType("Packaging Daily Records")
    expect(def?.storage).toEqual({ kind: "table", table: "packaging_daily_records" })
    expect(def?.departments).toEqual(["Packaging"])
    expect(def?.compulsory).toBe(true)
  })

  it("finds a stock-backed record type and reports its material", () => {
    const def = getRecordType("Herbs Stock")
    expect(def?.storage).toEqual({ kind: "stock", material: "herb" })
    expect(def?.compulsory).toBe(false)
    expect(def?.stockContinuity).toBe(true)
  })

  it("returns undefined for an unknown label", () => {
    expect(getRecordType("Daily Records (Nonexistent)")).toBeUndefined()
  })

  it("returns undefined for an empty label", () => {
    expect(getRecordType("")).toBeUndefined()
  })

  it("is case-SENSITIVE on labels (unlike the department lookups)", () => {
    expect(getRecordType("packaging daily records")).toBeUndefined()
    expect(getRecordType("Packaging Daily Records")).toBeDefined()
  })

  it("is whitespace-sensitive on labels", () => {
    expect(getRecordType(" Packaging Daily Records ")).toBeUndefined()
  })

  it("returns undefined for a label colliding with an Object.prototype member (Map-backed lookup)", () => {
    expect(getRecordType("toString")).toBeUndefined()
    expect(getRecordType("constructor")).toBeUndefined()
  })

  it("resolves every registry entry by its own label", () => {
    for (const r of RECORD_TYPES) {
      expect(getRecordType(r.label), `lookup of ${r.label}`).toBe(r)
    }
  })
})

describe("recordTypesForDepartment", () => {
  it("returns Blowing's single record type", () => {
    expect(labels(recordTypesForDepartment("Blowing"))).toEqual(["Daily Records (Preform Usage)"])
  })

  it("returns all six Alcohol and Blending record types, including the shared Concentrate form", () => {
    expect(labels(recordTypesForDepartment("Alcohol and Blending"))).toEqual([
      "Daily Usage of Alcohol And Stock Level",
      "Daily Records for Alcohol and Blending",
      "Ginger Production",
      "Extraction Monitoring Records",
      "Caramel Stock",
      "Daily Records Alcohol For Concentrate",
    ])
  })

  it("returns Filling Line's three record types", () => {
    expect(labels(recordTypesForDepartment("Filling Line"))).toEqual([
      "Filling Line Daily Records",
      "Caps Stock",
      "Labels Stock",
    ])
  })

  it("returns Concentrate's two record types", () => {
    expect(labels(recordTypesForDepartment("Concentrate"))).toEqual([
      "Daily Records Alcohol For Concentrate",
      "Herbs Stock",
    ])
  })

  it("preserves registry order in the result", () => {
    const all = labels(RECORD_TYPES)
    const forDept = labels(recordTypesForDepartment("Alcohol and Blending"))
    const indexes = forDept.map((l) => all.indexOf(l))
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
  })

  it("matches department names case-insensitively", () => {
    expect(labels(recordTypesForDepartment("filling line"))).toEqual(
      labels(recordTypesForDepartment("Filling Line")),
    )
    expect(labels(recordTypesForDepartment("ALCOHOL AND BLENDING"))).toEqual(
      labels(recordTypesForDepartment("Alcohol and Blending")),
    )
  })

  it("does NOT trim surrounding whitespace on the department name", () => {
    expect(recordTypesForDepartment(" Packaging ")).toEqual([])
  })

  it("returns an empty array for an unknown department", () => {
    expect(recordTypesForDepartment("Maintenance")).toEqual([])
  })

  it("returns an empty array for an empty department name", () => {
    expect(recordTypesForDepartment("")).toEqual([])
  })

  it("lists the shared Concentrate alcohol form under BOTH of its departments", () => {
    const shared = "Daily Records Alcohol For Concentrate"
    expect(labels(recordTypesForDepartment("Concentrate"))).toContain(shared)
    expect(labels(recordTypesForDepartment("Alcohol and Blending"))).toContain(shared)
  })
})

describe("compulsoryRecordTypes", () => {
  it("returns Blowing's one compulsory record", () => {
    expect(labels(compulsoryRecordTypes("Blowing"))).toEqual(["Daily Records (Preform Usage)"])
  })

  it("returns Alcohol and Blending's two compulsory records (excluding Ginger/Extraction/Caramel)", () => {
    expect(labels(compulsoryRecordTypes("Alcohol and Blending"))).toEqual([
      "Daily Usage of Alcohol And Stock Level",
      "Daily Records for Alcohol and Blending",
    ])
  })

  it("returns all three Filling Line records as compulsory", () => {
    expect(labels(compulsoryRecordTypes("Filling Line"))).toEqual([
      "Filling Line Daily Records",
      "Caps Stock",
      "Labels Stock",
    ])
  })

  it("returns Packaging's one compulsory record", () => {
    expect(labels(compulsoryRecordTypes("Packaging"))).toEqual(["Packaging Daily Records"])
  })

  it("returns nothing for Concentrate - it has no compulsory records at all", () => {
    expect(compulsoryRecordTypes("Concentrate")).toEqual([])
  })

  it("returns an empty array for an unknown department", () => {
    expect(compulsoryRecordTypes("Maintenance")).toEqual([])
  })

  it("is case-insensitive like recordTypesForDepartment", () => {
    expect(labels(compulsoryRecordTypes("packaging"))).toEqual(["Packaging Daily Records"])
  })

  it("returns a subset of that department's record types, all flagged compulsory", () => {
    for (const dept of DEPARTMENTS) {
      const all = labels(recordTypesForDepartment(dept))
      for (const r of compulsoryRecordTypes(dept)) {
        expect(r.compulsory, `${r.label} compulsory flag`).toBe(true)
        expect(all).toContain(r.label)
      }
    }
  })

  it("counts 7 compulsory record types across the whole registry", () => {
    expect(RECORD_TYPES.filter((r) => r.compulsory)).toHaveLength(7)
  })
})

describe("departmentsWithCompulsory", () => {
  it("returns the four departments that own compulsory records, in registry order", () => {
    expect(departmentsWithCompulsory()).toEqual([
      "Blowing",
      "Alcohol and Blending",
      "Filling Line",
      "Packaging",
    ])
  })

  it("excludes Concentrate, whose record types are all optional", () => {
    expect(departmentsWithCompulsory()).not.toContain("Concentrate")
  })

  it("de-duplicates departments that own several compulsory records", () => {
    const out = departmentsWithCompulsory()
    expect(new Set(out).size).toBe(out.length)
  })

  it("agrees with compulsoryRecordTypes for every canonical department", () => {
    const withCompulsory = departmentsWithCompulsory()
    for (const dept of DEPARTMENTS) {
      const expected = compulsoryRecordTypes(dept).length > 0
      expect(withCompulsory.includes(dept), `${dept} in departmentsWithCompulsory`).toBe(expected)
    }
  })
})

describe("departmentAllows", () => {
  it("allows the owning department to submit its record", () => {
    expect(departmentAllows("Packaging", "Packaging Daily Records")).toBe(true)
  })

  it("allows BOTH departments of the shared Concentrate alcohol form", () => {
    expect(departmentAllows("Concentrate", "Daily Records Alcohol For Concentrate")).toBe(true)
    expect(departmentAllows("Alcohol and Blending", "Daily Records Alcohol For Concentrate")).toBe(
      true,
    )
  })

  it("rejects a department that does not own the record", () => {
    expect(departmentAllows("Blowing", "Packaging Daily Records")).toBe(false)
  })

  it("rejects Filling Line for the Concentrate-only Herbs Stock form", () => {
    expect(departmentAllows("Filling Line", "Herbs Stock")).toBe(false)
  })

  it("matches the department case-insensitively", () => {
    expect(departmentAllows("pACKAGING", "Packaging Daily Records")).toBe(true)
  })

  it("returns false for an unknown record type (no throw)", () => {
    expect(departmentAllows("Packaging", "Some Other Form")).toBe(false)
  })

  it("returns false for an unknown department", () => {
    expect(departmentAllows("Maintenance", "Packaging Daily Records")).toBe(false)
  })

  it("returns false for empty department and empty label", () => {
    expect(departmentAllows("", "Packaging Daily Records")).toBe(false)
    expect(departmentAllows("Packaging", "")).toBe(false)
  })

  it("agrees with recordTypesForDepartment for every department/record-type pair", () => {
    for (const dept of DEPARTMENTS) {
      const allowed = new Set(labels(recordTypesForDepartment(dept)))
      for (const r of RECORD_TYPES) {
        expect(departmentAllows(dept, r.label), `${dept} -> ${r.label}`).toBe(allowed.has(r.label))
      }
    }
  })
})
