import type { Product } from "@/lib/db/types"

// ============================================================================
// Bill of materials — estimated raw-material usage per carton produced.
//
// These business-defined conversion factors were previously buried in the
// (now-removed) /api/analytics/kpis route. They are preserved here as a
// documented recipe: given a carton count, estimate how much of each input was
// consumed. Not currently surfaced on a dashboard, but kept because they encode
// real production ratios and are the basis for any future material-planning /
// forecasting view.
//
// NOTE: the stamps-per-carton and cartons-per-carton rates live in the DB
// `packaging_bom` table (they drive the DERIVED stamp/carton stock balance —
// consumption = cartons produced × rate, computed on read by stock_balance_core).
// The factors below are the softer input estimates (alcohol, concentrate,
// spices, caramel, water, GT juice) that are NOT tracked as discrete stock.
// ============================================================================

export interface CartonBom {
  /** Material key → { per-carton factor, unit } */
  [material: string]: { factor: number; unit: string }
}

export const BITTERS_BOM: CartonBom = {
  alcohol: { factor: 0.01, unit: "drums" },
  concentrate: { factor: 2 / 900, unit: "litres" },
  spices: { factor: 0.1 / 1000, unit: "litres" },
  caramel: { factor: 0.002, unit: "gallons" },
  water: { factor: 4.36 / 2500, unit: "litres" },
}

export const GINGER_BOM: CartonBom = {
  alcohol: { factor: 2.7 / 250, unit: "drums" },
  water: { factor: 5.1165 / 2500, unit: "litres" },
  gt_juice: { factor: 1.08, unit: "litres" },
  spices: { factor: 0.09 / 1000, unit: "litres" },
  caramel: { factor: 0.0135 / 20, unit: "gallons" },
}

export const CARTON_BOM: Record<Product, CartonBom> = {
  Bitters: BITTERS_BOM,
  Ginger: GINGER_BOM,
}

/** Estimated material usage for a given number of cartons of a product. */
export function estimateMaterialUsage(product: Product, cartons: number) {
  const bom = CARTON_BOM[product]
  return Object.fromEntries(
    Object.entries(bom).map(([material, { factor, unit }]) => [
      material,
      { amount: Math.round(cartons * factor * 100) / 100, unit },
    ]),
  )
}
