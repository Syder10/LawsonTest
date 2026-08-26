import { projectRunOut } from "@/lib/domain/operating-days"

// ============================================================================
// The ONE contract for a material's stock status.
//
// This exists because the two report routes drifted and broke the dashboard:
// /api/analytics/report emitted `daysLeft` while the manager UI read
// `operatingDaysLeft`, so the "Days left" column rendered NaN for every material
// and the urgency sort silently did nothing — the stock alerting looked healthy
// while being entirely dead. /api/procurement/report had the correct name, so the
// procurement page worked and the bug hid in plain sight.
//
// Both routes and both UIs now build and read rows through this module, so the
// field names cannot diverge again. It also absorbs the RED_DAYS/AMBER_DAYS
// thresholds and the level function, each of which was defined twice.
// ============================================================================

export type Level = "red" | "yellow" | "none"

/** ≤ ~1 working week of stock left. */
export const RED_DAYS = 6
/** ≤ ~2 working weeks of stock left. */
export const AMBER_DAYS = 12

/**
 * Urgency from operating days of stock remaining.
 * `null` days means no measurable usage in the window — not an alert, so "none".
 */
export function levelFromDays(days: number | null): Level {
  if (days === null) return "none"
  if (days <= RED_DAYS) return "red"
  if (days <= AMBER_DAYS) return "yellow"
  return "none"
}

/** Sort key: reds first, then ambers, then the rest. */
export const LEVEL_ORDER: Record<Level, number> = { red: 0, yellow: 1, none: 2 }

/**
 * Sort materials by urgency: worst level first, then soonest to run out.
 * Materials with no measurable usage (`operatingDaysLeft === null`) sort last.
 */
export function byUrgency(a: MaterialStatus, b: MaterialStatus): number {
  const byLevel = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
  if (byLevel !== 0) return byLevel
  return (a.operatingDaysLeft ?? Infinity) - (b.operatingDaysLeft ?? Infinity)
}

export interface MaterialStatus {
  /** Stable identifier, e.g. "alcohol", "labels_bitters". */
  key: string
  label: string
  unit: string
  remaining: number
  usedInWindow: number
  /** Consumption per OPERATING day (Mon–Sat), not per calendar day. */
  avgPerDay: number
  /** Operating days of stock left; null when there is no measurable usage. */
  operatingDaysLeft: number | null
  /** Projected calendar date stock hits zero; null if none or beyond the horizon. */
  runOutDate: string | null
  level: Level
}

/** Procurement tracks receipts and unit breakdowns on top of the base shape. */
export interface ProcurementMaterialStatus extends MaterialStatus {
  group: "procurement" | "production"
  receivedInWindow: number
  /** Human unit breakdown, e.g. "2 boxes · 3 coils · 400 pcs". Null when N/A. */
  breakdown: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Build a material status row, including the operating-day run-out projection.
 *
 * `fromISO` is the date the projection walks forward from (normally today).
 * Callers must pass operating days, not calendar days — use
 * operatingDaysBetween() from lib/domain/operating-days.
 */
export function buildMaterialStatus(input: {
  key: string
  label: string
  unit: string
  remaining: number
  usedInWindow: number
  operatingDaysInWindow: number
  fromISO: string
}): MaterialStatus {
  const ro = projectRunOut(input.remaining, input.usedInWindow, input.operatingDaysInWindow, input.fromISO)
  return {
    key: input.key,
    label: input.label,
    unit: input.unit,
    remaining: round2(input.remaining),
    usedInWindow: round2(input.usedInWindow),
    avgPerDay: ro.avgPerOperatingDay,
    operatingDaysLeft: ro.operatingDaysLeft,
    runOutDate: ro.runOutDate,
    level: levelFromDays(ro.operatingDaysLeft),
  }
}

/** The thresholds block both report routes return to the client. */
export const THRESHOLD_PAYLOAD = { redDays: RED_DAYS, amberDays: AMBER_DAYS } as const
