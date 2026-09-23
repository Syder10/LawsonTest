import type { InvoiceLineRow, InvoiceRow } from "@/lib/db/types"

// ============================================================================
// Supplier invoices.
//
// An invoice records what the SUPPLIER's document says, so that what arrived can be
// compared with what was billed. It is NOT an accounting entity: there are no
// purchase orders, no approvals, no payments and no ageing (PRD.md §3.2). Nothing
// here is posted anywhere.
//
// THE CENTRAL RULE — FR-9. The declared header total may legitimately disagree with
// the sum of the lines, because real invoices carry freight, tax and discounts that
// a line model does not represent. So a mismatch is SURFACED and never blocked.
// Refusing to record a real document because our arithmetic disagrees with it does
// not produce a correct record; it produces a fake total typed to get past the
// validation, and then the record is worthless.
// ============================================================================

/** A line as submitted from a form. */
export interface InvoiceLineInput {
  /**
   * Free text, not a constrained material code: an invoice may carry freight, a
   * spare part or a service line, none of which is a stock material. The constrained
   * code lives on the receipt that links to this line.
   */
  materialType: string
  description?: string | null
  quantity: number
  unit: string
  unitCost: number
}

export interface InvoiceInput {
  supplier: string
  invoiceNumber: string
  invoiceDate: string
  currency: string
  /** What the document declares. Optional — some arrive without a legible total. */
  declaredTotal?: number | null
  remarks?: string | null
  lines: InvoiceLineInput[]
}

export interface InvoiceLineDetail {
  id: string
  materialType: string
  description: string | null
  quantity: number
  unit: string
  unitCost: number
  /** Generated in the database: quantity × unitCost. Never computed on the client. */
  lineTotal: number
  /** Quantity actually received against this line, summed from receipts. */
  receivedQuantity: number
}

export interface InvoiceDetail {
  id: string
  supplier: string
  invoiceNumber: string
  invoiceDate: string
  currency: string
  declaredTotal: number | null
  remarks: string | null
  recordedBy: string | null
  lines: InvoiceLineDetail[]
  /** Σ line totals. Compare with `declaredTotal` — see `totalsAgree`. */
  lineTotal: number
}

/** The default trading currency. Ghana, so cedis. */
export const DEFAULT_CURRENCY = "GHS"

/**
 * Currencies offered in the form. Not a database constraint — the column accepts any
 * three-letter code, because a business should not need a deploy to record an
 * invoice in a currency nobody anticipated.
 */
export const COMMON_CURRENCIES = ["GHS", "USD", "EUR", "GBP", "CNY"] as const

// ── The declared-versus-lines comparison ────────────────────────────────────

/**
 * Rounding tolerance when comparing the declared total with the line sum.
 *
 * Two decimal places, because that is the precision `declared_total` is stored at.
 * A wider tolerance would hide a real one-unit discrepancy; a narrower one would
 * flag float noise as a finding.
 */
export const TOTAL_TOLERANCE = 0.01

export const sumLineTotals = (lines: { lineTotal: number }[]): number =>
  round2(lines.reduce((s, l) => s + l.lineTotal, 0))

/**
 * Do the two totals agree within tolerance?
 *
 * `true` when no total was declared: there is nothing to disagree with, and treating
 * "not stated" as a mismatch would put a warning on every invoice that arrived
 * without a legible total.
 */
export function totalsAgree(declaredTotal: number | null | undefined, lineTotal: number): boolean {
  if (declaredTotal === null || declaredTotal === undefined) return true
  return Math.abs(declaredTotal - lineTotal) <= TOTAL_TOLERANCE
}

/**
 * The human explanation of a mismatch, or null when there is nothing to say.
 *
 * Deliberately worded as an observation rather than an error. The difference is
 * usually freight or tax, which is information, not a fault — and the person
 * entering it cannot fix the supplier's arithmetic anyway.
 */
export function totalMismatchNote(
  declaredTotal: number | null | undefined,
  lineTotal: number,
  currency = DEFAULT_CURRENCY,
): string | null {
  if (totalsAgree(declaredTotal, lineTotal)) return null
  const diff = round2((declaredTotal as number) - lineTotal)
  const money = (n: number) => `${currency} ${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return diff > 0
    ? `The declared total is ${money(diff)} more than the lines add up to — often freight or tax. Recorded as given.`
    : `The declared total is ${money(diff)} less than the lines add up to — often a discount. Recorded as given.`
}

// ── Received against invoiced ───────────────────────────────────────────────

export type FulfilmentState = "outstanding" | "part" | "complete" | "over"

/**
 * How much of a line has physically arrived.
 *
 * `over` is a real and reportable state, not an error: suppliers over-deliver, and a
 * system that refused to record it would leave the extra goods off the balance
 * entirely — which is worse than a flagged discrepancy.
 */
export function fulfilment(line: Pick<InvoiceLineDetail, "quantity" | "receivedQuantity">): {
  state: FulfilmentState
  outstanding: number
  pct: number
} {
  const invoiced = line.quantity
  const received = line.receivedQuantity
  const outstanding = round2(invoiced - received)

  // Guard the zero denominator explicitly. `quantity > 0` is a database CHECK, so
  // this should be unreachable — but returning Infinity or NaN into a progress bar
  // is the kind of thing that renders as a blank cell nobody can explain.
  const pct = invoiced > 0 ? round2((received / invoiced) * 100) : 0

  if (received === 0) return { state: "outstanding", outstanding, pct }
  if (Math.abs(outstanding) <= TOTAL_TOLERANCE) return { state: "complete", outstanding: 0, pct }
  return { state: received > invoiced ? "over" : "part", outstanding, pct }
}

export const FULFILMENT_LABELS: Record<FulfilmentState, string> = {
  outstanding: "Not received",
  part: "Part received",
  complete: "Received",
  over: "Over-delivered",
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface InvoiceValidation {
  ok: boolean
  errors: Record<string, string>
  /**
   * Things worth saying that do NOT stop a save. The declared-total mismatch lives
   * here, never in `errors` — that separation IS FR-9, expressed in the type.
   */
  warnings: string[]
}

export function validateInvoice(input: Partial<InvoiceInput>): InvoiceValidation {
  const errors: Record<string, string> = {}
  const warnings: string[] = []

  if (!input.supplier?.trim()) errors.supplier = "Supplier is required."
  if (!input.invoiceNumber?.trim()) errors.invoiceNumber = "Invoice number is required."
  if (!input.invoiceDate) errors.invoiceDate = "Invoice date is required."

  const currency = (input.currency ?? DEFAULT_CURRENCY).trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.currency = "Currency must be a three-letter code, such as GHS."
  }

  if (input.declaredTotal !== null && input.declaredTotal !== undefined) {
    const t = Number(input.declaredTotal)
    if (!Number.isFinite(t) || t < 0) errors.declaredTotal = "Declared total must be zero or more."
  }

  const usable = (input.lines ?? []).filter((l) => Number(l.quantity) > 0)
  if (usable.length === 0) {
    errors.lines = "Add at least one line with a quantity."
  }

  ;(input.lines ?? []).forEach((line, i) => {
    // Skip a wholly blank row: a form with three empty line slots should not produce
    // three errors before anyone has typed. A row is judged once it has content.
    const touched = line.materialType?.trim() || Number(line.quantity) > 0 || Number(line.unitCost) > 0
    if (!touched) return

    if (!line.materialType?.trim()) errors[`line_${i}_materialType`] = "What is this line for?"
    if (!line.unit?.trim()) errors[`line_${i}_unit`] = "Unit is required."

    const q = Number(line.quantity)
    if (!Number.isFinite(q) || q <= 0) errors[`line_${i}_quantity`] = "Quantity must be more than zero."

    const c = Number(line.unitCost)
    if (!Number.isFinite(c) || c < 0) errors[`line_${i}_unitCost`] = "Unit cost must be zero or more."
  })

  // FR-9 in one place: computed, reported, and NOT added to `errors`.
  const lineTotal = round2(
    (input.lines ?? []).reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitCost || 0), 0),
  )
  const note = totalMismatchNote(input.declaredTotal, lineTotal, currency)
  if (note) warnings.push(note)

  return { ok: Object.keys(errors).length === 0, errors, warnings }
}

/** Lines to actually send: blank and zero-quantity rows dropped. */
export function invoiceLinesToSend(lines: InvoiceLineInput[]) {
  return lines
    .filter((l) => Number(l.quantity) > 0 && l.materialType?.trim())
    .map((l) => ({
      material_type: l.materialType.trim(),
      description: l.description?.trim() || null,
      quantity: Number(l.quantity),
      unit: l.unit?.trim() || "pcs",
      unit_cost: Number(l.unitCost) || 0,
    }))
}

// ── Row mapping ─────────────────────────────────────────────────────────────

/**
 * Map the joined rows PostgREST returns into `InvoiceDetail`.
 *
 * `Number()` on every numeric field, without exception: PostgREST serialises
 * `numeric` as a STRING. Without it `lineTotal` sums as string concatenation and
 * `totalsAgree` compares a number with "2820.0000", which is never equal.
 *
 * `receivedByLine` maps invoice_line_id → quantity received, gathered from receipts
 * by the caller (the route knows which quantity column each material type uses).
 */
export function toInvoiceDetail(
  row: InvoiceRow & { invoice_lines?: InvoiceLineRow[] | null },
  receivedByLine: Record<string, number> = {},
): InvoiceDetail {
  const lines: InvoiceLineDetail[] = [...(row.invoice_lines ?? [])]
    .sort((a, b) => a.display_order - b.display_order)
    .map((l) => ({
      id: l.id,
      materialType: l.material_type,
      description: l.description,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitCost: Number(l.unit_cost),
      lineTotal: Number(l.line_total),
      receivedQuantity: Number(receivedByLine[l.id] ?? 0),
    }))

  return {
    id: row.id,
    supplier: row.supplier,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    currency: row.currency,
    declaredTotal: row.declared_total === null ? null : Number(row.declared_total),
    remarks: row.remarks,
    recordedBy: row.recorded_by,
    lines,
    lineTotal: sumLineTotals(lines),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
