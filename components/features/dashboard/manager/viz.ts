// Data-viz tokens for the dashboards.
//
// These read the CSS custom properties from app/globals.css rather than
// hardcoding hex, so charts follow the light/dark theme. recharts needs concrete
// colour STRINGS for SVG attributes, and `var(--x)` is valid in SVG fill/stroke,
// so the indirection works without a JS theme lookup or a re-render on toggle.
//
// SERIES vs STATUS is a hard separation. The previous version used #d97706 for
// BOTH the Ginger series and the warning status, so a low-stock warning and a
// product read as the same colour. Series now sit on teal/orange and status keeps
// green/amber/red, with brand emerald reserved for UI chrome.
//
// The pair was chosen by running the dataviz validator, not by eye. The old
// emerald+amber pair measured protan ΔE 7.9 — inside the 6–8 warn band, i.e.
// green-vs-orange, the classic protanope confusion — despite this file's previous
// comment claiming "ΔE 39.3, well above the floor". Teal+orange measures protan
// 13.8 / tritan 34.5 and clears both axes outright.

export const SERIES = {
  bitters: "var(--series-bitters)",
  ginger: "var(--series-ginger)",
  total: "var(--series-total)", // neutral: an aggregate, not a third category
} as const

// Status palette — RESERVED. Never reused for a series, and never colour-alone:
// every consumer pairs these with an icon and a word (see StatusBadge).
export const STATUS = {
  red: {
    fill: "var(--status-critical)",
    soft: "bg-critical-subtle",
    ring: "border-critical/30",
    text: "text-critical-ink",
    dot: "bg-critical",
  },
  yellow: {
    fill: "var(--status-warning)",
    soft: "bg-warning-subtle",
    ring: "border-warning/30",
    text: "text-warning-ink",
    dot: "bg-warning",
  },
  none: {
    fill: "var(--status-good)",
    soft: "bg-good-subtle",
    ring: "border-good/30",
    text: "text-good-ink",
    dot: "bg-good",
  },
} as const

// Chart chrome: recessive hairlines, one step off the surface, never dashed.
export const SURFACE = "var(--chart-surface)"
export const GRID = "var(--chart-grid)"
export const AXIS = "var(--chart-axis)"

export const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n))
export const fmt1 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "2026-08-21" → "Aug 21" (UTC-safe, no timezone drift)
export const shortDay = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number)
  return `${MONTHS[m - 1]} ${d}`
}
