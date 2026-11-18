import type { DonationRow, Product, Shift } from "@/lib/db/types"
import { PRODUCTS } from "@/lib/domain/record-types"
import { SHIFT_ORDER } from "@/lib/shift-config"
import { isReturnDate } from "@/lib/domain/product-returns"

export interface DonationInput {
  date: string
  shift: Shift
  product: Product
  cartons: number
  recipient: string
  remarks?: string | null
}

export type DonationDetail = Omit<DonationRow, "user_id">

export interface DonationTotal {
  product: Product
  cartons: number
  count: number
}

export interface DonationsReport {
  filters: { from: string; to: string }
  donations: DonationDetail[]
  totals: DonationTotal[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function validateDonation(input: unknown): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const body = isObject(input) ? input : {}

  if (!isReturnDate(body.date)) errors.date = "Pick a valid date for the day the shift started."
  if (!(SHIFT_ORDER as readonly unknown[]).includes(body.shift)) errors.shift = "Choose a shift."
  if (!(PRODUCTS as readonly unknown[]).includes(body.product as Product)) errors.product = "Choose a valid product."

  const n = body.cartons
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n >= 10_000_000_000) {
    errors.cartons = "Enter a carton quantity greater than zero."
  } else if (Math.abs(n * 100 - Math.round(n * 100)) > 0.0001) {
    errors.cartons = "Use at most two decimal places."
  }

  if (typeof body.recipient !== "string" || body.recipient.trim().length === 0) {
    errors.recipient = "Enter the recipient or event (e.g. Festival, Marketing, VIP)."
  }

  if (body.remarks != null && typeof body.remarks !== "string") {
    errors.remarks = "Remarks must be text."
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

export function toDonationDetail(
  row: Omit<DonationRow, "cartons"> & { cartons: number | string },
): DonationDetail {
  return {
    id: row.id,
    date: row.date,
    shift: row.shift,
    product: row.product,
    cartons: Number(row.cartons),
    recipient: row.recipient,
    remarks: row.remarks ?? null,
    created_at: row.created_at,
  }
}
