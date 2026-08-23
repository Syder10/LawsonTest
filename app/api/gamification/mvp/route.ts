import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { createAdminSupabase } from "@/lib/supabase/admin"
import { compulsoryRecordTypes, departmentsWithCompulsory } from "@/lib/domain/record-types"
import { completeShiftKeys, fetchTypeRows, isRosteredOnTime } from "@/lib/domain/gamification"
import { isSaturdayOff } from "@/lib/shift-config"

const SYSTEM_START = "2026-04-01"

// The MVP banner shows on the last day of a month and the first 5 of the next;
// the popup (and badge award) only on the last day.
function mvpWindow(now: Date) {
  const day = now.getUTCDate()
  const year = now.getUTCFullYear()
  const mi = now.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate()
  const isLastDay = day === lastDay
  const isFirst5 = day >= 1 && day <= 5

  let y = year
  let m = mi
  if (isFirst5) {
    m = mi - 1
    if (m < 0) { m = 11; y-- }
  }
  return {
    showPopup: isLastDay,
    showBanner: isLastDay || isFirst5,
    monthStart: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
    monthEnd: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10),
    label: new Date(Date.UTC(y, m, 15)).toLocaleString("default", { month: "long", year: "numeric", timeZone: "UTC" }),
    badge: `mvp_${y}_${m + 1}`,
  }
}

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const win = mvpWindow(new Date())
  if (!win.showBanner) return NextResponse.json({ mvp: null })

  const admin = createAdminSupabase()
  const gte = win.monthStart > SYSTEM_START ? win.monthStart : SYSTEM_START

  const compulsoryDefs = [
    ...new Map(
      departmentsWithCompulsory()
        .flatMap((d) => compulsoryRecordTypes(d))
        .map((def) => [def.label, def]),
    ).values(),
  ]
  const perType = await Promise.all(compulsoryDefs.map((def) => fetchTypeRows(admin, def, gte, win.monthEnd)))

  const setsByLabel = new Map<string, Set<string>>()
  const userDept = new Map<string, string>()
  const userName = new Map<string, string>()

  compulsoryDefs.forEach((def, i) => {
    const set = new Set<string>()
    for (const row of perType[i]) {
      if (!row.user_id || !isRosteredOnTime(row)) continue
      if (row.department && row.group_number) {
        const d = new Date(row.date + "T12:00:00Z")
        if (d.getUTCDay() === 0 || (d.getUTCDay() === 6 && isSaturdayOff(row.department, row.group_number, d))) continue
      }
      set.add(`${row.user_id}|${row.date}|${row.shift}`)
      if (row.department) userDept.set(row.user_id, row.department)
      if (row.supervisor_name) userName.set(row.user_id, row.supervisor_name)
    }
    setsByLabel.set(def.label, set)
  })

  const complete = completeShiftKeys(setsByLabel, (key) => userDept.get(key.split("|")[0]))
  const perUser = new Map<string, number>()
  for (const key of complete) {
    const uid = key.split("|")[0]
    perUser.set(uid, (perUser.get(uid) || 0) + 1)
  }
  if (perUser.size === 0) return NextResponse.json({ mvp: null })

  let mvpId = ""
  let mvpCount = 0
  for (const [uid, count] of perUser) if (count > mvpCount) { mvpCount = count; mvpId = uid }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, department, group_number")
    .eq("id", mvpId)
    .single()

  if (win.showPopup) {
    await admin.from("supervisor_badges").upsert(
      { user_id: mvpId, badge_type: win.badge },
      { onConflict: "user_id,badge_type" },
    )
  }

  return NextResponse.json({
    mvp: {
      userId: mvpId,
      fullName: profile?.full_name || userName.get(mvpId) || "Supervisor",
      department: profile?.department || userDept.get(mvpId) || null,
      groupNumber: profile?.group_number || null,
      onTimeCount: mvpCount,
      month: win.label,
      isMe: mvpId === auth.ctx.user.id,
      showPopup: win.showPopup,
    },
  })
}
