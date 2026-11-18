import { describe, expect, it } from "vitest"
import {
  DEPARTMENT_MATRICES,
  departmentMatrix,
  matrixGroupColumns,
  matrixMeasures,
  measureValue,
  cellShift,
  monthBounds,
  noWorkCellKey,
  placeNoWork,
  rosteredGroupFor,
  readBlendingRow,
  readBlowingRow,
  readFillingRow,
  readPackagingRow,
} from "./department-matrix"
import { buildProductionPivotMatrix } from "./production-pivot"
import { buildPackagingPivotMatrix } from "./packaging-pivot"
import { hasProductSplit } from "./dept-metrics"
import { CHECKED_BY_TITLE, formatDayDate, preparedByName } from "./report-document"

// Sample rows only — made-up figures to exercise the readers.

describe("row readers", () => {
  it("read PostgREST strings as numbers (numeric columns arrive as strings)", () => {
    const r = readPackagingRow({ date: "2026-11-02", shift: "Morning", group_number: "2", product: "Ginger", quantity_cartons_produced: "40", number_cartons_wasted: null, quantity_cartons_loaded: "12", is_part_time: false })
    expect(r).toEqual({ date: "2026-11-02", shift: "Morning", group_number: 2, product: "Ginger", quantity_cartons_produced: 40, number_cartons_wasted: 0, quantity_cartons_loaded: 12, is_part_time: false })
  })

  it("derive blowing net output from produced − waste when it was not stored", () => {
    expect(readBlowingRow({ date: "d", shift: "Night", total_produced: "100", waste_pcs: "7", final_production: null }).final_production).toBe(93)
    expect(readBlowingRow({ date: "d", shift: "Night", total_produced: "100", waste_pcs: "7", final_production: "90" }).final_production).toBe(90)
  })

  it("default a missing product to Bitters, as the pivot tables always did", () => {
    expect(readFillingRow({ date: "d", shift: "Morning", product: null }).product).toBe("Bitters")
    expect(readBlendingRow({ date: "d", shift: "Morning", product: "" }).product).toBe("Bitters")
  })

  it("fill blending litres from drums only when litres were not recorded", () => {
    expect(readBlendingRow({ date: "d", shift: "Morning", alcohol_transferred_drums: "2", alcohol_transferred_litres: null }).alcohol_transferred_litres).toBe(500)
    expect(readBlendingRow({ date: "d", shift: "Morning", alcohol_transferred_drums: "2", alcohol_transferred_litres: "480" }).alcohol_transferred_litres).toBe(480)
  })

  it("treat a missing group as null, not 0", () => {
    expect(readFillingRow({ date: "d", shift: "Morning", group_number: null }).group_number).toBeNull()
  })
})

describe("DEPARTMENT_MATRICES", () => {
  it("covers each department once, under the names no_work_records uses", () => {
    expect(DEPARTMENT_MATRICES.map((d) => d.key)).toEqual(["packaging", "blowing", "filling", "blending"])
    expect(DEPARTMENT_MATRICES.map((d) => d.department)).toEqual(["Packaging", "Blowing", "Filling Line", "Alcohol and Blending"])
    expect(departmentMatrix("filling")?.table).toBe("filling_line_daily_records")
    expect(departmentMatrix("nope")).toBeUndefined()
  })

  it("expose a value for every declared measure on every record", () => {
    for (const def of DEPARTMENT_MATRICES) {
      const [rec] = def.read([{ date: "2026-11-02", shift: "Morning", group_number: 1 }])
      expect(Object.keys(rec.values).sort()).toEqual(def.measures.map((m) => m.key).sort())
    }
  })

  it("give each packaging product sheet exactly what the on-screen pivot shows for that product", () => {
    const raw = [
      { date: "2026-11-02", shift: "Morning", group_number: 1, product: "Bitters", quantity_cartons_produced: "30", is_part_time: false },
      { date: "2026-11-02", shift: "Night", group_number: 3, product: "Ginger", quantity_cartons_produced: "12", is_part_time: false },
      { date: "2026-11-03", shift: "Afternoon", group_number: null, product: "Ginger", quantity_cartons_produced: "5", is_part_time: true },
    ]
    const def = departmentMatrix("packaging")!
    for (const measure of matrixMeasures(def)) {
      const printed = buildProductionPivotMatrix({ year: 2026, month: 11, records: def.read(raw), valueExtractor: (r) => measureValue(r, measure) })
      const screen = buildPackagingPivotMatrix({ year: 2026, month: 11, records: raw.map(readPackagingRow), productFilter: measure.product })
      expect(printed.rows.map((r) => [r.group1.value, r.group2.value, r.group3.value, r.partTime.value, r.total])).toEqual(
        screen.rows.map((r) => [r.group1.cartons, r.group2.cartons, r.group3.cartons, r.partTime.cartons, r.total]),
      )
      expect(printed.summary.totalValue).toBe(screen.summary.totalCartons)
    }
  })
})

describe("matrixMeasures", () => {
  const labels = (key: string) => matrixMeasures(departmentMatrix(key)!).map((m) => m.label)

  it("splits the departments whose output is recorded per product into Bitters and Ginger sheets", () => {
    expect(labels("packaging")).toEqual(["Cartons produced — Bitters", "Cartons produced — Ginger"])
    expect(labels("filling")).toEqual(["Bottles filled — Bitters", "Bottles filled — Ginger"])
  })

  it("leaves Blowing (no product) and Alcohol and Blending (Bitters only) whole", () => {
    expect(labels("blowing")).toEqual(["Net output", "Preforms used"])
    expect(labels("blending")).toEqual(["Alcohol used", "Finished product blended"])
  })

  it("follows the same product-split switch as the analytics dashboards", () => {
    for (const def of DEPARTMENT_MATRICES) {
      expect(matrixMeasures(def).some((m) => m.product), def.department).toBe(hasProductSplit(def.department))
    }
  })

  it("gives every sheet a unique key", () => {
    for (const def of DEPARTMENT_MATRICES) {
      const keys = matrixMeasures(def).map((m) => m.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it("counts a record only on its own product sheet, and the sheets add up to the whole", () => {
    const raw = [
      { date: "2026-11-02", shift: "Morning", group_number: 1, product: "Bitters", total_production: "300" },
      { date: "2026-11-02", shift: "Night", group_number: 2, product: "Ginger", total_production: "120" },
      { date: "2026-11-03", shift: "Morning", group_number: 1, product: null, total_production: "10" },
    ]
    const def = departmentMatrix("filling")!
    const total = (measure: ReturnType<typeof matrixMeasures>[number]) =>
      buildProductionPivotMatrix({ year: 2026, month: 11, records: def.read(raw), valueExtractor: (r) => measureValue(r, measure) }).summary.totalValue
    const [bitters, ginger] = matrixMeasures(def)
    // A filling record with no product counts as Bitters, as the on-screen pivot has always read it.
    expect([total(bitters), total(ginger)]).toEqual([310, 120])
    const whole = def.measures[0]
    expect(total(bitters) + total(ginger)).toBe(total(whole))
  })
})

describe("monthBounds", () => {
  it("spans the whole month, leap years included", () => {
    expect(monthBounds(2026, 11)).toEqual({ from: "2026-11-01", to: "2026-11-30" })
    expect(monthBounds(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" })
    expect(monthBounds(2026, 12)).toEqual({ from: "2026-12-01", to: "2026-12-31" })
  })
})

describe("placeNoWork", () => {
  // The rotation's own anchor week (Monday 13 April 2026): Group 1 Afternoon,
  // Group 2 Night, Group 3 Morning. Blending's anchor (5 May 2025): Group 1
  // Morning, Group 2 Afternoon, no Night.
  it("knows which group the rotation put on a shift", () => {
    expect(rosteredGroupFor("Packaging", "Night", "2026-04-15")).toBe(2)
    expect(rosteredGroupFor("Packaging", "Morning", "2026-04-15")).toBe(3)
    expect(rosteredGroupFor("Alcohol and Blending", "Afternoon", "2025-05-06")).toBe(2)
    expect(rosteredGroupFor("Alcohol and Blending", "Night", "2025-05-06")).toBeNull()
    expect(rosteredGroupFor("Packaging", "Night", "not-a-date")).toBeNull()
  })

  it("marks the group the record names, else the rostered group, in that cell", () => {
    const { cells } = placeNoWork("Packaging", [
      { date: "2026-04-15", shift: "Night", group_number: null, reason: "Power outage" },
      { date: "2026-04-16", shift: "Morning", group_number: 1, reason: "Covering another line" },
    ])
    expect([...cells]).toEqual([
      [noWorkCellKey("2026-04-15", 2), "Night"],
      [noWorkCellKey("2026-04-16", 1), "Morning"],
    ])
  })

  it("leaves a no-work it cannot place in Remarks only", () => {
    const { cells, remarks } = placeNoWork("Alcohol and Blending", [
      { date: "2025-05-06", shift: "Night", group_number: null, reason: "No night line" },
    ])
    expect(cells.size).toBe(0)
    expect(remarks.get("2025-05-06")).toBe("Night: No night line")
  })

  it("names the group in Remarks, in shift order, without duplicates", () => {
    const { remarks } = placeNoWork("Packaging", [
      { date: "2026-04-15", shift: "Night", reason: "Power outage" },
      { date: "2026-04-15", shift: "Morning", reason: "No preforms" },
      { date: "2026-04-15", shift: "Night", reason: "Power outage" },
      { date: "2026-04-16", shift: "Afternoon", reason: "  " },
    ])
    expect(remarks.get("2026-04-15")).toBe("Morning (Group 3): No preforms; Night (Group 2): Power outage")
    expect(remarks.has("2026-04-16")).toBe(false)
  })
})

describe("matrixGroupColumns", () => {
  const none = { group1Total: 0, group2Total: 0, group3Total: 0 }

  it("shows Groups 1 and 2 for Alcohol and Blending, 1 to 3 elsewhere", () => {
    expect(matrixGroupColumns("Alcohol and Blending", none)).toEqual([1, 2])
    for (const d of ["Packaging", "Blowing", "Filling Line"]) expect(matrixGroupColumns(d, none)).toEqual([1, 2, 3])
  })

  it("adds Group 3 to Alcohol and Blending the moment anything is filed against it", () => {
    expect(matrixGroupColumns("Alcohol and Blending", { ...none, group3Total: 4 })).toEqual([1, 2, 3])
  })

  it("also adds Group 3 when only a no-work was filed against it", () => {
    expect(matrixGroupColumns("Alcohol and Blending", none, [3])).toEqual([1, 2, 3])
    expect(matrixGroupColumns("Alcohol and Blending", none, [])).toEqual([1, 2])
  })

  it("matches every department the matrices cover", () => {
    for (const def of DEPARTMENT_MATRICES) expect(matrixGroupColumns(def.department, none).length).toBeGreaterThanOrEqual(2)
  })
})

describe("sign-off", () => {
  it("prints the preparer in capitals, and nothing when the account has no name", () => {
    expect(preparedByName("  Bright   Amoah ")).toBe("BRIGHT AMOAH")
    expect(preparedByName(null)).toBe("")
    expect(preparedByName("")).toBe("")
  })

  it("is checked by the manager who owns the report", () => {
    expect(CHECKED_BY_TITLE).toEqual({ production: "Production Manager", procurement: "Procurement Manager" })
  })
})

describe("formatDayDate", () => {
  it("reads weekday then day-month-year, without leading zeros", () => {
    expect(formatDayDate("2026-10-02")).toBe("Fri 2-10-26")
    expect(formatDayDate("2026-11-16")).toBe("Mon 16-11-26")
    expect(formatDayDate("2030-01-06")).toBe("Sun 6-1-30")
    expect(formatDayDate("2026-02-30")).toBe("")
  })
})

describe("cellShift", () => {
  it("shades a cell by the one shift that produced it", () => {
    expect(cellShift([{ shift: "Morning", value: 30 }])).toEqual({ tone: "morning", initials: "" })
    expect(cellShift([{ shift: "Afternoon", value: 30 }])).toEqual({ tone: "afternoon", initials: "" })
    expect(cellShift([{ shift: "Night", value: 30 }, { shift: "Night", value: 4 }])).toEqual({ tone: "night", initials: "" })
  })

  it("leaves an empty cell plain, ignoring shifts that filed nothing", () => {
    expect(cellShift([])).toEqual({ tone: "none", initials: "" })
    expect(cellShift([{ shift: "Night", value: 0 }])).toEqual({ tone: "none", initials: "" })
    expect(cellShift([{ shift: "Night", value: 0 }, { shift: "Morning", value: 5 }])).toEqual({ tone: "morning", initials: "" })
  })

  it("marks a cell fed by two shifts as mixed, initials in shift order", () => {
    expect(cellShift([{ shift: "Night", value: 5 }, { shift: "Morning", value: 2 }])).toEqual({ tone: "mixed", initials: "M+N" })
  })

  it("never shades a shift it does not know", () => {
    expect(cellShift([{ shift: "Overtime", value: 5 }])).toEqual({ tone: "mixed", initials: "O" })
  })
})
