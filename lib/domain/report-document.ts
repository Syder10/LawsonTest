// ============================================================================
// Printed-report conventions, shared by every formal document the app prints
// (the procurement stock analysis report, the department production matrices).
//
// The house header reads "<COMPANY> LLC – <DEPARTMENT>", in the format of the
// paper reports the business already files. Declared once so two documents can
// never spell the company differently.
// ============================================================================

export const COMPANY_NAME = "Lawson"
export const COMPANY_SUFFIX = "LLC"

/** "LAWSON LLC – PROCUREMENT AND STOCK DEPARTMENT" */
export function documentHeaderText(department: string): string {
  return `${COMPANY_NAME} ${COMPANY_SUFFIX} – ${department}`.toUpperCase()
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a real calendar date in YYYY-MM-DD form ("2026-02-30" is false). */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

/**
 * "2026-11-17" → "17 November 2026" (the "DD Month YYYY" form on the paper
 * reports). Parsed by hand, not through Date, so no timezone can move the day.
 * Returns "" for anything that is not a real date.
 */
export function formatReportDate(iso: string): string {
  if (!isIsoDate(iso)) return ""
  const [y, m, d] = iso.split("-").map(Number)
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`
}

/** "November 2026" for a 1-based month. */
export function formatReportMonth(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? ""} ${year}`.trim()
}

/** Thousands separators, no decimals: 12345.6 → "12,346". */
export const fmtInt = (n: number) => new Intl.NumberFormat("en-GB").format(Math.round(n))

/** Up to one decimal: 4 → "4", 4.25 → "4.3". */
export const fmtOneDecimal = (n: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(n)

/** Quantities in containers can be fractional (12.5 drums): up to two decimals, separators. */
export const fmtQty = (n: number) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n)

/** "drums" → "Drums" for a table cell; "pcs" stays as written. */
export const unitCaption = (unit: string) => (unit === "pcs" ? unit : unit.charAt(0).toUpperCase() + unit.slice(1))

/** Today's calendar date in UTC — Ghana's own time zone, so it is also the local date there. */
export const todayISO = () => new Date().toISOString().slice(0, 10)

// ── Sign-off ────────────────────────────────────────────────────────────────
// "Prepared by" is the account printing the document; "Checked by" is the title of
// the manager who owns that department's report. Titles, not names: who holds the
// post can change, and the paper is signed by hand.

export type ReportOwner = "production" | "procurement"

export const CHECKED_BY_TITLE: Record<ReportOwner, string> = {
  production: "Production Manager",
  procurement: "Procurement Manager",
}

/**
 * The preparer's name as it prints: upper case, single-spaced. Empty when the
 * account has no name, so the line is left blank to be written in by hand rather
 * than filled with an email or a placeholder.
 */
export function preparedByName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().replace(/\s+/g, " ").toUpperCase()
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/**
 * "2026-10-02" → "Fri 2-10-26": weekday, then day-month-year the way dates are
 * written locally (day first), so a printed row reads the same to everyone who
 * picks it up. Weekday is taken in UTC — Ghana's own zone — so it cannot drift.
 * "" for anything that is not a real date.
 */
export function formatDayDate(iso: string): string {
  if (!isIsoDate(iso)) return ""
  const [y, m, d] = iso.split("-").map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${weekday} ${d}-${m}-${String(y % 100).padStart(2, "0")}`
}
