import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { createAdminSupabase } from "@/lib/supabase/admin"
import { compulsoryRecordTypes } from "@/lib/domain/record-types"
import { fetchTypeRows, isValidOnTime, computeStreak, type EnvelopeRow } from "@/lib/domain/gamification"
import type { Shift } from "@/lib/db/types"
import {
  buildOnTimeWindowInfo,
  currentGhanaShift,
  expectedShiftForGroup,
  isDayOff,
  isEarlyBird,
  isBackdated,
} from "@/lib/shift-config"

const SYSTEM_START = "2026-04-01"
const SUBMISSION_MILESTONES = [50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000]
const STREAK_MILESTONES = [5, 10, 20, 30, 50, 100]

// Per-supervisor streak, badges, submission count, assigned shift + on-time
// window. Uses the admin client (privileged streak/badge writes on the user's
// behalf) and the shared record-type registry + shift-config rules.
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, profile } = auth.ctx
  const admin = createAdminSupabase()

  const dept = profile.department
  const group = profile.group_number
  const defs = dept ? compulsoryRecordTypes(dept) : []
  const now = new Date()

  const assignedShift = (dept && group ? (expectedShiftForGroup(dept, group, now) ?? "Morning") : "Morning") as Shift
  const { shiftDate: checkDate } = currentGhanaShift(now)
  const dayOff = isDayOff(dept, group, now)

  // The user's own rows for each compulsory type since system start.
  const rowsByDef = new Map<string, EnvelopeRow[]>()
  await Promise.all(
    defs.map(async (def) => {
      const all = await fetchTypeRows(admin, def, SYSTEM_START)
      rowsByDef.set(def.label, all.filter((r) => r.user_id === user.id))
    }),
  )
  const allUserRows = [...rowsByDef.values()].flat()
  const totalSubmissions = allUserRows.length

  const noCompulsory = defs.length === 0

  // ── Current-shift completion (all compulsory types on-time, or a no-work) ──
  // All of this user's no-work rows since system start (envelope-shaped): used by
  // both the current-shift check and the history-based streak.
  const { data: noWorkAll } = await admin
    .from("no_work_records")
    .select("date, created_at, shift, user_id, department, group_number, supervisor_name")
    .eq("user_id", user.id)
    .gte("date", SYSTEM_START)
  const noWorkRows = (noWorkAll ?? []) as EnvelopeRow[]

  const noWorkValidCurrent = noWorkRows.some(
    (r) => r.date === checkDate && r.shift === assignedShift && isValidOnTime(r),
  )

  let currentShiftComplete = false
  if (dayOff || noCompulsory) {
    // Free pass: a day off, or a department with no compulsory records (Concentrate).
    currentShiftComplete = true
  } else {
    const allOnTime = defs.every((def) =>
      (rowsByDef.get(def.label) ?? []).some(
        (r) => r.date === checkDate && r.shift === assignedShift && isValidOnTime(r),
      ),
    )
    currentShiftComplete = allOnTime || noWorkValidCurrent
  }

  // ── Streak — computed from submission history (Fix B) ──────────────────────
  // Counts consecutive complete rostered working days backward from today, so a
  // silently-missed day breaks it (the old lazily-incremented counter didn't).
  const currentStreak = computeStreak(rowsByDef, noWorkRows, dept, group, now)
  const { data: streakRow } = await admin
    .from("supervisor_streaks")
    .select("longest_streak")
    .eq("user_id", user.id)
    .maybeSingle()
  const longestStreak = Math.max(currentStreak, streakRow?.longest_streak ?? 0)
  // Persist the derived values (longest is the all-time high water mark).
  await admin.from("supervisor_streaks").upsert(
    { user_id: user.id, current_streak: currentStreak, longest_streak: longestStreak, last_shift_date: checkDate, last_shift_type: assignedShift },
    { onConflict: "user_id" },
  )

  // ── Badges ──────────────────────────────────────────────────────────────
  const { data: existing } = await admin.from("supervisor_badges").select("badge_type").eq("user_id", user.id)
  const earned = new Set((existing ?? []).map((b) => b.badge_type))
  const newBadges: { user_id: string; badge_type: string }[] = []
  const add = (t: string) => { if (!earned.has(t)) newBadges.push({ user_id: user.id, badge_type: t }) }

  for (const m of SUBMISSION_MILESTONES) if (totalSubmissions >= m) add(`submissions_${m}`)
  for (const m of STREAK_MILESTONES) if (currentStreak >= m) add(`streak_${m}`)
  if (totalSubmissions >= 1) add("first_submit")

  const validRows = allUserRows.filter(isValidOnTime)
  if (validRows.some((r) => r.shift === "Night")) add("night_owl")
  if (allUserRows.some((r) => !isBackdated(r.date, r.created_at, r.shift) && isEarlyBird(r.created_at, r.shift))) add("early_bird")
  if (totalSubmissions >= 3) {
    const shifts = new Set(validRows.map((r) => r.shift))
    if (shifts.has("Morning") && shifts.has("Afternoon") && shifts.has("Night")) add("all_rounder")
  }

  // Perfect week — every expected working day this week has an on-time set.
  if (!noCompulsory) {
    const weekStart = new Date(now)
    weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7))
    weekStart.setUTCHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString().slice(0, 10)
    const validDays = new Set<string>()
    for (const r of validRows) if (r.date >= weekStartStr && r.shift === assignedShift) validDays.add(r.date)
    // This group's ACTUAL working days this week (respects Night/Blending-Afternoon
    // Saturday-off), and how many have fully elapsed — not a hardcoded 5/6 (Fix A).
    let totalWorkDays = 0
    let workDaysElapsed = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setUTCDate(weekStart.getUTCDate() + i)
      if (isDayOff(dept, group, d)) continue
      totalWorkDays++
      if (d.getTime() <= now.getTime()) workDaysElapsed++
    }
    if (totalWorkDays > 0 && workDaysElapsed >= totalWorkDays && validDays.size >= totalWorkDays) add("perfect_week")
  }

  if (newBadges.length > 0) {
    await admin.from("supervisor_badges").upsert(newBadges, { onConflict: "user_id,badge_type" })
  }
  const { data: allBadges } = await admin
    .from("supervisor_badges")
    .select("badge_type, earned_at")
    .eq("user_id", user.id)
    .order("earned_at", { ascending: true })

  return NextResponse.json({
    currentStreak,
    longestStreak,
    currentShiftComplete,
    assignedShift,
    currentShift: currentGhanaShift(now).shift,
    totalSubmissions,
    department: dept,
    groupNumber: group,
    fullName: profile.full_name,
    badges: allBadges ?? [],
    dayOff,
    noCompulsory,
    onTimeWindow: buildOnTimeWindowInfo(now, assignedShift),
  })
}
