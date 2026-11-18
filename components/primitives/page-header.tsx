import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { PageTitle, Subtle } from "./text"

// ============================================================================
// PageHeader — title, supporting line, optional back link, optional actions.
//
// Retires seven copy-pasted back-arrow circles (forms, forms/[recordType],
// history, profile, procurement/stock, procurement/submit, admin/users) which had
// drifted into three colour variants.
//
// `backHref` is optional and should become rare: with real navigation in place,
// a back arrow is only worth showing for a genuine drill-down (a specific record
// form), not for every top-level page.
// ============================================================================

export function PageHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  backHref?: string
  backLabel?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    // STACKS ON MOBILE. Side by side, the actions are `shrink-0` while the title block
    // is `min-w-0`, so a header with three buttons (the stock page has "New count",
    // "Log receipt" and "Refresh" — ~330px together) squeezed the title to a few pixels
    // and "Stock levels" wrapped one letter per line. Below `sm` the title gets the full
    // width and the buttons wrap underneath it.
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="mt-0.5 shrink-0 h-10 w-10 flex items-center justify-center rounded-full border border-hairline bg-surface-card text-ink-secondary hover:bg-surface-sunken hover:text-ink-primary transition-colors active:scale-[0.97]"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0">
          <PageTitle>{title}</PageTitle>
          {description && <Subtle className="mt-1">{description}</Subtle>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  )
}
