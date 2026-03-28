import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// ── Compulsory tables per department ──────────────────────────────────────
// Used to check whether a supervisor completed ALL records for a shift.
const COMPULSORY: Record<string, string[]> = {
  "Blowing":              ["blowing_daily_records"],
  "Packaging":            ["packaging_daily_records"],
  "Filling Line":         ["filling_line_daily_records", "caps_stock_records", "labels_stock_records"],
  "Alcohol and Blending": ["alcohol_stock_level_records", "alcohol_blending_daily_records"],
}

const ALL_COMPULSORY_TABLES = [
  "blowing_daily_records",
  "packaging_daily_records",
  "filling_line_daily_records",
  "caps_stock_records",
  "labels_stock_records",
  "alcohol_stock_level_records",
  "alcohol_blending_daily_records",
]

// On-time: submitted in the 1-hour window after shift ends (Ghana = UTC)
function isOnTime(createdAt: string, shift: string): boolean {
  const hour = new Date(createdAt).getUTCHours()
  if (shift === "Morning")   return hour === 14
  if (shift === "Afternoon") return hour === 21
  if (shift === "Night")     return hour === 5
  return false
}

// ── When to show MVP ───────────────────────────────────────────────────────
// • Pop-up toast: last day of the month only
// • Persistent banner on dashboard: last day + first 5 days of next month
function getMVPWindow(now: Date): {
  showPopup: boolean
  showBanner: boolean
  monthStart: string
  monthEnd:   string
  month:      string
} {
  const day        = now.getUTCDate()
  const year       = now.getUTCFullYear()
  const monthIndex = now.getUTCMonth()

  // Last day of current month
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const isLastDay = day === lastDay

  // First 5 days of the month = showing previous month's MVP banner
  const isFirst5Days = day >= 1 && day <= 5

  // Which month's MVP are we showing?
  // Last day → current month. Days 1–5 → previous month.
  let mvpYear  = year
  let mvpMonth = monthIndex // 0-indexed

  if (isFirst5Days) {
    // Previous month
    mvpMonth = monthIndex - 1
    if (mvpMonth < 0) { mvpMonth = 11; mvpYear-- }
  }

  const mvpMonthStart = new Date(Date.UTC(mvpYear, mvpMonth, 1)).toISOString().split("T")[0]
  const mvpMonthEnd   = new Date(Date.UTC(mvpYear, mvpMonth + 1, 0)).toISOString().split("T")[0]
  const mvpLabel      = new Date(Date.UTC(mvpYear, mvpMonth, 15))
    .toLocaleString("default", { month: "long", year: "numeric" })

  return {
    showPopup:  isLastDay,
    showBanner: isLastDay || isFirst5Days,
    monthStart: mvpMonthStart,
    monthEnd:   mvpMonthEnd,
    month:      mvpLabel,
  }
}

export async function GET() {
  try {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const now    = new Date()
    const window = getMVPWindow(now)

    // Not in show window → return nothing
    if (!window.showBanner) {
      return NextResponse.json({ mvp: null })
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch the month's compulsory records
    const results = await Promise.all(
      ALL_COMPULSORY_TABLES.map(table =>
        serviceClient
          .from(table)
          .select("user_id, department, shift, date, created_at, supervisor_name")
          .gte("date", window.monthStart)
          .lte("date", window.monthEnd)
      )
    )

    const all = results.flatMap(r => r.data || [])

    // ── Count completed on-time shifts per user ────────────────────────────
    // A "completed shift" = all compulsory tables for this user's department
    // have at least one record for (date, shift) submitted on-time.
    // Score = 1 per completed shift, NOT per individual record submitted.

    // First, build a map: user → department (from the records themselves)
    const userDept = new Map<string, string>()
    for (const row of all) {
      if (row.user_id && row.department && !userDept.has(row.user_id)) {
        userDept.set(row.user_id, row.department)
      }
    }

    // Group on-time records by (user_id, date, shift, table)
    type ShiftKey = string // `${userId}|${date}|${shift}`
    type TableKey = string // `${userId}|${date}|${shift}|${table}`

    const onTimeByTable = new Set<TableKey>()
    const supervisorNames = new Map<string, string>()

    for (const row of all) {
      if (!row.user_id) continue
      if (!isOnTime(row.created_at, row.shift)) continue
      // Track names
      if (!supervisorNames.has(row.user_id) && row.supervisor_name) {
        supervisorNames.set(row.user_id, row.supervisor_name)
      }
      // Determine which table this came from
      // We can't know the table from the row, so we'll handle it differently below
    }

    // Re-approach: fetch per-table and track which (user, date, shift) have records in each table
    const tableSubmissions = new Map<string, Set<ShiftKey>>()
    // tableSubmissions[tableName] = Set of "userId|date|shift" that submitted on-time

    for (let i = 0; i < ALL_COMPULSORY_TABLES.length; i++) {
      const table   = ALL_COMPULSORY_TABLES[i]
      const rows    = results[i].data || []
      const onTimeSks = new Set<ShiftKey>()
      for (const row of rows) {
        if (!row.user_id) continue
        if (!isOnTime(row.created_at, row.shift)) continue
        onTimeSks.add(`${row.user_id}|${row.date}|${row.shift}`)
        if (!supervisorNames.has(row.user_id) && row.supervisor_name) {
          supervisorNames.set(row.user_id, row.supervisor_name)
        }
        if (!userDept.has(row.user_id) && row.department) {
          userDept.set(row.user_id, row.department)
        }
      }
      tableSubmissions.set(table, onTimeSks)
    }

    // Now count completed shifts per user
    // A shift is "complete" if ALL compulsory tables for the user's dept
    // have an on-time record for that (date, shift).
    const completedShifts = new Map<string, number>()

    // Collect all unique (userId, date, shift) combos that appear anywhere
    const allShiftKeys = new Set<ShiftKey>()
    for (const set of tableSubmissions.values()) {
      for (const sk of set) allShiftKeys.add(sk)
    }

    for (const sk of allShiftKeys) {
      const [userId] = sk.split("|")
      const dept  = userDept.get(userId)
      if (!dept) continue
      const required = COMPULSORY[dept] || []
      if (required.length === 0) continue

      // Check all required tables have this shift key
      const allPresent = required.every(table => tableSubmissions.get(table)?.has(sk))
      if (allPresent) {
        completedShifts.set(userId, (completedShifts.get(userId) || 0) + 1)
      }
    }

    if (completedShifts.size === 0) return NextResponse.json({ mvp: null })

    // Find top user
    let mvpId = "", mvpCount = 0
    for (const [uid, count] of completedShifts.entries()) {
      if (count > mvpCount) { mvpCount = count; mvpId = uid }
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, department, group_number")
      .eq("id", mvpId)
      .single()

    // Award MVP badge on the last day only
    if (window.showPopup) {
      const mvpBadge = `mvp_${now.getUTCFullYear()}_${now.getUTCMonth() + 1}`
      await serviceClient
        .from("supervisor_badges")
        .upsert({ user_id: mvpId, badge_type: mvpBadge }, { onConflict: "user_id,badge_type" })
    }

    return NextResponse.json({
      mvp: {
        userId:      mvpId,
        fullName:    profile?.full_name || supervisorNames.get(mvpId) || "Supervisor",
        department:  profile?.department || userDept.get(mvpId) || null,
        groupNumber: profile?.group_number || null,
        onTimeCount: mvpCount,          // completed shifts (fair: 1 per shift regardless of dept)
        month:       window.month,
        isMe:        mvpId === user.id,
        showPopup:   window.showPopup,  // frontend uses this to decide whether to pop the toast
      }
    })
  } catch (e) {
    console.error("[mvp]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
