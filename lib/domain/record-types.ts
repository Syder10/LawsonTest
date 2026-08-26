import type { Product } from "@/lib/db/types"

// ============================================================================
// Single source of truth for record types.
//
// Replaces the maps that were previously copy-pasted (and drifting) across:
//   • app/api/records/submit           (recordTypeToTable, recordTypeAllowedDepts)
//   • app/api/records/previous-stock    (RECORD_TYPE_TO_TABLE_MAP)
//   • app/dashboard/forms/page          (DEPARTMENTS, recordTypeToTable)
//   • app/api/records/export            (DEPARTMENT_RECORDS, ALL_RECORDS)
//   • lib/shift-config                  (COMPULSORY, ALL_COMPULSORY_TABLES)
// ============================================================================

export type ProductionTable =
  | "blowing_daily_records"
  | "alcohol_blending_daily_records"
  | "ginger_production_records"
  | "extraction_monitoring_records"
  | "filling_line_daily_records"
  | "packaging_daily_records"
  | "concentrate_alcohol_records"

export type StockMaterial = "alcohol" | "caps" | "labels" | "caramel" | "herb"

// Where a record type's rows live: a dedicated production table, or a slice of
// the consolidated stock_records table keyed by material.
export type RecordStorage =
  | { kind: "table"; table: ProductionTable }
  | { kind: "stock"; material: StockMaterial }

export interface RecordTypeDef {
  /** UI label — canonical key used across the app and stored in history. */
  label: string
  /** Departments whose supervisors may submit this record. */
  departments: string[]
  storage: RecordStorage
  /** Products this record can be filed per ([] = single form, no product). */
  products: Product[]
  /** Counts toward a department's compulsory daily submissions. */
  compulsory: boolean
  /** Uses opening→remaining continuity (prev shift's close seeds this open). */
  stockContinuity: boolean
  /** For table-backed continuity records, the column holding the closing value. */
  continuityField?: string
}

const BOTH: Product[] = ["Bitters", "Ginger"]

// The two products, in display order. Use this instead of re-hardcoding
// ["Bitters", "Ginger"] in selects and filters — only the `Product` TYPE existed
// before, so every consumer wrote the literals out again.
export const PRODUCTS: readonly Product[] = BOTH

// Canonical department names, in display order. Matches the departments seed
// row in the DB. Use this instead of re-hardcoding the list in components.
export const DEPARTMENTS = [
  "Blowing",
  "Alcohol and Blending",
  "Filling Line",
  "Packaging",
  "Concentrate",
] as const

export const RECORD_TYPES: RecordTypeDef[] = [
  // ── Blowing ───────────────────────────────────────────────────────────────
  {
    label: "Daily Records (Preform Usage)",
    departments: ["Blowing"],
    storage: { kind: "table", table: "blowing_daily_records" },
    products: [],
    compulsory: true,
    stockContinuity: true,
    continuityField: "closing_stock_bags",
  },
  // ── Alcohol and Blending ────────────────────────────────────────────────
  {
    label: "Daily Usage of Alcohol And Stock Level",
    departments: ["Alcohol and Blending"],
    storage: { kind: "stock", material: "alcohol" },
    products: [],
    compulsory: true,
    stockContinuity: true,
  },
  {
    label: "Daily Records for Alcohol and Blending",
    departments: ["Alcohol and Blending"],
    storage: { kind: "table", table: "alcohol_blending_daily_records" },
    products: ["Bitters"],
    compulsory: true,
    stockContinuity: false,
  },
  {
    label: "Ginger Production",
    departments: ["Alcohol and Blending"],
    storage: { kind: "table", table: "ginger_production_records" },
    products: [],
    compulsory: false,
    stockContinuity: false,
  },
  {
    label: "Extraction Monitoring Records",
    departments: ["Alcohol and Blending"],
    storage: { kind: "table", table: "extraction_monitoring_records" },
    products: ["Bitters"],
    compulsory: false,
    stockContinuity: false,
  },
  {
    label: "Caramel Stock",
    departments: ["Alcohol and Blending"],
    storage: { kind: "stock", material: "caramel" },
    products: BOTH,
    compulsory: false,
    stockContinuity: true,
  },
  // ── Filling Line ────────────────────────────────────────────────────────
  {
    label: "Filling Line Daily Records",
    departments: ["Filling Line"],
    storage: { kind: "table", table: "filling_line_daily_records" },
    products: BOTH,
    compulsory: true,
    stockContinuity: false,
  },
  {
    label: "Caps Stock",
    departments: ["Filling Line"],
    storage: { kind: "stock", material: "caps" },
    products: [],
    compulsory: true,
    stockContinuity: true,
  },
  {
    label: "Labels Stock",
    departments: ["Filling Line"],
    storage: { kind: "stock", material: "labels" },
    products: BOTH,
    compulsory: true,
    stockContinuity: true,
  },
  // ── Packaging ─────────────────────────────────────────────────────────────
  {
    label: "Packaging Daily Records",
    departments: ["Packaging"],
    storage: { kind: "table", table: "packaging_daily_records" },
    products: BOTH,
    compulsory: true,
    stockContinuity: false,
  },
  // ── Concentrate (+ shared with Alcohol and Blending) ──────────────────────
  {
    label: "Daily Records Alcohol For Concentrate",
    departments: ["Concentrate", "Alcohol and Blending"],
    storage: { kind: "table", table: "concentrate_alcohol_records" },
    products: [],
    compulsory: false,
    stockContinuity: false,
  },
  {
    label: "Herbs Stock",
    departments: ["Concentrate"],
    storage: { kind: "stock", material: "herb" },
    products: [],
    compulsory: false,
    stockContinuity: true,
  },
]

// ── Lookups ───────────────────────────────────────────────────────────────
const BY_LABEL = new Map(RECORD_TYPES.map((r) => [r.label, r]))

export function getRecordType(label: string): RecordTypeDef | undefined {
  return BY_LABEL.get(label)
}

export function recordTypesForDepartment(department: string): RecordTypeDef[] {
  const d = department.toLowerCase()
  return RECORD_TYPES.filter((r) => r.departments.some((x) => x.toLowerCase() === d))
}

export function compulsoryRecordTypes(department: string): RecordTypeDef[] {
  return recordTypesForDepartment(department).filter((r) => r.compulsory)
}

/** Every department that has at least one compulsory record type. */
export function departmentsWithCompulsory(): string[] {
  return [...new Set(RECORD_TYPES.filter((r) => r.compulsory).flatMap((r) => r.departments))]
}

/** True if `department` is allowed to submit `label`. */
export function departmentAllows(department: string, label: string): boolean {
  const def = getRecordType(label)
  if (!def) return false
  const d = department.toLowerCase()
  return def.departments.some((x) => x.toLowerCase() === d)
}
