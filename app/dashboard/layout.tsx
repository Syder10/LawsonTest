import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LogOut, User } from "lucide-react"

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

    // Find their username from their email if needed
    const displayEmail = user.email || 'User'
    const username = displayEmail.split('@')[0]

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-700 flex items-center justify-center rounded-xl font-bold text-lg shadow-sm">
                        L
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-emerald-950 leading-tight">Lawson Production</h1>
                        <p className="text-xs font-semibold text-emerald-600/70 uppercase tracking-widest hidden sm:block">Management System</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-full border border-slate-200">
                        <User className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm font-semibold text-slate-700">
                            {username}
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
