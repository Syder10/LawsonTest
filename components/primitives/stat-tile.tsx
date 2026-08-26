import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Card } from "./card"
import { Eyebrow } from "./text"

// ============================================================================
// StatTile — the "figure is the chart" form.
//
// Follows the stat-tile contract: label (sentence case), value (auto-compact),
// optional delta vs a named period, optional sub-line.
//
// The value uses PROPORTIONAL figures deliberately — tabular-nums gives every
// digit the width of a 0, which makes a number like 121 look loose at display
// size. Tabular figures are for columns that must align vertically (see
// DataTable), not for a single large number.
//
// `accent` replaces the previous 3-value enum ("emerald" | "amber" | "slate"),
// which could not cover five departments or a product split. The accent is a 2px
// left rule, never applied to the number itself: colouring the figure would make
// the value's own hue carry meaning it does not have.
// ============================================================================

type Accent = "brand" | "neutral" | "bitters" | "ginger" | "good" | "warning" | "critical"

const ACCENT: Record<Accent, string> = {
  brand: "bg-brand",
  neutral: "bg-line-strong",
  bitters: "bg-series-bitters",
  ginger: "bg-series-ginger",
  good: "bg-good",
  warning: "bg-warning",
  critical: "bg-critical",
}

/** 1,284 · 12.9K · 4.2M — keeps a tile readable without truncating. */
export function compact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `${(n / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`
  return new Intl.NumberFormat().format(Math.round(n))
}

export function StatTile({
  label,
  value,
  unit,
  sub,
  icon,
  accent = "neutral",
  delta,
  className,
}: {
  label: string
  value: number | string
  unit?: string
  sub?: ReactNode
  icon?: ReactNode
  accent?: Accent
  /** Signed change vs a named period. `up` says whether up is good. */
  delta?: { value: number; period: string; up?: "good" | "bad" }
  className?: string
}) {
  const shown = typeof value === "number" ? compact(value) : value
  const deltaTone =
    !delta || delta.value === 0
      ? "text-ink-muted"
      : (delta.value > 0) === (delta.up !== "bad")
        ? "text-good-ink"
        : "text-critical-ink"

  return (
    <Card className={cn("relative", className)}>
      <span className={cn("absolute left-0 top-3 bottom-3 w-0.5 rounded-full", ACCENT[accent])} aria-hidden="true" />
      <div className="p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <Eyebrow className="truncate">{label}</Eyebrow>
          {icon && <span className="text-ink-muted shrink-0">{icon}</span>}
        </div>
        <p className="mt-1.5 text-2xl font-bold text-ink-primary leading-none">
          {shown}
          {unit && <span className="ml-1 text-sm font-semibold text-ink-muted">{unit}</span>}
        </p>
        {delta && (
          <p className={cn("mt-1 text-xs font-semibold", deltaTone)}>
            {delta.value > 0 ? "+" : ""}
            {compact(delta.value)} <span className="font-medium text-ink-muted">vs {delta.period}</span>
          </p>
        )}
        {sub && <p className="mt-1 text-xs font-medium text-ink-muted">{sub}</p>}
      </div>
    </Card>
  )
}
