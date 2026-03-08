import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    try {
        const supabase = await createClient()

        // Auth check
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = await request.json()
        const { userId, full_name, department, group_number } = body

        // Security check: Make sure they are only updating their own profile
        if (user.id !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }

        // Upsert into profiles table
        const { error } = await supabase
            .from("profiles")
            .upsert({
                id: userId,
                full_name,
                department,
                group_number: Number(group_number),
                username: user.email, // keeping username synced just in case
                updated_at: new Date().toISOString()
            }, { onConflict: "id" })

        if (error) {
            console.error("Supabase Profile Upsert Error:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Profile update error:", error)
        return NextResponse.json(
            { error: "Internal Server Error" },
            { status: 500 }
        )
    }
}
