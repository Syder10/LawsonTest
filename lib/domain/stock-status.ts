import { distinctDays, projectRunOut, usageSpanOperatingDays } from "@/lib/domain/operating-days"
import { expectedDailyBurn, ledgerUnitFor } from "@/lib/domain/materials"

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
  /** The unit the ledger counts in — what a supervisor entered (e.g. "drums"). */
  unit: string
  /**
   * Derived secondary quantity per unit, where the conversion is confirmed: 250 litres
   * per drum, 4,000 pcs per box of caps. Absent for a container whose contents nobody
   * has stated (label rolls, herb sacks) — an unstated factor is left unstated.
   */
  unitEach?: { qty: number; unit: string }
  remaining: number
  usedInWindow: number
  /** Consumption per OPERATING day (Mon–Sat), not per calendar day. */
  avgPerDay: number
  /** Operating days of stock left; null when there is no measurable usage. */
  operatingDaysLeft: number | null
  /** Projected calendar date stock hits zero; null if none or beyond the horizon. */
  runOutDate: string | null
  /** Operating days the burn rate was measured over (the sample's span). */
  burnDays: number
  /**
   * Distinct days that actually recorded usage. A projection from one or two days is
   * arithmetic, not a trend — the UI says so rather than presenting it as equal to a
   * month of data.
   */
  sampleDays: number
  /** Known normal consumption per day in `unit`, for a sanity check. Null if none. */
  expectedPerDay: number | null
  /**
   * Which rate the days-left projection actually used. "expected" means the records
   * were too thin or too far off a known normal to project from — the figure is honest
   * about that rather than dressing up two rows of test data as a trend.
   */
  basis: "measured" | "expected"
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

/** Fewer recorded days than this and a projection is flagged as provisional. */
export const MIN_SAMPLE_DAYS = 3

/**
 * Build a material status row, including the operating-day run-out projection.
 *
 * `usageDates` is every date on which consumption was recorded in the window (repeats
 * are fine — one entry per row is expected). The burn rate is measured over the span
 * those dates cover, NOT over the whole filter window: see usageSpanOperatingDays for
 * why, and for the 624-days-of-alcohol case that made it obvious.
 *
 * WHICH RATE THE PROJECTION USES. A measured rate is only worth trusting when there is
 * enough of it and it isn't absurd. Alcohol runs ~200 drums a day; a couple of test
 * rows measuring 25 produce a confident-looking figure that is eight times out. So when
 * the sample is thin (< MIN_SAMPLE_DAYS), or the measured rate contradicts a known
 * normal by more than 4×, or nothing was recorded at all, the projection falls back to
 * the expected rate and says so via `basis`. Where no expectation exists there is
 * nothing to fall back to, and a thin sample is reported as measured with its
 * `sampleDays` on show.
 *
 * `fromISO` is the date the projection walks forward from (normally today).
 */
export function buildMaterialStatus(input: {
  key: string
  label: string
  unit: string
  remaining: number
  usedInWindow: number
  usageDates: string[]
  /** The report window's end date. */
  windowEnd: string
  fromISO: string
}): MaterialStatus {
  const burnDays = usageSpanOperatingDays(input.usageDates, input.windowEnd, input.fromISO)
  const measured = projectRunOut(input.remaining, input.usedInWindow, burnDays, input.fromISO)
  const sampleDays = distinctDays(input.usageDates)
  const expectedPerDay = expectedDailyBurn(input.key)

  const thin = sampleDays < MIN_SAMPLE_DAYS
  const implausible = burnLooksImplausible({ avgPerDay: measured.avgPerOperatingDay, expectedPerDay })
  const useExpected = expectedPerDay !== null && (thin || implausible)

  // Projecting from an explicit rate: one "day" of exactly that much consumption.
  const projection = useExpected
    ? projectRunOut(input.remaining, expectedPerDay, 1, input.fromISO)
    : measured

  // The entry unit and its piece/litre equivalent come from the ledger-unit registry,
  // so one material cannot be captioned "litres" on one screen and "drums" on another.
  const ledger = ledgerUnitFor(input.key)
  return {
    key: input.key,
    label: input.label,
    unit: ledger?.unit ?? input.unit,
    ...(ledger?.each ? { unitEach: ledger.each } : {}),
    remaining: round2(input.remaining),
    usedInWindow: round2(input.usedInWindow),
    // Always the MEASURED rate: it is what the records say, and the point of showing it
    // beside the expectation is to make a bad entry visible.
    avgPerDay: measured.avgPerOperatingDay,
    operatingDaysLeft: projection.operatingDaysLeft,
    runOutDate: projection.runOutDate,
    burnDays,
    sampleDays,
    expectedPerDay,
    basis: useExpected ? "expected" : "measured",
    level: levelFromDays(projection.operatingDaysLeft),
  }
}

/**
 * Does the measured burn rate look like a data-entry problem rather than a fact?
 *
 * Only answerable where a normal rate is known (see EXPECTED_DAILY_BURN). The band is
 * deliberately wide — a quarter to four times expected — because production genuinely
 * swings, and a check that cries wolf gets ignored. What it catches is the order-of-
 * magnitude kind of mistake: litres typed where drums were meant, or a shift's usage
 * entered as a month's.
 */
export function burnLooksImplausible(row: Pick<MaterialStatus, "avgPerDay" | "expectedPerDay">): boolean {
  if (!row.expectedPerDay || row.avgPerDay <= 0) return false
  const ratio = row.avgPerDay / row.expectedPerDay
  return ratio < 0.25 || ratio > 4
}

/** The thresholds block both report routes return to the client. */
export const THRESHOLD_PAYLOAD = { redDays: RED_DAYS, amberDays: AMBER_DAYS } as const
