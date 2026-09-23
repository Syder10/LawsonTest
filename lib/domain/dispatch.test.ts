import { describe, it, expect } from "vitest"
import {
  BREAKDOWN_DIMENSIONS,
  DIMENSION_LABELS,
  dispatchLinesToSend,
  emptyDispatchLines,
  grandTotalCartons,
  isBreakdownDimension,
  toDispatchDetail,
  totalsFromDispatches,
  validateDispatch,
  type DispatchDetail,
} from "@/lib/domain/dispatch"
import { PRODUCTS } from "@/lib/domain/record-types"
import type { DispatchRow } from "@/lib/db/types"

const line = (product: string, cartons: number | string) => ({ product: product as any, cartons: cartons as any })

describe("validateDispatch", () => {
  const good = {
    date: "2026-09-20",
    shift: "Morning" as const,
    vehicleReg: "GT-1234-24",
    driverName: "Kofi",
    destination: "Accra",
    lines: [line("Bitters", 120)],
  }
  it("accepts a well-formed dispatch", () => {
    expect(validateDispatch(good).ok).toBe(true)
  })
  it("requires the date and shift", () => {
    const v = validateDispatch({ ...good, date: "", shift: undefined })
    expect(v.errors.date).toBeTruthy()
    expect(v.errors.shift).toBeTruthy()
  })
  it("requires vehicle, driver and destination", () => {
    const v = validateDispatch({ ...good, vehicleReg: "", driverName: " ", destination: "" })
    expect(v.errors.vehicleReg).toBeTruthy()
    expect(v.errors.driverName).toBeTruthy()
    expect(v.errors.destination).toBeTruthy()
  })
  it("needs at least one line with a positive quantity (FR-13)", () => {
    expect(validateDispatch({ ...good, lines: [line("Bitters", 0)] }).errors.lines).toBeTruthy()
  })
  it("rejects a negative carton count on a line", () => {
    expect(validateDispatch({ ...good, lines: [line("Bitters", -1)] }).errors["cartons_Bitters"]).toBeTruthy()
  })
})

describe("dispatchLinesToSend", () => {
  it("keeps only positive lines and coerces to numbers", () => {
    const out = dispatchLinesToSend([line("Bitters", 120), line("Ginger", 0), line("Bitters", -5)])
    expect(out).toEqual([{ product: "Bitters", cartons: 120 }])
  })
})

describe("emptyDispatchLines", () => {
  it("offers one zero line per product", () => {
    const empty = emptyDispatchLines()
    expect(empty.map((l) => l.product)).toEqual([...PRODUCTS])
    expect(empty.every((l) => l.cartons === 0)).toBe(true)
  })
})

describe("totalsFromDispatches", () => {
  const dispatches: DispatchDetail[] = [
    { id: "d1", date: "2026-09-20", shift: "Morning", vehicleReg: "V1", driverName: "A", destination: "Accra", waybillNumber: null, releasedBy: null, remarks: null, lines: [line("Bitters", 100), line("Ginger", 50)], totalCartons: 150 },
    { id: "d2", date: "2026-09-20", shift: "Morning", vehicleReg: "V2", driverName: "B", destination: "Kumasi", waybillNumber: null, releasedBy: null, remarks: null, lines: [line("Bitters", 20)], totalCartons: 20 },
  ]
  it("sums cartons per product and counts distinct loads, not lines", () => {
    const totals = totalsFromDispatches(dispatches)
    const bitters = totals.find((t) => t.product === "Bitters")!
    expect(bitters.cartons).toBe(120)
    expect(bitters.loads).toBe(2)
    expect(totals.find((t) => t.product === "Ginger")!.loads).toBe(1)
  })
  it("adds up every carton across products and loads", () => {
    expect(grandTotalCartons(dispatches)).toBe(170)
  })
})

describe("toDispatchDetail", () => {
  const row = {
    id: "d1", date: "2026-09-20", shift: "Morning", vehicle_reg: "V1", driver_name: "A",
    destination: "Accra", waybill_number: "WB-1", released_by: "Ama", remarks: null,
    user_id: null, created_at: "", updated_at: "",
    dispatch_lines: [line("Ginger", "50"), line("Bitters", "100")],
  } as unknown as DispatchRow & { dispatch_lines: { product: any; cartons: number | string }[] }

  it("coerces string cartons, orders lines by PRODUCTS and totals them", () => {
    const d = toDispatchDetail(row)
    expect(d.lines.map((l) => l.product)).toEqual([...PRODUCTS])
    expect(d.totalCartons).toBe(150)
    expect(d.lines[0].cartons).toBe(100)
  })
  it("omits a product that was not on the load rather than showing it as zero", () => {
    const d = toDispatchDetail({ ...row, dispatch_lines: [line("Bitters", 100)] })
    expect(d.lines).toHaveLength(1)
    expect(d.lines[0].product).toBe("Bitters")
  })
})

describe("breakdown dimensions", () => {
  it("labels and recognises exactly the whitelisted dimensions", () => {
    expect([...BREAKDOWN_DIMENSIONS]).toEqual(["vehicle", "driver", "destination"])
    for (const d of BREAKDOWN_DIMENSIONS) expect(DIMENSION_LABELS[d]).toBeTruthy()
    expect(isBreakdownDimension("vehicle")).toBe(true)
    expect(isBreakdownDimension("colour")).toBe(false)
  })
})
