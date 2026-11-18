import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import type { Shift } from "@/lib/db/types"

// Log a "no work this shift" record via the RLS-bound session client, so the
// row is written as the caller (supervisors write only their own).
//
// Note: reason is accepted as free text (the "Other" option lets supervisors
// type a custom reason). The old route validated against a fixed list, which
// silently rejected every custom "Other" reason.
export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, profile, supabase } = auth.ctx

  let body: { date?: string; shift?: Shift; group?: number | null; department?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const reason = body.reason?.trim()
  if (!body.date || !body.shift || !reason) {
    return NextResponse.json({ error: "date, shift and reason are required." }, { status: 400 })
  }

  const isStaff = profile.role === "manager" || profile.role === "admin"
  const department = isStaff ? body.department || "General" : profile.department || "General"

  const { data, error } = await supabase
    .from("no_work_records")
    .insert({
      date: body.date,
      shift: body.shift,
      group_number: body.group ?? null,
      department,
      supervisor_name: profile.full_name,
      reason,
      user_id: user.id,
    })
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation (no_work_records_one_per_shift_uidx, 0013).
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error:
            `A no-work record already exists for ${department} on ${body.date} (${body.shift} shift).`,
        },
        { status: 409 },
      )
    }
    console.error("[no-work] insert error:", error.message)
    return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
