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
 *   avgPerOperatingDay = usedInWindow / operating days in that window
 *   run-out date       = walk forward from `fromISO` over operating days,
 *                        skipping Sundays, until the balance hits zero.
 * Returns nulls when there is no usage, or when it lasts beyond `horizon`
 * operating days (i.e. "plenty — don't bother projecting a date").
 */
export function projectRunOut(
  remaining: number,
  usedInWindow: number,
  operatingDaysInWindow: number,
  fromISO: string,
  horizon = 180,
): RunOut {
  const avg = operatingDaysInWindow > 0 ? usedInWindow / operatingDaysInWindow : 0
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
