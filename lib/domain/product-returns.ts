import type { Product, ProductReturnRow, Shift } from "@/lib/db/types"
import { PRODUCTS } from "@/lib/domain/record-types"
import { SHIFT_ORDER } from "@/lib/shift-config"
import { DISPATCH_BRANCHES, type DispatchBranch } from "@/lib/domain/dispatch"

export { DISPATCH_BRANCHES, type DispatchBranch }

export interface ProductReturnLineInput {
  product: Product
  cartons?: number
  repackCartons?: number
  spoilageCartons?: number
}

export interface ProductReturnInput {
  date: string
  shift: Shift
  returnedFrom?: string | null
  driverName?: string | null
  vehicleReg?: string | null
  remarks?: string | null
  lines: ProductReturnLineInput[]
}

export type ProductReturnDetail = Omit<ProductReturnRow, "user_id">
export interface ProductReturnTotal {
  product: Product
  cartons: number
  repackCartons: number
  spoilageCartons: number
}
export interface ProductReturnsReport {
  filters: { from: string; to: string }
  returns: ProductReturnDetail[]
  totals: ProductReturnTotal[]
}

/** Calendar validation for record entry and return-history filters. */
export function isReturnDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Shared form/API rules. Zero means that product was not returned and is omitted. */
export function validateProductReturn(input: unknown): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const body = isObject(input) ? input : {}
  if (!isReturnDate(body.date)) errors.date = "Pick a valid date for the day the shift started."
  if (!(SHIFT_ORDER as readonly unknown[]).includes(body.shift)) errors.shift = "Choose a shift."
  for (const key of ["returnedFrom", "driverName", "vehicleReg", "remarks"]) {
    if (body[key] != null && typeof body[key] !== "string") errors[key] = "Enter text."
  }
  let positive = false
  const seen = new Set<string>()
  if (!Array.isArray(body.lines)) {
    errors.lines = "Enter the cartons returned for at least one product."
  } else {
    for (const line of body.lines) {
      if (!isObject(line) || !(PRODUCTS as readonly unknown[]).includes(line.product)) {
        errors.lines = "Choose a valid product."
        continue
      }
      const product = String(line.product)
      if (seen.has(product)) errors.lines = "Enter each product only once."
      seen.add(product)
      // Line may specify cartons, or repackCartons and spoilageCartons
      const repack = line.repackCartons
      const spoilage = line.spoilageCartons
      let n = line.cartons

      if (repack !== undefined && repack !== null) {
        if (typeof repack !== "number" || !Number.isFinite(repack) || repack < 0 || repack >= 10_000_000_000) {
          errors[`repack_${product}`] = "Enter a valid repack quantity of zero or more."
        } else if (Math.abs(repack * 100 - Math.round(repack * 100)) > 0.0001) {
          errors[`repack_${product}`] = "Use at most two decimal places."
        }
      }

      if (spoilage !== undefined && spoilage !== null) {
        if (typeof spoilage !== "number" || !Number.isFinite(spoilage) || spoilage < 0 || spoilage >= 10_000_000_000) {
          errors[`spoilage_${product}`] = "Enter a valid spoilage quantity of zero or more."
        } else if (Math.abs(spoilage * 100 - Math.round(spoilage * 100)) > 0.0001) {
          errors[`spoilage_${product}`] = "Use at most two decimal places."
        }
      }

      if (n === undefined && (repack !== undefined || spoilage !== undefined)) {
        n = (Number(repack) || 0) + (Number(spoilage) || 0)
      }

      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n >= 10_000_000_000) {
        errors[`cartons_${product}`] = "Enter a valid carton quantity of zero or more."
      } else if (Math.abs(n * 100 - Math.round(n * 100)) > 0.0001) {
        errors[`cartons_${product}`] = "Use at most two decimal places."
      } else if (n > 0) positive = true
    }
    if (!positive && !errors.lines) errors.lines = "Enter the cartons returned for at least one product."
  }
  return { ok: Object.keys(errors).length === 0, errors }
}

export function productReturnLinesToSend(lines: ProductReturnInput["lines"]): (ProductReturnLineInput & { cartons: number; repackCartons?: number; spoilageCartons?: number })[] {
  return lines
    .map((line) => {
      const hasSplit = line.repackCartons !== undefined || line.spoilageCartons !== undefined
      const repack = Number.isFinite(line.repackCartons) ? Number(line.repackCartons) : 0
      const spoilage = Number.isFinite(line.spoilageCartons) ? Number(line.spoilageCartons) : 0
      const cartons = Number.isFinite(line.cartons) ? Number(line.cartons) : repack + spoilage
      const res: ProductReturnLineInput & { cartons: number; repackCartons?: number; spoilageCartons?: number } = {
        product: line.product,
        cartons,
      }
      if (hasSplit) {
        res.repackCartons = repack
        res.spoilageCartons = spoilage
      }
      return res
    })
    .filter((line) => line.cartons > 0)
}

/** PostgREST numeric fields arrive as strings; coerce before rendering or adding. */
export function toProductReturnDetail(row: Omit<ProductReturnRow, "cartons" | "repack_cartons" | "spoilage_cartons"> & {
  cartons: number | string
  repack_cartons?: number | string | null
  spoilage_cartons?: number | string | null
}): ProductReturnDetail {
  const cartons = Number(row.cartons)
  const repack_cartons = row.repack_cartons != null ? Number(row.repack_cartons) : cartons
  const spoilage_cartons = row.spoilage_cartons != null ? Number(row.spoilage_cartons) : 0
  return {
    id: row.id,
    date: row.date,
    shift: row.shift,
    product: row.product,
    cartons,
    repack_cartons,
    spoilage_cartons,
    returned_from: row.returned_from,
    driver_name: row.driver_name ?? null,
    vehicle_reg: row.vehicle_reg ?? null,
    remarks: row.remarks,
    received_by: row.received_by,
    created_at: row.created_at,
  }
}
