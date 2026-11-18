// Box → piece conversion constants for received raw materials / PPE.
// Previously copy-pasted across the procurement route and two procurement
// pages; centralised here.
//
// EVERY FIGURE BELOW IS A DEFAULT. The live values are admin-editable in
// `app_settings` (see lib/domain/settings.ts), so anything that reads settings should
// take the conversion from there and use these only as the fallback — one number, one
// source, with the constants standing in when the table cannot be reached.

import { DEFAULT_SETTINGS, type Conversions as SettingsConversions } from "@/lib/domain/settings"

const D = DEFAULT_SETTINGS.conversions

export const STAMP_COILS_PER_BOX = D.stampCoilsPerBox
export const STAMP_PCS_PER_COIL = D.stampPcsPerCoil
export const STAMP_PCS_PER_BOX = STAMP_COILS_PER_BOX * STAMP_PCS_PER_COIL // 90,000
export const TAPE_PCS_PER_BOX = D.tapePcsPerBox
export const HAIRNET_PACKS_PER_BOX = D.hairnetPacksPerBox
export const NOSEMASK_PACKS_PER_BOX = D.nosemaskPacksPerBox
export const GLOVES_PACKS_PER_BOX = D.glovesPacksPerBox

/** Pieces in one received box of stamps, for a given configuration. */
export const stampPcsPerBox = (c: SettingsConversions): number => c.stampCoilsPerBox * c.stampPcsPerCoil

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

/** Units per received box for the box-based materials, for a given configuration. */
export function pcsPerBoxFor(material: MaterialType, c: SettingsConversions): number {
  switch (material) {
    case "seal_tape":
      return c.tapePcsPerBox
    case "hair_net":
      return c.hairnetPacksPerBox
    case "nose_mask":
      return c.nosemaskPacksPerBox
    case "gloves":
      return c.glovesPacksPerBox
    default:
      return 1
  }
}

/** Units per received box on the defaults. Prefer `pcsPerBoxFor` where settings exist. */
export function pcsPerBox(material: MaterialType): number {
  return pcsPerBoxFor(material, D)
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

/** One drum of raw ethanol. The default — `Conversions.drumLitres` is the live value. */
export const DRUM_LITRES = D.drumLitres // 250
/** The 20 L drum the floor calls a "gallon". Also the BOM's caramel vessel. */
export const CARAMEL_GALLON_LITRES = D.gallonLitres // 20
/** User-confirmed 2026-08-31, and editable since. */
export const CAPS_PCS_PER_BOX = D.capsPcsPerBox
export const LABEL_PCS_PER_ROLL = D.labelPcsPerRoll
export const PREFORM_PCS_PER_BAG = D.preformPcsPerBag

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
 * How many of the secondary unit one container holds, for a given configuration.
 * The unit WORDS above are fixed in code (entry-form labels are built from them and
 * those labels key submissions); only the QUANTITIES are admin-editable.
 */
const eachQtyFor = (material: string, c: SettingsConversions): number | undefined => {
  switch (material) {
    case "alcohol": return c.drumLitres
    case "caps": return c.capsPcsPerBox
    case "labels": return c.labelPcsPerRoll
    case "caramel": return c.gallonLitres
    case "preform": return c.preformPcsPerBag
    default: return undefined
  }
}

/**
 * Row keys that don't match their material code. The dashboards and the ledger
 * disagree on the plural for preforms, so an exact-match lookup silently dropped the
 * unit on the procurement row — the same class of drift as the old
 * `cartons_bitters` / `carton_bitters` split.
 */
const KEY_ALIASES: Record<string, string> = { preforms: "preform" }

export const ledgerUnitFor = (
  key: string,
  conversions?: SettingsConversions,
): LedgerUnit | undefined => {
  const k = Object.hasOwn(KEY_ALIASES, key) ? KEY_ALIASES[key] : key
  // Dashboard rows are keyed per product or per variant — "labels_bitters",
  // "caramel_ginger", "herb_alligator_pepper" — so fall back to the material prefix
  // rather than silently losing the unit on exactly the rows that show it.
  const base = Object.hasOwn(LEDGER_UNITS, k)
    ? k
    : Object.keys(LEDGER_UNITS).find((m) => k === m || k.startsWith(`${m}_`))
  if (!base) return undefined

  const defaults = LEDGER_UNITS[base]
  if (!conversions || !defaults.each) return defaults
  const qty = eachQtyFor(base, conversions)
  return qty === undefined ? defaults : { unit: defaults.unit, each: { qty, unit: defaults.each.unit } }
}
