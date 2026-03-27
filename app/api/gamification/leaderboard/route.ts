import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Try the leaderboard_weekly view first
    const { data, error } = await serviceClient
      .from("leaderboard_weekly")
      .select("*")
      .order("on_time_count", { ascending: false })
      .limit(20)

    if (error) {
      // Fallback: compute manually if view doesn't exist yet
      console.warn("[leaderboard] View not found, falling back:", error.message)
      return await computeLeaderboard(serviceClient)
    }

    return NextResponse.json({ leaderboard: data || [] })
  } catch (e) {
    console.error("[leaderboard]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function computeLeaderboard(serviceClient: ReturnType<typeof createClient>) {
  const now       = new Date()
  const weekStart = new Date(now)
  weekStart.setUTCDate(now.getUTCDate() - now.getUTCDay() + 1)
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

  // Fetch all this-week records from compulsory tables
  const results = await Promise.all(
    TABLES.map(table =>
      serviceClient
        .from(table)
        .select("user_id, department, group_number, date, shift, created_at")
        .gte("date", weekStartStr)
    )
  )

  const all = results.flatMap(r => r.data || [])

  // Determine on-time per shift
  const onTimeMap = new Map<string, { dept: string; group: number; count: number; lastSubmission: string }>()

  for (const row of all) {
    if (!row.department || !row.group_number) continue
    const submittedHour = new Date(row.created_at).getUTCHours()
    let isOnTime = false
    if (row.shift === "Morning")   isOnTime = submittedHour < 14
    if (row.shift === "Afternoon") isOnTime = submittedHour < 21
    if (row.shift === "Night")     isOnTime = submittedHour < 5

    if (!isOnTime) continue

    const key = `${row.department}|${row.group_number}`
    const existing = onTimeMap.get(key)
    if (existing) {
      existing.count++
      if (row.created_at > existing.lastSubmission) existing.lastSubmission = row.created_at
    } else {
      onTimeMap.set(key, { dept: row.department, group: row.group_number, count: 1, lastSubmission: row.created_at })
    }
  }

  const leaderboard = Array.from(onTimeMap.entries())
    .map(([key, v]) => ({
      department:       v.dept,
      group_number:     v.group,
      team_label:       `${v.dept} — Group ${v.group}`,
      on_time_count:    v.count,
      last_submission:  v.lastSubmission,
    }))
    .sort((a, b) => b.on_time_count - a.on_time_count)
    .slice(0, 20)

  return NextResponse.json({ leaderboard })
}
