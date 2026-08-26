import { describe, it, expect } from "vitest"
import {
  DEPT_METRICS,
  allMaterialKeys,
  allMaterials,
  columnsFor,
  deptMaterialKeys,
  deptMetrics,
  evaluate,
  hasProductSplit,
  isDepartment,
  materialKey,
  sourceTables,
  trendSeries,
} from "@/lib/domain/dept-metrics"
import { DEPARTMENTS } from "@/lib/domain/record-types"

describe("registry coverage", () => {
  it("defines metrics for every department", () => {
    for (const d of DEPARTMENTS) expect(DEPT_METRICS[d]).toBeDefined()
  })

  it("has no extra departments beyond the canonical list", () => {
    expect(Object.keys(DEPT_METRICS).sort()).toEqual([...DEPARTMENTS].sort())
  })

  it("gives every department at least one KPI", () => {
    for (const d of DEPARTMENTS) expect(DEPT_METRICS[d].kpis.length).toBeGreaterThan(0)
  })

  it("gives Concentrate real representation", () => {
    // Concentrate had ZERO presence on every dashboard: neither report route
    // emitted a herb row, and it has no compulsory record types either.
    expect(DEPT_METRICS.Concentrate.kpis.length).toBeGreaterThan(0)
    expect(deptMaterialKeys("Concentrate")).toContain("herb")
  })
})

// ════════════════════════════════════════════════════════════════════════════
// The drift guard. Each KPI names the table its columns come from; that table
// must be one the department actually owns according to the record-type
// registry. This is what stops this file quietly disagreeing with
// lib/domain/record-types.ts the way the two report routes disagreed.
// ════════════════════════════════════════════════════════════════════════════
describe("KPI tables come from the record-type registry", () => {
  it("only references tables the department actually owns", () => {
    for (const d of DEPARTMENTS) {
      const owned = sourceTables(d)
      for (const kpi of DEPT_METRICS[d].kpis) {
        expect(owned, `${d} / ${kpi.key} -> ${kpi.table}`).toContain(kpi.table)
      }
    }
  })

  it("derives Blowing's tables rather than restating them", () => {
    expect(sourceTables("Blowing")).toEqual(["blowing_daily_records"])
  })

  it("collapses stock_records to a single entry however many materials use it", () => {
    const tables = sourceTables("Filling Line")
    expect(tables).toContain("filling_line_daily_records")
    expect(tables.filter((t) => t === "stock_records")).toHaveLength(1)
  })

  it("gives the shared record type to both its departments", () => {
    // "Daily Records Alcohol For Concentrate" belongs to Concentrate AND
    // Alcohol and Blending.
    expect(sourceTables("Concentrate")).toContain("concentrate_alcohol_records")
    expect(sourceTables("Alcohol and Blending")).toContain("concentrate_alcohol_records")
  })

  it("is case-insensitive about the department name", () => {
    expect(sourceTables("blowing")).toEqual(["blowing_daily_records"])
  })
})

describe("uniqueness within a department", () => {
  it("has no duplicate KPI keys", () => {
    for (const d of DEPARTMENTS) {
      const keys = DEPT_METRICS[d].kpis.map((k) => k.key)
      expect(new Set(keys).size, `${d} has duplicate KPI keys`).toBe(keys.length)
    }
  })

  it("has no duplicate material keys", () => {
    for (const d of DEPARTMENTS) {
      const keys = DEPT_METRICS[d].materials.map((m) => m.key)
      expect(new Set(keys).size, `${d} has duplicate material keys`).toBe(keys.length)
    }
  })
})

describe("materialKey — one convention", () => {
  it("is the bare material code when there is no product", () => {
    expect(materialKey("alcohol")).toBe("alcohol")
    expect(materialKey("caps", null)).toBe("caps")
  })

  it("appends a lower-cased product when the material tracks one", () => {
    expect(materialKey("labels", "Bitters")).toBe("labels_bitters")
    expect(materialKey("carton", "Ginger")).toBe("carton_ginger")
  })

  it("uses the singular DB material code, not the old plural spellings", () => {
    // The two report routes disagreed: analytics emitted `cartons_bitters` and
    // `preforms`; procurement emitted `carton_bitters`. Singular wins because it
    // matches stock_materials.code.
    const keys = allMaterialKeys()
    expect(keys).toContain("carton_bitters")
    expect(keys).toContain("preform")
    expect(keys).not.toContain("cartons_bitters")
    expect(keys).not.toContain("preforms")
  })
})

describe("materials", () => {
  it("assigns each ledger material to the department that records it", () => {
    expect(deptMaterialKeys("Blowing")).toEqual(["preform"])
    expect(deptMaterialKeys("Filling Line")).toEqual(["caps", "labels_bitters", "labels_ginger"])
    expect(deptMaterialKeys("Packaging")).toEqual(["tax_stamp", "carton_bitters", "carton_ginger"])
    expect(deptMaterialKeys("Alcohol and Blending")).toEqual(["alcohol", "caramel_bitters", "caramel_ginger"])
  })

  it("returns nothing for an unknown department", () => {
    expect(deptMaterialKeys("Marketing")).toEqual([])
  })

  it("dedupes across departments for the company-wide view", () => {
    const all = allMaterialKeys()
    expect(new Set(all).size).toBe(all.length)
  })

  it("covers all 11 ledger material slots company-wide", () => {
    expect(allMaterialKeys().sort()).toEqual(
      [
        "alcohol", "caps", "caramel_bitters", "caramel_ginger", "carton_bitters",
        "carton_ginger", "herb", "labels_bitters", "labels_ginger", "preform", "tax_stamp",
      ].sort(),
    )
  })

  it("marks herb as per-variant, since its rows key on a herb name", () => {
    expect(allMaterials().find((m) => m.key === "herb")?.perVariant).toBe(true)
  })

  it("carries a unit on every material, so figures are never bare", () => {
    for (const m of allMaterials()) expect(m.unit).toBeTruthy()
  })
})

describe("hasProductSplit", () => {
  it("is true only where the source table carries a product column", () => {
    expect(hasProductSplit("Filling Line")).toBe(true)
    expect(hasProductSplit("Packaging")).toBe(true)
  })

  it("is false where no product column exists", () => {
    // blowing_daily_records and concentrate_alcohol_records have no `product`,
    // so a Bitters/Ginger series would be fabricated.
    expect(hasProductSplit("Blowing")).toBe(false)
    expect(hasProductSplit("Concentrate")).toBe(false)
  })

  it("is false for Alcohol and Blending, whose only product is ever Bitters", () => {
    expect(hasProductSplit("Alcohol and Blending")).toBe(false)
  })

  it("is false for an unknown department", () => {
    expect(hasProductSplit("Nope")).toBe(false)
  })
})

describe("evaluate", () => {
  const sums = { waste_pcs: 25, total_produced: 500, water_70_litres: 150, alcohol_used_70_litres: 100 }

  it("sums a column", () => {
    expect(evaluate({ kind: "sum", column: "waste_pcs" }, sums, 3)).toBe(25)
  })

  it("treats a missing column as zero rather than NaN", () => {
    expect(evaluate({ kind: "sum", column: "nope" }, sums, 3)).toBe(0)
  })

  it("counts rows", () => {
    expect(evaluate({ kind: "count" }, sums, 7)).toBe(7)
  })

  it("computes a rate as a percentage to one decimal", () => {
    expect(evaluate({ kind: "rate", numerator: "waste_pcs", denominator: "total_produced" }, sums, 3)).toBe(5)
  })

  it("computes a ratio to two decimals", () => {
    expect(evaluate({ kind: "ratio", numerator: "water_70_litres", denominator: "alcohol_used_70_litres" }, sums, 3)).toBe(1.5)
  })

  it("returns null for a zero denominator instead of NaN or Infinity", () => {
    // A shift with no production must read "—", never "NaN%" or "∞".
    expect(evaluate({ kind: "rate", numerator: "waste_pcs", denominator: "nothing" }, sums, 3)).toBeNull()
    expect(evaluate({ kind: "ratio", numerator: "waste_pcs", denominator: "nothing" }, sums, 3)).toBeNull()
  })
})

describe("columnsFor", () => {
  it("returns every column the department's KPIs need from one table", () => {
    const cols = columnsFor("Blowing", "blowing_daily_records")
    expect(cols).toContain("total_produced")
    expect(cols).toContain("waste_pcs")
    expect(cols).toContain("final_production")
    expect(cols).toContain("bottles_given_out")
  })

  it("dedupes a column used by both a sum and a rate", () => {
    const cols = columnsFor("Blowing", "blowing_daily_records")
    expect(new Set(cols).size).toBe(cols.length)
  })

  it("returns nothing for a table the department does not own", () => {
    expect(columnsFor("Blowing", "packaging_daily_records")).toEqual([])
  })

  it("returns nothing for an unknown department", () => {
    expect(columnsFor("Nope", "blowing_daily_records")).toEqual([])
  })
})

describe("trendKpi / trendSeries", () => {
  it("names a real KPI of that department", () => {
    for (const d of DEPARTMENTS) {
      const def = DEPT_METRICS[d]
      const keys = def.kpis.map((k) => k.key)
      expect(keys, `${d}.trendKpi`).toContain(def.trendKpi)
    }
  })

  it("always resolves to a summable column", () => {
    // A rate or ratio cannot be aggregated across days, so the trend KPI must be
    // a sum or the chart would be nonsense.
    for (const d of DEPARTMENTS) {
      const series = trendSeries(d)
      expect(series, `${d} has no resolvable trend series`).toBeDefined()
      expect(series!.column).toBeTruthy()
      expect(series!.table).toBeTruthy()
    }
  })

  it("gives each department its OWN measure, not packaging cartons", () => {
    // The old dashboard charted packaging cartons whatever department was
    // selected, so picking anything else produced an empty chart.
    expect(trendSeries("Blowing")).toMatchObject({ table: "blowing_daily_records", column: "total_produced" })
    expect(trendSeries("Filling Line")).toMatchObject({ table: "filling_line_daily_records", column: "total_production" })
    expect(trendSeries("Packaging")).toMatchObject({ table: "packaging_daily_records", column: "quantity_cartons_produced" })
    expect(trendSeries("Concentrate")).toMatchObject({ table: "concentrate_alcohol_records", column: "total_alcohol_used_litres" })
  })

  it("returns undefined for an unknown department", () => {
    expect(trendSeries("Nope")).toBeUndefined()
  })
})

describe("isDepartment / deptMetrics", () => {
  it("recognises the canonical names", () => {
    expect(isDepartment("Packaging")).toBe(true)
    expect(isDepartment("packaging")).toBe(false) // strict — it is an FK value
  })

  it("resolves metrics case-insensitively, matching sourceTables", () => {
    // Otherwise ?department=packaging would find tables but no metrics.
    expect(deptMetrics("packaging")?.department).toBe("Packaging")
    expect(deptMetrics("ALCOHOL AND BLENDING")?.department).toBe("Alcohol and Blending")
  })

  it("returns undefined rather than throwing for an unknown department", () => {
    expect(deptMetrics("Nope")).toBeUndefined()
  })

  it("carries a summary line for every department", () => {
    for (const d of DEPARTMENTS) expect(DEPT_METRICS[d].summary.length).toBeGreaterThan(10)
  })
})
