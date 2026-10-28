import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ManagerDashboard }     from "@/components/features/dashboard/ManagerDashboard"
import { SupervisorDashboard }  from "@/components/features/dashboard/SupervisorDashboard"
import { AdminDashboard }       from "@/components/features/dashboard/AdminDashboard"
import { ProcurementDashboard } from "@/components/features/dashboard/ProcurementDashboard"
import { StockDashboard }       from "@/components/features/dashboard/StockDashboard"
import { QcDashboardClient }    from "@/components/features/qc/qc-dashboard-client"
import { getProfileForUser } from "@/lib/auth/profile"

export default async function DashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect("/login")

    const { profile, error: profileError } = await getProfileForUser(supabase, user.id)

    if (profileError || !profile) redirect("/auth/signout")

    const role = profile.role

    if (role === "admin")        return <AdminDashboard />
    if (role === "manager")      return <ManagerDashboard />
    if (role === "procurement")  return <ProcurementDashboard />
    if (role === "stock")        return <StockDashboard userName={profile.full_name} />
    if (role === "qc_officer")   return <QcDashboardClient isManager={false} />
    if (role === "qc_manager")   return <QcDashboardClient isManager={true} />
    return <SupervisorDashboard userId={user.id} />
}
