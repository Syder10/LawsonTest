import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LogOut, User } from "lucide-react"
import Image from "next/image"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Fetch the user's role so the header label matches their role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user!.id)
        .single()

    const role = profile?.role || 'supervisor'
    const displayName = (role === 'manager' || role === 'admin') ? 'Manager' : 'Supervisor'

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <Image src="/logo.png" alt="Lawson LLC Logo" width={40} height={40} className="w-10 h-10 object-contain" />
                    <div>
                        <h1 className="text-xl font-bold text-emerald-950 leading-tight">Lawson Production</h1>
                        <p className="text-xs font-semibold text-emerald-600/70 uppercase tracking-widest hidden sm:block">Management System</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full border border-slate-200">
                        <User className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-semibold text-slate-700">
                            {displayName}
                        </span>
                    </div>
                    <form action="/auth/signout" method="post">
                        <button className="p-2 text-slate-500 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 flex items-center gap-2 group cursor-pointer">
                            <LogOut className="w-4 h-4" />
                            <span className="text-sm font-medium hidden sm:inline">Sign Out</span>
                        </button>
                    </form>
                </div>
            </header>
            <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
                {children}
            </main>
        </div>
    )
}
