import { createServerSupabase } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { LogOut } from "lucide-react"
import Image from "next/image"
import { roleLabel, sideNavFor } from "@/lib/domain/roles"
import { getProfileForUser } from "@/lib/auth/profile"
import { ThemeToggle } from "@/components/features/shared/theme-toggle"
import { BottomTabs, HeaderNav } from "@/components/features/shared/app-nav"
import { SideNav } from "@/components/features/shared/side-nav"
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

    // Roles with a desktop sidebar (the stock office) drop the header nav, which the
    // sidebar replaces, and lay the page out beside it. Phones keep the bottom tabs.
    const sideNav = sideNavFor(profile.role)

    return (
        <div className="min-h-dvh bg-surface-page flex flex-col font-sans">
            <header className="bg-surface-card border-b border-hairline sticky top-0 z-30 shadow-sm print:hidden">
                <div className={`${sideNav ? "" : "max-w-7xl mx-auto"} px-4 sm:px-6 h-16 flex items-center justify-between gap-3`}>
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

                    {!sideNav && <HeaderNav role={profile.role} />}

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
            {sideNav ? (
                <div className="flex-1 flex">
                    <SideNav sections={sideNav} title={roleLabel(profile.role)} />
                    {/* min-w-0 lets wide tables scroll inside the page instead of
                        pushing the sidebar off screen. */}
                    <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 pb-20 md:pb-8 print:p-0">
                        <div className="max-w-7xl mx-auto w-full">{children}</div>
                    </main>
                </div>
            ) : (
                <main className="flex-1 p-4 sm:p-6 md:p-10 pb-20 md:pb-10 max-w-7xl mx-auto w-full print:p-0">
                    {children}
                </main>
            )}

            <div className="print:hidden">
                <BottomTabs role={profile.role} />
            </div>
        </div>
    )
}
