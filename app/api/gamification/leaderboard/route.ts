import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// ── Compulsory tables per department ──────────────────────────────────────
// A team scores 1 point per shift where ALL their compulsory tables
// have at least one on-time record. This is fair across departments:
//   Blowing (1 table) = 1 point per shift
//   Filling Line (3 tables) = 1 point per shift (only if all 3 submitted)
const COMPULSORY: Record<string, string[]> = {
  "Blowing":              ["blowing_daily_records"],
  "Packaging":            ["packaging_daily_records"],
  "Filling Line":         ["filling_line_daily_records", "caps_stock_records", "labels_stock_records"],
  "Alcohol and Blending": ["alcohol_stock_level_records", "alcohol_blending_daily_records"],
}

const ALL_TABLES = [
  "blowing_daily_records",
  "packaging_daily_records",
  "filling_line_daily_records",
  "caps_stock_records",
  "labels_stock_records",
  "alcohol_stock_level_records",
  "alcohol_blending_daily_records",
]

// On-time: submitted in the 1-hour grace window after shift ends (Ghana = UTC)
function isOnTime(createdAt: string, shift: string): boolean {
  const hour = new Date(createdAt).getUTCHours()
  if (shift === "Morning")   return hour === 14
  if (shift === "Afternoon") return hour === 21
  if (shift === "Night")     return hour === 5
  return false
}

// Weekend rules
function isWeekendOff(dateStr: string, shift: string): boolean {
  const day = new Date(dateStr + "T12:00:00Z").getUTCDay()
  if (day === 0) return true                        // Sunday — everyone off
  if (day === 6 && shift === "Night") return true   // Saturday — Night groups off
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

    // Try Postgres view first (fastest path)
    const { data: viewData, error: viewError } = await serviceClient
      .from("leaderboard_weekly")
      .select("*")
      .order("on_time_count", { ascending: false })
      .limit(20)

    if (!viewError) return NextResponse.json({ leaderboard: viewData || [] })

    // Fallback: compute in JS (runs if view hasn't been created yet)
    console.warn("[leaderboard] View unavailable, falling back:", viewError.message)
    return await computeLeaderboard(serviceClient)
  } catch (e) {
    console.error("[leaderboard]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function computeLeaderboard(serviceClient: ReturnType<typeof createClient>) {
  const now       = new Date()
  // Monday of current ISO week
  const weekStart = new Date(now)
  weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7))
  weekStart.setUTCHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString().split("T")[0]
  // Saturday (Sunday excluded — everyone off)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekStart.getUTCDate() + 5)
  const weekEndStr = weekEnd.toISOString().split("T")[0]

  // Fetch all compulsory records for this week, one query per table
  const tableResults = await Promise.all(
    ALL_TABLES.map(table =>
      serviceClient
        .from(table)
        .select("user_id, department, group_number, date, shift, created_at")
        .gte("date", weekStartStr)
        .lte("date", weekEndStr)
    )
  )

  // ── Build per-table set of on-time (dept|group|date|shift) combos ─────────
  // Key: "department|group_number|date|shift"
  type ShiftKey = string
  const tableOnTime = new Map<string, Set<ShiftKey>>()
  // Also track team metadata and last submission time
  const teamMeta = new Map<string, { dept: string; group: number; lastSub: string }>()

  for (let i = 0; i < ALL_TABLES.length; i++) {
    const table = ALL_TABLES[i]
    const rows  = tableResults[i].data || []
    const onTimeSet = new Set<ShiftKey>()

    for (const row of rows) {
      if (!row.department || !row.group_number) continue
      if (isWeekendOff(row.date, row.shift)) continue
      if (!isOnTime(row.created_at, row.shift)) continue

      const sk = `${row.department}|${row.group_number}|${row.date}|${row.shift}`
      onTimeSet.add(sk)

      const teamKey = `${row.department}|${row.group_number}`
      const existing = teamMeta.get(teamKey)
      if (!existing || row.created_at > existing.lastSub) {
        teamMeta.set(teamKey, { dept: row.department, group: row.group_number, lastSub: row.created_at })
      }
    }
    tableOnTime.set(table, onTimeSet)
  }

  // ── Collect all unique (dept|group|date|shift) shift keys ─────────────────
  const allShiftKeys = new Set<ShiftKey>()
  for (const set of tableOnTime.values()) {
    for (const sk of set) allShiftKeys.add(sk)
  }

  // ── Score: 1 point per shift where the team completed ALL required tables ──
  const teamScore = new Map<string, number>()

  for (const sk of allShiftKeys) {
    const [dept, group] = sk.split("|")
    const teamKey  = `${dept}|${group}`
    const required = COMPULSORY[dept] || []
    if (required.length === 0) continue

    const allComplete = required.every(table => tableOnTime.get(table)?.has(sk))
    if (allComplete) {
      teamScore.set(teamKey, (teamScore.get(teamKey) || 0) + 1)
    }
  }

  // ── Build leaderboard ──────────────────────────────────────────────────────
  const leaderboard = Array.from(teamScore.entries())
    .map(([teamKey, score]) => {
      const meta = teamMeta.get(teamKey)
      const [dept, group] = teamKey.split("|")
      return {
        department:      dept,
        group_number:    Number(group),
        team_label:      `${dept} — Group ${group}`,
        on_time_count:   score,          // completed shifts (1 per shift, fair for all depts)
        last_submission: meta?.lastSub || "",
      }
    })
    .sort((a, b) => b.on_time_count - a.on_time_count)
    .slice(0, 20)

  return NextResponse.json({ leaderboard })
}
