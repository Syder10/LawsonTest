import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LogOut } from "lucide-react"
import Image from "next/image"
import { roleLabel } from "@/lib/domain/roles"
import { getProfileForUser } from "@/lib/auth/profile"
import { ThemeToggle } from "@/components/features/shared/theme-toggle"
import { BottomTabs, HeaderNav } from "@/components/features/shared/app-nav"
import { Chip } from "@/components/primitives"

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

    // The role drives both the header label and which nav items appear.
    const { profile } = await getProfileForUser(supabase, user!.id)

    if (!profile) redirect("/auth/signout")

    return (
        <div className="min-h-dvh bg-surface-page flex flex-col font-sans">
            <header className="bg-surface-card border-b border-hairline sticky top-0 z-30 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
                    {/* The logo links home. It previously did not, so there was no
                        way back to the dashboard from the header on any screen. */}
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-2.5 min-w-0 rounded-xl -m-1 p-1 hover:bg-surface-sunken transition-colors"
                    >
                        <Image src="/logo.png" alt="" width={36} height={36} className="w-9 h-9 shrink-0 object-contain" />
                        <span className="text-base sm:text-lg font-bold text-ink-primary leading-tight truncate">
                            Lawson
                        </span>
                    </Link>

                    <HeaderNav role={profile.role} />

                    <div className="flex items-center gap-2 shrink-0">
                        <Chip tone="brand" className="hidden lg:inline-flex">{roleLabel(profile.role)}</Chip>
                        <ThemeToggle />
                        <form action="/auth/signout" method="post">
                            <button
                                className="h-9 px-2.5 flex items-center gap-1.5 rounded-lg text-ink-muted hover:text-critical-ink hover:bg-critical-subtle transition-colors cursor-pointer"
                                aria-label="Sign out"
                            >
                                <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                                <span className="text-sm font-medium hidden sm:inline">Sign out</span>
                            </button>
                        </form>
                    </div>
                </div>
            </header>

            {/* pb-20 on mobile clears the fixed bottom tab bar; without it the last
                card of every page sits underneath it. */}
            <main className="flex-1 p-4 sm:p-6 md:p-10 pb-20 md:pb-10 max-w-7xl mx-auto w-full">
                {children}
            </main>

            <BottomTabs role={profile.role} />
        </div>
    )
}
