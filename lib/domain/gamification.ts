import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/db/types"
import { compulsoryRecordTypes, type RecordTypeDef } from "@/lib/domain/record-types"
import { isBackdated, isOnTime, expectedShiftForGroup, isDayOff, buildOnTimeWindowInfo } from "@/lib/shift-config"

// ============================================================================
// Shared gamification data-access + aggregation.
//
// Centralises the "query a record type's rows" logic (table vs consolidated
// stock_records) and the "which shifts were completed on-time" computation that
// the streak, leaderboard, and MVP routes all need. The on-time / backdate
// rules live in lib/shift-config (single source).
// ============================================================================

export type AdminClient = SupabaseClient<Database>

export interface EnvelopeRow {
  user_id: string | null
  department: string
  group_number: number | null
  date: string
  shift: string
  created_at: string
  supervisor_name: string | null
}

const ENVELOPE = "user_id, department, group_number, date, shift, created_at, supervisor_name"

export function storageTable(def: RecordTypeDef): string {
  return def.storage.kind === "table" ? def.storage.table : "stock_records"
}

/** Envelope rows for a record type within [gteDate, lteDate]. */
export async function fetchTypeRows(
  admin: AdminClient,
  def: RecordTypeDef,
  gteDate: string,
  lteDate?: string,
): Promise<EnvelopeRow[]> {
  // Dynamic table name — the one place we intentionally step outside the typed
  // table map, so the builder is treated loosely here.
  let q = (admin.from(storageTable(def)) as any).select(ENVELOPE).gte("date", gteDate)
  if (lteDate) q = q.lte("date", lteDate)
  if (def.storage.kind === "stock") q = q.eq("material", def.storage.material)
  const { data } = await q
  return (data ?? []) as EnvelopeRow[]
}

/**
 * Given, per compulsory record type, the set of shift-keys that had an on-time
 * non-backdated submission, return the keys that were complete — i.e. present
 * for EVERY compulsory record type of the key's department.
 *
 * `deptOfKey` extracts the department for a key so we know which compulsory set
 * to require (the key encodes dept for team scoring, or maps user→dept for MVP).
 */
export function completeShiftKeys(
  setsByLabel: Map<string, Set<string>>,
  deptOfKey: (key: string) => string | undefined,
): Set<string> {
  const allKeys = new Set<string>()
  for (const set of setsByLabel.values()) for (const k of set) allKeys.add(k)

  const complete = new Set<string>()
  for (const key of allKeys) {
    const dept = deptOfKey(key)
    if (!dept) continue
    const required = compulsoryRecordTypes(dept)
    if (required.length === 0) continue
    if (required.every((def) => setsByLabel.get(def.label)?.has(key))) complete.add(key)
  }
  return complete
}

/** True if this row is a valid on-time, non-backdated submission. */
export function isValidOnTime(row: EnvelopeRow): boolean {
  return !isBackdated(row.date, row.created_at, row.shift) && isOnTime(row.created_at, row.shift)
}

/**
 * True if the row's shift matches the shift its group was ROSTERED for on the
 * record's date. Prevents crediting a submission tagged for a shift the group
 * wasn't scheduled on (Fix D). Rows with no dept/group can't be checked → false.
 */
export function isRosteredShift(row: EnvelopeRow): boolean {
  if (!row.department || !row.group_number) return false
  const expected = expectedShiftForGroup(row.department, row.group_number, new Date(row.date + "T12:00:00Z"))
  return expected === row.shift
}

/** Valid on-time AND submitted for the group's rostered shift that day. */
export function isRosteredOnTime(row: EnvelopeRow): boolean {
  return isValidOnTime(row) && isRosteredShift(row)
}

/**
 * History-based streak (Fix B) — counts consecutive complete ROSTERED working
 * days backward from today, so a silently-missed day breaks the streak (unlike
 * the old lazily-incremented counter). A day is "complete" when every compulsory
 * record type for the department has a rostered, on-time, non-backdated row for
 * that group's rostered shift on that day, OR a valid no-work row.
 *
 *   rowsByLabel : compulsory-type label → the user's envelope rows.
 *   noWork      : the user's no_work rows (envelope-shaped).
 *   dept/group  : the supervisor's department + rotation group.
 *   now         : evaluation time.
 *
 * Day-off days are skipped (neither break nor extend). Today only counts once its
 * on-time window has closed AND it was completed; before that it's "pending" and
 * simply doesn't extend the streak yet (it never breaks it).
 */
export function computeStreak(
  rowsByLabel: Map<string, EnvelopeRow[]>,
  noWork: EnvelopeRow[],
  dept: string | null,
  group: number | null,
  now: Date,
): number {
  if (!dept || !group) return 0
  const required = compulsoryRecordTypes(dept)
  if (required.length === 0) return 0 // no compulsory work → no streak to track

  // Index valid rostered on-time rows by `${date}|${shift}` per compulsory label.
  const setsByLabel = new Map<string, Set<string>>()
  for (const def of required) {
    const set = new Set<string>()
    for (const r of rowsByLabel.get(def.label) ?? []) {
      if (isRosteredOnTime(r)) set.add(`${r.date}|${r.shift}`)
    }
    setsByLabel.set(def.label, set)
  }
  const noWorkKeys = new Set<string>()
  for (const r of noWork) if (isRosteredOnTime(r)) noWorkKeys.add(`${r.date}|${r.shift}`)

  const dayComplete = (dateStr: string): boolean => {
    const d = new Date(dateStr + "T12:00:00Z")
    const shift = expectedShiftForGroup(dept, group, d)
    if (!shift) return false
    const key = `${dateStr}|${shift}`
    if (noWorkKeys.has(key)) return true
    return required.every((def) => setsByLabel.get(def.label)?.has(key))
  }

  // Walk backward from today. Skip day-offs. Today is "pending" until its window
  // closes: if incomplete-but-window-open, don't break — start counting yesterday.
  let streak = 0
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todayStr = cursor.toISOString().slice(0, 10)
  for (let i = 0; i < 400; i++) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const off = isDayOff(dept, group, cursor)
    if (!off) {
      const complete = dayComplete(dateStr)
      if (complete) {
        streak++
      } else if (dateStr === todayStr) {
        const shift = expectedShiftForGroup(dept, group, cursor) ?? "Morning"
        const windowClosed = now.getTime() > new Date(buildOnTimeWindowInfo(now, shift).closeIso).getTime()
        if (windowClosed) break // today's window closed and incomplete → streak ended
        // else: today still pending, don't count or break — look at prior days
      } else {
        break // a past working day was missed → streak ends here
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

export interface DayGap {
  date: string
  shift: string
  /** Compulsory record-type labels still missing for that (date, rostered shift). */
  missingTypes: string[]
}

/**
 * Unresolved rostered working days that still need a submission (for the
 * "unsubmitted days" prompt). Walks every day from `fromISO` up to YESTERDAY
 * (today is handled by the normal flow), skipping day-offs. A day is a gap when,
 * for its rostered shift, at least one compulsory record type has NO row AND
 * there is no no-work row.
 *
 * Unlike the streak, presence here counts ANY row (a late/backfilled submission
 * resolves the gap — on-time is NOT required). Returned most-recent first.
 */
export function computeGaps(
  rowsByLabel: Map<string, EnvelopeRow[]>,
  noWork: EnvelopeRow[],
  dept: string | null,
  group: number | null,
  fromISO: string,
  now: Date,
): DayGap[] {
  if (!dept || !group) return []
  const required = compulsoryRecordTypes(dept)
  if (required.length === 0) return [] // Concentrate etc. — nothing compulsory

  const presence = new Map<string, Set<string>>()
  for (const def of required) {
    const set = new Set<string>()
    for (const r of rowsByLabel.get(def.label) ?? []) set.add(`${r.date}|${r.shift}`)
    presence.set(def.label, set)
  }
  const noWorkKeys = new Set<string>()
  for (const r of noWork) noWorkKeys.add(`${r.date}|${r.shift}`)

  const gaps: DayGap[] = []
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const cursor = new Date(fromISO + "T00:00:00Z")
  cursor.setUTCHours(0, 0, 0, 0)
  let guard = 0
  while (cursor.getTime() < today.getTime() && guard++ < 800) {
    const dateStr = cursor.toISOString().slice(0, 10)
    if (!isDayOff(dept, group, cursor)) {
      const shift = expectedShiftForGroup(dept, group, cursor)
      if (shift) {
        const key = `${dateStr}|${shift}`
        if (!noWorkKeys.has(key)) {
          const missing = required.filter((def) => !presence.get(def.label)?.has(key)).map((def) => def.label)
          if (missing.length > 0) gaps.push({ date: dateStr, shift, missingTypes: missing })
        }
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  gaps.reverse()
  return gaps
}
