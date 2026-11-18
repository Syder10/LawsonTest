import {
  DEFAULT_SETTINGS,
  cartonLitres,
  type Conversions,
  type ProductionSettings,
} from "@/lib/domain/settings"
import type { Product } from "@/lib/db/types"

// ============================================================================
// Bill of materials — the ingredient recipe behind a carton.
//
// WHERE THE NUMBERS LIVE
// ----------------------
// The recipe itself (litres of each ingredient per carton) and every conversion
// are admin-editable in `app_settings` / `product_recipes` — see
// lib/domain/settings.ts. This module owns what is genuinely a fact about the
// plant rather than a preference: which VESSEL each ingredient is kept in, what
// that vessel is called, and how big a batch is mixed. It turns a configuration
// into the readings a dashboard needs.
//
// UNITS ARE THE WHOLE STORY HERE
// ------------------------------
// The plant measures each ingredient in the VESSEL it is stored or produced in,
// not in bare litres: ethanol by the 250 L drum, concentrate and spices by the
// 1000 L tank they are made in, water by the 2500 L "Rambo" tank, caramel by the
// 20 L gallon (a 20 L drum — NOT a US gallon).
//
// An earlier version stored those vessel fractions but labelled several of them
// "litres". So a factor of 4.36/2500 was correct as "Rambo tanks per carton" while
// reading as "4.36 litres of water", and the panel would have printed a number
// ~2500× too small against the wrong noun. Right number, wrong unit.
//
// So litres per carton is AUTHORITATIVE and the vessel count is derived, which
// means a mislabelling cannot silently change a quantity.
//
// SELF-CHECK: a recipe's ingredients must sum to exactly its carton. One that does
// not is wrong by construction — asserted in a test, validated on save, and
// enforced by a trigger in 0007.
// ============================================================================

/** The DEFAULT carton: 12 bottles × 750 mL. Both figures are editable. */
export const BOTTLES_PER_CARTON = DEFAULT_SETTINGS.conversions.bottlesPerCarton
export const BOTTLE_LITRES = DEFAULT_SETTINGS.conversions.bottleLitres
export const CARTON_LITRES = cartonLitres(DEFAULT_SETTINGS.conversions) // 9

/** A vessel the plant stores or produces an ingredient in. */
export interface Vessel {
  name: string
  /** Capacity in litres. */
  litres: number
}

export type VesselKind = "drum" | "tank" | "rambo" | "gallon"

/**
 * Vessel NAMES stay in code — they are the floor's own vocabulary. Capacities are
 * settings, so no name may contain one: "1000 L tank" would go stale the moment an
 * administrator re-tanked, and the display prints the litres alongside anyway.
 */
const VESSEL_NAME: Record<VesselKind, string> = {
  drum: "drum",
  tank: "mixing tank",
  rambo: "Rambo tank",
  /** A 20 L drum, called a "gallon" on the floor. Not 3.79 L. */
  gallon: "gallon",
}

const capacityOf = (kind: VesselKind, c: Conversions): number => {
  switch (kind) {
    case "drum":
      return c.drumLitres
    case "tank":
      return c.tankLitres
    case "rambo":
      return c.ramboLitres
    case "gallon":
      return c.gallonLitres
  }
}

export const vesselFor = (
  kind: VesselKind,
  conversions: Conversions = DEFAULT_SETTINGS.conversions,
): Vessel => ({ name: VESSEL_NAME[kind], litres: capacityOf(kind, conversions) })

/** The vessels at their default capacities, for display before settings are read. */
export const VESSEL: Record<VesselKind, Vessel> = {
  drum: vesselFor("drum"),
  tank: vesselFor("tank"),
  rambo: vesselFor("rambo"),
  gallon: vesselFor("gallon"),
}

/**
 * Which vessel each known ingredient is kept in. An ingredient an administrator adds
 * that is not listed here is shown in litres only: guessing a container would print a
 * vessel count that means nothing, which is the exact failure this module exists to
 * prevent.
 */
const VESSEL_KIND: Record<string, VesselKind> = {
  alcohol: "drum",
  concentrate: "tank",
  gt_juice: "tank",
  spices: "tank",
  water: "rambo",
  caramel: "gallon",
}

/** Ingredient codes with a known container, for the recipe editor to name. */
export const INGREDIENTS_WITH_VESSELS = Object.keys(VESSEL_KIND)

/**
 * Litres in one production batch — the volume a batch is mixed in, which is NOT a
 * vessel capacity: Bitters is mixed 900 L at a time in a 1000 L tank. Informational
 * (it drives one chip), so it stays in code while every quantity comes from the
 * recipe.
 */
export const BATCH_LITRES: Record<Product, number> = { Bitters: 900, Ginger: 1000 }

export interface BomIngredient {
  key: string
  label: string
  /** Litres consumed per carton — the authoritative number. */
  litresPerCarton: number
  /** The vessel this is ordered and stored in; null when it has no known container. */
  vessel: Vessel | null
}

export interface ProductBom {
  product: Product
  /** Litres in one carton, from the conversions this was built with. */
  cartonLitres: number
  /** Litres in one production batch. */
  batchLitres: number
  /** Cartons one batch yields (batchLitres ÷ cartonLitres). */
  cartonsPerBatch: number
  /** What the ingredients actually sum to. */
  totalLitres: number
  /** True when the recipe exactly fills its carton. */
  fillsCarton: boolean
  ingredients: BomIngredient[]
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/** The bill of materials implied by a configuration. */
export function bomFor(settings: ProductionSettings): Record<Product, ProductBom> {
  const target = cartonLitres(settings.conversions)
  const build = (product: Product): ProductBom => {
    const ingredients: BomIngredient[] = (settings.recipes[product] ?? []).map((line) => ({
      key: line.ingredient,
      label: line.label,
      litresPerCarton: line.litresPerCarton,
      vessel: Object.hasOwn(VESSEL_KIND, line.ingredient)
        ? vesselFor(VESSEL_KIND[line.ingredient], settings.conversions)
        : null,
    }))
    // Sum of decimals — round to kill float drift (4.36 + 2.5 + … = 8.999999).
    const totalLitres = round4(ingredients.reduce((s, i) => s + i.litresPerCarton, 0))
    return {
      product,
      cartonLitres: target,
      batchLitres: BATCH_LITRES[product],
      // NOT rounded: Bitters' 900 L divides into exactly 100 cartons, but Ginger's
      // 1000 L gives 111.1 — rounding that would silently misstate a batch's yield.
      cartonsPerBatch: target > 0 ? BATCH_LITRES[product] / target : 0,
      totalLitres,
      fillsCarton: totalLitres === round4(target),
      ingredients,
    }
  }
  return { Bitters: build("Bitters"), Ginger: build("Ginger") }
}

/** The bill of materials on the confirmed defaults — the fallback everywhere. */
export const PRODUCT_BOM: Record<Product, ProductBom> = bomFor(DEFAULT_SETTINGS)

// ── Derived reads ───────────────────────────────────────────────────────────

/** Vessel-fractions of an ingredient consumed per carton (e.g. 0.01 drums). */
export function vesselsPerCarton(ing: BomIngredient): number | null {
  return ing.vessel ? ing.litresPerCarton / ing.vessel.litres : null
}

/** Total litres the recipe accounts for. Should equal the carton size. */
export function recipeLitres(product: Product, bom: Record<Product, ProductBom> = PRODUCT_BOM): number {
  return bom[product].totalLitres
}

/** True when the recipe exactly fills a carton. */
export function recipeBalances(product: Product, bom: Record<Product, ProductBom> = PRODUCT_BOM): boolean {
  return bom[product].fillsCarton
}

export interface UsageLine {
  key: string
  label: string
  litres: number
  vessels: number | null
  vessel: Vessel | null
}

/**
 * Ingredient usage for a given number of cartons, in both litres and vessels.
 * Vessels are what procurement orders; litres are what the recipe specifies.
 */
export function estimateUsage(
  product: Product,
  cartons: number,
  bom: Record<Product, ProductBom> = PRODUCT_BOM,
): UsageLine[] {
  const round2 = (n: number) => Math.round(n * 100) / 100
  return bom[product].ingredients.map((i) => {
    const perCarton = vesselsPerCarton(i)
    return {
      key: i.key,
      label: i.label,
      litres: round2(i.litresPerCarton * cartons),
      vessels: perCarton === null ? null : Math.round(perCarton * cartons * 1000) / 1000,
      vessel: i.vessel,
    }
  })
}

/** Cartons one batch of `product` yields. */
export function cartonsPerBatch(product: Product, bom: Record<Product, ProductBom> = PRODUCT_BOM): number {
  return bom[product].cartonsPerBatch
}
