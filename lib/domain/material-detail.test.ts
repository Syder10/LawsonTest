import { describe, it, expect } from "vitest"
import {
  normalizeBlowingRecord,
  normalizeCount,
  normalizeLedger,
  normalizeReceipt,
  normalizeStockRecord,
} from "@/lib/domain/material-detail"
import { materialDescriptorForKey } from "@/lib/domain/stock-materials"

// PostgREST serialises numeric as a STRING; every normaliser must Number()-coerce so
// downstream arithmetic and `variance === 0` behave. Inputs below use strings on
// purpose to prove the coercion.

describe("normalizeStockRecord", () => {
  it("coerces numerics and maps checked_by/destination", () => {
    expect(
      normalizeStockRecord({
        id: "s1",
        date: "2026-09-20",
        shift: "Morning",
        quantity_received: "3" as unknown as number,
        quantity_used: "1" as unknown as number,
        destination: "Line A",
        checked_by: "Ama",
        remarks: null,
      }),
    ).toEqual({
      id: "s1",
      date: "2026-09-20",
      shift: "Morning",
      received: 3,
      used: 1,
      by: "Ama",
      destination: "Line A",
      remarks: null,
    })
  })
})

describe("normalizeBlowingRecord", () => {
  it("maps preform bags to received/used", () => {
    expect(
      normalizeBlowingRecord({
        id: "b1",
        date: "2026-09-21",
        shift: "Night",
        quantity_received_bags: "10" as unknown as number,
        preforms_used_bags: "4" as unknown as number,
        supervisor_name: "Kofi",
        remarks: "topped up",
      }),
    ).toEqual({
      id: "b1",
      date: "2026-09-21",
      shift: "Night",
      received: 10,
      used: 4,
      by: "Kofi",
      destination: null,
      remarks: "topped up",
    })
  })
})

describe("normalizeReceipt", () => {
  const receipt = {
    id: "r1",
    date: "2026-09-22",
    received_by: "Yaw",
    stamp_total_pcs: "90000" as unknown as number,
    carton_total_pcs: "500" as unknown as number,
    ppe_pcs_in: "12" as unknown as number,
    ppe_given_pcs: "5" as unknown as number,
    ppe_given_to: "Filling",
    remarks: null,
  }

  it("reads stamp pieces and leaves used null for tax stamps", () => {
    const out = normalizeReceipt(receipt, materialDescriptorForKey("tax_stamp")!)
    expect(out).toMatchObject({ received: 90000, used: null, shift: null, destination: null, by: "Yaw" })
  })

  it("reads carton pieces for the carton material", () => {
    const out = normalizeReceipt(receipt, materialDescriptorForKey("carton_ginger")!)
    expect(out).toMatchObject({ received: 500, used: null, destination: null })
  })

  it("reads PPE pieces in/out and the issued-to destination", () => {
    const out = normalizeReceipt(receipt, materialDescriptorForKey("gloves")!)
    expect(out).toMatchObject({ received: 12, used: 5, destination: "Filling" })
  })
})

describe("normalizeCount", () => {
  it("coerces a string zero variance to a real number zero", () => {
    const out = normalizeCount({
      id: "c1",
      date: "2026-09-19",
      shift: null,
      counted_qty: "40" as unknown as number,
      computed_qty: "40" as unknown as number,
      variance: "0" as unknown as number,
      kind: "reconciliation",
      note: null,
      counted_by: "Mgr",
    })
    expect(out.variance).toBe(0)
    expect(out.variance === 0).toBe(true)
    expect(out).toMatchObject({ counted: 40, computed: 40, kind: "reconciliation", by: "Mgr" })
  })
})

describe("normalizeLedger", () => {
  it("coerces every numeric field", () => {
    expect(
      normalizeLedger({
        date: "2026-09-18",
        shift: "Afternoon",
        received: "2" as unknown as number,
        used: "1" as unknown as number,
        opening: "5" as unknown as number,
        remaining: "6" as unknown as number,
      }),
    ).toEqual({ date: "2026-09-18", shift: "Afternoon", received: 2, used: 1, opening: 5, remaining: 6 })
  })
})
