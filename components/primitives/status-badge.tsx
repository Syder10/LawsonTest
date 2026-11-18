import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react"
import type { Level } from "@/lib/domain/stock-status"
import { cn } from "@/lib/utils"

// ============================================================================
// StatusBadge — stock urgency, as colour + icon + word.
//
// Was copy-pasted VERBATIM into components/features/dashboard/manager/
// materials-table.tsx and app/dashboard/procurement/stock/page.tsx. One
// definition now; both import it.
//
// The icon and the word are not decoration, they are the accessibility
// mechanism: status must never be carried by colour alone. It matters twice over
// here because the brand is green and "OK" is green, and because the warning
// amber sits below 3:1 on a light surface by design — the pairing is what makes
// that legal.
// ============================================================================

const META: Record<Level, { label: string; Icon: typeof AlertCircle; className: string }> = {
  red: {
    label: "Critical",
    Icon: AlertCircle,
    className: "bg-critical-subtle text-critical-ink border-critical/30",
  },
  yellow: {
    label: "Low",
    Icon: AlertTriangle,
    className: "bg-warning-subtle text-warning-ink border-warning/30",
  },
  none: {
    label: "OK",
    Icon: CheckCircle2,
    className: "bg-good-subtle text-good-ink border-good/30",
  },
}

export function StatusBadge({ level, className }: { level: Level; className?: string }) {
  const { label, Icon, className: tone } = META[level]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      {label}
    </span>
  )
}
