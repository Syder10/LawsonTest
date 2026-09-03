// Box → piece conversion constants for received raw materials / PPE.
// Previously copy-pasted across the procurement route and two procurement
// pages; centralised here. (These are mirrored by the consumable_materials
// seed row values in the DB for reference/display.)

import { VESSEL } from "@/lib/domain/bom"

export const STAMP_COILS_PER_BOX = 6
export const STAMP_PCS_PER_COIL = 15_000
export const STAMP_PCS_PER_BOX = STAMP_COILS_PER_BOX * STAMP_PCS_PER_COIL // 90,000
export const TAPE_PCS_PER_BOX = 24
export const HAIRNET_PACKS_PER_BOX = 10
export const NOSEMASK_PACKS_PER_BOX = 40
export const GLOVES_PACKS_PER_BOX = 10

export type MaterialType =
  | "tax_stamp"
  | "carton_bitters"
  | "carton_ginger"
  | "seal_tape"
  | "hair_net"
  | "nose_mask"
  | "gloves"

export const PPE_TYPES: MaterialType[] = ["seal_tape", "hair_net", "nose_mask", "gloves"]

export const ALL_MATERIAL_TYPES: MaterialType[] = [
  "tax_stamp",
  "carton_bitters",
  "carton_ginger",
  "seal_tape",
  "hair_net",
  "nose_mask",
  "gloves",
]

/** Units per received box for the box-based materials. */
export function pcsPerBox(material: MaterialType): number {
  switch (material) {
    case "seal_tape":
      return TAPE_PCS_PER_BOX
    case "hair_net":
      return HAIRNET_PACKS_PER_BOX
    case "nose_mask":
      return NOSEMASK_PACKS_PER_BOX
    case "gloves":
      return GLOVES_PACKS_PER_BOX
    default:
      return 1
  }
}

// ============================================================================
// STOCK-LEDGER UNITS — what a supervisor counts, and what the number means.
//
// The ledger stores whatever unit is entered, so entry, storage and display have to
// agree. They did not for alcohol: the form asked for a bare "Quantity Used", the
// floor counts 250 L drums, and every dashboard captioned the result "litres". The
// arithmetic was consistent (drums in, drums out) so days-left was not wrong by 250×
// — but every figure on screen was mislabelled, and "600 litres of alcohol" reads as
// a rounding error for a plant this size rather than the two months of cover it is.
//
// Drums, not litres, is also how procurement buys and how a stock count is taken, so
// it is the honest primary unit. Litres are derived for display, never stored.
// ============================================================================

/** One drum of raw ethanol. Same constant the BOM uses — not a second opinion. */
export const DRUM_LITRES = VESSEL.drum.litres // 250
/** The 20 L drum the floor calls a "gallon". Also the BOM's caramel vessel. */
export const CARAMEL_GALLON_LITRES = VESSEL.gallon.litres // 20
/** User-confirmed 2026-08-31. */
export const CAPS_PCS_PER_BOX = 4000
export const LABEL_PCS_PER_ROLL = 4000
export const PREFORM_PCS_PER_BAG = 1008

export interface LedgerUnit {
  /** Unit a supervisor enters and the ledger stores. */
  unit: string
  /**
   * Optional derived secondary quantity, shown beside the primary figure: how much
   * one unit holds. Present only where the conversion is CONFIRMED — a container
   * whose contents nobody has stated stays a bare count, because inventing a factor
   * is how the alcohol mislabelling happened in the first place.
   */
  each?: { qty: number; unit: string }
}

/**
 * How the stock ledger counts each material. All four production materials are
 * counted in CONTAINERS, not pieces — which is why every one of these labels used to
 * be wrong: the form asked for a bare "Quantity Used" and the dashboards captioned
 * the result with whatever the seed row happened to say.
 *
 * Units and the counts per container are user-confirmed (2026-08-31). Where no `each`
 * is given the count was not stated — the unit is still correct and the figure still
 * honest, there is simply no second line to show. Herb sacks have no stated weight and
 * the user asked for none to be displayed.
 */
export const LEDGER_UNITS: Record<string, LedgerUnit> = {
  alcohol: { unit: "drums", each: { qty: DRUM_LITRES, unit: "litres" } },
  caps: { unit: "boxes", each: { qty: CAPS_PCS_PER_BOX, unit: "pcs" } },
  labels: { unit: "rolls", each: { qty: LABEL_PCS_PER_ROLL, unit: "pcs" } },
  caramel: { unit: "gallons", each: { qty: CARAMEL_GALLON_LITRES, unit: "litres" } },
  herb: { unit: "sacks" },
  preform: { unit: "bags", each: { qty: PREFORM_PCS_PER_BAG, unit: "pcs" } },
}

/**
 * Row keys that don't match their material code. The dashboards and the ledger
 * disagree on the plural for preforms, so an exact-match lookup silently dropped the
 * unit on the procurement row — the same class of drift as the old
 * `cartons_bitters` / `carton_bitters` split.
 */
const KEY_ALIASES: Record<string, string> = { preforms: "preform" }

export const ledgerUnitFor = (key: string): LedgerUnit | undefined => {
  const k = Object.hasOwn(KEY_ALIASES, key) ? KEY_ALIASES[key] : key
  if (Object.hasOwn(LEDGER_UNITS, k)) return LEDGER_UNITS[k]
  // Dashboard rows are keyed per product or per variant — "labels_bitters",
  // "caramel_ginger", "herb_alligator_pepper" — so fall back to the material prefix
  // rather than silently losing the unit on exactly the rows that show it.
  const base = Object.keys(LEDGER_UNITS).find((m) => k === m || k.startsWith(`${m}_`))
  return base ? LEDGER_UNITS[base] : undefined
}

/**
 * Expected consumption, for sanity-checking a measured burn rate.
 *
 * User-confirmed 2026-08-31: alcohol runs about 100 drums per shift, two production
 * shifts a day. This is NOT used to compute anything — it is shown beside the
 * measured rate so a figure that is wildly off reads as "check the entry" instead of
 * quietly driving a reorder decision.
 */
export const EXPECTED_DAILY_BURN: Record<string, number> = {
  alcohol: 200,
}

export const expectedDailyBurn = (key: string): number | null =>
  Object.hasOwn(EXPECTED_DAILY_BURN, key) ? EXPECTED_DAILY_BURN[key] : null
