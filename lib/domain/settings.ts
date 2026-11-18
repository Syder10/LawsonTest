import type { AppSettingsRow, ProductRecipeRow } from "@/lib/db/types"
import type { Product } from "@/lib/db/types"

// ============================================================================
// Operational settings — the numbers the business changes without a deploy.
//
// These were compile-time constants. They became editable because the production
// forecast drives every days-left projection: until a material has weeks of records a
// measured burn rate means nothing, so the projection falls back to what the plant
// SHOULD consume, derived from cartons produced. That figure moves with the business.
//
// Everything here is a plain value object with pure helpers, so the validation rules
// are testable without a database and the report routes can fall back to DEFAULTS when
// the table has not been migrated yet — a settings read failing must not blank out a
// stock dashboard.
// ============================================================================

/**
 * Unit conversions. Every NUMBER that feeds a calculation is here; the unit WORDS
 * ("drums", "boxes") stay in code, because they appear in entry-form labels and those
 * labels are the keys a submission is posted under — renaming one from a settings page
 * would orphan in-flight drafts and change what the submit route reads.
 */
export interface Conversions {
  bottlesPerCarton: number
  bottleLitres: number
  capsPerBottle: number
  labelsPerBottle: number
  stampsPerBottle: number
  preformsPerBottle: number
  drumLitres: number
  gallonLitres: number
  /** The 1000 L tank concentrate, juice and spices are made in. */
  tankLitres: number
  /** The 2500 L "Rambo" tank water is stored in. */
  ramboLitres: number
  capsPcsPerBox: number
  labelPcsPerRoll: number
  preformPcsPerBag: number
  stampPcsPerCoil: number
  stampCoilsPerBox: number
  tapePcsPerBox: number
  hairnetPacksPerBox: number
  nosemaskPacksPerBox: number
  glovesPacksPerBox: number
}

export interface RecipeLine {
  ingredient: string
  label: string
  /** Litres per carton — authoritative. The vessel only affects display. */
  litresPerCarton: number
}

export type Recipes = Record<Product, RecipeLine[]>

export interface ProductionSettings {
  /** Cartons produced per shift, per product. The mix is not even. */
  cartonsPerShift: Record<Product, number>
  shiftsPerDay: number
  /** Fraction (0.02 = 2%), applied to the bottle-level materials. */
  wasteAllowance: number
  /** Drums per day, stated by the business rather than derived from the recipe. */
  alcoholDrumsPerDay: number
  conversions: Conversions
  recipes: Recipes
}

export const DEFAULT_CONVERSIONS: Conversions = {
  bottlesPerCarton: 12,
  bottleLitres: 0.75,
  capsPerBottle: 1,
  labelsPerBottle: 1,
  stampsPerBottle: 1,
  preformsPerBottle: 1,
  drumLitres: 250,
  gallonLitres: 20,
  tankLitres: 1000,
  ramboLitres: 2500,
  capsPcsPerBox: 4000,
  labelPcsPerRoll: 4000,
  preformPcsPerBag: 1008,
  stampPcsPerCoil: 15_000,
  stampCoilsPerBox: 6,
  tapePcsPerBox: 24,
  hairnetPacksPerBox: 10,
  nosemaskPacksPerBox: 40,
  glovesPacksPerBox: 10,
}

/** Confirmed 2026-08-26. Each product's litres must sum to a carton — see below. */
export const DEFAULT_RECIPES: Recipes = {
  Bitters: [
    { ingredient: "alcohol", label: "Raw ethanol", litresPerCarton: 2.5 },
    { ingredient: "concentrate", label: "Concentrate extract", litresPerCarton: 2 },
    { ingredient: "water", label: "Water", litresPerCarton: 4.36 },
    { ingredient: "spices", label: "Spices", litresPerCarton: 0.1 },
    { ingredient: "caramel", label: "Caramel", litresPerCarton: 0.04 },
  ],
  Ginger: [
    { ingredient: "alcohol", label: "Raw ethanol", litresPerCarton: 2.7 },
    { ingredient: "gt_juice", label: "Ginger / Tiger Nut juice", litresPerCarton: 1.08 },
    { ingredient: "water", label: "Water", litresPerCarton: 5.1165 },
    { ingredient: "spices", label: "Spices", litresPerCarton: 0.09 },
    { ingredient: "caramel", label: "Caramel", litresPerCarton: 0.0135 },
  ],
}

/** Litres in one carton — what every recipe must sum to. */
export const cartonLitres = (c: Conversions): number => c.bottlesPerCarton * c.bottleLitres

/**
 * User-confirmed 2026-09-03: 3,000 cartons a shift split 2,500 Bitters / 500 Ginger,
 * three shifts, ~200 drums of alcohol a day. Waste is ZERO until a real rate is read
 * off the waste records — an invented allowance would move every reorder point.
 *
 * These are also the column defaults in 0006, so a fresh database and a codebase that
 * cannot reach the table agree.
 */
export const DEFAULT_SETTINGS: ProductionSettings = {
  cartonsPerShift: { Bitters: 2500, Ginger: 500 },
  shiftsPerDay: 3,
  wasteAllowance: 0,
  alcoholDrumsPerDay: 200,
  conversions: DEFAULT_CONVERSIONS,
  recipes: DEFAULT_RECIPES,
}

/** Cartons a day for one product. */
export const cartonsPerDay = (s: ProductionSettings, product: Product): number =>
  s.cartonsPerShift[product] * s.shiftsPerDay

/** Cartons a day across both products. */
export const totalCartonsPerDay = (s: ProductionSettings): number =>
  cartonsPerDay(s, "Bitters") + cartonsPerDay(s, "Ginger")

/** DB row → domain object. Percentages become fractions here, once. */
export function settingsFromRow(
  row: Partial<AppSettingsRow> | null | undefined,
  recipeRows?: ProductRecipeRow[] | null,
): ProductionSettings {
  if (!row) return DEFAULT_SETTINGS
  const num = (v: unknown, fallback: number) => {
    // PostgREST serialises numeric as a STRING, so Number() is not optional here —
    // "2500" * 3 is 7500 but "2500" + 3 is "25003", and one of those is a silent bug.
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number.NaN
    return Number.isFinite(n) ? n : fallback
  }
  const d = DEFAULT_CONVERSIONS
  return {
    cartonsPerShift: {
      Bitters: num(row.cartons_per_shift_bitters, DEFAULT_SETTINGS.cartonsPerShift.Bitters),
      Ginger: num(row.cartons_per_shift_ginger, DEFAULT_SETTINGS.cartonsPerShift.Ginger),
    },
    shiftsPerDay: num(row.shifts_per_day, DEFAULT_SETTINGS.shiftsPerDay),
    wasteAllowance: num(row.waste_allowance_pct, 0) / 100,
    alcoholDrumsPerDay: num(row.alcohol_drums_per_day, DEFAULT_SETTINGS.alcoholDrumsPerDay),
    // Per FIELD, so a column added by a migration that has not run yet (0007) falls
    // back on its own rather than discarding the forecast that HAS been read.
    conversions: {
      bottlesPerCarton: num(row.bottles_per_carton, d.bottlesPerCarton),
      bottleLitres: num(row.bottle_litres, d.bottleLitres),
      capsPerBottle: num(row.caps_per_bottle, d.capsPerBottle),
      labelsPerBottle: num(row.labels_per_bottle, d.labelsPerBottle),
      stampsPerBottle: num(row.stamps_per_bottle, d.stampsPerBottle),
      preformsPerBottle: num(row.preforms_per_bottle, d.preformsPerBottle),
      drumLitres: num(row.drum_litres, d.drumLitres),
      gallonLitres: num(row.gallon_litres, d.gallonLitres),
      tankLitres: num(row.tank_litres, d.tankLitres),
      ramboLitres: num(row.rambo_litres, d.ramboLitres),
      capsPcsPerBox: num(row.caps_pcs_per_box, d.capsPcsPerBox),
      labelPcsPerRoll: num(row.label_pcs_per_roll, d.labelPcsPerRoll),
      preformPcsPerBag: num(row.preform_pcs_per_bag, d.preformPcsPerBag),
      stampPcsPerCoil: num(row.stamp_pcs_per_coil, d.stampPcsPerCoil),
      stampCoilsPerBox: num(row.stamp_coils_per_box, d.stampCoilsPerBox),
      tapePcsPerBox: num(row.tape_pcs_per_box, d.tapePcsPerBox),
      hairnetPacksPerBox: num(row.hairnet_packs_per_box, d.hairnetPacksPerBox),
      nosemaskPacksPerBox: num(row.nosemask_packs_per_box, d.nosemaskPacksPerBox),
      glovesPacksPerBox: num(row.gloves_packs_per_box, d.glovesPacksPerBox),
    },
    recipes: recipesFromRows(recipeRows),
  }
}

/**
 * Recipe rows → the per-product lists. An EMPTY set means "not configured" (0007 not
 * applied), so the confirmed defaults stand — a plant with no recipe would otherwise
 * report zero caramel consumption and infinite cover.
 */
export function recipesFromRows(rows: ProductRecipeRow[] | null | undefined): Recipes {
  if (!rows || rows.length === 0) return DEFAULT_RECIPES
  const out: Recipes = { Bitters: [], Ginger: [] }
  for (const r of [...rows].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))) {
    const litres = typeof r.litres_per_carton === "string" ? Number(r.litres_per_carton) : r.litres_per_carton
    if (!Number.isFinite(litres)) continue
    out[r.product]?.push({ ingredient: r.ingredient, label: r.label, litresPerCarton: litres })
  }
  // A product with no rows keeps its default rather than becoming an empty recipe.
  return {
    Bitters: out.Bitters.length > 0 ? out.Bitters : DEFAULT_RECIPES.Bitters,
    Ginger: out.Ginger.length > 0 ? out.Ginger : DEFAULT_RECIPES.Ginger,
  }
}

/**
 * Validates a recipe set against the carton size, returning the first problem or null.
 *
 * THE INVARIANT: each product's ingredients must sum to exactly one carton. A recipe
 * that does not fill its carton is wrong by construction — this is the check that
 * caught the real error (Bitters concentrate coded as 2/900 instead of 2/1000, ~11%
 * out). It is enforced again by a trigger in 0007, because the database is the real
 * boundary; this exists so an administrator gets a sentence instead of a 23514.
 */
/**
 * An ingredient key is a code, not prose: it is half the primary key of
 * `product_recipes`, it is how `expectedDailyBurn` finds caramel, and it is matched
 * against the vessel registry in lib/domain/bom. Constrained so a typed-in name cannot
 * become a row nothing can look up.
 */
const INGREDIENT_KEY = /^[a-z][a-z0-9_]{0,39}$/

export function validateRecipes(recipes: Recipes, conversions: Conversions): string | null {
  const target = cartonLitres(conversions)
  if (!Number.isFinite(target) || target <= 0) return "A carton must hold more than zero litres."

  for (const product of ["Bitters", "Ginger"] as Product[]) {
    const lines = recipes[product]
    if (!lines || lines.length === 0) return `${product} has no recipe.`
    const seen = new Set<string>()
    for (const line of lines) {
      if (!INGREDIENT_KEY.test(line.ingredient)) {
        return `${product} — "${line.ingredient || "(blank)"}" is not a valid ingredient code: use lower-case letters, digits and underscores, starting with a letter.`
      }
      if (seen.has(line.ingredient)) return `${product} lists ${line.ingredient} twice.`
      seen.add(line.ingredient)
      if (!line.label.trim()) return `${product} — ${line.ingredient} needs a name.`
      if (!Number.isFinite(line.litresPerCarton) || line.litresPerCarton < 0) {
        return `${product} — ${line.label} must be zero or more litres.`
      }
    }
    // Round before comparing: 2.5 + 2 + 4.36 + 0.1 + 0.04 is 8.999999999999998 in
    // binary floating point, and rejecting a correct recipe would be worse than the
    // fourth decimal place mattering.
    const total = round4(lines.reduce((sum, l) => sum + l.litresPerCarton, 0))
    if (total !== round4(target)) {
      return `${product} sums to ${total} L per carton but a carton is ${round4(target)} L — adjust an ingredient (water is usually the remainder).`
    }
  }
  return null
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/** The editable shape the settings form posts. Percentages, as typed by the user. */
export interface SettingsInput {
  cartons_per_shift_bitters: number
  cartons_per_shift_ginger: number
  shifts_per_day: number
  waste_allowance_pct: number
  alcohol_drums_per_day: number
}

/** The conversions the form posts, as typed. */
export type ConversionsInput = Conversions

/**
 * Range + integrality rules for the conversions, mirroring the CHECKs in 0007. Counts
 * of physical pieces must be whole numbers; per-bottle counts and litres may be
 * fractional (half a litre of something per bottle is meaningful, half a cap is not).
 */
export const CONVERSION_FIELDS: Array<{
  key: keyof Conversions
  label: string
  min: number
  max: number
  integer: boolean
  group: "carton" | "perBottle" | "vessel" | "container" | "pack"
}> = [
  { key: "bottlesPerCarton", label: "Bottles per carton", min: 1, max: 96, integer: true, group: "carton" },
  { key: "bottleLitres", label: "Litres per bottle", min: 0.001, max: 20, integer: false, group: "carton" },
  { key: "capsPerBottle", label: "Caps per bottle", min: 0, max: 10, integer: false, group: "perBottle" },
  { key: "labelsPerBottle", label: "Labels per bottle", min: 0, max: 10, integer: false, group: "perBottle" },
  { key: "stampsPerBottle", label: "Tax stamps per bottle", min: 0, max: 10, integer: false, group: "perBottle" },
  { key: "preformsPerBottle", label: "Preforms per bottle", min: 0, max: 10, integer: false, group: "perBottle" },
  { key: "drumLitres", label: "Litres per alcohol drum", min: 1, max: 10_000, integer: false, group: "vessel" },
  { key: "gallonLitres", label: "Litres per caramel gallon", min: 1, max: 1000, integer: false, group: "vessel" },
  { key: "tankLitres", label: "Litres per mixing tank", min: 1, max: 100_000, integer: false, group: "vessel" },
  { key: "ramboLitres", label: "Litres per water (Rambo) tank", min: 1, max: 100_000, integer: false, group: "vessel" },
  { key: "capsPcsPerBox", label: "Caps per box", min: 1, max: 1_000_000, integer: true, group: "container" },
  { key: "labelPcsPerRoll", label: "Labels per roll", min: 1, max: 1_000_000, integer: true, group: "container" },
  { key: "preformPcsPerBag", label: "Preforms per bag", min: 1, max: 1_000_000, integer: true, group: "container" },
  { key: "stampPcsPerCoil", label: "Stamps per coil", min: 1, max: 1_000_000, integer: true, group: "pack" },
  { key: "stampCoilsPerBox", label: "Coils per stamp box", min: 1, max: 1000, integer: true, group: "pack" },
  { key: "tapePcsPerBox", label: "Seal tapes per box", min: 1, max: 100_000, integer: true, group: "pack" },
  { key: "hairnetPacksPerBox", label: "Hair-net packs per box", min: 1, max: 100_000, integer: true, group: "pack" },
  { key: "nosemaskPacksPerBox", label: "Nose-mask packs per box", min: 1, max: 100_000, integer: true, group: "pack" },
  { key: "glovesPacksPerBox", label: "Glove packs per box", min: 1, max: 100_000, integer: true, group: "pack" },
]

export function validateConversions(input: Conversions): string | null {
  for (const f of CONVERSION_FIELDS) {
    const value = input[f.key]
    if (!Number.isFinite(value)) return `${f.label} must be a number.`
    if (f.integer && !Number.isInteger(value)) return `${f.label} must be a whole number.`
    if (value < f.min || value > f.max) return `${f.label} must be between ${f.min} and ${f.max}.`
  }
  return null
}

/**
 * camelCase field ⇄ snake_case column, declared ONCE. The settings route writes these
 * columns and the admin form previews through the same `settingsFromRow` the report
 * routes use, so both need the mapping — and two copies of it is how a renamed column
 * gets saved on one side and read on the other.
 */
export const CONVERSION_COLUMNS: Record<keyof Conversions, keyof AppSettingsRow> = {
  bottlesPerCarton: "bottles_per_carton",
  bottleLitres: "bottle_litres",
  capsPerBottle: "caps_per_bottle",
  labelsPerBottle: "labels_per_bottle",
  stampsPerBottle: "stamps_per_bottle",
  preformsPerBottle: "preforms_per_bottle",
  drumLitres: "drum_litres",
  gallonLitres: "gallon_litres",
  tankLitres: "tank_litres",
  ramboLitres: "rambo_litres",
  capsPcsPerBox: "caps_pcs_per_box",
  labelPcsPerRoll: "label_pcs_per_roll",
  preformPcsPerBag: "preform_pcs_per_bag",
  stampPcsPerCoil: "stamp_pcs_per_coil",
  stampCoilsPerBox: "stamp_coils_per_box",
  tapePcsPerBox: "tape_pcs_per_box",
  hairnetPacksPerBox: "hairnet_packs_per_box",
  nosemaskPacksPerBox: "nosemask_packs_per_box",
  glovesPacksPerBox: "gloves_packs_per_box",
}

/** The conversions as database columns. */
export function conversionRow(c: Conversions): Partial<AppSettingsRow> {
  const row: Record<string, number> = {}
  for (const [field, column] of Object.entries(CONVERSION_COLUMNS)) {
    row[column] = c[field as keyof Conversions]
  }
  return row as Partial<AppSettingsRow>
}

/**
 * Ingredient codes that other calculations look up by name. A recipe is free not to
 * include one — but the consequence has to be visible, because a renamed line does not
 * fail, it silently reads as no consumption.
 */
export const LOAD_BEARING_INGREDIENTS: Array<{ ingredient: string; consequence: string }> = [
  {
    ingredient: "caramel",
    consequence:
      "caramel's expected daily use is read from the recipe line coded `caramel`; without it caramel shows no expected usage and falls back to whatever has been recorded",
  },
]

/** Non-blocking notes about a recipe set — things that are allowed but worth saying. */
export function recipeWarnings(recipes: Recipes): string[] {
  const out: string[] = []
  for (const product of ["Bitters", "Ginger"] as Product[]) {
    const codes = new Set((recipes[product] ?? []).map((l) => l.ingredient))
    for (const { ingredient, consequence } of LOAD_BEARING_INGREDIENTS) {
      if (!codes.has(ingredient)) out.push(`${product} has no "${ingredient}" line — ${consequence}.`)
    }
  }
  return out
}

export const SETTINGS_LIMITS = {
  cartonsPerShift: { min: 0, max: 100_000 },
  shiftsPerDay: { min: 1, max: 3 },
  wastePct: { min: 0, max: 50 },
  alcoholDrumsPerDay: { min: 0, max: 10_000 },
} as const

/**
 * Validates a settings submission, returning the first human-readable problem or null.
 *
 * Mirrors the CHECK constraints in 0006 deliberately: the database is the real
 * boundary, but a constraint violation surfaces as an opaque 23514 and this screen is
 * used by an administrator typing numbers, who deserves to be told which field is
 * wrong. Both exist on purpose — one for correctness, one for the human.
 */
export function validateSettings(input: SettingsInput): string | null {
  const { cartonsPerShift, shiftsPerDay, wastePct, alcoholDrumsPerDay } = SETTINGS_LIMITS
  const checks: Array<[string, number, { min: number; max: number }, boolean]> = [
    ["Bitters cartons per shift", input.cartons_per_shift_bitters, cartonsPerShift, true],
    ["Ginger cartons per shift", input.cartons_per_shift_ginger, cartonsPerShift, true],
    ["Shifts per day", input.shifts_per_day, shiftsPerDay, true],
    ["Waste allowance", input.waste_allowance_pct, wastePct, false],
    ["Alcohol drums per day", input.alcohol_drums_per_day, alcoholDrumsPerDay, false],
  ]

  for (const [label, value, range, integer] of checks) {
    if (!Number.isFinite(value)) return `${label} must be a number.`
    if (integer && !Number.isInteger(value)) return `${label} must be a whole number.`
    if (value < range.min || value > range.max) {
      return `${label} must be between ${range.min} and ${range.max}.`
    }
  }

  // A forecast of nothing would make every expected rate zero, which reads on screen as
  // "no usage" for every material — worse than a wrong number, because it looks calm.
  if (input.cartons_per_shift_bitters + input.cartons_per_shift_ginger === 0) {
    return "Total cartons per shift cannot be zero — the forecast is what days-left falls back on."
  }
  return null
}
