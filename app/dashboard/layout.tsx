import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LogOut, User } from "lucide-react"
import Image from "next/image"
import { roleLabel } from "@/lib/domain/roles"
import { getProfileForUser } from "@/lib/auth/profile"
import { ThemeToggle } from "@/components/features/shared/theme-toggle"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Fetch the user's role so the header label matches their role
    const { profile, error: profileError } = await getProfileForUser(supabase, user!.id)

    if (profileError || !profile) redirect("/auth/signout")

    const displayName = roleLabel(profile.role)

    return (
        <div className="min-h-dvh bg-surface-page flex flex-col font-sans">
            <header className="bg-surface-card border-b border-hairline px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
                {/* The logo is a link home. It previously was not, leaving no way
                    back to the dashboard from the header on any screen. */}
                <Link href="/dashboard" className="flex items-center gap-2 sm:gap-4 min-w-0 rounded-xl -m-1 p-1 hover:bg-surface-sunken transition-colors">
                    <Image src="/logo.png" alt="" width={36} height={36} className="w-9 h-9 shrink-0 object-contain" />
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-xl font-bold text-ink-primary leading-tight truncate">Lawson Production</h1>
                        <p className="text-xs font-semibold text-brand uppercase tracking-widest hidden sm:block">Management System</p>
                    </div>
                </Link>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <ThemeToggle />
                    <div className="hidden sm:flex items-center gap-1.5 bg-surface-sunken px-3 py-1.5 rounded-full border border-hairline">
                        <User className="w-3.5 h-3.5 text-brand shrink-0" aria-hidden="true" />
                        <span className="text-sm font-semibold text-ink-secondary">{displayName}</span>
                    </div>
                    <form action="/auth/signout" method="post">
                        <button className="h-9 px-2.5 text-ink-muted hover:text-critical transition-colors rounded-lg hover:bg-critical-subtle flex items-center gap-1.5 cursor-pointer">
                            <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span className="text-sm font-medium hidden sm:inline">Sign Out</span>
                        </button>
                    </form>
                </div>
            </header>
            <main className="flex-1 p-4 sm:p-6 md:p-10 max-w-7xl mx-auto w-full">
                {children}
            </main>
        </div>
    )
}
