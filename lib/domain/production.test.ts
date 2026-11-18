import { describe, it, expect } from "vitest"
import { cartonsProducedByDay, cartonsProducedTotals } from "@/lib/domain/production"

const row = (date: string, product: string, qty: number | string) => ({
  date,
  product,
  quantity_cartons_produced: qty,
})

describe("cartonsProducedTotals", () => {
  it("sums per product and across both, coercing string quantities", () => {
    const t = cartonsProducedTotals([
      row("2026-09-20", "Bitters", "100"),
      row("2026-09-20", "Ginger", 40),
      row("2026-09-21", "Bitters", 20),
    ])
    expect(t).toEqual({ bitters: 120, ginger: 40, total: 160 })
  })
  it("is zero for an empty window", () => {
    expect(cartonsProducedTotals([])).toEqual({ bitters: 0, ginger: 0, total: 0 })
  })
  it("counts an unknown product toward the total but not either split", () => {
    const t = cartonsProducedTotals([row("2026-09-20", "Other", 5), row("2026-09-20", "Bitters", 10)])
    expect(t).toEqual({ bitters: 10, ginger: 0, total: 15 })
  })
})

describe("cartonsProducedByDay", () => {
  it("groups by date, splits by product and orders ascending", () => {
    const days = cartonsProducedByDay([
      row("2026-09-21", "Bitters", 20),
      row("2026-09-20", "Bitters", "100"),
      row("2026-09-20", "Ginger", 40),
    ])
    expect(days).toEqual([
      { date: "2026-09-20", total: 140, bitters: 100, ginger: 40 },
      { date: "2026-09-21", total: 20, bitters: 20, ginger: 0 },
    ])
  })
  it("returns nothing for an empty window", () => {
    expect(cartonsProducedByDay([])).toEqual([])
  })
})
