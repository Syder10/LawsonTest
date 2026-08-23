import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { createAdminSupabase } from "@/lib/supabase/admin"
import { compulsoryRecordTypes, departmentsWithCompulsory } from "@/lib/domain/record-types"
import { completeShiftKeys, fetchTypeRows, isRosteredOnTime } from "@/lib/domain/gamification"
import { isSaturdayOff } from "@/lib/shift-config"

// Weekly team on-time leaderboard. Computed here from the shared domain logic
// (the old fragile leaderboard_weekly SQL view is gone). Cross-supervisor read
// → admin client.
function weekBounds(now: Date) {
  const start = new Date(now)
  start.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7)) // Monday
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 5) // Saturday
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

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
  const { start, end } = weekBounds(new Date())

  // Distinct compulsory record types across all departments.
  const compulsoryDefs = [
    ...new Map(
      departmentsWithCompulsory()
        .flatMap((d) => compulsoryRecordTypes(d))
        .map((def) => [def.label, def]),
    ).values(),
  ]

  // For each compulsory type, the set of team|date|shift keys with a valid
  // on-time submission this week. Also track each team's latest submission.
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

  return NextResponse.json({ leaderboard })
}
