"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Gift,
  History,
  LayoutDashboard,
  Leaf,
  LineChart,
  ListChecks,
  PackagePlus,
  Receipt,
  ShieldCheck,
  Table2,
  Truck,
  User,
  Warehouse,
} from "lucide-react"
import { activeNavHref, type SideNavKey, type SideNavSection } from "@/lib/domain/roles"
import { cn } from "@/lib/utils"

// ============================================================================
// ERP-style left sidebar for the office roles (desktop, `md` and up). Phones keep
// the bottom tabs. Which roles get one, and what is in it, lives in lib/domain/roles.
//
// Plain and dense on purpose: grouped sections with small uppercase headings,
// one icon per row in the muted ink, and the active row marked by a brand rule
// at its left edge plus a subtle fill — the word and the position carry it, not
// colour alone. Rows are 44px tall, the app's touch-target floor.
// ============================================================================

const ICON: Record<SideNavKey, typeof Warehouse> = {
  home: LayoutDashboard,
  production: Factory,
  stock: Warehouse,
  herbs: Leaf,
  analysis: LineChart,
  receive: PackagePlus,
  invoices: Receipt,
  dispatch: Truck,
  returns: ArrowLeftRight,
  donations: Gift,
  matrix: Table2,
  reports: FileSpreadsheet,
  "monthly-report": FileText,
  "procurement-report": ClipboardList,
  "qc-new": FlaskConical,
  "qc-history": ListChecks,
  "qc-standards": ShieldCheck,
  history: History,
  profile: User,
}

export function SideNav({ sections, title }: { sections: SideNavSection[]; title: string }) {
  const pathname = usePathname()
  const active = activeNavHref(pathname, sections.flatMap((s) => s.items))

  return (
    <aside className="hidden md:flex print:hidden w-60 lg:w-64 shrink-0 flex-col border-r border-hairline bg-surface-card sticky top-16 h-[calc(100dvh-4rem)] overflow-y-auto">
      <p className="px-5 pt-5 pb-1 text-xs font-bold uppercase tracking-widest text-ink-muted">{title}</p>
      <nav aria-label={title} className="flex-1 px-3 pb-6">
        {sections.map((section) => (
          <div key={section.heading} className="mt-4 first:mt-2">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{section.heading}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICON[item.key]
                const isActive = active === item.href
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-brand-subtle text-brand-subtle-ink font-semibold"
                          : "text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary",
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand" aria-hidden="true" />
                      )}
                      <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-brand" : "text-ink-muted")} aria-hidden="true" />
                      <span className="break-words">{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}
