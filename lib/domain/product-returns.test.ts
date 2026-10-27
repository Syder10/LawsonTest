import { describe, expect, it } from "vitest"
import { isReturnDate, productReturnLinesToSend, toProductReturnDetail, validateProductReturn } from "./product-returns"
import type { ProductReturnInput } from "./product-returns"

const good: ProductReturnInput = {
  date: "2026-10-22", shift: "Morning", lines: [{ product: "Bitters", cartons: 12 }, { product: "Ginger", cartons: 0 }],
}

describe("product return validation", () => {
  it("accepts either product or both, including partial cartons", () => {
    expect(validateProductReturn(good).ok).toBe(true)
    expect(validateProductReturn({ ...good, lines: [{ product: "Ginger", cartons: 1.25 }] }).ok).toBe(true)
    expect(validateProductReturn({ ...good, lines: good.lines.map((l) => ({ ...l, cartons: 5 })) }).ok).toBe(true)
  })
  it("requires a real calendar date and a known shift", () => {
    for (const date of ["", "2026-02-30", "22/10/2026", "2026-13-01"]) {
      expect(validateProductReturn({ ...good, date }).errors.date).toBeTruthy()
    }
    expect(isReturnDate("2024-02-29")).toBe(true)
    expect(validateProductReturn({ ...good, shift: "Evening" }).errors.shift).toBeTruthy()
  })
  it("rejects empty quantities and duplicates instead of double counting", () => {
    expect(validateProductReturn({ ...good, lines: [] }).ok).toBe(false)
    expect(validateProductReturn({ ...good, lines: [{ product: "Bitters", cartons: 0 }] }).ok).toBe(false)
    expect(validateProductReturn({ ...good, lines: [good.lines[0], good.lines[0]] }).ok).toBe(false)
  })
  it("rejects negative, nonnumeric, oversized and excessively precise quantities", () => {
    for (const cartons of [-1, NaN, Infinity, null, true, "2", 1e10, 1.001]) {
      expect(validateProductReturn({ ...good, lines: [{ product: "Bitters", cartons }] }).errors.cartons_Bitters).toBeTruthy()
    }
  })
  it("handles arbitrary JSON without throwing or accepting unknown products", () => {
    for (const body of [null, [], "hello", { ...good, lines: {} }, { ...good, lines: [null] }, { ...good, lines: [{ product: "Unknown", cartons: 1 }] }]) {
      expect(validateProductReturn(body).ok).toBe(false)
    }
    expect(validateProductReturn({ ...good, returnedFrom: [] }).ok).toBe(false)
  })
})

it("only sends products that were physically returned", () => {
  expect(productReturnLinesToSend(good.lines)).toEqual([{ product: "Bitters", cartons: 12 }])
})

it("coerces PostgREST quantities and keeps the account id off the response", () => {
  const detail = toProductReturnDetail({
    id: "r1", date: "2026-10-22", shift: "Night", product: "Bitters", cartons: "12.5",
    returned_from: "Accra", driver_name: "Kofi Mensah", vehicle_reg: "GT-555-24",
    received_by: "Stock Officer", remarks: null, user_id: "u1", created_at: "",
  })
  expect(detail.cartons + 2).toBe(14.5)
  expect(detail.driver_name).toBe("Kofi Mensah")
  expect(detail.vehicle_reg).toBe("GT-555-24")
  expect(detail).not.toHaveProperty("user_id")
})

it("accepts valid driver and car information", () => {
  expect(validateProductReturn({ ...good, driverName: "Kofi Mensah", vehicleReg: "GT-555-24" }).ok).toBe(true)
  expect(validateProductReturn({ ...good, driverName: 123 }).errors.driverName).toBeTruthy()
  expect(validateProductReturn({ ...good, vehicleReg: true }).errors.vehicleReg).toBeTruthy()
})
