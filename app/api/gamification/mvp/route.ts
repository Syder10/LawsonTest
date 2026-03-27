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

function isOnTime(createdAt: string, shift: string): boolean {
  const hour = new Date(createdAt).getUTCHours()
  if (shift === "Morning")   return hour < 14
  if (shift === "Afternoon") return hour < 21
  return hour < 5 // Night
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

    // Month bounds
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

    // Fetch this month's compulsory records across all tables
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

    // Count on-time submissions per user
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

    if (userCounts.size === 0) {
      return NextResponse.json({ mvp: null })
    }

    // Find the top user
    let mvpId    = ""
    let mvpCount = 0
    for (const [uid, data] of userCounts.entries()) {
      if (data.count > mvpCount) { mvpCount = data.count; mvpId = uid }
    }

    // Get their full profile
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, department, group_number")
      .eq("id", mvpId)
      .single()

    const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" })

    // Award MVP badge if it's a new month's MVP
    const mvpBadgeType = `mvp_${now.getFullYear()}_${now.getMonth() + 1}`
    await serviceClient
      .from("supervisor_badges")
      .upsert({ user_id: mvpId, badge_type: mvpBadgeType }, { onConflict: "user_id,badge_type" })

    // Is the requesting user the MVP?
    const isMe = mvpId === user.id

    return NextResponse.json({
      mvp: {
        userId:      mvpId,
        fullName:    profile?.full_name || userCounts.get(mvpId)?.supervisorName || "Supervisor",
        department:  profile?.department || null,
        groupNumber: profile?.group_number || null,
        onTimeCount: mvpCount,
        month:       monthLabel,
        isMe,
      }
    })
  } catch (e) {
    console.error("[mvp]", e)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
