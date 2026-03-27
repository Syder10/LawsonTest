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

// ── Shift windows (hour of day, 24h, UTC – adjust if your server is offset) ─
// Morning:   06:00–14:00  on-time = submitted before 14:00
// Afternoon: 14:00–21:00  on-time = submitted before 21:00
// Night:     21:00–05:00  on-time = submitted before 05:00 next day
function shiftDeadlineHour(shift: string): number {
  if (shift === "Morning")   return 14
  if (shift === "Afternoon") return 21
  return 5 // Night deadline: 05:00
}

function isOnTime(submittedAt: string, shift: string): boolean {
  const submitted = new Date(submittedAt)
  const hour = submitted.getUTCHours()
  const deadline = shiftDeadlineHour(shift)
  if (shift === "Night") {
    // Night shift crosses midnight — on time if hour < 05:00
    return hour < deadline
  }
  return hour < deadline
}

// ── Badge milestone definitions ────────────────────────────────────────────
const SUBMISSION_MILESTONES = [100, 200, 300, 400, 500, 750, 1000]

export async function GET() {
  try {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch profile
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("department, group_number, full_name")
      .eq("id", user.id)
      .single()

    const dept        = profile?.department || null
    const groupNumber = profile?.group_number || null
    const tables      = dept ? (COMPULSORY[dept] || []) : []

    // ── 1. Total submissions across all tables ─────────────────────────────
    let totalSubmissions = 0
    if (tables.length > 0) {
      const counts = await Promise.all(
        tables.map(table =>
          serviceClient.from(table).select("*", { count: "exact", head: true }).eq("user_id", user.id)
        )
      )
      totalSubmissions = counts.reduce((sum, r) => sum + (r.count || 0), 0)
    }

    // ── 2. Streak calculation ──────────────────────────────────────────────
    // Fetch existing streak row
    const { data: streakRow } = await serviceClient
      .from("supervisor_streaks")
      .select("*")
      .eq("user_id", user.id)
      .single()

    let currentStreak  = streakRow?.current_streak  || 0
    let longestStreak  = streakRow?.longest_streak  || 0

    // Check if today's current shift is already completed
    const now          = new Date()
    const todayStr     = now.toISOString().split("T")[0]
    const currentHour  = now.getUTCHours()
    const currentShift =
      currentHour >= 6  && currentHour < 14 ? "Morning"   :
      currentHour >= 14 && currentHour < 21 ? "Afternoon" : "Night"

    // For the streak: determine what shift/date to check
    // Night shift: if hour < 5, it's technically yesterday's night shift still active
    const checkShift = currentShift
    const checkDate  =
      currentShift === "Night" && currentHour < 5
        ? new Date(now.getTime() - 86400000).toISOString().split("T")[0]
        : todayStr

    let currentShiftComplete = false
    if (tables.length > 0) {
      const checks = await Promise.all(
        tables.map(table =>
          serviceClient
            .from(table)
            .select("id, created_at")
            .eq("user_id", user.id)
            .eq("date", checkDate)
            .eq("shift", checkShift)
            .limit(1)
        )
      )
      currentShiftComplete = checks.every(r => (r.data?.length || 0) > 0)
    }

    // If this shift is complete and we haven't already counted it, increment streak
    if (currentShiftComplete) {
      const alreadyCounted =
        streakRow?.last_shift_date === checkDate &&
        streakRow?.last_shift_type === checkShift

      if (!alreadyCounted) {
        // Check if previous shift was consecutive to maintain streak
        // For simplicity: if last counted was within the last 2 shifts, keep streak going
        const newStreak = (streakRow?.current_streak || 0) + 1
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
      .from("supervisor_badges")
      .select("badge_type, earned_at")
      .eq("user_id", user.id)

    const earnedTypes = new Set(existingBadges?.map(b => b.badge_type) || [])
    const newBadges: { user_id: string; badge_type: string }[] = []

    // Submission milestone badges
    for (const milestone of SUBMISSION_MILESTONES) {
      const key = `submissions_${milestone}`
      if (totalSubmissions >= milestone && !earnedTypes.has(key)) {
        newBadges.push({ user_id: user.id, badge_type: key })
      }
    }

    // Perfect week badge — check if all 21 shifts this week are complete
    // (3 shifts × 7 days — simplified: check this week's Monday→Sunday)
    const weekStart = new Date(now)
    weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay() + 1) // Monday
    const weekStartStr = weekStart.toISOString().split("T")[0]

    if (!earnedTypes.has("perfect_week") && tables.length > 0) {
      // Count distinct date+shift combos submitted this week
      const weekChecks = await Promise.all(
        tables.map(table =>
          serviceClient
            .from(table)
            .select("date, shift")
            .eq("user_id", user.id)
            .gte("date", weekStartStr)
        )
      )
      const submittedShifts = new Set<string>()
      weekChecks.forEach(r => {
        r.data?.forEach(row => submittedShifts.add(`${row.date}-${row.shift}`))
      })
      // 7 days × 3 shifts = 21, but we only check up to today
      const daysElapsed = Math.floor((now.getTime() - weekStart.getTime()) / 86400000) + 1
      const expectedShifts = Math.min(daysElapsed * 3, 21)
      if (submittedShifts.size >= expectedShifts && expectedShifts >= 21) {
        newBadges.push({ user_id: user.id, badge_type: "perfect_week" })
      }
    }

    // First submit badge
    if (totalSubmissions >= 1 && !earnedTypes.has("first_submit")) {
      newBadges.push({ user_id: user.id, badge_type: "first_submit" })
    }

    // Insert any newly earned badges
    if (newBadges.length > 0) {
      await serviceClient.from("supervisor_badges").upsert(newBadges, { onConflict: "user_id,badge_type" })
    }

    // Fetch final badge list
    const { data: allBadges } = await serviceClient
      .from("supervisor_badges")
      .select("badge_type, earned_at")
      .eq("user_id", user.id)
      .order("earned_at", { ascending: true })

    return NextResponse.json({
      currentStreak,
      longestStreak,
      currentShiftComplete,
      currentShift,
      totalSubmissions,
      department:  dept,
      groupNumber,
      fullName:    profile?.full_name,
      badges:      allBadges || [],
    })
  } catch (e) {
    console.error("[gamification/stats]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
