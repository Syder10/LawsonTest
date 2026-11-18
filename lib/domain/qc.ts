import type { QcCategory, QcStatus } from "@/lib/db/types"

export type { QcCategory, QcStatus }

export interface QcFieldDef {
  key: string
  label: string
  type: "number" | "text" | "select"
  unit?: string
  options?: readonly string[]
  required?: boolean
  numericPrecision?: number
}

export interface QcRecordTypeDef {
  key: string
  label: string
  category: QcCategory
  subgroup?: string
  fields: QcFieldDef[]
}

export const QC_CATEGORIES: { key: QcCategory; label: string }[] = [
  { key: "water", label: "Water Records" },
  { key: "product", label: "Product Records" },
  { key: "raw_materials", label: "Raw Materials Records" },
]

export const QC_RECORD_TYPES: Record<string, QcRecordTypeDef> = {
  // ── Water Records ──
  treated_water_ro: {
    key: "treated_water_ro",
    label: "Treated Water – Reverse Osmosis",
    category: "water",
    fields: [
      { key: "ph", label: "pH", type: "number", numericPrecision: 2, required: true },
      { key: "tds", label: "TDS", type: "number", unit: "ppm", numericPrecision: 1 },
      { key: "temperature", label: "Temperature", type: "number", unit: "°C", numericPrecision: 1 },
      { key: "colour", label: "Colour", type: "text" },
      { key: "taste", label: "Taste", type: "text" },
      { key: "conductivity_007", label: "Conductivity (007)", type: "number", unit: "µS/cm" },
      { key: "conductivity_008", label: "Conductivity (008)", type: "number", unit: "µS/cm" },
    ],
  },
  treated_water_blending: {
    key: "treated_water_blending",
    label: "Treated Water – Blending Water",
    category: "water",
    fields: [
      { key: "ph", label: "pH", type: "number", numericPrecision: 2, required: true },
      { key: "tds", label: "TDS", type: "number", unit: "ppm", numericPrecision: 1 },
      { key: "temperature", label: "Temperature", type: "number", unit: "°C", numericPrecision: 1 },
      { key: "colour", label: "Colour", type: "text" },
      { key: "taste", label: "Taste", type: "text" },
    ],
  },

  // ── Product Records: Alcoholic Beverages ──
  bitters: {
    key: "bitters",
    label: "Lawson De-Ray Bitters",
    category: "product",
    subgroup: "Alcoholic Beverages",
    fields: [
      { key: "batch_no", label: "Batch No.", type: "text", required: true },
      { key: "alcohol_percentage", label: "Alcohol percentage", type: "number", unit: "%", numericPrecision: 1, required: true },
      { key: "ph", label: "pH", type: "number", numericPrecision: 2, required: true },
      { key: "tds", label: "TDS", type: "number", unit: "ppm", numericPrecision: 1 },
      { key: "density", label: "Density", type: "number", unit: "g/mL", numericPrecision: 3 },
      { key: "temperature", label: "Temperature", type: "number", unit: "°C", numericPrecision: 1 },
      { key: "colour", label: "Colour", type: "text" },
      { key: "volume", label: "Volume", type: "text" },
      { key: "taste", label: "Taste", type: "text" },
    ],
  },
  ginger_liquor: {
    key: "ginger_liquor",
    label: "Lawson De-Ray Ginger Liquor",
    category: "product",
    subgroup: "Alcoholic Beverages",
    fields: [
      { key: "batch_no", label: "Batch No.", type: "text", required: true },
      { key: "alcohol_percentage", label: "Alcohol percentage", type: "number", unit: "%", numericPrecision: 1, required: true },
      { key: "ph", label: "pH", type: "number", numericPrecision: 2, required: true },
      { key: "tds", label: "TDS", type: "number", unit: "ppm", numericPrecision: 1 },
      { key: "density", label: "Density", type: "number", unit: "g/mL", numericPrecision: 3 },
      { key: "temperature", label: "Temperature", type: "number", unit: "°C", numericPrecision: 1 },
      { key: "settling_time", label: "Settling Time", type: "text" },
      { key: "colour", label: "Colour", type: "text" },
      { key: "volume", label: "Volume", type: "text" },
      { key: "taste", label: "Taste", type: "text" },
    ],
  },

  // ── Product Records: Herbal Products ──
  herbal_mixture: {
    key: "herbal_mixture",
    label: "Lawson Herbal Mixture",
    category: "product",
    subgroup: "Herbal Products",
    fields: [
      { key: "batch_no", label: "Batch No.", type: "text" },
      { key: "ph", label: "pH", type: "number", numericPrecision: 2, required: true },
      { key: "tds", label: "TDS", type: "number", unit: "ppm", numericPrecision: 1 },
      { key: "temperature", label: "Temperature", type: "number", unit: "°C", numericPrecision: 1 },
      { key: "viscosity", label: "Viscosity", type: "text" },
      { key: "saponings", label: "Saponings", type: "text" },
      { key: "colour", label: "Colour", type: "text" },
    ],
  },
  lawcare_mixture: {
    key: "lawcare_mixture",
    label: "Lawson LawCare Mixture",
    category: "product",
    subgroup: "Herbal Products",
    fields: [
      { key: "batch_no", label: "Batch No.", type: "text" },
      { key: "ph", label: "pH", type: "number", numericPrecision: 2, required: true },
      { key: "tds", label: "TDS", type: "number", unit: "ppm", numericPrecision: 1 },
      { key: "temperature", label: "Temperature", type: "number", unit: "°C", numericPrecision: 1 },
      { key: "viscosity", label: "Viscosity", type: "text" },
      { key: "saponings", label: "Saponings", type: "text" },
      { key: "colour", label: "Colour", type: "text" },
    ],
  },
  delayman_capsules: {
    key: "delayman_capsules",
    label: "Lawson DelayMan Capsules",
    category: "product",
    subgroup: "Herbal Products",
    fields: [
      { key: "batch_no", label: "Batch No.", type: "text" },
      { key: "ph", label: "pH", type: "number", numericPrecision: 2 },
      { key: "colour", label: "Colour", type: "text" },
      { key: "texture", label: "Texture", type: "text" },
      { key: "odour", label: "Odour", type: "text" },
      { key: "foreign_matter", label: "Foreign Matter", type: "text" },
      { key: "appearance", label: "Appearance", type: "text" },
    ],
  },

  // ── Raw Materials Records ──
  pet_preforms: {
    key: "pet_preforms",
    label: "PET Preforms",
    category: "raw_materials",
    fields: [
      { key: "appearance", label: "Appearance", type: "text" },
      { key: "weight", label: "Weight", type: "number", unit: "g", numericPrecision: 2 },
      { key: "neck_finish_thread", label: "Neck Finish & Thread", type: "text" },
      { key: "preform_length", label: "Preform Length", type: "number", unit: "mm", numericPrecision: 1 },
      { key: "neck_outer_diameter", label: "Neck Outer Diameter", type: "number", unit: "mm", numericPrecision: 1 },
      { key: "inner_diameter", label: "Inner Diameter", type: "number", unit: "mm", numericPrecision: 1 },
    ],
  },
  blown_bottles: {
    key: "blown_bottles",
    label: "Blown Bottles",
    category: "raw_materials",
    fields: [
      { key: "appearance", label: "Appearance", type: "text" },
      { key: "weight", label: "Weight", type: "number", unit: "g", numericPrecision: 2 },
      { key: "neck_finish_thread", label: "Neck Finish & Thread", type: "text" },
      { key: "neck_outer_diameter", label: "Neck Outer Diameter", type: "number", unit: "mm", numericPrecision: 1 },
      { key: "inner_diameter", label: "Inner Diameter", type: "number", unit: "mm", numericPrecision: 1 },
    ],
  },
  raw_ethanol: {
    key: "raw_ethanol",
    label: "Raw Ethanol",
    category: "raw_materials",
    fields: [
      { key: "alcohol_percentage", label: "Alcohol percentage", type: "number", unit: "%", numericPrecision: 1, required: true },
      { key: "ph", label: "pH", type: "number", numericPrecision: 2, required: true },
      { key: "tds", label: "TDS", type: "number", unit: "ppm", numericPrecision: 1 },
      { key: "temperature", label: "Temperature", type: "number", unit: "°C", numericPrecision: 1 },
      { key: "odour", label: "Odour", type: "text" },
      { key: "taste", label: "Taste", type: "text" },
      { key: "origin", label: "Origin", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "checked_by", label: "Checked By", type: "text" },
    ],
  },
}

export function getQcRecordType(key: string): QcRecordTypeDef | undefined {
  return QC_RECORD_TYPES[key]
}

export interface StandardEvaluationRule {
  lowerLimit: number | null
  upperLimit: number | null
  isInclusive: boolean
}

/**
 * Evaluates a numeric measurement against configured reference limits.
 * (§7 of specification)
 */
export function evaluateQcValue(
  value: number | null | undefined,
  rule?: StandardEvaluationRule | null,
): QcStatus {
  if (value === null || value === undefined || isNaN(value)) {
    return "incomplete"
  }
  if (!rule || (rule.lowerLimit === null && rule.upperLimit === null)) {
    return "standard_not_configured"
  }

  const { lowerLimit, upperLimit, isInclusive } = rule

  if (lowerLimit !== null) {
    if (isInclusive ? value < lowerLimit : value <= lowerLimit) {
      return "below_range"
    }
  }

  if (upperLimit !== null) {
    if (isInclusive ? value > upperLimit : value >= upperLimit) {
      return "above_range"
    }
  }

  return "in_range"
}

/**
 * Resolves the overall record-level status from individual parameter statuses.
 * Any Above Range, Below Range or Out of Range parameter flags the record.
 */
export function deriveOverallRecordStatus(statuses: QcStatus[]): QcStatus {
  if (statuses.length === 0) return "standard_not_configured"

  if (statuses.some((s) => s === "above_range" || s === "below_range" || s === "out_of_range")) {
    return "out_of_range"
  }
  if (statuses.some((s) => s === "incomplete")) {
    return "incomplete"
  }
  if (statuses.some((s) => s === "in_range")) {
    return "in_range"
  }
  if (statuses.some((s) => s === "not_evaluated")) {
    return "not_evaluated"
  }
  return "standard_not_configured"
}

export const QC_STATUS_CONFIG: Record<
  QcStatus,
  { label: string; badgeClass: string; textClass: string; dotClass: string }
> = {
  in_range: {
    label: "In Range",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    textClass: "text-emerald-700 dark:text-emerald-300",
    dotClass: "bg-emerald-500",
  },
  below_range: {
    label: "Below Range",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
    textClass: "text-blue-700 dark:text-blue-300",
    dotClass: "bg-blue-500",
  },
  above_range: {
    label: "Above Range",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
    textClass: "text-rose-700 dark:text-rose-300",
    dotClass: "bg-rose-500",
  },
  out_of_range: {
    label: "Flagged / Out of Range",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    textClass: "text-amber-700 dark:text-amber-300",
    dotClass: "bg-amber-500",
  },
  standard_not_configured: {
    label: "Standard Not Configured",
    badgeClass: "bg-surface-sunken text-ink-muted border-hairline",
    textClass: "text-ink-muted",
    dotClass: "bg-ink-muted",
  },
  not_evaluated: {
    label: "Not Evaluated",
    badgeClass: "bg-surface-sunken text-ink-muted border-hairline",
    textClass: "text-ink-muted",
    dotClass: "bg-ink-muted",
  },
  incomplete: {
    label: "Incomplete",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
    textClass: "text-amber-600 dark:text-amber-400",
    dotClass: "bg-amber-400",
  },
}

/** Formats a unique sequential reference: QC-YYYYMMDD-001 */
export function generateQcReference(dateStr: string, seq: number): string {
  const compactDate = dateStr.replace(/-/g, "")
  const padSeq = String(seq).padStart(3, "0")
  return `QC-${compactDate}-${padSeq}`
}
