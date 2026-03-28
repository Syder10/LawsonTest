import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// ── Compulsory records per department ──────────────────────────────────────
const COMPULSORY: Record<string, string[]> = {
  "Blowing":              ["blowing_daily_records"],
  "Packaging":            ["packaging_daily_records"],
  "Filling Line":         ["filling_line_daily_records", "caps_stock_records", "labels_stock_records"],
  "Alcohol and Blending": ["alcohol_stock_level_records", "alcohol_blending_daily_records"],
}

// ── Ghana is UTC+0 (GMT). Supabase timestamps are UTC. UTC hour = Ghana hour ─
//
// On-time window = the 1-hour grace period AFTER shift ends:
//   Morning   ends 14:00 → on-time if submitted 14:00–14:59 GMT
//   Afternoon ends 21:00 → on-time if submitted 21:00–21:59 GMT
//   Night     ends 05:00 → on-time if submitted 05:00–05:59 GMT

function isOnTime(createdAt: string, shift: string): boolean {
  const d    = new Date(createdAt)
  const hour = d.getUTCHours()          // Ghana hour (UTC = GMT+0)
  if (shift === "Morning")   return hour === 14            // 14:00–14:59
  if (shift === "Afternoon") return hour === 21            // 21:00–21:59
  if (shift === "Night")     return hour === 5             // 05:00–05:59
  return false
}

// Early Bird: submitted within 30 min after shift end
function isEarlyBird(createdAt: string, shift: string): boolean {
  const d      = new Date(createdAt)
  const hour   = d.getUTCHours()
  const minute = d.getUTCMinutes()
  if (shift === "Morning")   return hour === 14 && minute < 30
  if (shift === "Afternoon") return hour === 21 && minute < 30
  if (shift === "Night")     return hour === 5  && minute < 30
  return false
}

// ── Shift currently active in Ghana right now ──────────────────────────────
// Morning:   06:00–13:59 GMT
// Afternoon: 14:00–20:59 GMT
// Night:     21:00–05:59 GMT (wraps midnight)
function currentGhanaShift(now: Date): { shift: string; shiftDate: string } {
  const hour = now.getUTCHours()
  // Night shift that started yesterday (00:00–05:59 → still yesterday's night)
  if (hour >= 0 && hour < 6) {
    const yesterday = new Date(now)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    return { shift: "Night", shiftDate: yesterday.toISOString().split("T")[0] }
  }
  const dateStr = now.toISOString().split("T")[0]
  if (hour >= 6  && hour < 14) return { shift: "Morning",   shiftDate: dateStr }
  if (hour >= 14 && hour < 21) return { shift: "Afternoon", shiftDate: dateStr }
  return { shift: "Night", shiftDate: dateStr } // 21:00–23:59
}

// ── Weekend off rules ──────────────────────────────────────────────────────
// Sunday  → EVERYONE is off (no records expected, streak safe)
// Saturday → Night-shift groups are off; Morning and Afternoon still work
async function isDayOff(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  tables: string[],
  now: Date
): Promise<boolean> {
  const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon … 6=Sat

  // Sunday — total rest day for all groups
  if (dayOfWeek === 0) return true

  // Saturday — only Night-rotation groups are off
  if (dayOfWeek === 6) {
    const weekStart = new Date(now)
    weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7)) // Monday
    const weekStartStr = weekStart.toISOString().split("T")[0]

    const results = await Promise.all(
      tables.map(t =>
        serviceClient.from(t).select("shift, date")
          .eq("user_id", userId)
          .gte("date", weekStartStr)
          .order("date", { ascending: false })
          .limit(1)
      )
    )
    const shifts = results.flatMap(r => r.data?.map(d => d.shift) || [])
    // On Night rotation this week → Saturday off
    return shifts.some(s => s === "Night")
  }

  return false
}

// ── Badge milestones ───────────────────────────────────────────────────────
const SUBMISSION_MILESTONES = [50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000]
const STREAK_MILESTONES     = [5, 10, 20, 30, 50, 100]

export async function GET() {
  try {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("department, group_number, full_name")
      .eq("id", user.id)
      .single()

    const dept        = profile?.department || null
    const groupNumber = profile?.group_number || null
    const tables      = dept ? (COMPULSORY[dept] || []) : []

    // ── 1. Total submissions ───────────────────────────────────────────────
    let totalSubmissions = 0
    if (tables.length > 0) {
      const counts = await Promise.all(
        tables.map(t => serviceClient.from(t).select("*", { count: "exact", head: true }).eq("user_id", user.id))
      )
      totalSubmissions = counts.reduce((s, r) => s + (r.count || 0), 0)
    }

    // ── 2. Streak ──────────────────────────────────────────────────────────
    const { data: streakRow } = await serviceClient
      .from("supervisor_streaks").select("*").eq("user_id", user.id).single()

    let currentStreak = streakRow?.current_streak || 0
    let longestStreak = streakRow?.longest_streak || 0

    const now = new Date()
    const { shift: checkShift, shiftDate: checkDate } = currentGhanaShift(now)

    // Check weekend off rules (Sunday = everyone off, Saturday = Night groups off)
    const dayOff = await isDayOff(serviceClient, user.id, tables, now)

    let currentShiftComplete = false
    if (tables.length > 0 && !dayOff) {
      const checks = await Promise.all(
        tables.map(t =>
          serviceClient.from(t).select("id")
            .eq("user_id", user.id)
            .eq("date", checkDate)
            .eq("shift", checkShift)
            .limit(1)
        )
      )
      currentShiftComplete = checks.every(r => (r.data?.length || 0) > 0)
    } else if (dayOff) {
      // Day off — no records expected, treat as complete so streak doesn't break
      currentShiftComplete = true
    }

    if (currentShiftComplete) {
      const alreadyCounted =
        streakRow?.last_shift_date === checkDate &&
        streakRow?.last_shift_type === checkShift

      if (!alreadyCounted) {
        const newStreak  = (streakRow?.current_streak || 0) + 1
        const newLongest = Math.max(newStreak, streakRow?.longest_streak || 0)
        currentStreak = newStreak
        longestStreak = newLongest

        await serviceClient.from("supervisor_streaks").upsert({
          user_id:         user.id,
          current_streak:  newStreak,
          longest_streak:  newLongest,
          last_shift_date: checkDate,
          last_shift_type: checkShift,
          updated_at:      new Date().toISOString(),
        }, { onConflict: "user_id" })
      }
    }

    // ── 3. Badges ──────────────────────────────────────────────────────────
    const { data: existingBadges } = await serviceClient
      .from("supervisor_badges").select("badge_type, earned_at").eq("user_id", user.id)

    const earnedTypes = new Set(existingBadges?.map(b => b.badge_type) || [])
    const newBadges: { user_id: string; badge_type: string }[] = []

    // Submission milestones
    for (const m of SUBMISSION_MILESTONES) {
      const key = `submissions_${m}`
      if (totalSubmissions >= m && !earnedTypes.has(key))
        newBadges.push({ user_id: user.id, badge_type: key })
    }

    // Streak milestones
    for (const m of STREAK_MILESTONES) {
      const key = `streak_${m}`
      if (currentStreak >= m && !earnedTypes.has(key))
        newBadges.push({ user_id: user.id, badge_type: key })
    }

    // First submit
    if (totalSubmissions >= 1 && !earnedTypes.has("first_submit"))
      newBadges.push({ user_id: user.id, badge_type: "first_submit" })

    // Perfect Week
    // Sunday = everyone off. Night groups Saturday off too.
    // Expected shifts = working days in the week × 1 shift per day.
    if (!earnedTypes.has("perfect_week") && tables.length > 0) {
      const weekStart = new Date(now)
      weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7)) // Mon
      weekStart.setUTCHours(0, 0, 0, 0)
      const weekStartStr = weekStart.toISOString().split("T")[0]

      const weekChecks = await Promise.all(
        tables.map(t =>
          serviceClient.from(t).select("date, shift").eq("user_id", user.id).gte("date", weekStartStr)
        )
      )
      const submitted = new Set<string>()
      weekChecks.forEach(r => r.data?.forEach(row => submitted.add(`${row.date}-${row.shift}`)))

      const isNightWeek = [...submitted].some(s => s.includes("-Night"))
      // Mon–Fri = 5 days always. Morning/Afternoon also work Saturday = +1 day.
      // Night rotation: Saturday off → max 5 days. Sunday always off.
      const maxWorkDays  = isNightWeek ? 5 : 6
      const daysPassed   = Math.min(Math.floor((now.getTime() - weekStart.getTime()) / 86400000) + 1, 7)
      const workDaysPassed = Math.min(daysPassed, maxWorkDays)

      if (submitted.size >= workDaysPassed && workDaysPassed >= maxWorkDays)
        newBadges.push({ user_id: user.id, badge_type: "perfect_week" })
    }

    // Night Owl — submitted a Night shift in the on-time window
    if (!earnedTypes.has("night_owl") && tables.length > 0) {
      const nightChecks = await Promise.all(
        tables.map(t =>
          serviceClient.from(t).select("created_at, shift")
            .eq("user_id", user.id).eq("shift", "Night").limit(20)
        )
      )
      if (nightChecks.some(r => r.data?.some(row => isOnTime(row.created_at, "Night"))))
        newBadges.push({ user_id: user.id, badge_type: "night_owl" })
    }

    // Early Bird — submitted within 30 min of shift end on any shift
    if (!earnedTypes.has("early_bird") && tables.length > 0) {
      const allRecent = await Promise.all(
        tables.map(t =>
          serviceClient.from(t).select("created_at, shift")
            .eq("user_id", user.id).limit(50)
        )
      )
      const hasEarly = allRecent.some(r =>
        r.data?.some(row => isEarlyBird(row.created_at, row.shift))
      )
      if (hasEarly) newBadges.push({ user_id: user.id, badge_type: "early_bird" })
    }

    // All-Rounder — submitted on all 3 shift types
    if (!earnedTypes.has("all_rounder") && tables.length > 0 && totalSubmissions >= 3) {
      const shiftChecks = await Promise.all(
        tables.map(t =>
          serviceClient.from(t).select("shift").eq("user_id", user.id).limit(100)
        )
      )
      const shifts = new Set(shiftChecks.flatMap(r => r.data?.map(row => row.shift) || []))
      if (shifts.has("Morning") && shifts.has("Afternoon") && shifts.has("Night"))
        newBadges.push({ user_id: user.id, badge_type: "all_rounder" })
    }

    if (newBadges.length > 0)
      await serviceClient.from("supervisor_badges").upsert(newBadges, { onConflict: "user_id,badge_type" })

    const { data: allBadges } = await serviceClient
      .from("supervisor_badges").select("badge_type, earned_at")
      .eq("user_id", user.id).order("earned_at", { ascending: true })

    return NextResponse.json({
      currentStreak,
      longestStreak,
      currentShiftComplete,
      currentShift:  checkShift,
      totalSubmissions,
      department:    dept,
      groupNumber,
      fullName:      profile?.full_name,
      badges:        allBadges || [],
      dayOff,
    })
  } catch (e) {
    console.error("[gamification/stats]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
