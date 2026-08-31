import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { createAdminSupabase } from "@/lib/supabase/admin"
import { compulsoryRecordTypes, departmentsWithCompulsory } from "@/lib/domain/record-types"
import { completeShiftKeys, fetchTypeRows, isRosteredOnTime } from "@/lib/domain/gamification"
import { monthWindow } from "@/lib/domain/period"
import { isSaturdayOff } from "@/lib/shift-config"

// MONTHLY team on-time leaderboard, computed here from the shared domain logic (the
// old fragile leaderboard_weekly SQL view is long gone). Cross-supervisor read →
// admin client.
//
// Was weekly. A week is a small sample on a 3-week shift rotation: a team's score
// depended on which shift it happened to be rostered on, and Monday wiped the board
// before a pattern could show. The month is the same period the MVP is judged over,
// so the two screens now agree.

function isWeekendOff(dateStr: string, department: string, group: number): boolean {
  const d = new Date(dateStr + "T12:00:00Z")
  const dow = d.getUTCDay()
  if (dow === 0) return true
  if (dow === 6) return isSaturdayOff(department, group, d)
  return false
}

export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminSupabase()
  const period = monthWindow(new Date())
  const { start, end } = period

  // Distinct compulsory record types across all departments.
  const compulsoryDefs = [
    ...new Map(
      departmentsWithCompulsory()
        .flatMap((d) => compulsoryRecordTypes(d))
        .map((def) => [def.label, def]),
    ).values(),
  ]

  // For each compulsory type, the set of team|date|shift keys with a valid
  // on-time submission this month. Also track each team's latest submission.
  const setsByLabel = new Map<string, Set<string>>()
  const teamMeta = new Map<string, { dept: string; group: number; lastSub: string }>()

  const perType = await Promise.all(compulsoryDefs.map((def) => fetchTypeRows(admin, def, start, end)))

  compulsoryDefs.forEach((def, i) => {
    const set = new Set<string>()
    for (const row of perType[i]) {
      if (!row.department || !row.group_number) continue
      if (isWeekendOff(row.date, row.department, row.group_number)) continue
      if (!isRosteredOnTime(row)) continue
      const key = `${row.department}|${row.group_number}|${row.date}|${row.shift}`
      set.add(key)
      const teamKey = `${row.department}|${row.group_number}`
      const meta = teamMeta.get(teamKey)
      if (!meta || row.created_at > meta.lastSub) {
        teamMeta.set(teamKey, { dept: row.department, group: row.group_number, lastSub: row.created_at })
      }
    }
    setsByLabel.set(def.label, set)
  })

  // A shift-key counts when every compulsory type for that department is present.
  const complete = completeShiftKeys(setsByLabel, (key) => key.split("|")[0])

  const teamScore = new Map<string, number>()
  for (const key of complete) {
    const [dept, group] = key.split("|")
    const teamKey = `${dept}|${group}`
    teamScore.set(teamKey, (teamScore.get(teamKey) || 0) + 1)
  }

  const leaderboard = [...teamScore.entries()]
    .map(([teamKey, score]) => {
      const [dept, group] = teamKey.split("|")
      return {
        department: dept,
        group_number: Number(group),
        team_label: `${dept} — Group ${group}`,
        on_time_count: score,
        last_submission: teamMeta.get(teamKey)?.lastSub || "",
      }
    })
    .sort((a, b) => b.on_time_count - a.on_time_count)
    .slice(0, 20)

  // The label ships with the data so the screen can never caption the board with a
  // period it wasn't computed over.
  return NextResponse.json({ leaderboard, period: { label: period.label, start, end } })
}
