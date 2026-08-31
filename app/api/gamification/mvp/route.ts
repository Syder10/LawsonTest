import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { createAdminSupabase } from "@/lib/supabase/admin"
import { compulsoryRecordTypes, departmentsWithCompulsory } from "@/lib/domain/record-types"
import { completeShiftKeys, fetchTypeRows, isRosteredOnTime } from "@/lib/domain/gamification"
import { mvpWindow } from "@/lib/domain/period"
import { isSaturdayOff } from "@/lib/shift-config"

const SYSTEM_START = "2026-04-01"

// Monthly MVP: the supervisor with the most complete on-time shifts in the month
// that has just FINISHED, shown for the first days of the new one.
//
// The timing rule (and why the old one was wrong) lives in lib/domain/period.ts,
// where it is unit-tested. In short: the previous version judged the current month
// on its own last day, so the winner was decided before that day's Afternoon and
// Night shifts had submitted — and the badge was written at that moment by whoever
// opened the app first.

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const win = mvpWindow(new Date())
  if (!win.show) return NextResponse.json({ mvp: null })

  const admin = createAdminSupabase()
  const gte = win.start > SYSTEM_START ? win.start : SYSTEM_START

  const compulsoryDefs = [
    ...new Map(
      departmentsWithCompulsory()
        .flatMap((d) => compulsoryRecordTypes(d))
        .map((def) => [def.label, def]),
    ).values(),
  ]
  const perType = await Promise.all(compulsoryDefs.map((def) => fetchTypeRows(admin, def, gte, win.end)))

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

  // Deterministic tie-break. `count > best` alone let Map insertion order decide,
  // which is row order from the database — so a tie could name a different winner on
  // each request, and the badge would go to whoever's request happened to run first.
  let mvpId = ""
  let mvpCount = 0
  for (const [uid, count] of [...perUser.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    mvpId = uid
    mvpCount = count
    break
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, department, group_number")
    .eq("id", mvpId)
    .single()

  // The month is closed, so its on-time totals can no longer change (a late row is
  // backdated and never counts as on-time). Awarding here is therefore idempotent
  // rather than a race, and the upsert makes repeat visits harmless.
  await admin.from("supervisor_badges").upsert(
    { user_id: mvpId, badge_type: win.badge },
    { onConflict: "user_id,badge_type" },
  )

  return NextResponse.json({
    mvp: {
      userId: mvpId,
      fullName: profile?.full_name || userName.get(mvpId) || "Supervisor",
      department: profile?.department || userDept.get(mvpId) || null,
      groupNumber: profile?.group_number || null,
      onTimeCount: mvpCount,
      month: win.label,
      isMe: mvpId === auth.ctx.user.id,
      // The popup is shown once per device per month; the client keys its
      // localStorage flag on `month`, so a fixed label is what makes that work.
      showPopup: true,
    },
  })
}
