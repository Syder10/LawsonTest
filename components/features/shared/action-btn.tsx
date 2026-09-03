"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// Shared quick-action row, on tokens rather than literal colours.
//
// h-14 (56px) because these are the primary targets on the supervisor and
// procurement home screens — comfortably above the 44px minimum for a thumb.
export function ActionBtn({
  href,
  icon: Icon,
  label,
  primary,
  external,
}: {
  href: string
  icon: React.ElementType
  label: string
  primary?: boolean
  external?: boolean
}) {
  const cls = cn(
    "group flex items-center gap-3 rounded-2xl px-4 min-h-14 transition-colors active:scale-[0.97]",
    primary
      ? "bg-brand-solid hover:bg-brand-solid-hover text-brand-ink shadow-sm"
      : "bg-surface-card hover:bg-surface-sunken text-ink-secondary border border-hairline shadow-sm",
  )
  const inner = (
    <>
      <span
        className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
          primary ? "bg-white/15 group-hover:bg-white/25" : "bg-surface-sunken group-hover:bg-brand-subtle",
        )}
      >
        <Icon className={cn("w-4 h-4", primary ? "text-brand-ink" : "text-brand")} aria-hidden="true" />
      </span>
      {/* min-w-0 so a long label ("Stock levels & days of cover") wraps inside the row
          instead of pushing the chevron past the edge of the card. */}
      <span className="min-w-0 text-sm font-bold">{label}</span>
      <ChevronRight
        className={cn("w-4 h-4 ml-auto shrink-0 transition-transform group-hover:translate-x-0.5", primary ? "text-brand-ink/70" : "text-ink-muted")}
        aria-hidden="true"
      />
    </>
  )
  return external ? (
    <a href={href} className={cls}>{inner}</a>
  ) : (
    <Link href={href} className={cls}>{inner}</Link>
  )
}
