import type { Product, Shift } from "@/lib/db/types"
import { FORM_FIELDS } from "@/lib/domain/form-config"
import {
  getRecordType,
  type ProductionTable,
  type StockMaterial,
} from "@/lib/domain/record-types"

// ============================================================================
// Pure, testable translation from a submitted form to a database row.
//
// Replaces the old submit route's global `fieldNameToColumn` map (which was
// keyed on label strings shared across forms, so collisions/typos silently
// dropped data). Here each field's column comes from FORM_FIELDS, scoped to the
// specific record type, and any unmapped field is reported (never silently
// lost). GENERATED columns are never written — the DB computes them.
// ============================================================================

export interface RecordEnvelopeInput {
  date: string
  shift: Shift
  group_number: number | null
  department: string
  supervisor_name: string | null
  user_id: string
  product?: Product | null
  variant?: string | null
}

export type RecordTarget =
  | { kind: "table"; table: ProductionTable }
  | { kind: "stock"; material: StockMaterial }

export interface BuiltRecord {
  target: RecordTarget
  row: Record<string, unknown>
  /** Field labels present in the submission that have no column mapping. */
  unmappedFields: string[]
}

export type BuildResult = { ok: true; built: BuiltRecord } | { ok: false; error: string }

function coerce(value: unknown, isNumber: boolean): unknown {
  if (isNumber) {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return value
}

export function buildRecordRow(
  recordType: string,
  env: RecordEnvelopeInput,
  formData: Record<string, unknown>,
): BuildResult {
  const def = getRecordType(recordType)
  if (!def) return { ok: false, error: `Unknown record type: ${recordType}` }

  const fields = FORM_FIELDS[recordType] ?? []
  const byLabel = new Map(fields.map((f) => [f.label, f]))

  const row: Record<string, unknown> = {
    date: env.date,
    shift: env.shift,
    group_number: env.group_number,
    department: env.department,
    supervisor_name: env.supervisor_name,
    user_id: env.user_id,
  }

  // Product, for record types filed per-product. Validated rather than merely
  // copied when present — mirroring the herb-variant check below.
  //
  // Silently omitting it was a real hazard: packaging_daily_records.product is
  // NOT NULL so the insert failed with a raw Postgres error, while
  // filling_line / labels / caramel accept NULL and would have stored a row that
  // is invisible to every per-product analytic AND occupies a different slot in
  // the one-record-per-(date,shift,product) uniqueness guard
  // (0004_records.sql).
  if (def.products.length > 0) {
    if (!env.product) {
      return {
        ok: false,
        error: `${recordType} must be filed for a product (${def.products.join(" or ")}).`,
      }
    }
    if (!def.products.includes(env.product)) {
      return {
        ok: false,
        error: `"${env.product}" is not a valid product for ${recordType} (expected ${def.products.join(" or ")}).`,
      }
    }
    row.product = env.product
  }

  // Stock records also carry the material (+ herb variant).
  if (def.storage.kind === "stock") {
    row.material = def.storage.material
    if (def.storage.material === "herb") {
      if (!env.variant) return { ok: false, error: "Herbs Stock requires a herb type." }
      row.variant = env.variant
    }
  }

  const unmappedFields: string[] = []
  for (const [label, raw] of Object.entries(formData)) {
    if (raw === "" || raw === null || raw === undefined) continue
    const field = byLabel.get(label)
    if (!field) {
      unmappedFields.push(label)
      continue
    }
    if (field.generated) continue // DB computes it — never write
    if (field.carried) continue // server-derived carried-forward balance — never write
    row[field.column] = coerce(raw, field.type === "number")
  }

  const target: RecordTarget =
    def.storage.kind === "table"
      ? { kind: "table", table: def.storage.table }
      : { kind: "stock", material: def.storage.material }

  return { ok: true, built: { target, row, unmappedFields } }
}

/** Validate required (non-generated) fields are present. Returns missing labels. */
export function missingRequiredFields(
  recordType: string,
  formData: Record<string, unknown>,
): string[] {
  const fields = FORM_FIELDS[recordType] ?? []
  return fields
    .filter((f) => f.required && !f.generated)
    .filter((f) => {
      const v = formData[f.label]
      return v === undefined || v === null || String(v).trim() === ""
    })
    .map((f) => f.label)
}
