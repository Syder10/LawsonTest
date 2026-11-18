import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"

// Update the caller's own profile. The profile row is provisioned by the
// handle_new_user() trigger at signup, so this is a plain UPDATE (not an upsert).
// Writes through the RLS-bound client (profiles_update_own policy).
//
// ONLY full_name is self-editable. role, department and group_number are
// privileged: they decide the supervisor's shift roster, which record types they
// may submit, and how they are scored, so an administrator assigns them via
// /api/admin/users. This route not accepting them is a convenience, NOT the
// boundary — the real guard is the DB trigger in
// 0003_identity.sql, which rejects the change even if the caller
// talks to PostgREST directly with their own JWT.
export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, supabase } = auth.ctx

  let body: { full_name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const fullName = body.full_name?.trim()
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 })
  }

  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id)

  if (error) {
    // 42501 = insufficient_privilege, raised by the profile guard trigger. Should
    // be unreachable from here (we only send full_name) but surfacing it as 403
    // beats a misleading 500 if that ever changes.
    if (error.code === "42501") {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error("[profile/update] error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
