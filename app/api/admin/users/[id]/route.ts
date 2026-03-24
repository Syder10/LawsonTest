import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

async function requireAdmin() {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return { error: "Unauthorized", status: 401 }

    const { data: profile } = await ssrClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

    if (profile?.role !== "admin") {
        return { error: "Forbidden — admin only", status: 403 }
    }
    return { error: null, status: 200 }
}

function adminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

// PATCH /api/admin/users/[id] — update role, department, full_name, group_number
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { error, status } = await requireAdmin()
    if (error) return NextResponse.json({ error }, { status })

    const { id } = await params
    const body = await request.json()
    const { role, department, full_name, group_number } = body

    if (role && !["supervisor", "manager", "admin"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (role         !== undefined) updates.role         = role
    if (department   !== undefined) updates.department   = department
    if (full_name    !== undefined) updates.full_name    = full_name
    if (group_number !== undefined) updates.group_number = group_number ? Number(group_number) : null

    const { error: dbError } = await adminClient()
        .from("profiles")
        .update(updates)
        .eq("id", id)

    if (dbError) {
        return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}

// POST /api/admin/users/[id] — reset a user's password to a temporary one
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { error, status } = await requireAdmin()
    if (error) return NextResponse.json({ error }, { status })

    const { id } = await params
    const body = await request.json()
    const { tempPassword } = body

    if (!tempPassword || typeof tempPassword !== "string" || tempPassword.length < 6) {
        return NextResponse.json(
            { error: "Temporary password must be at least 6 characters" },
            { status: 400 }
        )
    }

    const { error: authError } = await adminClient().auth.admin.updateUserById(id, {
        password: tempPassword,
    })

    if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}

// DELETE /api/admin/users/[id] — remove a user entirely
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { error, status } = await requireAdmin()
    if (error) return NextResponse.json({ error }, { status })

    const { id } = await params

    const { error: authError } = await adminClient().auth.admin.deleteUser(id)
    if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
