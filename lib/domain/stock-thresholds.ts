// ⚠️  NOT CURRENTLY IN USE. Alerts are driven by the days-based rule (≤6 / ≤12
// operating days left) in the analytics/procurement report routes — see
// lib/domain/operating-days.ts. This file preserves the PER-MATERIAL threshold
// table salvaged from the original system (each `red` ≈ one week of supply, in
// the material's DISPLAY unit — drums/boxes/bags/coils/gallons/pcs). It is kept
// as the starting point for "Level 2" (per-material reorder points): its values
// must be (1) confirmed as authoritative by the business and (2) converted from
// display units to the base units the new schema stores, before being wired in.

export const WEEK_DAYS = 6

export const THRESHOLDS: Record<string, { red: number; yellow: number }> = {
  alcohol: { red: 700, yellow: 1_400 }, // Drums
  caps: { red: 90, yellow: 180 }, // Boxes
  preforms: { red: 600, yellow: 1_200 }, // Bags
  labels_bitters: { red: 138, yellow: 276 }, // Coils
  labels_ginger: { red: 30, yellow: 60 }, // Coils
  caramel_bitters: { red: 48, yellow: 96 }, // Gallons
  caramel_ginger: { red: 6, yellow: 12 }, // Gallons
  cartons_bitters: { red: 45_000, yellow: 90_000 }, // Pcs
  cartons_ginger: { red: 9_000, yellow: 18_000 }, // Pcs
  tax_stamp: { red: 7, yellow: 14 }, // Boxes
}

export type AlertLevel = "red" | "yellow" | "none"

export function alertLevel(value: number, key: string): AlertLevel {
  const t = THRESHOLDS[key]
  if (!t) return "none"
  if (value <= t.red) return "red"
  if (value <= t.yellow) return "yellow"
  return "none"
}

/** Estimated days of stock remaining, based on the weekly (red) threshold. */
export function daysRemaining(remaining: number, key: string): number | null {
  const t = THRESHOLDS[key]
  if (!t || t.red <= 0) return null
  return Math.round((remaining / t.red) * WEEK_DAYS * 10) / 10
}
