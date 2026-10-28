import { describe, expect, it } from "vitest"
import { toDonationDetail, validateDonation, type DonationInput } from "./donations"

const good: DonationInput = {
  date: "2026-07-15",
  shift: "Morning",
  product: "Bitters",
  cartons: 102,
  recipient: "Festival Sponsorship",
  remarks: "Management approved",
}

describe("donations validation", () => {
  it("accepts valid donation inputs", () => {
    expect(validateDonation(good).ok).toBe(true)
    expect(validateDonation({ ...good, product: "Ginger", cartons: 251 }).ok).toBe(true)
  })

  it("requires a recipient", () => {
    expect(validateDonation({ ...good, recipient: "" }).errors.recipient).toBeTruthy()
    expect(validateDonation({ ...good, recipient: "   " }).errors.recipient).toBeTruthy()
  })

  it("rejects zero or negative quantities", () => {
    expect(validateDonation({ ...good, cartons: 0 }).errors.cartons).toBeTruthy()
    expect(validateDonation({ ...good, cartons: -5 }).errors.cartons).toBeTruthy()
  })

  it("rejects non-numeric quantities or invalid shifts", () => {
    expect(validateDonation({ ...good, cartons: "10" as unknown as number }).errors.cartons).toBeTruthy()
    expect(validateDonation({ ...good, shift: "Invalid" as unknown as "Morning" }).errors.shift).toBeTruthy()
  })

  it("coerces PostgREST quantities and preserves detail", () => {
    const detail = toDonationDetail({
      id: "d1",
      date: "2026-07-15",
      shift: "Morning",
      product: "Bitters",
      cartons: "102",
      recipient: "Di Asa",
      remarks: null,
      user_id: "u1",
      created_at: "2026-07-15T10:00:00Z",
    })
    expect(detail.cartons).toBe(102)
    expect(detail.recipient).toBe("Di Asa")
    expect(detail).not.toHaveProperty("user_id")
  })
})
