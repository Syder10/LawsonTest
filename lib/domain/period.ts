/**
 * Monthly windows for the gamification screens.
 *
 * Both the leaderboard (live standings for the month in progress) and the MVP
 * banner (the winner of the month just finished) need calendar-month bounds, and
 * the MVP's TIMING is a rule with a right and a wrong answer — so it lives here as
 * pure, tested code rather than inline in a route.
 *
 * Ghana is UTC+0 and every record date is a UTC calendar date, so all arithmetic is
 * UTC. Using local time here would move month boundaries on a server in another
 * zone and silently attribute the first or last day of a month to the wrong one.
 */

/** Explicit names rather than toLocaleString: no dependency on the server's locale. */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

export interface MonthWindow {
  /** First day, YYYY-MM-DD. */
  start: string
  /** Last day, YYYY-MM-DD. */
  end: string
  /** e.g. "August 2026" */
  label: string
  year: number
  /** 1–12. */
  month: number
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

function windowFor(year: number, monthIndex: number): MonthWindow {
  return {
    start: iso(new Date(Date.UTC(year, monthIndex, 1))),
    // Day 0 of the next month IS the last day of this one, which also handles
    // February and leap years without a table.
    end: iso(new Date(Date.UTC(year, monthIndex + 1, 0))),
    label: `${MONTHS[monthIndex]} ${year}`,
    year,
    month: monthIndex + 1,
  }
}

/** The month `now` falls in — the leaderboard's live window. */
export function monthWindow(now: Date): MonthWindow {
  return windowFor(now.getUTCFullYear(), now.getUTCMonth())
}

/** The last COMPLETED month. Rolls the year back correctly in January. */
export function previousMonthWindow(now: Date): MonthWindow {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  return m === 0 ? windowFor(y - 1, 11) : windowFor(y, m - 1)
}

/** How many days into the new month the previous month's MVP is celebrated. */
export const MVP_BANNER_DAYS = 7

export interface MvpWindow extends MonthWindow {
  /** Whether the banner should be shown at all. */
  show: boolean
  /** supervisor_badges.badge_type for this month's award. */
  badge: string
}

/**
 * The MVP window: ALWAYS the month that has just finished, shown for the first
 * `MVP_BANNER_DAYS` days of the new one.
 *
 * The previous rule decided the MVP on the LAST DAY of the month it was judging —
 * before that day's Afternoon and Night shifts had submitted — and wrote the badge
 * at that moment. Whoever opened the app first triggered a permanent award from an
 * unfinished month, and the banner shown on the 1st could then name a different
 * person than the badge holder. Judging only a closed month removes the race: a row
 * submitted after its own shift window is backdated, so it never counts as on-time,
 * which means a finished month's on-time totals can no longer change.
 */
export function mvpWindow(now: Date): MvpWindow {
  const w = previousMonthWindow(now)
  return {
    ...w,
    show: now.getUTCDate() <= MVP_BANNER_DAYS,
    badge: `mvp_${w.year}_${w.month}`,
  }
}
