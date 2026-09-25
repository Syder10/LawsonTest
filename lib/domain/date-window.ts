// ============================================================================
// "All time" as a reporting-window selection.
//
// Every dashboard that filters by a date range offers an "All time" option. The
// pieces that make that work live here, declared once and imported on every
// surface, so the client state, the request it sends, and the label it shows can
// never drift apart (NFR-2).
//
// The design: client state holds the empty string for an all-time selection, so a
// native <input type="date"> renders empty (no lower bound). The API routes read
//   searchParams.get("from") || <their own default window>
// so sending an empty string would wrongly fall through to that default. requestFrom()
// translates the empty selection to a floor date only when building the request URL,
// and the UI shows the ALL_TIME_LABEL in place of a day count so no floor date or
// sentinel is ever displayed to a user.
//
// The burn-rate / days-left projections are unaffected: they measure over the span
// of dates that actually recorded usage (see usageSpanOperatingDays), not over the
// raw window, so an all-time window does not read empty early days as zero usage.
// ============================================================================

/** The value client date state holds for an all-time selection (empty native input). */
export const ALL_TIME = ""

/**
 * Floor date sent to the API for an all-time window. A lower BOUND that predates any
 * record the system holds, chosen only so `.gte("date", ALL_TIME_FROM)` returns every
 * row. Not a business figure and not the date the plant opened.
 */
export const ALL_TIME_FROM = "2000-01-01"

/** Shown wherever an all-time window is active, in place of a day count. */
export const ALL_TIME_LABEL = "All time"

/** True when `from` is the all-time selection. */
export function isAllTime(from: string): boolean {
  return from === ALL_TIME
}

/**
 * The `from` value to put on a request URL: the floor date for an all-time selection,
 * the chosen date otherwise. This is what makes "all time" actually fetch all time
 * rather than the route's built-in default window.
 */
export function requestFrom(from: string): string {
  return isAllTime(from) ? ALL_TIME_FROM : from
}
