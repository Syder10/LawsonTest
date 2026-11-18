import { describe, it, expect } from "vitest"
import {
  COMMON_CURRENCIES,
  DEFAULT_CURRENCY,
  FULFILMENT_LABELS,
  TOTAL_TOLERANCE,
  fulfilment,
  invoiceLinesToSend,
  openInvoiceLines,
  sumLineTotals,
  toInvoiceDetail,
  totalMismatchNote,
  totalsAgree,
  validateInvoice,
  type InvoiceDetail,
  type InvoiceLineDetail,
} from "@/lib/domain/invoices"
import type { InvoiceLineRow, InvoiceRow } from "@/lib/db/types"

describe("totalsAgree", () => {
  it("treats a missing declared total as agreement, nothing to disagree with", () => {
    expect(totalsAgree(null, 100)).toBe(true)
    expect(totalsAgree(undefined, 100)).toBe(true)
  })
  it("agrees within the two-decimal tolerance and disagrees beyond it", () => {
    expect(totalsAgree(100, 100)).toBe(true)
    expect(totalsAgree(100.009, 100)).toBe(true)
    expect(totalsAgree(100.02, 100)).toBe(false)
  })
})

describe("totalMismatchNote", () => {
  it("says nothing when the totals agree", () => {
    expect(totalMismatchNote(100, 100)).toBeNull()
    expect(totalMismatchNote(null, 100)).toBeNull()
  })
  it("reads as freight or tax when the declared total is higher", () => {
    const note = totalMismatchNote(120, 100, "GHS")
    expect(note).toContain("more than")
    expect(note).toContain("GHS")
    expect(note).toContain("20.00")
  })
  it("reads as a discount when the declared total is lower", () => {
    expect(totalMismatchNote(80, 100)).toContain("less than")
  })
})

describe("sumLineTotals", () => {
  it("sums line totals and rounds to two places", () => {
    expect(sumLineTotals([{ lineTotal: 10.1 }, { lineTotal: 20.2 }])).toBe(30.3)
  })
})

describe("fulfilment", () => {
  it("is outstanding when nothing has been received", () => {
    expect(fulfilment({ quantity: 10, receivedQuantity: 0 }).state).toBe("outstanding")
  })
  it("is part when some but not all has arrived", () => {
    const f = fulfilment({ quantity: 10, receivedQuantity: 4 })
    expect(f.state).toBe("part")
    expect(f.outstanding).toBe(6)
    expect(f.pct).toBe(40)
  })
  it("is complete within tolerance", () => {
    expect(fulfilment({ quantity: 10, receivedQuantity: 10 }).state).toBe("complete")
  })
  it("is over when more arrived than was invoiced", () => {
    expect(fulfilment({ quantity: 10, receivedQuantity: 12 }).state).toBe("over")
  })
  it("guards a zero invoiced quantity rather than returning NaN", () => {
    expect(fulfilment({ quantity: 0, receivedQuantity: 0 }).pct).toBe(0)
  })
})

describe("openInvoiceLines", () => {
  const line = (
    id: string,
    quantity: number,
    receivedQuantity: number,
    extra: Partial<InvoiceLineDetail> = {},
  ): InvoiceLineDetail => ({
    id, materialType: "tax_stamp", description: null, quantity, unit: "boxes",
    unitCost: 0, lineTotal: 0, receivedQuantity, ...extra,
  })
  const invoice = (
    id: string,
    lines: InvoiceLineDetail[],
    extra: Partial<InvoiceDetail> = {},
  ): InvoiceDetail => ({
    id, supplier: "Kama", invoiceNumber: `INV-${id}`, invoiceDate: "2026-09-20",
    currency: "GHS", declaredTotal: null, remarks: null, recordedBy: null,
    lines, lineTotal: 0, ...extra,
  })

  it("keeps outstanding and part lines, dropping complete and over", () => {
    const inv = invoice("i1", [
      line("out", 10, 0),
      line("part", 10, 4),
      line("done", 10, 10),
      line("over", 10, 12),
    ])
    expect(openInvoiceLines([inv]).map((l) => l.id)).toEqual(["out", "part"])
  })

  it("reports the outstanding quantity for a partial line", () => {
    const [open] = openInvoiceLines([invoice("i1", [line("part", 10, 4)])])
    expect(open.invoiced).toBe(10)
    expect(open.received).toBe(4)
    expect(open.outstanding).toBe(6)
  })

  it("flattens open lines across invoices, carrying parent identity", () => {
    const out = openInvoiceLines([
      invoice("i1", [line("a", 5, 0)], { supplier: "Kama", invoiceNumber: "INV-1" }),
      invoice("i2", [line("b", 5, 0)], { supplier: "Zeta", invoiceNumber: "INV-2" }),
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ id: "a", invoiceId: "i1", supplier: "Kama", invoiceNumber: "INV-1" })
    expect(out[1]).toMatchObject({ id: "b", invoiceId: "i2", supplier: "Zeta", invoiceNumber: "INV-2" })
  })

  it("returns nothing for no invoices or fully-received ones", () => {
    expect(openInvoiceLines([])).toEqual([])
    expect(openInvoiceLines([invoice("i1", [line("done", 10, 10)])])).toEqual([])
  })
})

describe("validateInvoice", () => {
  const good = {
    supplier: "Kama Ltd",
    invoiceNumber: "INV-1",
    invoiceDate: "2026-09-20",
    currency: "GHS",
    lines: [{ materialType: "tax_stamp", quantity: 10, unit: "boxes", unitCost: 5 }],
  }
  it("accepts a well-formed invoice", () => {
    expect(validateInvoice(good).ok).toBe(true)
  })
  it("requires supplier, number and date", () => {
    const v = validateInvoice({ ...good, supplier: "", invoiceNumber: "", invoiceDate: "" })
    expect(v.ok).toBe(false)
    expect(v.errors.supplier).toBeTruthy()
    expect(v.errors.invoiceNumber).toBeTruthy()
    expect(v.errors.invoiceDate).toBeTruthy()
  })
  it("rejects a currency that is not three letters", () => {
    expect(validateInvoice({ ...good, currency: "cedis" }).errors.currency).toBeTruthy()
  })
  it("rejects a negative declared total", () => {
    expect(validateInvoice({ ...good, declaredTotal: -1 }).errors.declaredTotal).toBeTruthy()
  })
  it("needs at least one line with a quantity", () => {
    expect(validateInvoice({ ...good, lines: [] }).errors.lines).toBeTruthy()
  })
  it("skips a wholly blank row instead of erroring on it", () => {
    const v = validateInvoice({
      ...good,
      lines: [good.lines[0], { materialType: "", quantity: 0, unit: "", unitCost: 0 }],
    })
    expect(v.ok).toBe(true)
  })
  it("puts the declared-versus-lines mismatch in warnings, never errors (FR-9)", () => {
    const v = validateInvoice({ ...good, declaredTotal: 999 })
    expect(v.ok).toBe(true)
    expect(v.errors.declaredTotal).toBeUndefined()
    expect(v.warnings.length).toBeGreaterThan(0)
  })
})

describe("invoiceLinesToSend", () => {
  it("drops blank and zero-quantity rows and maps to the RPC shape", () => {
    const out = invoiceLinesToSend([
      { materialType: " tax_stamp ", description: " box ", quantity: 10, unit: " boxes ", unitCost: 5 },
      { materialType: "", quantity: 0, unit: "", unitCost: 0 },
    ])
    expect(out).toEqual([
      { material_type: "tax_stamp", description: "box", quantity: 10, unit: "boxes", unit_cost: 5 },
    ])
  })
  it("defaults a missing unit to pcs", () => {
    expect(invoiceLinesToSend([{ materialType: "x", quantity: 1, unit: "", unitCost: 0 }])[0].unit).toBe("pcs")
  })
})

describe("toInvoiceDetail", () => {
  const row = {
    id: "i1", supplier: "Kama", invoice_number: "INV-1", invoice_date: "2026-09-20",
    currency: "GHS", declared_total: "120.00", remarks: null, recorded_by: "Ama",
    user_id: null, created_at: "", updated_at: "",
    invoice_lines: [
      { id: "l2", invoice_id: "i1", material_type: "b", description: null, quantity: "2", unit: "pcs", unit_cost: "10", line_total: "20", display_order: 1, created_at: "" },
      { id: "l1", invoice_id: "i1", material_type: "a", description: null, quantity: "1", unit: "pcs", unit_cost: "10", line_total: "10", display_order: 0, created_at: "" },
    ],
  } as unknown as InvoiceRow & { invoice_lines: InvoiceLineRow[] }

  it("coerces numeric strings and sorts lines by display_order", () => {
    const d = toInvoiceDetail(row, { l1: 1 })
    expect(d.lines.map((l) => l.id)).toEqual(["l1", "l2"])
    expect(d.declaredTotal).toBe(120)
    expect(d.lineTotal).toBe(30)
    expect(d.lines[0].receivedQuantity).toBe(1)
    expect(d.lines[1].receivedQuantity).toBe(0)
  })
  it("keeps a null declared total null", () => {
    expect(toInvoiceDetail({ ...row, declared_total: null }).declaredTotal).toBeNull()
  })
})

describe("constants", () => {
  it("defaults to cedis and includes it among the common currencies", () => {
    expect(DEFAULT_CURRENCY).toBe("GHS")
    expect(COMMON_CURRENCIES).toContain("GHS")
  })
  it("labels every fulfilment state and keeps a tight tolerance", () => {
    expect(Object.keys(FULFILMENT_LABELS).sort()).toEqual(["complete", "outstanding", "over", "part"])
    expect(TOTAL_TOLERANCE).toBe(0.01)
  })
})
