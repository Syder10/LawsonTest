import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ManagerDashboard }     from "@/components/features/dashboard/ManagerDashboard"
import { SupervisorDashboard }  from "@/components/features/dashboard/SupervisorDashboard"
import { AdminDashboard }       from "@/components/features/dashboard/AdminDashboard"
import { ProcurementDashboard } from "@/components/features/dashboard/ProcurementDashboard"
import { getProfileForUser } from "@/lib/auth/profile"

export default async function DashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    const { profile, error: profileError } = await getProfileForUser(supabase, user.id)

    if (profileError || !profile) redirect("/auth/signout")

    const role = profile.role

    if (role === "admin")        return <AdminDashboard />
    if (role === "manager")      return <ManagerDashboard userId={user.id} />
    if (role === "procurement")  return <ProcurementDashboard />
    return <SupervisorDashboard userId={user.id} />
}
