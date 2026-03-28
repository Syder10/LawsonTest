import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const COMPULSORY_TABLES = [
  "blowing_daily_records",
  "packaging_daily_records",
  "filling_line_daily_records",
  "caps_stock_records",
  "labels_stock_records",
  "alcohol_stock_level_records",
  "alcohol_blending_daily_records",
]

// On-time: 1-hour grace window after shift ends (Ghana = UTC)
function isOnTime(createdAt: string, shift: string): boolean {
  const hour = new Date(createdAt).getUTCHours()
  if (shift === "Morning")   return hour === 14
  if (shift === "Afternoon") return hour === 21
  if (shift === "Night")     return hour === 5
  return false
}

// Is today the last day of the current month (Ghana time)?
function isLastDayOfMonth(now: Date): boolean {
  const tomorrow = new Date(now)
  tomorrow.setUTCDate(now.getUTCDate() + 1)
  return tomorrow.getUTCMonth() !== now.getUTCMonth()
}

export async function GET() {
  try {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const now = new Date()

    // ── Only reveal MVP on the last day of the month ───────────────────────
    // (still return mvp:null other days so the dashboard shows nothing)
    if (!isLastDayOfMonth(now)) {
      return NextResponse.json({ mvp: null, reason: "not_last_day" })
    }

    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Full month bounds
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString().split("T")[0]
    const monthEnd = now.toISOString().split("T")[0] // today (last day)

    // Fetch all on-time compulsory records for this month
    const results = await Promise.all(
      COMPULSORY_TABLES.map(table =>
        serviceClient
          .from(table)
          .select("user_id, shift, created_at, supervisor_name")
          .gte("date", monthStart)
          .lte("date", monthEnd)
      )
    )

    const all = results.flatMap(r => r.data || [])

    // Count on-time per user
    const userCounts = new Map<string, { count: number; supervisorName: string }>()
    for (const row of all) {
      if (!row.user_id) continue
      if (!isOnTime(row.created_at, row.shift)) continue
      const existing = userCounts.get(row.user_id)
      if (existing) {
        existing.count++
      } else {
        userCounts.set(row.user_id, { count: 1, supervisorName: row.supervisor_name || "Supervisor" })
      }
    }

    if (userCounts.size === 0) return NextResponse.json({ mvp: null })

    // Find the top user
    let mvpId = "", mvpCount = 0
    for (const [uid, d] of userCounts.entries()) {
      if (d.count > mvpCount) { mvpCount = d.count; mvpId = uid }
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, department, group_number")
      .eq("id", mvpId)
      .single()

    const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" })

    // Award MVP badge for this month
    const mvpBadgeType = `mvp_${now.getUTCFullYear()}_${now.getUTCMonth() + 1}`
    await serviceClient
      .from("supervisor_badges")
      .upsert({ user_id: mvpId, badge_type: mvpBadgeType }, { onConflict: "user_id,badge_type" })

    return NextResponse.json({
      mvp: {
        userId:      mvpId,
        fullName:    profile?.full_name || userCounts.get(mvpId)?.supervisorName || "Supervisor",
        department:  profile?.department || null,
        groupNumber: profile?.group_number || null,
        onTimeCount: mvpCount,
        month:       monthLabel,
        isMe:        mvpId === user.id,
      }
    })
  } catch (e) {
    console.error("[mvp]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
