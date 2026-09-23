import type { DispatchRow, Product, Shift } from "@/lib/db/types"
import { PRODUCTS } from "@/lib/domain/record-types"

// ============================================================================
// Dispatch — the outbound delivery log.
//
// The business had no record of where finished goods went: the only trace of an
// outbound carton was `packaging_daily_records.quantity_cartons_loaded`, a number
// with no destination. This module owns the shapes and the aggregation.
//
// DISPATCH IS NOT A STOCK MOVEMENT HERE. It does not feed the finished-goods
// balance, and there is no variance report. `finished_goods_stock()` keeps deriving
// from `quantity_cartons_loaded`; this log sits beside it and answers a different
// question — "where did the goods go", not "how many left".
//
// So dispatched totals may differ from cartons loaded, and nothing flags the
// difference. That is a decision, not an oversight (PRD.md §3.3), asserted in
// supabase/tests/06_stock_separation.sql so it cannot be "fixed" silently. If the
// business ever wants one authoritative number, that is a separate decision with a
// data migration attached.
// ============================================================================

/** A dispatch with its per-product quantities, as the API returns it. */
export interface DispatchDetail {
  id: string
  date: string
  shift: Shift
  vehicleReg: string
  driverName: string
  destination: string
  waybillNumber: string | null
  releasedBy: string | null
  remarks: string | null
  /** Cartons per product. A product absent from the load is absent here, not zero. */
  lines: { product: Product; cartons: number }[]
  /** Total cartons across every line — the figure a load is judged by. */
  totalCartons: number
}

/** One line of a dispatch as submitted from a form. */
export interface DispatchLineInput {
  product: Product
  cartons: number
  }

export interface DispatchInput {
  date: string
  shift: Shift
  vehicleReg: string
  driverName: string
  destination: string
  waybillNumber?: string | null
  remarks?: string | null
  lines: DispatchLineInput[]
}

/** The dimensions the dispatch log can be grouped by. Mirrors the SQL whitelist. */
export const BREAKDOWN_DIMENSIONS = ["vehicle", "driver", "destination"] as const
export type BreakdownDimension = (typeof BREAKDOWN_DIMENSIONS)[number]

export const DIMENSION_LABELS: Record<BreakdownDimension, string> = {
  vehicle: "Vehicle",
  driver: "Driver",
  destination: "Destination",
}

export const isBreakdownDimension = (v: string): v is BreakdownDimension =>
  (BREAKDOWN_DIMENSIONS as readonly string[]).includes(v)

/** Cartons out per product over a window. */
export interface DispatchTotal {
  product: Product
  cartons: number
  /** Distinct loads, not lines — two products on one truck is ONE load. */
  loads: number
}

/** Cartons out grouped by one dimension. */
export interface DispatchBreakdownRow {
  label: string
  cartons: number
  loads: number
}

export interface DispatchReport {
  totals: DispatchTotal[]
  byVehicle: DispatchBreakdownRow[]
  byDriver: DispatchBreakdownRow[]
  byDestination: DispatchBreakdownRow[]
  /** Every load in the window, newest first. */
  dispatches: DispatchDetail[]
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Why validation lives here rather than only in the route: the same rules have to
 * hold for the form (before a request is sent) and for the API (because a form is
 * not a boundary). One declaration, imported by both — the rule this codebase is
 * built on. The database enforces the same constraints a third time.
 */
export interface DispatchValidation {
  ok: boolean
  /** Field-keyed messages, so a form can put each one beside its own control. */
  errors: Record<string, string>
}

const REQUIRED_TEXT: { key: keyof DispatchInput; label: string }[] = [
  { key: "vehicleReg", label: "Vehicle registration" },
  { key: "driverName", label: "Driver name" },
  { key: "destination", label: "Destination" },
]

export function validateDispatch(input: Partial<DispatchInput>): DispatchValidation {
  const errors: Record<string, string> = {}

  if (!input.date) errors.date = "Pick the date the shift started."
  if (!input.shift) errors.shift = "Choose a shift."

  for (const { key, label } of REQUIRED_TEXT) {
    const v = input[key]
    if (typeof v !== "string" || v.trim().length === 0) {
      errors[key as string] = `${label} is required.`
    }
  }

  // FR-13: a dispatch of nothing is a data-entry accident, so at least one line must
  // carry a positive quantity. A zero for the product that was not loaded is normal
  // form input and is skipped rather than rejected — which is why this counts
  // POSITIVE lines instead of checking that the array is non-empty.
  const positive = (input.lines ?? []).filter((l) => Number(l.cartons) > 0)
  if (positive.length === 0) {
    errors.lines = "Enter the cartons loaded for at least one product."
  }

  for (const line of input.lines ?? []) {
    const n = Number(line.cartons)
    if (line.cartons !== undefined && line.cartons !== null && (!Number.isFinite(n) || n < 0)) {
      errors[`cartons_${line.product}`] = "Cartons must be zero or more."
    }
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * The lines to actually send: zero and blank entries dropped.
 *
 * A form offering both products always submits both, so the zero has to be dropped
 * somewhere. Doing it here means the RPC payload matches what will be stored, and
 * `dispatch_lines` never holds a zero row that would later read as "we delivered
 * none of this product" rather than "this product was not on the truck".
 */
export function dispatchLinesToSend(lines: DispatchLineInput[]): DispatchLineInput[] {
  return lines
    .map((l) => ({ product: l.product, cartons: Number(l.cartons) }))
    .filter((l) => Number.isFinite(l.cartons) && l.cartons > 0)
}

/** A blank set of lines, one per product, for a fresh form. */
export const emptyDispatchLines = (): DispatchLineInput[] =>
  PRODUCTS.map((product) => ({ product, cartons: 0 }))

// ── Aggregation ─────────────────────────────────────────────────────────────

/**
 * Total cartons across a set of dispatches, per product.
 *
 * Used where the client already holds the rows (the history table's footer) rather
 * than re-querying. `loads` counts DISTINCT dispatches: one truck carrying both
 * products is one load, and counting lines would double it.
 */
export function totalsFromDispatches(dispatches: DispatchDetail[]): DispatchTotal[] {
  const byProduct = new Map<Product, { cartons: number; loads: Set<string> }>()

  for (const d of dispatches) {
    for (const line of d.lines) {
      const entry = byProduct.get(line.product) ?? { cartons: 0, loads: new Set<string>() }
      entry.cartons += line.cartons
      entry.loads.add(d.id)
      byProduct.set(line.product, entry)
    }
  }

  // Iterate PRODUCTS rather than the map so display order is stable and does not
  // depend on which product happened to be dispatched first.
  return PRODUCTS.filter((p) => byProduct.has(p)).map((product) => {
    const e = byProduct.get(product)!
    return { product, cartons: e.cartons, loads: e.loads.size }
  })
}

/** Cartons across every product and load. */
export const grandTotalCartons = (dispatches: DispatchDetail[]): number =>
  dispatches.reduce((sum, d) => sum + d.totalCartons, 0)

/**
 * Map the joined rows PostgREST returns into `DispatchDetail`.
 *
 * `Number()` on every numeric: PostgREST serialises `numeric` as a STRING, so
 * without it `cartons` arrives as "120" and `+` concatenates instead of adding —
 * a total of "0120" rather than 120.
 */
export function toDispatchDetail(
  row: DispatchRow & { dispatch_lines?: { product: Product; cartons: number | string }[] | null },
): DispatchDetail {
  const lines = (row.dispatch_lines ?? []).map((l) => ({
    product: l.product,
    cartons: Number(l.cartons),
  }))

  return {
    id: row.id,
    date: row.date,
    shift: row.shift,
    vehicleReg: row.vehicle_reg,
    driverName: row.driver_name,
    destination: row.destination,
    waybillNumber: row.waybill_number,
    releasedBy: row.released_by,
    remarks: row.remarks,
    // Sorted by PRODUCTS order so a load reads the same way on every screen.
    lines: PRODUCTS.filter((p) => lines.some((l) => l.product === p)).map(
      (p) => lines.find((l) => l.product === p)!,
    ),
    totalCartons: lines.reduce((s, l) => s + l.cartons, 0),
  }
}
