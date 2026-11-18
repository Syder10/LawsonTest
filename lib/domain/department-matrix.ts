import type { GenericProductionRecord } from "@/lib/domain/production-pivot"
import { groupsForDepartment, shiftRank } from "@/lib/shift-config"
import { hasProductSplit } from "@/lib/domain/dept-metrics"
import type { Product } from "@/lib/db/types"

// ============================================================================
// Department production matrices — what each department's monthly matrix reads.
//
// One definition per department: the source table, the columns it selects, how
// a raw row is read, and which measures can be put in the matrix. The on-screen
// pivot tables (components/features/dashboard/manager/*-pivot-table) and the
// printable matrix report both import these, so a row can never be read one way
// on the screen and another way on paper.
//
// The readers are moved here VERBATIM from the pivot tables, fallbacks included.
// Two of those fallbacks are conversion factors, and both mirror the database: the
// blending table GENERATES its litre columns as drums × 250 and tanks × 900
// (0004_records.sql), so the stored litres are always present and the fallbacks
// only matter for a row read without them.
// ============================================================================

const num = (v: unknown) => Number(v) || 0
const groupOf = (v: unknown) => (v ? Number(v) : null)

// ── Row shapes (formerly declared inside each pivot table) ─────────────────

export interface PackagingRecordRow extends GenericProductionRecord {
  group_number: number | null
  product: string
  quantity_cartons_produced: number
  number_cartons_wasted: number
  quantity_cartons_loaded: number
  is_part_time: boolean
}

export interface BlowingRecordRow extends GenericProductionRecord {
  group_number: number | null
  preforms_used_bags: number
  total_produced: number
  waste_pcs: number
  final_production: number
  is_part_time: boolean
}

export interface FillingRecordRow extends GenericProductionRecord {
  group_number: number | null
  product: string
  total_production: number
  bottles_wasted: number
  bottles_rejected: number
  is_part_time: boolean
}

export interface BlendingRecordRow extends GenericProductionRecord {
  group_number: number | null
  product: string
  alcohol_transferred_drums: number
  alcohol_transferred_litres: number
  finished_products_transferred_tanks: number
  finished_products_transferred_litres: number
  is_part_time: boolean
}

type Raw = Record<string, unknown>

// ── Readers ─────────────────────────────────────────────────────────────────

export const PACKAGING_SELECT =
  "date, shift, group_number, product, quantity_cartons_produced, number_cartons_wasted, quantity_cartons_loaded, is_part_time"
export function readPackagingRow(r: Raw): PackagingRecordRow {
  return {
    date: String(r.date),
    shift: String(r.shift),
    group_number: groupOf(r.group_number),
    product: String(r.product),
    quantity_cartons_produced: num(r.quantity_cartons_produced),
    number_cartons_wasted: r.number_cartons_wasted ? Number(r.number_cartons_wasted) : 0,
    quantity_cartons_loaded: r.quantity_cartons_loaded ? Number(r.quantity_cartons_loaded) : 0,
    is_part_time: Boolean(r.is_part_time),
  }
}

export const BLOWING_SELECT =
  "date, shift, group_number, preforms_used_bags, total_produced, waste_pcs, final_production, is_part_time"
export function readBlowingRow(r: Raw): BlowingRecordRow {
  return {
    date: String(r.date),
    shift: String(r.shift),
    group_number: groupOf(r.group_number),
    preforms_used_bags: num(r.preforms_used_bags),
    total_produced: num(r.total_produced),
    waste_pcs: num(r.waste_pcs),
    final_production: Number(r.final_production) || num(r.total_produced) - num(r.waste_pcs),
    is_part_time: Boolean(r.is_part_time),
  }
}

export const FILLING_SELECT =
  "date, shift, group_number, product, total_production, bottles_wasted, bottles_rejected, is_part_time"
export function readFillingRow(r: Raw): FillingRecordRow {
  return {
    date: String(r.date),
    shift: String(r.shift),
    group_number: groupOf(r.group_number),
    product: String(r.product || "Bitters"),
    total_production: num(r.total_production),
    bottles_wasted: num(r.bottles_wasted),
    bottles_rejected: num(r.bottles_rejected),
    is_part_time: Boolean(r.is_part_time),
  }
}

/** Litres per alcohol drum — the database generates alcohol_transferred_litres the same way. */
const LITRES_PER_DRUM = 250
/** Litres per finished-product tank — the database generates finished_products_transferred_litres the same way. */
const LITRES_PER_TANK = 900

export const BLENDING_SELECT =
  "date, shift, group_number, product, alcohol_transferred_drums, alcohol_transferred_litres, finished_products_transferred_tanks, finished_products_transferred_litres, is_part_time"
export function readBlendingRow(r: Raw): BlendingRecordRow {
  const drums = num(r.alcohol_transferred_drums)
  const tanks = num(r.finished_products_transferred_tanks)
  return {
    date: String(r.date),
    shift: String(r.shift),
    group_number: groupOf(r.group_number),
    product: String(r.product || "Bitters"),
    alcohol_transferred_drums: drums,
    alcohol_transferred_litres: Number(r.alcohol_transferred_litres) || drums * LITRES_PER_DRUM,
    finished_products_transferred_tanks: tanks,
    finished_products_transferred_litres: Number(r.finished_products_transferred_litres) || tanks * LITRES_PER_TANK,
    is_part_time: Boolean(r.is_part_time),
  }
}

// ── The matrix definitions ──────────────────────────────────────────────────

export type DepartmentKey = "packaging" | "blowing" | "filling" | "blending"

export interface MatrixMeasure {
  key: string
  /** Column caption on the printed matrix, e.g. "Cartons produced". */
  label: string
  unit: string
  /** Set on a per-product sheet: only records of this product count. */
  product?: Product
  /** The record value this sheet reads, when it differs from `key` (per-product sheets). */
  valueKey?: string
}

/** A record reduced to what a matrix needs: who, when, and one value per measure. */
export interface MatrixRecord extends GenericProductionRecord {
  values: Record<string, number>
}

/** The four source tables, spelled as literals so the typed Supabase client accepts them. */
export type MatrixTable =
  | "packaging_daily_records"
  | "blowing_daily_records"
  | "filling_line_daily_records"
  | "alcohol_blending_daily_records"

export interface DepartmentMatrixDef {
  key: DepartmentKey
  /** The department name as stored in profiles and no_work_records. */
  department: string
  table: MatrixTable
  select: string
  measures: MatrixMeasure[]
  read(raw: Raw[]): MatrixRecord[]
}

const base = (r: GenericProductionRecord) => ({
  date: r.date,
  shift: r.shift,
  group_number: r.group_number ?? null,
  product: r.product ?? null,
  is_part_time: r.is_part_time ?? null,
})

export const DEPARTMENT_MATRICES: readonly DepartmentMatrixDef[] = [
  {
    key: "packaging",
    department: "Packaging",
    table: "packaging_daily_records",
    select: PACKAGING_SELECT,
    measures: [{ key: "cartons_produced", label: "Cartons produced", unit: "cartons" }],
    read: (raw) =>
      raw.map(readPackagingRow).map((r) => ({ ...base(r), values: { cartons_produced: r.quantity_cartons_produced } })),
  },
  {
    key: "blowing",
    department: "Blowing",
    table: "blowing_daily_records",
    select: BLOWING_SELECT,
    measures: [
      { key: "net_output", label: "Net output", unit: "bottles" },
      { key: "preforms_used", label: "Preforms used", unit: "bags" },
    ],
    read: (raw) =>
      raw.map(readBlowingRow).map((r) => ({
        ...base(r),
        values: { net_output: r.final_production, preforms_used: r.preforms_used_bags },
      })),
  },
  {
    key: "filling",
    department: "Filling Line",
    table: "filling_line_daily_records",
    select: FILLING_SELECT,
    measures: [{ key: "bottles_filled", label: "Bottles filled", unit: "bottles" }],
    read: (raw) => raw.map(readFillingRow).map((r) => ({ ...base(r), values: { bottles_filled: r.total_production } })),
  },
  {
    key: "blending",
    department: "Alcohol and Blending",
    table: "alcohol_blending_daily_records",
    select: BLENDING_SELECT,
    measures: [
      { key: "alcohol_used", label: "Alcohol used", unit: "drums" },
      { key: "blended_litres", label: "Finished product blended", unit: "litres" },
    ],
    read: (raw) =>
      raw.map(readBlendingRow).map((r) => ({
        ...base(r),
        values: { alcohol_used: r.alcohol_transferred_drums, blended_litres: r.finished_products_transferred_litres },
      })),
  },
]

export function departmentMatrix(key: string): DepartmentMatrixDef | undefined {
  return DEPARTMENT_MATRICES.find((d) => d.key === key)
}

// ── Month window and no-work remarks ────────────────────────────────────────

/** First and last ISO date of a 1-based month. */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, "0")
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(days).padStart(2, "0")}` }
}

// ── No work ─────────────────────────────────────────────────────────────────
// A no-work record sits on the matrix exactly as a production record does: under
// the group that recorded it, on the date it was recorded. A record filed without
// a group goes in Part Time, the column production filed without a group already
// lands in (buildProductionPivotMatrix). Nothing is inferred from the rotation.

export interface NoWorkRow {
  date: unknown
  shift: unknown
  group_number?: unknown
  reason: unknown
}

/** A matrix column: a rotation group, or Part Time (which also holds records with no group). */
export type MatrixColumn = 1 | 2 | 3 | "pt"

export interface NoWorkPlacement {
  /** "date|column" → the shift(s) that did not run, for the cells to mark. */
  cells: Map<string, string[]>
  /** date → "Night (Group 2): Power outage; …", in shift order, for the Remarks column. */
  remarks: Map<string, string>
}

export const noWorkCellKey = (date: string, column: MatrixColumn) => `${date}|${column}`

/** The column a record belongs in, by the group it was filed under. */
export function columnForGroup(groupNumber: unknown): MatrixColumn {
  const g = Number(groupNumber)
  return groupNumber != null && (g === 1 || g === 2 || g === 3) ? g : "pt"
}

export function placeNoWork(rows: NoWorkRow[]): NoWorkPlacement {
  const cells = new Map<string, string[]>()
  const byDate = new Map<string, { rank: number; text: string }[]>()
  for (const r of rows) {
    const date = String(r.date)
    const shift = r.shift ? String(r.shift) : ""
    const column = columnForGroup(r.group_number)
    const key = noWorkCellKey(date, column)
    const shifts = cells.get(key) ?? []
    if (shift && !shifts.includes(shift)) shifts.push(shift)
    cells.set(key, shifts)

    const reason = String(r.reason ?? "").trim()
    if (!reason) continue
    const who = [shift, column === "pt" ? "(no group)" : `(Group ${column})`].filter(Boolean).join(" ")
    const text = `${who}: ${reason}`
    const list = byDate.get(date) ?? []
    if (!list.some((e) => e.text === text)) list.push({ rank: shift ? shiftRank(shift) : -1, text })
    byDate.set(date, list)
  }
  const remarks = new Map<string, string>()
  for (const [date, list] of byDate) {
    remarks.set(date, list.sort((x, y) => x.rank - y.rank).map((e) => e.text).join("; "))
  }
  return { cells, remarks }
}

// ── Group columns ───────────────────────────────────────────────────────────

export type MatrixGroup = 1 | 2 | 3

/**
 * The rotation-group columns a department's matrix shows: the groups its rotation
 * actually has (groupsForDepartment — Alcohol and Blending runs Groups 1 and 2, the
 * other departments 1 to 3), plus Group 3 whenever records were filed against it.
 *
 * That second rule is the room left for the future: if Alcohol and Blending ever
 * staffs a third group, its column appears on its own the first month it has
 * output, and the totals never include a figure the sheet does not show. Part Time
 * is always shown; it also holds records filed without a group.
 */
export function matrixGroupColumns(
  department: string,
  totals: { group1Total: number; group2Total: number; group3Total: number },
  /** Groups with something else to show this month, e.g. a no-work filed against them. */
  alsoShow: Iterable<number> = [],
): MatrixGroup[] {
  const rostered = new Set<number>([...groupsForDepartment(department), ...alsoShow])
  const filed: Record<MatrixGroup, number> = { 1: totals.group1Total, 2: totals.group2Total, 3: totals.group3Total }
  return ([1, 2, 3] as const).filter((g) => rostered.has(g) || filed[g] !== 0)
}

// ── Shift shading ───────────────────────────────────────────────────────────
// Each group cell on a printed matrix is shaded by the shift that produced it, as
// agreed with the business: Morning plain, Afternoon ash, Night black (with white
// figures so the value stays legible). A cell that two shifts fed is left plain and
// labelled with their initials, e.g. "M+N", rather than shaded as one of them.

export type CellShiftTone = "none" | "morning" | "afternoon" | "night" | "mixed"

export interface CellShift {
  tone: CellShiftTone
  /** "M+N" for a mixed cell; empty otherwise. */
  initials: string
}

const SHIFT_TONES: Record<string, Exclude<CellShiftTone, "none" | "mixed">> = {
  Morning: "morning",
  Afternoon: "afternoon",
  Night: "night",
}

/** The shading for one matrix cell, from the shifts that contributed to it. */
export function cellShift(shifts: { shift: string; value: number }[]): CellShift {
  const worked = [...new Set(shifts.filter((s) => s.value !== 0).map((s) => s.shift))].sort(
    (a, b) => shiftRank(a) - shiftRank(b),
  )
  if (worked.length === 0) return { tone: "none", initials: "" }
  if (worked.length === 1 && SHIFT_TONES[worked[0]]) return { tone: SHIFT_TONES[worked[0]], initials: "" }
  return { tone: "mixed", initials: worked.map((s) => s.charAt(0).toUpperCase()).join("+") }
}

// ── Product sheets ──────────────────────────────────────────────────────────

const PRODUCTS: readonly Product[] = ["Bitters", "Ginger"]

/**
 * The sheets a department prints. Where the department's output is genuinely split
 * by product — hasProductSplit, the same switch the analytics dashboards use, true
 * today for Packaging and Filling Line — every measure becomes one sheet per
 * product, since Bitters and Ginger are produced and stocked separately. Elsewhere
 * the measures print as declared: Blowing records no product at all, and Alcohol
 * and Blending's records only ever carry Bitters (Ginger runs on its own table), so
 * splitting them would print a Ginger sheet that is empty by construction.
 */
export function matrixMeasures(def: DepartmentMatrixDef): MatrixMeasure[] {
  if (!hasProductSplit(def.department)) return def.measures
  return def.measures.flatMap((m) =>
    PRODUCTS.map((product) => ({
      key: `${m.key}_${product.toLowerCase()}`,
      label: `${m.label} — ${product}`,
      unit: m.unit,
      product,
      valueKey: m.key,
    })),
  )
}

/** A record's value on a sheet: 0 when the sheet is for the other product. */
export function measureValue(record: MatrixRecord, measure: MatrixMeasure): number {
  if (measure.product && record.product !== measure.product) return 0
  return record.values[measure.valueKey ?? measure.key] ?? 0
}
