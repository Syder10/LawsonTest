// ============================================================================
// Operating calendar + stock run-out projection.
//
// The plant runs Monday–Saturday and is closed Sundays (see lib/shift-config
// for the full shift rules). Saturdays are lighter — standard departments run
// Morning + Afternoon, Blending runs Morning only, and there is no Night shift
// anywhere on Saturday — but for run-out projection every Mon–Sat still counts
// as ONE operating day. The measured daily burn already blends busy weekdays
// with lighter Saturdays into a single per-operating-day rate.
// ============================================================================

/** True for Mon–Sat; false on Sundays (plant closed). */
export function isOperatingDay(d: Date): boolean {
  return d.getUTCDay() !== 0
}

/** Count operating days (Mon–Sat) in [fromISO, toISO], inclusive. */
export function operatingDaysBetween(fromISO: string, toISO: string): number {
  const to = new Date(toISO + "T00:00:00Z")
  const d = new Date(fromISO + "T00:00:00Z")
  let count = 0
  while (d <= to) {
    if (isOperatingDay(d)) count++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return count
}

/**
 * How many operating days a usage sample actually COVERS: first day usage was
 * recorded → the end of the window (never past today).
 *
 * This is the denominator for the burn rate, and it is deliberately NOT "every
 * operating day in the filter window". Dividing by the whole window treats days with
 * no records as days of zero consumption, which they usually aren't — they are days
 * nobody has entered yet. On a 30-day window that is ~26 operating days, so a single
 * recorded day of usage produced a burn rate 26× too low and a days-left figure 26×
 * too high: 600 units against one 25-unit day read as 624 days of cover instead of 24.
 *
 * Measuring from the first recorded usage instead keeps genuine intermittency (a
 * material used twice a week over a month still spans ~26 days) while refusing to
 * treat an empty run-up as consumption data.
 */
export function usageSpanOperatingDays(usageDates: string[], windowEndISO: string, todayISO: string): number {
  if (usageDates.length === 0) return 0
  const first = usageDates.reduce((a, b) => (b < a ? b : a))
  const last = windowEndISO < todayISO ? windowEndISO : todayISO
  if (last < first) return operatingDaysBetween(first, first)
  return operatingDaysBetween(first, last)
}

/** Distinct dates in a list of usage dates — the sample size behind a projection. */
export function distinctDays(usageDates: string[]): number {
  return new Set(usageDates).size
}

export interface RunOut {
  /** Consumption per operating day (0 if no usage measured). */
  avgPerOperatingDay: number
  /** Operating days of stock left (null if there's no measurable usage). */
  operatingDaysLeft: number | null
  /** Calendar date stock is projected to hit zero (null if none / beyond horizon). */
  runOutDate: string | null
}

/**
 * Project when a material runs out.
 *   avgPerOperatingDay = usedInWindow / burnDays
 *   run-out date       = walk forward from `fromISO` over operating days,
 *                        skipping Sundays, until the balance hits zero.
 *
 * `burnDays` must be the operating days the usage sample COVERS — see
 * usageSpanOperatingDays. Passing every operating day in the filter window instead
 * silently understates the burn rate whenever records are sparse.
 *
 * Returns nulls when there is no usage, or when it lasts beyond `horizon` operating
 * days (i.e. "plenty — don't bother projecting a date").
 */
export function projectRunOut(
  remaining: number,
  usedInWindow: number,
  burnDays: number,
  fromISO: string,
  horizon = 180,
): RunOut {
  const avg = burnDays > 0 ? usedInWindow / burnDays : 0
  if (avg <= 0) return { avgPerOperatingDay: 0, operatingDaysLeft: null, runOutDate: null }

  const operatingDaysLeft = Math.round((remaining / avg) * 10) / 10

  let left = remaining
  let opDays = 0
  const d = new Date(fromISO + "T00:00:00Z")
  while (opDays < horizon) {
    if (isOperatingDay(d)) {
      left -= avg
      opDays++
      if (left <= 0) return { avgPerOperatingDay: Math.round(avg * 100) / 100, operatingDaysLeft, runOutDate: d.toISOString().slice(0, 10) }
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  // Lasts beyond the horizon — plenty of stock; skip the date.
  return { avgPerOperatingDay: Math.round(avg * 100) / 100, operatingDaysLeft, runOutDate: null }
}
