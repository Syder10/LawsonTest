import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

// ============================================================================
// Chip — a small labelled token: record type, product, shift, role, material tag.
//
// Replaces ~10 inline variants that disagreed on radius (rounded / rounded-md /
// rounded-full), size (text-[9px] through text-xs) and colour family.
//
// For stock urgency use StatusBadge instead — it pairs the colour with an icon
// and a word, which a bare chip does not.
// ============================================================================

type ChipTone = "neutral" | "brand" | "good" | "warning" | "critical" | "bitters" | "ginger"

const TONE: Record<ChipTone, string> = {
  neutral: "bg-surface-sunken text-ink-secondary border-hairline",
  brand: "bg-brand-subtle text-brand-subtle-ink border-brand/20",
  good: "bg-good-subtle text-good-ink border-good/30",
  warning: "bg-warning-subtle text-warning-ink border-warning/30",
  critical: "bg-critical-subtle text-critical-ink border-critical/30",
  // Product identity, matching the chart series so a chip and a bar agree.
  bitters: "bg-series-bitters/10 text-series-bitters border-series-bitters/25",
  ginger: "bg-series-ginger/10 text-series-ginger border-series-ginger/25",
}

export function Chip({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: ReactNode
  tone?: ChipTone
  icon?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
