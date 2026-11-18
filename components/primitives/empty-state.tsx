import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// ============================================================================
// EmptyState — replaces six different treatments of "there is nothing here":
// a full illustrated card with a CTA, bare centred text, a one-line paragraph,
// and italic grey text, depending on which file you were in.
//
// An empty screen is an invitation to act, not a shrug — so `action` is a
// first-class slot and the copy says what to do next rather than apologising.
// ============================================================================

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  compact = false,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
  /** Tighter variant for use inside a card or a chart well. */
  compact?: boolean
}) {
  return (
    <div className={cn("text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {icon && (
        <div className="mx-auto mb-3 h-11 w-11 flex items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
          {icon}
        </div>
      )}
      <p className={cn("font-semibold text-ink-primary", compact ? "text-sm" : "text-base")}>{title}</p>
      {description && <p className="mt-1 text-sm text-ink-muted max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
