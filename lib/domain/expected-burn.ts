import { ledgerUnitFor } from "@/lib/domain/materials"
import {
  DEFAULT_SETTINGS,
  cartonsPerDay,
  totalCartonsPerDay,
  type Conversions,
  type ProductionSettings,
} from "@/lib/domain/settings"
import type { Product } from "@/lib/db/types"

// ============================================================================
// Expected daily consumption, DERIVED from the production forecast.
//
// Why derived rather than a table of hand-kept numbers: a days-left projection is
// only as good as its burn rate, and a measured rate needs weeks of records before
// it means anything. Every material except alcohol and the herbs is consumed in a
// fixed ratio to cartons produced — one cap and one label per bottle, twelve bottles
// per carton, the BOM's litres of caramel, the packaging BOM's stamps — so one
// forecast figure plus ratios the business has already confirmed gives every material
// an expectation, and changing the forecast moves all of them together.
//
// USER-CONFIRMED (2026-09-03):
//   • 3,000 cartons per shift over three shifts, split 2,500 Bitters / 500 Ginger
//   • one label per bottle (body only), one cap per bottle, one stamp per bottle
//   • the expectation should allow for waste (rate still to come)
// ============================================================================

// The forecast now lives in app_settings (see lib/domain/settings.ts). These exports
// are the DEFAULTS — what a fresh database seeds and what the app falls back to if the
// settings row cannot be read, so a failed read degrades to the confirmed figures
// rather than to zero.
export const FORECAST_CARTONS_PER_SHIFT = DEFAULT_SETTINGS.cartonsPerShift
export const SHIFTS_PER_DAY = DEFAULT_SETTINGS.shiftsPerDay

// Per-bottle counts and the carton size are conversions now (admin-editable); these
// exports are the confirmed DEFAULTS the app falls back on.
export const CAPS_PER_BOTTLE = DEFAULT_SETTINGS.conversions.capsPerBottle
export const LABELS_PER_BOTTLE = DEFAULT_SETTINGS.conversions.labelsPerBottle
export const STAMPS_PER_BOTTLE = DEFAULT_SETTINGS.conversions.stampsPerBottle
export const PREFORMS_PER_BOTTLE = DEFAULT_SETTINGS.conversions.preformsPerBottle

/**
 * Stamps per carton, the rate the packaging ledger deducts. Every bottle is stamped,
 * so this is simply the bottles in a carton — it is exported because the DB seed
 * (packaging_bom) and the procurement route must not disagree with it.
 */
export const STAMPS_PER_CARTON_RATE =
  DEFAULT_SETTINGS.conversions.bottlesPerCarton * STAMPS_PER_BOTTLE

/** Stamps per carton for a given configuration — what the ledger should deduct. */
export const stampsPerCarton = (c: Conversions): number => c.bottlesPerCarton * c.stampsPerBottle

/**
 * Default extra bottle-level material for breakage and rejects, as a fraction.
 *
 * ZERO by default, and editable on the admin settings page: no waste rate has been
 * stated, and a plausible-looking 2% would quietly shift every reorder point. Blowing
 * records `waste_pcs` and filling records `bottles_wasted`/`bottles_rejected`, so the
 * real figure can be read off a full month and typed in.
 */
export const WASTE_ALLOWANCE = DEFAULT_SETTINGS.wasteAllowance

/** One carton box per carton produced. A box IS a carton in the plant's own words. */
const CARTON_BOXES_PER_CARTON = 1


/** Litres of an ingredient the configured recipe needs per carton of a product. */
function litresPerCarton(settings: ProductionSettings, product: Product, ingredient: string): number {
  return settings.recipes[product]?.find((i) => i.ingredient === ingredient)?.litresPerCarton ?? 0
}

/** Splits "caramel_bitters" into its material and product. */
function splitKey(key: string): { material: string; product: Product | null } {
  if (key.endsWith("_bitters")) return { material: key.slice(0, -8), product: "Bitters" }
  if (key.endsWith("_ginger")) return { material: key.slice(0, -7), product: "Ginger" }
  return { material: key, product: null }
}

/**
 * Expected consumption per operating day, in the unit the LEDGER counts (see
 * LEDGER_UNITS) — drums, boxes, rolls, gallons, bags, pieces. Null where there is no
 * defensible figure, in which case the projection stays with the measured rate.
 *
 * Alcohol is the one material NOT derived from cartons. The business states ~200 drums
 * a day, while the blending recipe accounts for about 94 at this output — the
 * difference is alcohol drawn for concentrate extraction and ginger production, which
 * the same ledger covers but the per-carton BOM does not. The stated figure therefore
 * wins over the derivation rather than being reconciled with it.
 */
export const ALCOHOL_DRUMS_PER_DAY = DEFAULT_SETTINGS.alcoholDrumsPerDay

export function expectedDailyBurn(
  key: string,
  settings: ProductionSettings = DEFAULT_SETTINGS,
): number | null {
  const { material, product } = splitKey(key)
  const c = settings.conversions
  // The container size comes from the same settings, so a changed pcs-per-box moves the
  // expectation and the balance together instead of one at a time.
  const perUnit = ledgerUnitFor(key, c)?.each?.qty ?? 1

  const cartonsFor = (p: Product | null) =>
    p ? cartonsPerDay(settings, p) : totalCartonsPerDay(settings)
  const bottlesFor = (p: Product | null) => cartonsFor(p) * c.bottlesPerCarton
  // Waste applies to the bottle-level materials only: a wasted bottle consumed a
  // preform, a cap and a label, but it never reached a carton box or a tax stamp.
  const withWaste = (n: number) => n * (1 + settings.wasteAllowance)

  switch (material) {
    case "alcohol":
      return settings.alcoholDrumsPerDay

    // One per bottle, counted in boxes/rolls of `perUnit` pieces.
    case "caps":
      return round(withWaste(bottlesFor(null) * c.capsPerBottle) / perUnit)
    case "labels":
      return round(withWaste(bottlesFor(product) * c.labelsPerBottle) / perUnit)
    case "preform":
    case "preforms":
      return round(withWaste(bottlesFor(null) * c.preformsPerBottle) / perUnit)

    // Recipe volumes, counted in 20 L gallons.
    case "caramel": {
      if (!product) return null
      return round((cartonsFor(product) * litresPerCarton(settings, product, "caramel")) / perUnit)
    }

    // One stamp per bottle, so the plant's whole bottle output.
    case "tax_stamp":
      return round(bottlesFor(null) * c.stampsPerBottle)
    case "carton":
      return round(cartonsFor(product) * CARTON_BOXES_PER_CARTON)

    // Herb sacks feed extraction, which has no per-carton recipe; PPE is issued to
    // people, not consumed by production. Neither has a rate worth inventing.
    default:
      return null
  }
}

const round = (n: number) => Math.round(n * 100) / 100
