import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { createAdminSupabase } from "@/lib/supabase/admin"
import { compulsoryRecordTypes } from "@/lib/domain/record-types"
import { fetchTypeRows, computeGaps, type EnvelopeRow } from "@/lib/domain/gamification"

const SYSTEM_START = "2026-04-01"

// Unresolved rostered working days that still need a submission, for the
// "unsubmitted days" prompt. Bounded to on/after the later of SYSTEM_START and
// the supervisor's profile-creation date (never nag for days before they joined)
// and up to yesterday (today is handled by the normal submit flow).
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, profile } = auth.ctx

  const dept = profile.department
  const group = profile.group_number
  const defs = dept ? compulsoryRecordTypes(dept) : []
  if (!dept || !group || defs.length === 0) {
    return NextResponse.json({ gaps: [], count: 0 })
  }

  const now = new Date()
  const joinDate = profile.created_at ? profile.created_at.slice(0, 10) : SYSTEM_START
  const floor = joinDate > SYSTEM_START ? joinDate : SYSTEM_START

  const admin = createAdminSupabase()
  const rowsByDef = new Map<string, EnvelopeRow[]>()
  await Promise.all(
    defs.map(async (def) => {
      rowsByDef.set(def.label, await fetchTypeRows(admin, def, floor, undefined, user.id))
    }),
  )

  const { data: noWorkAll } = await admin
    .from("no_work_records")
    .select("date, created_at, shift, user_id, department, group_number, supervisor_name")
    .eq("user_id", user.id)
    .gte("date", floor)
  const noWork = (noWorkAll ?? []) as EnvelopeRow[]

  const gaps = computeGaps(rowsByDef, noWork, dept, group, floor, now)
  return NextResponse.json({ gaps, count: gaps.length })
}
