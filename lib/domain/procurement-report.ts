import { AMBER_DAYS, RED_DAYS, type ProcurementMaterialStatus } from "@/lib/domain/stock-status"
import type { Conversions } from "@/lib/domain/settings"
import { fmtOneDecimal } from "@/lib/domain/report-document"

// ============================================================================
// Procurement Stock Analysis Report — the rules behind the printed document.
//
// Nothing here invents a figure. Every status, days-left value and sentence is
// derived from the same /api/procurement/report rows the Stock dashboard reads:
//
//   • STATUS reuses the system's own urgency level (lib/domain/stock-status:
//     Critical at ≤ RED_DAYS operating days, Monitor at ≤ AMBER_DAYS), so the
//     report can never disagree with the dashboards. The only report-specific
//     state is Stockout, which is simply "nothing left".
//   • Cartons show DAYS left, not a percentage. "% left" has no stated basis in
//     this business (percent of what — the last delivery, the month's opening?),
//     and an invented denominator is worse than none.
//   • Tax-stamp boxes are counted on the admin-configured pack sizes, never a
//     hardcoded number.
// ============================================================================

/** The thresholds the report states. Re-exported so the page never hardcodes them. */
export const REPORT_THRESHOLDS = { criticalDays: RED_DAYS, monitorDays: AMBER_DAYS } as const

export type ReportStatus = "Stockout" | "Critical" | "Monitor" | "Adequate"

/**
 * The part of the /api/procurement/report response this document reads. The route
 * builds its response from a value of THIS type, so the two cannot drift.
 */
export interface ProcurementStockSnapshot {
  filters: { from: string; to: string }
  materials: ProcurementMaterialStatus[]
  /** Remaining tax stamps as full boxes plus loose pieces, on the configured pack sizes. */
  taxStamps: TaxStampCount
  thresholds: { redDays: number; amberDays: number }
  last_updated: string
}

export interface TaxStampCount {
  remainingPcs: number
  boxes: number
  /** Pieces left over after the full boxes — not the total in pieces. */
  pieces: number
}

type StatusInput = Pick<ProcurementMaterialStatus, "remaining" | "level">

/** Stockout when nothing is left; otherwise the system's own urgency level. */
export function reportStatus(m: StatusInput): ReportStatus {
  if (m.remaining <= 0) return "Stockout"
  if (m.level === "red") return "Critical"
  if (m.level === "yellow") return "Monitor"
  return "Adequate"
}

/** Stockout and Critical are the two statuses that need procurement now. */
export const isUrgent = (s: ReportStatus) => s === "Stockout" || s === "Critical"

/** Days left as the report states it: 0 for a stockout, null when there is no usage to project. */
export function reportDaysLeft(m: Pick<ProcurementMaterialStatus, "remaining" | "operatingDaysLeft">): number | null {
  if (m.remaining <= 0) return 0
  return m.operatingDaysLeft
}

/** "Critical (4.2 days left)", "Stockout (0 days left)", "Adequate (no usage recorded)". */
export function statusWithDays(m: ProcurementMaterialStatus): string {
  const status = reportStatus(m)
  const days = reportDaysLeft(m)
  if (days === null) return `${status} (no usage recorded)`
  return `${status} (${fmtOneDecimal(days)} day${days === 1 ? "" : "s"} left)`
}

// ── Which rows go in which section ──────────────────────────────────────────

const TAX_STAMP_KEY = "tax_stamp"
const isCartonKey = (key: string) => key.startsWith("carton_")
/**
 * PPE is issued to staff, not consumed by production, so it is not a "production
 * material" and is left out of the report, as it was on the paper template.
 */
const PPE_KEYS = new Set(["hair_net", "nose_mask", "gloves"])

export interface ReportSections {
  cartons: ProcurementMaterialStatus[]
  /** Production materials first, in the order the route sends them, then other consumables (seal tape). */
  materials: ProcurementMaterialStatus[]
  taxStamp: ProcurementMaterialStatus | null
}

export function splitReportSections(rows: ProcurementMaterialStatus[]): ReportSections {
  const cartons = rows.filter((m) => isCartonKey(m.key))
  const production = rows.filter((m) => m.group === "production")
  const otherConsumables = rows.filter(
    (m) => m.group !== "production" && !isCartonKey(m.key) && m.key !== TAX_STAMP_KEY && !PPE_KEYS.has(m.key),
  )
  return {
    cartons,
    materials: [...production, ...otherConsumables],
    taxStamp: rows.find((m) => m.key === TAX_STAMP_KEY) ?? null,
  }
}

// ── Tax stamps ──────────────────────────────────────────────────────────────

/** Full boxes plus loose pieces. A box is `stampCoilsPerBox` coils of `stampPcsPerCoil` stamps. */
export function stampBoxesAndPieces(
  remainingPcs: number,
  c: Pick<Conversions, "stampPcsPerCoil" | "stampCoilsPerBox">,
): TaxStampCount {
  const pcs = Math.max(0, Math.round(remainingPcs))
  const perBox = c.stampPcsPerCoil * c.stampCoilsPerBox
  if (!(perBox > 0)) return { remainingPcs: pcs, boxes: 0, pieces: pcs }
  return { remainingPcs: pcs, boxes: Math.floor(pcs / perBox), pieces: pcs % perBox }
}

// ── ATTENTION callout ───────────────────────────────────────────────────────

export interface Attention {
  label: string
  days: number
}

/**
 * The carton with the fewest days left, among those that are Stockout, Critical
 * or Monitor. Null — and the callout is hidden — when every carton is Adequate.
 */
export function cartonAttention(cartons: ProcurementMaterialStatus[]): Attention | null {
  let worst: Attention | null = null
  for (const c of cartons) {
    if (reportStatus(c) === "Adequate") continue
    const days = reportDaysLeft(c)
    if (days === null) continue
    if (!worst || days < worst.days) worst = { label: c.label, days }
  }
  return worst
}

// ── Priority actions ────────────────────────────────────────────────────────

export type ActionUrgency = "immediate" | "advance" | "routine"

export interface ReportAction {
  id: string
  text: string
  urgency: ActionUrgency
}

const URGENCY_RANK: Record<ActionUrgency, number> = { immediate: 0, advance: 1, routine: 2 }
const STATUS_RANK: Record<ReportStatus, number> = { Stockout: 0, Critical: 1, Monitor: 2, Adequate: 3 }

function byUrgencyThenDays(a: ProcurementMaterialStatus, b: ProcurementMaterialStatus): number {
  const s = STATUS_RANK[reportStatus(a)] - STATUS_RANK[reportStatus(b)]
  if (s !== 0) return s
  return (reportDaysLeft(a) ?? Infinity) - (reportDaysLeft(b) ?? Infinity)
}

const procureNow = (m: ProcurementMaterialStatus): ReportAction => ({
  id: `procure-${m.key}`,
  text: `Procure ${m.label} immediately.`,
  urgency: "immediate",
})

/**
 * Default actions, most urgent first:
 *   Stockout / Critical material → "Procure <item> immediately."
 *   Monitor material             → "Monitor <item> stock and place replenishment orders in advance."
 *   Tax stamps                   → "Monitor Tax Stamp stock and plan replenishment in advance."
 *   Cartons                      → "Continue monitoring carton consumption trends to maintain adequate stock levels."
 *
 * Cartons and tax stamps that are themselves Stockout or Critical get the
 * "procure immediately" line instead of the routine one — telling the office to
 * "continue monitoring … adequate stock" for a carton that has run out would be wrong.
 */
export function suggestActions(sections: ReportSections): ReportAction[] {
  const urgentRows = [...sections.materials, ...sections.cartons, ...(sections.taxStamp ? [sections.taxStamp] : [])]
    .filter((m) => isUrgent(reportStatus(m)))
    .sort(byUrgencyThenDays)

  const monitorRows = [...sections.materials]
    .filter((m) => reportStatus(m) === "Monitor")
    .sort(byUrgencyThenDays)

  const actions: ReportAction[] = [
    ...urgentRows.map(procureNow),
    ...monitorRows.map((m) => ({
      id: `monitor-${m.key}`,
      text: `Monitor ${m.label} stock and place replenishment orders in advance.`,
      urgency: "advance" as const,
    })),
  ]

  if (sections.taxStamp && !isUrgent(reportStatus(sections.taxStamp))) {
    actions.push({
      id: "monitor-tax-stamps",
      text: "Monitor Tax Stamp stock and plan replenishment in advance.",
      urgency: "advance",
    })
  }
  if (sections.cartons.length > 0 && !sections.cartons.some((c) => isUrgent(reportStatus(c)))) {
    actions.push({
      id: "monitor-cartons",
      text: "Continue monitoring carton consumption trends to maintain adequate stock levels.",
      urgency: "routine",
    })
  }

  return actions.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
}

const URGENT_WORD = /\bimmediately\b/i

/**
 * Urgency of a sentence the user typed or edited: "immediate" if it says
 * "immediately", otherwise what it was before (a new line defaults to routine).
 * An edited "procure … immediately" line that no longer says so drops to "advance".
 */
export function urgencyForText(text: string, previous: ActionUrgency = "routine"): ActionUrgency {
  if (URGENT_WORD.test(text)) return "immediate"
  return previous === "immediate" ? "advance" : previous
}

/**
 * Index of the action whose "immediately" is underlined in red: the first immediate
 * action, in the list order the user has arranged, that actually says "immediately".
 * -1 when there is none.
 */
export function mostUrgentIndex(actions: Pick<ReportAction, "urgency" | "text">[]): number {
  return actions.findIndex((a) => a.urgency === "immediate" && URGENT_WORD.test(a.text))
}

export interface TextSegment {
  text: string
  emphasis: boolean
}

/** Splits an action sentence so its urgency word ("immediately") can be set in bold. */
export function urgencySegments(text: string): TextSegment[] {
  return text
    .split(/(\bimmediately\b)/i)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, emphasis: /^immediately$/i.test(part) }))
}
