import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ManagerDashboard } from "@/components/features/dashboard/ManagerDashboard"
import { SupervisorDashboard } from "@/components/features/dashboard/SupervisorDashboard"

export default async function DashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    const displayEmail = user?.email || 'User'
    const username = displayEmail.split('@')[0]

    // Fetch the user's role from the profiles table
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    const role = profile?.role || 'supervisor'

    if (role === 'manager' || role === 'admin') {
        return <ManagerDashboard username={username} userId={user.id} />
    }

    return <SupervisorDashboard username={username} userId={user.id} />
}
