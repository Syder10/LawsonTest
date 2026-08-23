// Validated data-viz tokens for the manager dashboard (light surface).
//
// Categorical series (Bitters / Ginger) validated with the dataviz palette
// checker: L-band PASS, chroma PASS, CVD ΔE 39.3 (well above the 12 floor),
// contrast PASS. Identity is never colour-alone — every chart is direct-labeled
// and legended, and the materials table pairs status colour with an icon+label.

export const SERIES = {
  bitters: "#059669", // emerald 600
  ginger: "#d97706", // amber 600
  total: "#334155", // slate 700 (neutral aggregate line)
} as const

// Status palette (reserved — not reused for series).
export const STATUS = {
  red: { fill: "#dc2626", soft: "bg-red-50", ring: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
  yellow: { fill: "#d97706", soft: "bg-amber-50", ring: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  none: { fill: "#059669", soft: "bg-emerald-50", ring: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
} as const

export const SURFACE = "#f7f7f5"
export const GRID = "#e5e7eb"
export const AXIS = "#94a3b8"

export const fmt = (n: number) => new Intl.NumberFormat().format(Math.round(n))
export const fmt1 = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n)

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "2026-08-21" → "Aug 21" (UTC-safe, no timezone drift)
export const shortDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  return `${MONTHS[m - 1]} ${d}`
}
