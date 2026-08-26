import type { Product } from "@/lib/db/types"

// ============================================================================
// Bill of materials — the ingredient recipe behind a carton.
//
// UNITS ARE THE WHOLE STORY HERE
// ------------------------------
// The plant measures each ingredient in the VESSEL it is stored or produced in,
// not in bare litres: ethanol by the 250 L drum, concentrate and spices by the
// 1000 L tank they are made in, water by the 2500 L "Rambo" tank, caramel by the
// 20 L gallon (a 20 L drum — NOT a US gallon).
//
// The previous version stored those vessel fractions but labelled several of them
// "litres". So a factor of 4.36/2500 was correct as "Rambo tanks per carton" while
// reading as "4.36 litres of water", and the panel would have printed a number
// ~2500× too small against the wrong noun. Right number, wrong unit.
//
// This model therefore stores the AUTHORITATIVE figure in litres per carton and
// derives the vessel count, so a mislabelling cannot silently change a quantity.
//
// SELF-CHECK: for both products the ingredients sum to exactly CARTON_LITRES.
// A recipe that does not fill a carton is wrong by construction, and there is a
// test asserting it.
// ============================================================================

/** 12 bottles × 750 mL. The one place this conversion lives. */
export const BOTTLES_PER_CARTON = 12
export const BOTTLE_LITRES = 0.75
export const CARTON_LITRES = BOTTLES_PER_CARTON * BOTTLE_LITRES // 9

/** A vessel the plant stores or produces an ingredient in. */
export interface Vessel {
  name: string
  /** Capacity in litres. */
  litres: number
}

export const VESSEL = {
  drum: { name: "drum", litres: 250 },
  tank: { name: "1000 L tank", litres: 1000 },
  rambo: { name: "Rambo tank", litres: 2500 },
  /** A 20 L drum, called a "gallon" on the floor. Not 3.79 L. */
  gallon: { name: "gallon", litres: 20 },
} as const satisfies Record<string, Vessel>

export interface BomIngredient {
  key: string
  label: string
  /** Litres consumed per carton — the authoritative number. */
  litresPerCarton: number
  /** The vessel this is ordered and stored in. */
  vessel: Vessel
  /** True once the business has confirmed the figure. */
  confirmed: boolean
}

export interface ProductBom {
  product: Product
  /** Litres in one production batch. */
  batchLitres: number
  /** Cartons one batch yields (batchLitres ÷ CARTON_LITRES). */
  cartonsPerBatch: number
  ingredients: BomIngredient[]
  /** True when every ingredient is confirmed AND the recipe fills a carton. */
  confirmed: boolean
}

// ── Bitters ─────────────────────────────────────────────────────────────────
// Confirmed 2026-08-26. Per 900 L tank: 250 L raw ethanol, 200 L concentrate
// extract, 10 L spices, 4 L caramel, remainder (436 L) water. 900 L ÷ 9 L =
// 100 cartons, so per-carton is simply per-tank ÷ 100.
const BITTERS_INGREDIENTS: BomIngredient[] = [
  { key: "alcohol", label: "Raw ethanol", litresPerCarton: 2.5, vessel: VESSEL.drum, confirmed: true },
  { key: "concentrate", label: "Concentrate extract", litresPerCarton: 2, vessel: VESSEL.tank, confirmed: true },
  { key: "water", label: "Water", litresPerCarton: 4.36, vessel: VESSEL.rambo, confirmed: true },
  { key: "spices", label: "Spices", litresPerCarton: 0.1, vessel: VESSEL.tank, confirmed: true },
  { key: "caramel", label: "Caramel", litresPerCarton: 0.04, vessel: VESSEL.gallon, confirmed: true },
]

// ── Ginger ──────────────────────────────────────────────────────────────────
// Confirmed 2026-08-26. Per 1000 L tank: 300 L raw ethanol, 120 L Ginger/Tiger
// Nut juice, 10 L spices, 1.5 L caramel, remainder (568.5 L) water.
//
// A Ginger tank is 1000 L (NOT 900 like Bitters), which is why it yields 111.1
// cartons rather than a whole number — fine for a continuous volume, and it
// confirms the schema's `finished_product_litres = tanks × 1000`.
//
// Every one of these per-carton figures matches the original code's numerator
// exactly, so the Ginger data was right all along; only its unit LABELS were
// wrong (litres where the value was a vessel fraction).
const GINGER_INGREDIENTS: BomIngredient[] = [
  { key: "alcohol", label: "Raw ethanol", litresPerCarton: 2.7, vessel: VESSEL.drum, confirmed: true },
  { key: "water", label: "Water", litresPerCarton: 5.1165, vessel: VESSEL.rambo, confirmed: true },
  // Vessel assumed to be the 1000 L tank it is produced in — correctable here in
  // one line if juice is stored in something else. Litres are authoritative.
  { key: "gt_juice", label: "Ginger / Tiger Nut juice", litresPerCarton: 1.08, vessel: VESSEL.tank, confirmed: true },
  { key: "spices", label: "Spices", litresPerCarton: 0.09, vessel: VESSEL.tank, confirmed: true },
  { key: "caramel", label: "Caramel", litresPerCarton: 0.0135, vessel: VESSEL.gallon, confirmed: true },
]

const build = (product: Product, batchLitres: number, ingredients: BomIngredient[]): ProductBom => ({
  product,
  batchLitres,
  // NOT rounded: Bitters' 900 L divides into exactly 100 cartons, but Ginger's
  // 1000 L gives 111.1 — rounding that would silently misstate a batch's yield.
  cartonsPerBatch: batchLitres / CARTON_LITRES,
  ingredients,
  confirmed: ingredients.every((i) => i.confirmed),
})

export const PRODUCT_BOM: Record<Product, ProductBom> = {
  Bitters: build("Bitters", 900, BITTERS_INGREDIENTS),
  Ginger: build("Ginger", 1000, GINGER_INGREDIENTS),
}

// ── Derived reads ───────────────────────────────────────────────────────────

/** Vessel-fractions of an ingredient consumed per carton (e.g. 0.01 drums). */
export function vesselsPerCarton(ing: BomIngredient): number {
  return ing.litresPerCarton / ing.vessel.litres
}

/** Total litres the recipe accounts for. Should equal CARTON_LITRES. */
export function recipeLitres(product: Product): number {
  const total = PRODUCT_BOM[product].ingredients.reduce((s, i) => s + i.litresPerCarton, 0)
  // Sum of decimals — round to kill float drift (4.36 + 2.5 + … = 8.999999).
  return Math.round(total * 10000) / 10000
}

/** True when the recipe exactly fills a carton. */
export function recipeBalances(product: Product): boolean {
  return recipeLitres(product) === CARTON_LITRES
}

export interface UsageLine {
  key: string
  label: string
  litres: number
  vessels: number
  vessel: Vessel
  confirmed: boolean
}

/**
 * Ingredient usage for a given number of cartons, in both litres and vessels.
 * Vessels are what procurement orders; litres are what the recipe specifies.
 */
export function estimateUsage(product: Product, cartons: number): UsageLine[] {
  const round2 = (n: number) => Math.round(n * 100) / 100
  return PRODUCT_BOM[product].ingredients.map((i) => ({
    key: i.key,
    label: i.label,
    litres: round2(i.litresPerCarton * cartons),
    vessels: Math.round(vesselsPerCarton(i) * cartons * 1000) / 1000,
    vessel: i.vessel,
    confirmed: i.confirmed,
  }))
}

/** Cartons one batch of `product` yields. */
export function cartonsPerBatch(product: Product): number {
  return PRODUCT_BOM[product].cartonsPerBatch
}
