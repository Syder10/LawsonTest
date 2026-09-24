import type { Product } from "@/lib/db/types"
import { ledgerUnitFor } from "@/lib/domain/materials"

// ============================================================================
// STOCK MATERIAL REGISTRY — one descriptor per stock row key.
//
// The key -> { material, product } mapping and the label/unit for each stock
// material used to live in two places: the reconcile modal (ledgerTargetForKey)
// and the procurement report route. This is the single source both now read, so
// a new material or a renamed key is edited once (NFR-2).
//
// `kind` says HOW the number behind a row is derived, which decides what the
// detail page can show:
//   • "ledger"     — movements filed per shift in stock_records / blowing_daily_records.
//                    stock_ledger yields per-shift opening/remaining. Reconcilable.
//   • "derived"    — tax stamps & cartons. Balance is correct via stock_remaining_asof,
//                    but stock_ledger has no movement rows for them: receipts come from
//                    raw_materials_received and consumption is derived from production.
//                    Reconcilable.
//   • "consumable" — PPE. A running total in consumable_stock, received/issued through
//                    raw_materials_received. NOT reconciled through stock counts.
// ============================================================================

export type StockMaterialKind = "ledger" | "derived" | "consumable"

export interface StockMaterialDescriptor {
  /** Dashboard/report row key, and the URL segment of the detail page. */
  key: string
  /** Ledger / consumable material code (what the RPCs and stock_counts take). */
  material: string
  /** Product split for per-product materials, else null. */
  product: Product | null
  /** Herb variant, else null (no herb row is surfaced on these screens today). */
  variant: string | null
  label: string
  unit: string
  kind: StockMaterialKind
}

// The unit for a ledger material comes from the ledger-unit registry so it is not
// re-declared here (that drift is exactly what LEDGER_UNITS was created to stop).
// derived and consumable materials have no ledger-unit entry and carry their own.
const ledgerUnit = (material: string) => ledgerUnitFor(material)?.unit ?? "pcs"

export const STOCK_MATERIALS: StockMaterialDescriptor[] = [
  // Procurement receives these; the ledger derives their consumption from production.
  { key: "tax_stamp", material: "tax_stamp", product: null, variant: null, label: "Tax Stamps", unit: "pcs", kind: "derived" },
  { key: "carton_bitters", material: "carton", product: "Bitters", variant: null, label: "Cartons — Bitters", unit: "pcs", kind: "derived" },
  { key: "carton_ginger", material: "carton", product: "Ginger", variant: null, label: "Cartons — Ginger", unit: "pcs", kind: "derived" },
  // PPE: a running total via consumable_stock, not a derived ledger.
  { key: "seal_tape", material: "seal_tape", product: null, variant: null, label: "Seal Tape", unit: "pcs", kind: "consumable" },
  { key: "hair_net", material: "hair_net", product: null, variant: null, label: "Hair Nets", unit: "packs", kind: "consumable" },
  { key: "nose_mask", material: "nose_mask", product: null, variant: null, label: "Nose Masks", unit: "packs", kind: "consumable" },
  { key: "gloves", material: "gloves", product: null, variant: null, label: "Gloves", unit: "packs", kind: "consumable" },
  // Production materials: movements filed per shift, so the full derived ledger applies.
  { key: "alcohol", material: "alcohol", product: null, variant: null, label: "Alcohol", unit: ledgerUnit("alcohol"), kind: "ledger" },
  { key: "preforms", material: "preform", product: null, variant: null, label: "Preforms", unit: ledgerUnit("preform"), kind: "ledger" },
  { key: "caps", material: "caps", product: null, variant: null, label: "Caps", unit: ledgerUnit("caps"), kind: "ledger" },
  { key: "labels_bitters", material: "labels", product: "Bitters", variant: null, label: "Labels — Bitters", unit: ledgerUnit("labels"), kind: "ledger" },
  { key: "labels_ginger", material: "labels", product: "Ginger", variant: null, label: "Labels — Ginger", unit: ledgerUnit("labels"), kind: "ledger" },
  { key: "caramel_bitters", material: "caramel", product: "Bitters", variant: null, label: "Caramel — Bitters", unit: ledgerUnit("caramel"), kind: "ledger" },
  { key: "caramel_ginger", material: "caramel", product: "Ginger", variant: null, label: "Caramel — Ginger", unit: ledgerUnit("caramel"), kind: "ledger" },
]

// The manager dashboard keys cartons as cartons_*, procurement as carton_*. Fold the
// alias here so both entry points resolve to one descriptor.
const KEY_ALIASES: Record<string, string> = {
  cartons_bitters: "carton_bitters",
  cartons_ginger: "carton_ginger",
}

const BY_KEY = new Map(STOCK_MATERIALS.map((m) => [m.key, m]))

/** The descriptor for a row key (folding the cartons_* alias), or null if unknown. */
export function materialDescriptorForKey(key: string): StockMaterialDescriptor | null {
  const canonical = Object.hasOwn(KEY_ALIASES, key) ? KEY_ALIASES[key] : key
  return BY_KEY.get(canonical) ?? null
}

export function stockMaterialKeys(): string[] {
  return STOCK_MATERIALS.map((m) => m.key)
}

/** Everything but PPE re-anchors through stock counts, so everything but PPE is reconcilable. */
export function isReconcilable(d: StockMaterialDescriptor): boolean {
  return d.kind !== "consumable"
}
