import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import UserManagement from "./UserManagement"

export const dynamic = "force-dynamic"

export default async function AdminUsersPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

    if (profile?.role !== "admin") redirect("/dashboard")

    // Fetch all user profiles
    const { data: users } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, department, group_number, supervisor_id, created_at")
        .order("created_at", { ascending: false })

    return <UserManagement initialUsers={users || []} />
}

