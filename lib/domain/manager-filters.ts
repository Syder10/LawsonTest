import { DEPARTMENTS, PRODUCTS } from "@/lib/domain/record-types"
import { SHIFT_ORDER } from "@/lib/shift-config"
import { ALL_TIME } from "@/lib/domain/date-window"
import { hasProductSplit } from "@/lib/domain/dept-metrics"

export interface ManagerFilters {
  from: string
  to: string
  shift: string
  department: string
  product: string
}

export function getDefaultManagerFilters(): ManagerFilters {
  return {
    from: ALL_TIME,
    to: new Date().toISOString().slice(0, 10),
    shift: "",
    department: "",
    product: "",
  }
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateStr(s: string): boolean {
  if (!DATE_REGEX.test(s)) return false
  const t = Date.parse(s)
  return !isNaN(t)
}

/**
 * Validates and extracts ManagerFilters from URL query parameters.
 * Any missing, unrecognised, or malicious parameters fall back to safe defaults.
 * Never passes unvalidated URL text to the API.
 */
export function parseManagerFiltersFromParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): ManagerFilters {
  const defaults = getDefaultManagerFilters()
  const get = (k: string): string => {
    if (params instanceof URLSearchParams) {
      return params.get(k) ?? ""
    }
    const val = params[k]
    return typeof val === "string" ? val : Array.isArray(val) ? (val[0] ?? "") : ""
  }

  const rawFrom = get("from")
  const rawTo = get("to")
  const rawShift = get("shift")
  const rawDept = get("department")
  const rawProduct = get("product")

  const from = rawFrom === ALL_TIME || isValidDateStr(rawFrom) ? rawFrom : defaults.from
  const to = isValidDateStr(rawTo) ? rawTo : defaults.to
  const shift = (SHIFT_ORDER as readonly string[]).includes(rawShift) ? rawShift : ""
  const department = (DEPARTMENTS as readonly string[]).includes(rawDept) ? rawDept : ""

  // Rule: Product only applies if Overview or department has product split
  const productApplies = department === "" || hasProductSplit(department)
  const product = productApplies && (PRODUCTS as readonly string[]).includes(rawProduct) ? rawProduct : ""

  return { from, to, shift, department, product }
}

/**
 * Serialises valid filters into URLSearchParams for syncing with router.replace.
 */
export function filtersToSearchParams(filters: ManagerFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.from && filters.from !== ALL_TIME) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  if (filters.shift) params.set("shift", filters.shift)
  if (filters.department) params.set("department", filters.department)
  if (filters.product) params.set("product", filters.product)
  return params
}

/**
 * Computes the Export button URL and descriptive label based on the current
 * department and whether the filter window falls inside one calendar month.
 */
export function buildExportParams(filters: ManagerFilters): {
  url: string
  label: string
} {
  const params = new URLSearchParams()
  if (filters.department) {
    params.set("department", filters.department)
  }

  // Check if window falls inside one calendar month
  const isOneCalendarMonth =
    filters.from !== ALL_TIME &&
    isValidDateStr(filters.from) &&
    isValidDateStr(filters.to) &&
    filters.from.slice(0, 7) === filters.to.slice(0, 7)

  let monthLabel: string | null = null
  if (isOneCalendarMonth) {
    const monthStr = filters.from.slice(0, 7)
    params.set("month", monthStr)
    const [year, month] = monthStr.split("-").map(Number)
    const d = new Date(Date.UTC(year, month - 1, 1))
    monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
  }

  let label = "Export"
  if (filters.department && monthLabel) {
    label = `Export ${filters.department}, ${monthLabel}`
  } else if (filters.department) {
    label = `Export ${filters.department}`
  } else if (monthLabel) {
    label = `Export All, ${monthLabel}`
  } else {
    label = "Export"
  }

  const qs = params.toString()
  return {
    url: `/api/records/export${qs ? `?${qs}` : ""}`,
    label,
  }
}

