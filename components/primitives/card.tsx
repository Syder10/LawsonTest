import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// ============================================================================
// Card — the app's one panel surface.
//
// Replaces 19 inline card declarations that had drifted into three separate
// identities: `rounded-3xl border-emerald-100 shadow-sm` (the "emerald world":
// forms, history, profile), `rounded-2xl border-slate-200` (the "data world":
// manager, procurement), and `border-zinc-100` (admin). Same component, three
// spellings, plus a fourth in components/ui/card.tsx that nothing imported.
//
// `tone` keeps the one meaningful distinction — brand-tinted page panels vs
// neutral data panels — as a prop instead of a per-file habit.
// ============================================================================

type Tone = "data" | "brand"

const TONE: Record<Tone, string> = {
  // Neutral: dense data — tables, charts, filter bars, stat tiles.
  data: "bg-surface-card border-hairline",
  // Brand-tinted: page-level content panels the supervisor reads and fills in.
  brand: "bg-surface-card border-brand/15",
}

export function Card({
  children,
  tone = "data",
  className,
  padded = false,
  as: Tag = "div",
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  /** Adds the standard inner padding. Omit when the card owns a table or header. */
  padded?: boolean
  as?: "div" | "section" | "article" | "li"
}) {
  return (
    <Tag className={cn("rounded-2xl border shadow-sm overflow-hidden", TONE[tone], padded && "p-4 sm:p-6", className)}>
      {children}
    </Tag>
  )
}

/**
 * Card header with a title and optional trailing actions. Separated by a
 * hairline, so a card can hold a header plus a full-bleed table beneath it.
 */
export function CardHeader({
  title,
  hint,
  actions,
  className,
}: {
  title: ReactNode
  /** Secondary explanation, e.g. threshold legends. Hidden on narrow screens. */
  hint?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-4 py-3 border-b border-hairline flex items-center justify-between gap-3", className)}>
      <h3 className="text-sm font-bold text-ink-primary truncate">{title}</h3>
      <div className="flex items-center gap-3 shrink-0">
        {hint && <span className="text-xs font-medium text-ink-muted hidden sm:inline">{hint}</span>}
        {actions}
      </div>
    </div>
  )
}
