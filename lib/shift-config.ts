/**
 * lib/shift-config.ts
 *
 * Single source of truth for:
 *   • On-time submission windows per shift
 *   • Weekly shift rotation (which group works which shift each week)
 *   • Saturday off rules
 *   • isOnTime / isEarlyBird helpers
 *   • buildOnTimeWindowInfo for the frontend countdown
 *
 * (Compulsory-record rules now live on the record-types registry —
 *  see `compulsory` / `compulsoryRecordTypes()` in lib/domain/record-types.ts.)
 *
 * Ghana is UTC+0 (GMT) — UTC hour === Ghana hour at all times.
 *
 * KEY DESIGN RULE:
 *   A supervisor's "shift" is determined by their group + department + week,
 *   NOT by what time it currently is. It stays fixed all week and flips on Monday.
 *   currentGhanaShift() is only used internally for streak/no-work date-keying.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shift chronological order (Morning → Afternoon → Night).
// Mirrors the DB shift_rank() function (0011_stock_counts.sql). This is the
// single JS source of truth for ordering shifts within a day — use it instead of
// re-hardcoding a ["Morning","Afternoon","Night"] literal.
// ─────────────────────────────────────────────────────────────────────────────
export const SHIFT_ORDER = ["Morning", "Afternoon", "Night"] as const

export const SHIFT_RANK: Record<string, number> = {
  Morning: 1,
  Afternoon: 2,
  Night: 3,
}

/** Chronological rank of a shift within a day (Morning=1, Afternoon=2, Night=3). */
export function shiftRank(shift: string): number {
  return SHIFT_RANK[shift] ?? 0
}

// ─────────────────────────────────────────────────────────────────────────────
// On-time submission windows  (Ghana / UTC)
//
//  Morning   shift ends 2:00 pm  → submit 1:00 pm – 2:30 pm  (13:00–14:30)
//  Afternoon shift ends 9:00 pm  → submit 8:00 pm – 9:30 pm  (20:00–21:30)
//  Night     shift ends 5:30 am  → submit 4:00 am – 5:30 am  (04:00–05:30)
// ─────────────────────────────────────────────────────────────────────────────
export const ON_TIME_WINDOWS: Record<
  string,
  { startHour: number; startMin: number; endHour: number; endMin: number }
> = {
  Morning:   { startHour: 13, startMin:  0, endHour: 14, endMin: 30 },
  Afternoon: { startHour: 20, startMin:  0, endHour: 21, endMin: 30 },
  Night:     { startHour:  4, startMin:  0, endHour:  5, endMin: 30 },
}

// Human-readable labels for the UI
export const ON_TIME_WINDOW_LABEL: Record<string, string> = {
  Morning:   "1:00 pm – 2:30 pm",
  Afternoon: "8:00 pm – 9:30 pm",
  Night:     "4:00 am – 5:30 am",
}

// ─────────────────────────────────────────────────────────────────────────────
// isWindowOpenNow — is the current time inside a shift's on-time window?
// (Ghana = UTC.) Used by the forms page banner.
// ─────────────────────────────────────────────────────────────────────────────
export function isWindowOpenNow(shift: string, now: Date = new Date()): boolean {
  const w = ON_TIME_WINDOWS[shift]
  if (!w) return false
  const min = now.getUTCHours() * 60 + now.getUTCMinutes()
  return min >= w.startHour * 60 + w.startMin && min <= w.endHour * 60 + w.endMin
}

// ─────────────────────────────────────────────────────────────────────────────
// isOnTime
// ─────────────────────────────────────────────────────────────────────────────
export function isOnTime(createdAt: string, shift: string): boolean {
  const d   = new Date(createdAt)
  const min = d.getUTCHours() * 60 + d.getUTCMinutes()
  const w   = ON_TIME_WINDOWS[shift]
  if (!w) return false
  return min >= w.startHour * 60 + w.startMin && min <= w.endHour * 60 + w.endMin
}

// ─────────────────────────────────────────────────────────────────────────────
// isEarlyBird — first 30 minutes of the on-time window
// ─────────────────────────────────────────────────────────────────────────────
export function isEarlyBird(createdAt: string, shift: string): boolean {
  const d   = new Date(createdAt)
  const min = d.getUTCHours() * 60 + d.getUTCMinutes()
  const w   = ON_TIME_WINDOWS[shift]
  if (!w) return false
  const start = w.startHour * 60 + w.startMin
  return min >= start && min < start + 30
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIFT-DATE CONVENTION — the most important dating rule in the system.
//
// A record is dated by the day its shift STARTED, never by the wall-clock day
// the supervisor happened to fill in the form.
//
// A Night shift that starts Thu 20/08 at 21:00 and closes Fri 21/08 at ~05:00 is
// dated 20/08. That way one calendar date holds exactly one Morning + one
// Afternoon + one Night submission per department — which is precisely what every
// downstream consumer already assumes:
//
//   • The derived stock ledger chains movements date → Morning → Afternoon →
//     Night (shift_rank, 0011_stock_counts.sql). A Night row dated 21/08 would
//     sort BEFORE that day's Morning row and corrupt every running balance.
//   • isDayOff/isSaturdayOff read "Night is off Saturday" as "no Night shift
//     STARTS on Saturday" — so the week's last Night shift starts Friday.
//   • The on-time window for Night (04:00–05:30) falls on the following calendar
//     morning, which isBackdated() forgives via its +1-day Night grace.
//
// NIGHT_ROLLOVER_HOUR is the boundary: before 06:00 we are still in the tail of
// the Night shift that began yesterday.
// ─────────────────────────────────────────────────────────────────────────────
export const NIGHT_ROLLOVER_HOUR = 6

/** ISO date (yyyy-mm-dd) `offsetDays` from `d`, in UTC (= Ghana local). */
function isoDay(d: Date, offsetDays = 0): string {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + offsetDays)
  return x.toISOString().split("T")[0]
}

/**
 * The date a record for `shift` belongs to, given the current moment.
 *
 * This is the canonical default for the date field on the submission forms. Use
 * it instead of `new Date().toISOString()`, which yields the WRONG day for a
 * Night shift being filed at 05:00 (it would say 21/08 for a shift that began
 * 20/08, splitting one working day across two dates).
 *
 *   shiftDateFor("Night",     21/08 04:30) -> "2026-08-20"   (started yesterday)
 *   shiftDateFor("Night",     20/08 21:30) -> "2026-08-20"
 *   shiftDateFor("Morning",   21/08 08:00) -> "2026-08-21"
 *   shiftDateFor("Afternoon", 21/08 20:15) -> "2026-08-21"
 */
export function shiftDateFor(shift: string, now: Date = new Date()): string {
  if (shift === "Night" && now.getUTCHours() < NIGHT_ROLLOVER_HOUR) {
    return isoDay(now, -1)
  }
  return isoDay(now)
}

// ─────────────────────────────────────────────────────────────────────────────
// currentGhanaShift
// Which shift is running right now, and the date that shift is keyed to (per the
// convention above). Used for streak date-keying and no-work record matching.
// Do NOT use this to decide what shift to DISPLAY to a supervisor — their shift
// is fixed for the week by the rotation; use expectedShiftForGroup() for that.
//
//  Morning:   06:00–13:59
//  Afternoon: 14:00–20:59
//  Night:     21:00–05:59  (wraps midnight; before 06:00 it is still yesterday's)
// ─────────────────────────────────────────────────────────────────────────────
export function currentGhanaShift(now: Date): { shift: string; shiftDate: string } {
  const hour = now.getUTCHours()
  // Before the rollover we are in the tail of the Night shift that began
  // yesterday, so it keeps yesterday's date.
  if (hour < NIGHT_ROLLOVER_HOUR) return { shift: "Night", shiftDate: isoDay(now, -1) }

  const dateStr = isoDay(now)
  if (hour < 14) return { shift: "Morning",   shiftDate: dateStr }
  if (hour < 21) return { shift: "Afternoon", shiftDate: dateStr }
  return { shift: "Night", shiftDate: dateStr }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shift rotation
//
// Anchor: Monday 2026-04-13 (rotation offset 0). Repeats every 3 weeks.
//
// Standard departments (Blowing, Filling Line, Packaging, Concentrate) — 3 groups:
//   offset 0: G1=Afternoon, G2=Night,     G3=Morning
//   offset 1: G1=Night,     G2=Morning,   G3=Afternoon
//   offset 2: G1=Morning,   G2=Afternoon, G3=Night
//
// Alcohol and Blending — 2 groups only (see BLENDING_ROTATION below):
//   offset 0: G1=Morning,   G2=Afternoon
//   offset 1: G1=Afternoon, G2=Morning
// ─────────────────────────────────────────────────────────────────────────────

// Monday 2026-04-13 00:00 UTC — anchor for offset 0
const ANCHOR_MONDAY_MS = 1776038400000 // 2026-04-13 00:00 UTC (Monday of anchor week)

/**
 * Returns 0, 1, or 2: which rotation week `date` falls in.
 * Resets to 0 every 3 weeks from the anchor Monday.
 */
export function weekRotationOffset(date: Date): 0 | 1 | 2 {
  const d   = new Date(date)
  const dow = d.getUTCDay() || 7        // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() - (dow - 1))  // roll back to Monday of this week
  d.setUTCHours(0, 0, 0, 0)
  const weeks = Math.round((d.getTime() - ANCHOR_MONDAY_MS) / (7 * 86_400_000))
  return (((weeks % 3) + 3) % 3) as 0 | 1 | 2
}

const STANDARD_ROTATION: Record<number, Record<number, string>> = {
  0: { 1: "Afternoon", 2: "Night",     3: "Morning"   },
  1: { 1: "Night",     2: "Morning",   3: "Afternoon"  },
  2: { 1: "Morning",   2: "Afternoon", 3: "Night"      },
}

// Blending only has groups 1 and 2, on a SEPARATE 2-week cycle independent of
// the 3-week global cycle. Anchor: Monday 2025-05-05 (offset 0 → G1=Morning,
// G2=Afternoon). Swaps every week: offset 1 → G1=Afternoon, G2=Morning.
const BLENDING_ANCHOR_MS = 1746403200000 // 2025-05-05 00:00 UTC (Monday)

function blendingOffset(date: Date): 0 | 1 {
  const d   = new Date(date)
  const dow = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - (dow - 1))
  d.setUTCHours(0, 0, 0, 0)
  const weeks = Math.round((d.getTime() - BLENDING_ANCHOR_MS) / (7 * 86_400_000))
  return (((weeks % 2) + 2) % 2) as 0 | 1
}

const BLENDING_ROTATION: Record<number, Record<number, string>> = {
  0: { 1: "Morning",   2: "Afternoon" },  // G1=Morning, G2=Afternoon
  1: { 1: "Afternoon", 2: "Morning"   },  // G1=Afternoon, G2=Morning
}

/**
 * Returns the rotation-assigned shift for a group during the week that
 * contains `date`. This is the shift that should be DISPLAYED to the
 * supervisor all week, regardless of current clock time.
 * Returns null if the group/department combination is unknown.
 */
export function expectedShiftForGroup(
  department: string,
  groupNumber: number,
  date: Date,
): string | null {
  const isBlend = department.toLowerCase() === "alcohol and blending"
  if (isBlend) {
    const offset = blendingOffset(date)   // 2-week cycle, independent anchor
    return BLENDING_ROTATION[offset]?.[groupNumber] ?? null
  }
  const offset = weekRotationOffset(date) // 3-week cycle for all other depts
  return STANDARD_ROTATION[offset]?.[groupNumber] ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Saturday off rules
//
//   • Night groups are OFF on Saturday for ALL departments (no Night shift runs
//     anywhere on Saturday).
//   • Alcohol and Blending's Afternoon group is also OFF on Saturday, so Blending
//     runs Morning only on Saturdays.
//   • All other departments' Morning AND Afternoon groups work Saturday.
//   • Sunday: everyone off.
// ─────────────────────────────────────────────────────────────────────────────
export function isSaturdayOff(department: string, groupNumber: number, date: Date): boolean {
  if (date.getUTCDay() !== 6) return false
  const assigned = expectedShiftForGroup(department, groupNumber, date)
  // Night groups are off on Saturday for ALL departments
  if (assigned === "Night") return true
  // Afternoon groups are off on Saturday ONLY for Alcohol and Blending
  // All other departments (Blowing, Filling Line, Packaging, Concentrate) work Saturday afternoon
  if (assigned === "Afternoon") return department.toLowerCase() === "alcohol and blending"
  // Morning groups work Saturday for all departments
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// buildOnTimeWindowInfo
//
// Returns the ISO open/close timestamps for the on-time window of a given shift
// on a given date. Used by the stats API so the frontend has exact timestamps
// for the countdown timer.
//
// The `forDate` param should be today's UTC date.
// For Night shift: the window is 04:00–05:30 on the FOLLOWING calendar day
// relative to when the night shift started (i.e. if it's currently evening,
// the window is tomorrow early morning).
// ─────────────────────────────────────────────────────────────────────────────
export interface OnTimeWindowInfo {
  shift:     string
  openIso:   string   // ISO timestamp — window opens
  closeIso:  string   // ISO timestamp — window closes (30-min warning triggers here - 30min)
  startHour: number
  startMin:  number
  endHour:   number
  endMin:    number
}

/**
 * ISO timestamp at which the on-time window CLOSES for `shift` on `recordDate`.
 *
 * Unlike buildOnTimeWindowInfo (which is relative to "now"), this is anchored to
 * a specific record date, so it can answer "has that day's window passed?" for
 * any day in history. For Night the window falls on the FOLLOWING calendar
 * morning, because a Night record is dated by the day its shift started — see
 * the SHIFT-DATE CONVENTION above.
 *
 *   onTimeWindowCloseFor("2026-08-20", "Morning") -> 2026-08-20T14:30:00Z
 *   onTimeWindowCloseFor("2026-08-20", "Night")   -> 2026-08-21T05:30:00Z
 */
export function onTimeWindowCloseFor(recordDate: string, shift: string): string {
  const w = ON_TIME_WINDOWS[shift]
  const d = new Date(recordDate + "T00:00:00Z")
  if (!w) {
    d.setUTCHours(23, 59, 59, 999)
    return d.toISOString()
  }
  if (shift === "Night") d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(w.endHour, w.endMin, 0, 0)
  return d.toISOString()
}

export function buildOnTimeWindowInfo(now: Date, assignedShift: string): OnTimeWindowInfo {
  const w = ON_TIME_WINDOWS[assignedShift]

  // Base: today UTC midnight
  const todayBase = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  let openMs  = todayBase + (w.startHour * 60 + w.startMin) * 60_000
  let closeMs = todayBase + (w.endHour   * 60 + w.endMin)   * 60_000

  // Night shift window is always 04:00–05:30 UTC
  // If it's currently evening (≥21:00), the window is tomorrow morning
  if (assignedShift === "Night" && now.getUTCHours() >= 21) {
    openMs  += 86_400_000
    closeMs += 86_400_000
  }

  return {
    shift:     assignedShift,
    openIso:   new Date(openMs).toISOString(),
    closeIso:  new Date(closeMs).toISOString(),
    startHour: w.startHour,
    startMin:  w.startMin,
    endHour:   w.endHour,
    endMin:    w.endMin,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared submission-timing helpers
//
// These were previously copy-pasted (verbatim) into the gamification routes —
// isBackdated appeared in stats, leaderboard, AND mvp; isDayOff/isWeekendOff in
// two of them. They live here now so there is one definition.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A record is "backdated" if the calendar day it was submitted FOR (`recordDate`)
 * differs from the Ghana calendar day it was actually created (`createdAt`).
 *
 * Night-shift exception: the on-time window (04:00–05:30) falls on the morning
 * AFTER the shift started, and the record's date is pinned to the shift's start
 * day — so a one-day gap for a Night record is expected and NOT backdated.
 */
export function isBackdated(recordDate: string, createdAt: string, shift: string): boolean {
  const createdDay = new Date(createdAt).toISOString().split("T")[0]
  if (recordDate === createdDay) return false

  if (shift === "Night") {
    const diffDays = Math.round(
      (new Date(createdDay + "T00:00:00Z").getTime() -
        new Date(recordDate + "T00:00:00Z").getTime()) /
        86_400_000,
    )
    if (diffDays === 1) return false
  }
  return true
}

/**
 * Whether a group is off on `date`: Sundays for everyone; Saturdays for the
 * rotation groups that don't work Saturday (see isSaturdayOff).
 */
export function isDayOff(department: string | null, groupNumber: number | null, date: Date): boolean {
  const dow = date.getUTCDay()
  if (dow === 0) return true
  if (dow === 6 && department && groupNumber) return isSaturdayOff(department, groupNumber, date)
  return false
}

/**
 * For a set of rows belonging to one compulsory record type + shift, returns
 * true if at least one row was submitted on-time and is not backdated.
 */
export function shiftOnTimeAndNotBackdated(
  rows: { created_at: string; date: string }[],
  shift: string,
): boolean {
  return rows.some((r) => !isBackdated(r.date, r.created_at, shift) && isOnTime(r.created_at, shift))
}
