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

/**
 * The earliest date the system holds records for — a floor for history scans, so a
 * "missing submissions" sweep doesn't walk back through years that never existed.
 *
 * This is the one DEPLOYMENT fact in this file rather than a domain rule, and it was
 * previously copy-pasted into three separate routes (gaps, stats, mvp), which is
 * exactly how three files end up disagreeing about when the system went live. Change
 * it here if the real go-live date differs; a floor that is too early only costs a
 * wider query, while one that is too late hides real gaps.
 */
export const SYSTEM_START = "2026-04-01"

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

/** The month `now` falls in, as a plain calendar month. */
export function monthWindow(now: Date): MonthWindow {
  return windowFor(now.getUTCFullYear(), now.getUTCMonth())
}

/** The last COMPLETED calendar month. Rolls the year back correctly in January. */
export function previousMonthWindow(now: Date): MonthWindow {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  return m === 0 ? windowFor(y - 1, 11) : windowFor(y, m - 1)
}

/**
 * THE MONTH DOES NOT CLOSE AT MIDNIGHT.
 *
 * A Night shift is DATED BY THE DAY IT STARTED, so the shift that begins 21:00 on the
 * 31st is dated the 31st — and its on-time window is 04:00–05:30 the NEXT morning
 * (ON_TIME_WINDOWS.Night, applied a day later by onTimeWindowCloseFor). At 00:00 on
 * the 1st that supervisor has not merely failed to submit; they are not yet ALLOWED
 * to. Closing the month at midnight would judge it with its final rostered shift
 * still outstanding, and drop that shift's record into a month nobody is looking at.
 *
 * So the gamification month rolls over at 07:00 UTC on the 1st — 90 minutes after the
 * last Night window closes. Ghana is UTC+0, so that is 07:00 local.
 */
export const PERIOD_ROLLOVER_HOUR = 7

/** True during the hours of the 1st when last month is still open for submissions. */
export function isBeforeRollover(now: Date): boolean {
  return now.getUTCDate() === 1 && now.getUTCHours() < PERIOD_ROLLOVER_HOUR
}

/**
 * The month gamification currently counts as live — what the leaderboard shows.
 * Before the rollover on the 1st that is still LAST month, so a Night supervisor
 * submitting at 05:00 sees their record land on the board they were competing on.
 */
export function activeMonthWindow(now: Date): MonthWindow {
  return isBeforeRollover(now) ? previousMonthWindow(now) : monthWindow(now)
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
 * The MVP window: ALWAYS the month that has just finished, revealed at the rollover
 * on the 1st and shown for the first `MVP_BANNER_DAYS` days of the new month.
 *
 * The previous rule decided the MVP on the LAST DAY of the month it was judging —
 * before that day's Afternoon and Night shifts had submitted — and wrote the badge
 * at that moment. Whoever opened the app first triggered a permanent award from an
 * unfinished month, and the banner shown on the 1st could then name a different
 * person than the badge holder. Judging only a closed month removes the race: a row
 * submitted after its own shift window is backdated, so it never counts as on-time,
 * which means a finished month's on-time totals can no longer change.
 *
 * That is also why the reveal waits for PERIOD_ROLLOVER_HOUR rather than midnight —
 * see the note there. Revealing at 00:00 would announce a winner while the month's
 * last Night shift still had five hours to file.
 */
export function mvpWindow(now: Date): MvpWindow {
  const w = previousMonthWindow(now)
  return {
    ...w,
    show: now.getUTCDate() <= MVP_BANNER_DAYS && !isBeforeRollover(now),
    badge: `mvp_${w.year}_${w.month}`,
  }
}
