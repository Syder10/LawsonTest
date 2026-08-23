import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"

// Update the caller's own profile. The profile row is provisioned by the
// handle_new_user() trigger at signup, so this is a plain UPDATE (not an
// upsert). Role is deliberately NOT accepted here — role changes go through the
// admin API. Writes through the RLS-bound client (profiles_update_own policy).
export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, supabase } = auth.ctx

  let body: { full_name?: string; department?: string | null; group_number?: number | string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let group: number | null = null
  if (body.group_number !== null && body.group_number !== undefined && body.group_number !== "") {
    const n = Number(body.group_number)
    if (!Number.isInteger(n) || n < 1 || n > 3) {
      return NextResponse.json({ error: "group_number must be 1, 2, or 3." }, { status: 400 })
    }
    group = n
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: body.full_name ?? null,
      department: body.department || null,
      group_number: group,
    })
    .eq("id", user.id)

  if (error) {
    console.error("[profile/update] error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
