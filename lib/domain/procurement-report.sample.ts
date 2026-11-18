// ============================================================================
// SAMPLE DATA — NOT REAL FIGURES.
//
// Placeholder rows for the Procurement Stock Analysis Report, used by the unit
// tests. Every number below is made up to exercise a status branch (stockout,
// critical, monitor, adequate, no usage). None is taken from a real report, and
// nothing in the app renders this file — the page reads /api/procurement/report.
// ============================================================================

import type { ProcurementMaterialStatus } from "@/lib/domain/stock-status"
import type { Level } from "@/lib/domain/stock-status"

export function sampleRow(over: Partial<ProcurementMaterialStatus> & { key: string; label: string }): ProcurementMaterialStatus {
  return {
    unit: "pcs",
    remaining: 100,
    usedInWindow: 10,
    avgPerDay: 1,
    operatingDaysLeft: 100,
    runOutDate: null,
    burnDays: 10,
    sampleDays: 10,
    expectedPerDay: null,
    basis: "measured",
    level: "none" as Level,
    group: "production",
    receivedInWindow: 0,
    breakdown: null,
    ...over,
  }
}

/** One of every section and every status, in the order the route sends them. */
export const SAMPLE_MATERIALS: ProcurementMaterialStatus[] = [
  sampleRow({ key: "tax_stamp", label: "Tax Stamps", group: "procurement", remaining: 1000, operatingDaysLeft: 30 }),
  sampleRow({ key: "carton_bitters", label: "Cartons — Bitters", group: "procurement", remaining: 50, operatingDaysLeft: 3, level: "red" }),
  sampleRow({ key: "carton_ginger", label: "Cartons — Ginger", group: "procurement", remaining: 80, operatingDaysLeft: 8, level: "yellow" }),
  sampleRow({ key: "seal_tape", label: "Seal Tape", group: "procurement", remaining: 20, operatingDaysLeft: 40 }),
  sampleRow({ key: "hair_net", label: "Hair Nets", group: "procurement", unit: "packs" }),
  sampleRow({ key: "gloves", label: "Gloves", group: "procurement", unit: "packs" }),
  sampleRow({ key: "alcohol", label: "Alcohol", unit: "drums", remaining: 0, operatingDaysLeft: 0, level: "red" }),
  sampleRow({ key: "preforms", label: "Preforms", unit: "bags", remaining: 9, operatingDaysLeft: 2.25, level: "red" }),
  sampleRow({ key: "caps", label: "Caps", unit: "boxes", remaining: 7, operatingDaysLeft: 10, level: "yellow" }),
  sampleRow({ key: "labels_bitters", label: "Labels — Bitters", unit: "rolls", remaining: 5, operatingDaysLeft: null, level: "none" }),
]
