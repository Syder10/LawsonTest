"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardList, History, Home, PackagePlus, SlidersHorizontal, User, Users, Warehouse } from "lucide-react"
import { isActiveNav, navFor, type NavKey } from "@/lib/domain/roles"
import { cn } from "@/lib/utils"

// ============================================================================
// Role-aware navigation.
//
// Bottom tab bar on phones (where supervisors work, often one-handed at a
// machine) and a header row on desktop (where managers work). The routes come
// from lib/domain/roles so the two renderings can never disagree.
//
// This replaces a hub-and-spoke model with no persistent nav at all: the only way
// between sections was a dashboard card out and a back-arrow in, and three of the
// four roles had no link to their own Profile whatsoever.
// ============================================================================

const ICON: Record<NavKey, typeof Home> = {
  home: Home,
  submit: ClipboardList,
  receive: PackagePlus,
  history: History,
  stock: Warehouse,
  users: Users,
  settings: SlidersHorizontal,
  profile: User,
}

/** Horizontal nav for the header. Hidden below `md`, where the tab bar takes over. */
export function HeaderNav({ role }: { role: string }) {
  const pathname = usePathname()
  const items = navFor(role)

  return (
    <nav aria-label="Main" className="hidden md:flex items-center gap-1">
      {items.map((item) => {
        const active = isActiveNav(item.href, pathname, items)
        const Icon = ICON[item.key]
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "h-9 px-3 flex items-center gap-1.5 rounded-lg text-sm font-semibold transition-colors",
              active
                ? "bg-brand-subtle text-brand-subtle-ink"
                : "text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Fixed bottom tab bar for phones. Shown below `md` only.
 *
 * `pb-[env(safe-area-inset-bottom)]` keeps the tabs clear of the iOS home
 * indicator — without it the last few pixels of each tap target sit under the
 * system gesture area, which is precisely where a thumb lands.
 */
export function BottomTabs({ role }: { role: string }) {
  const pathname = usePathname()
  const items = navFor(role)

  return (
    <nav
      aria-label="Main"
      // No backdrop-blur: behind a 95%-opaque background a 4px blur is invisible, so
      // it was a backdrop-filter on a viewport-wide bar present on EVERY dashboard
      // page — re-sampled whenever the content behind it repaints — bought for an
      // effect nobody can see. Opaque enough is cheaper and looks the same.
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-hairline bg-surface-card/95 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = isActiveNav(item.href, pathname, items)
          const Icon = ICON[item.key]
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "h-14 flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-[0.97]",
                  active ? "text-brand" : "text-ink-muted",
                )}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold leading-none">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
