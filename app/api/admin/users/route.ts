import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Admin-only guard helper
async function requireAdmin() {
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) return { error: "Unauthorized", status: 401, user: null, ssrClient: null }

    const { data: profile } = await ssrClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

    if (profile?.role !== "admin") {
        return { error: "Forbidden — admin only", status: 403, user: null, ssrClient: null }
    }
    return { error: null, status: 200, user, ssrClient }
}

// GET /api/admin/users — list all users with their profiles
export async function GET() {
    const { error, status, ssrClient } = await requireAdmin()
    if (error) return NextResponse.json({ error }, { status })

    const { data: profiles, error: dbError } = await ssrClient!
        .from("profiles")
        .select("id, email, full_name, role, department, group_number, supervisor_id, created_at")
        .order("created_at", { ascending: false })

    if (dbError) {
        return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ users: profiles || [] })
}

// POST /api/admin/users — create a new user account
export async function POST(request: Request) {
    const { error, status } = await requireAdmin()
    if (error) return NextResponse.json({ error }, { status })

    const body = await request.json()
    const { username, password, role, department, full_name, group_number } = body

    if (!username || !password || !role) {
        return NextResponse.json(
            { error: "username, password and role are required" },
            { status: 400 }
        )
    }

    if (!["supervisor", "manager", "admin"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    if (password.length < 6) {
        return NextResponse.json(
            { error: "Password must be at least 6 characters" },
            { status: 400 }
        )
    }

    // Use the service role client to create auth users
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const email = username.includes("@") ? username : `${username}@llc.com`

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // skip email confirmation
    })

    if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Insert the profile row
    const { error: profileError } = await adminClient
        .from("profiles")
        .insert({
            id:           authData.user.id,
            email,
            full_name:    full_name || username,
            role,
            department:   department || null,
            group_number: group_number ? Number(group_number) : null,
            supervisor_id: username.includes("@") ? username.split("@")[0] : username,
        })

    if (profileError) {
        // Rollback auth user if profile insert fails
        await adminClient.auth.admin.deleteUser(authData.user.id)
        return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, userId: authData.user.id })
}
