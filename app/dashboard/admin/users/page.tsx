import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
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

    // Use service role client to bypass RLS — admins must see all profiles
    const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: users } = await serviceClient
        .from("profiles")
        .select("id, email, full_name, role, department, group_number, supervisor_id, created_at")
        .order("created_at", { ascending: false })

    return <UserManagement initialUsers={users || []} />
}
