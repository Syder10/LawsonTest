import { type NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/guards"
import { createAdminSupabase } from "@/lib/supabase/admin"
import type { UserRole } from "@/lib/db/types"

const ROLES: UserRole[] = ["supervisor", "manager", "admin", "procurement"]

// Guard against removing the last admin (which would lock everyone out of the
// admin panel). Returns true if `excludingId` is the only remaining admin.
async function isLastAdmin(admin: ReturnType<typeof createAdminSupabase>, excludingId: string) {
  const { data } = await admin.from("profiles").select("id").eq("role", "admin")
  const adminIds = (data ?? []).map((r) => r.id)
  return adminIds.length <= 1 && adminIds.includes(excludingId)
}

// PATCH — update role / department / full_name / group_number.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { role, department, full_name, group_number } = body

  if (role && !ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  const admin = createAdminSupabase()

  // Don't let the last admin demote themselves out of the admin role.
  if (role && role !== "admin" && (await isLastAdmin(admin, id))) {
    return NextResponse.json({ error: "Cannot demote the last remaining admin." }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (role !== undefined) updates.role = role
  if (department !== undefined) updates.department = department || null
  if (full_name !== undefined) updates.full_name = full_name
  if (group_number !== undefined) updates.group_number = group_number ? Number(group_number) : null

  const { data: updatedProfile, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select("id, role")
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const updatedRole = (updatedProfile as unknown as { role?: UserRole } | null)?.role
  if (!updatedProfile || (role !== undefined && updatedRole !== role)) {
    return NextResponse.json({ error: "Profile role was not updated." }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// POST — reset a user's password.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const { tempPassword } = await request.json().catch(() => ({}))
  if (!tempPassword || typeof tempPassword !== "string" || tempPassword.length < 6) {
    return NextResponse.json({ error: "Temporary password must be at least 6 characters" }, { status: 400 })
  }

  const { error } = await createAdminSupabase().auth.admin.updateUserById(id, { password: tempPassword })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE — remove a user (auth row + cascade to profile).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const admin = createAdminSupabase()

  if (await isLastAdmin(admin, id)) {
    return NextResponse.json({ error: "Cannot delete the last remaining admin." }, { status: 400 })
  }

  // Deleting the auth user cascades to profiles (FK on delete cascade); record
  // rows keep their history with user_id set to null.
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
