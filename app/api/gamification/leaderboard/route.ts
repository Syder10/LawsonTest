import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// ── On-time window: 1-hour grace period after shift ends (Ghana = UTC) ─────
// Morning   ends 14:00 → on-time 14:00–14:59
// Afternoon ends 21:00 → on-time 21:00–21:59
// Night     ends 05:00 → on-time 05:00–05:59
function isOnTime(createdAt: string, shift: string): boolean {
  const hour = new Date(createdAt).getUTCHours()
  if (shift === "Morning")   return hour === 14
  if (shift === "Afternoon") return hour === 21
  if (shift === "Night")     return hour === 5
  return false
}

// Skip Sunday records entirely (everyone off) and Saturday Night records.
function isWeekendOff(dateStr: string, shift: string): boolean {
  const day = new Date(dateStr + "T12:00:00Z").getUTCDay() // 0=Sun, 6=Sat
  if (day === 0) return true                              // Sunday — all groups off
  if (day === 6 && shift === "Night") return true         // Saturday — Night groups off
  return false
}

export async function GET() {
  try {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Try Postgres view first (fastest)
    const { data, error } = await serviceClient
      .from("leaderboard_weekly")
      .select("*")
      .order("on_time_count", { ascending: false })
      .limit(20)

    if (!error) return NextResponse.json({ leaderboard: data || [] })

    // Fallback: compute in JS
    console.warn("[leaderboard] View not found, falling back:", error.message)
    return await computeLeaderboard(serviceClient)
  } catch (e) {
    console.error("[leaderboard]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function computeLeaderboard(serviceClient: ReturnType<typeof createClient>) {
  const now       = new Date()
  const weekStart = new Date(now)
  // Monday of current week
  weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7))
  weekStart.setUTCHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString().split("T")[0]

  const TABLES = [
    "blowing_daily_records",
    "packaging_daily_records",
    "filling_line_daily_records",
    "caps_stock_records",
    "labels_stock_records",
    "alcohol_stock_level_records",
    "alcohol_blending_daily_records",
  ]

  const results = await Promise.all(
    TABLES.map(table =>
      serviceClient
        .from(table)
        .select("user_id, department, group_number, date, shift, created_at")
        .gte("date", weekStartStr)
    )
  )

  const all = results.flatMap(r => r.data || [])

  // Track which dept+group is on Night shift this week (for Saturday exemption)
  const nightGroups = new Set<string>()
  for (const row of all) {
    if (row.shift === "Night" && row.department && row.group_number) {
      nightGroups.add(`${row.department}|${row.group_number}`)
    }
  }

  const onTimeMap = new Map<string, { dept: string; group: number; count: number; lastSubmission: string }>()

  for (const row of all) {
    if (!row.department || !row.group_number) continue

    // Skip Sunday (everyone off) and Saturday Night (night groups off)
    if (isWeekendOff(row.date, row.shift)) continue

    if (!isOnTime(row.created_at, row.shift)) continue

    const teamKey = `${row.department}|${row.group_number}`
    if (existing) {
      existing.count++
      if (row.created_at > existing.lastSubmission) existing.lastSubmission = row.created_at
    } else {
      onTimeMap.set(teamKey, {
        dept: row.department, group: row.group_number,
        count: 1, lastSubmission: row.created_at,
      })
    }
  }

  const leaderboard = Array.from(onTimeMap.values())
    .map(v => ({
      department:      v.dept,
      group_number:    v.group,
      team_label:      `${v.dept} — Group ${v.group}`,
      on_time_count:   v.count,
      last_submission: v.lastSubmission,
    }))
    .sort((a, b) => b.on_time_count - a.on_time_count)
    .slice(0, 20)

  return NextResponse.json({ leaderboard })
}
