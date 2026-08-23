import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/guards"
import { createAdminSupabase } from "@/lib/supabase/admin"
import type { UserRole } from "@/lib/db/types"

const ROLES: UserRole[] = ["supervisor", "manager", "admin", "procurement"]

// GET /api/admin/users — list all users (admin only).
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Service role: listing all profiles is exactly the RLS-bypassing operation
  // that justifies the admin client.
  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, department, group_number, created_at")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data ?? [] })
}

// POST /api/admin/users — create a new account (admin only).
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const { username, password, role, department, full_name, group_number } = body

  if (!username || !password || !role) {
    return NextResponse.json({ error: "username, password and role are required" }, { status: 400 })
  }
  if (!ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  if (String(password).length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 })
  }

  const admin = createAdminSupabase()
  const email = String(username).includes("@") ? username : `${username}@llc.com`

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? "Failed to create user" }, { status: 400 })
  }

  // handle_new_user() has already created a default profile row; set the real
  // fields with an upsert (idempotent).
  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: authData.user.id,
      email,
      full_name: full_name || username,
      role,
      department: department || null,
      group_number: group_number ? Number(group_number) : null,
    },
    { onConflict: "id" },
  )

  if (profileError) {
    await admin.auth.admin.deleteUser(authData.user.id) // roll back
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: authData.user.id })
}
