import type { UserRole } from "@/lib/db/types"

// Shared role presentation. The label map was duplicated in the dashboard
// layout header and the user-management screen.
export const ROLES: UserRole[] = ["supervisor", "manager", "admin", "procurement", "stock", "qc_officer", "qc_manager"]

/**
 * `stock` is "Stock Officer" and `procurement` is "Procurement" — the labels changed
 * with the 0008 split, and the change matters.
 *
 * `qc_officer` and `qc_manager` handle Quality Control inspection and standards.
 */
export const ROLE_LABELS: Record<string, string> = {
  supervisor: "Supervisor",
  manager: "Manager",
  admin: "Administrator",
  procurement: "Procurement",
  stock: "Stock Officer",
  qc_officer: "QC Officer",
  qc_manager: "QC Manager",
}

/**
 * What each role is FOR, shown beside the label wherever an account is assigned.
 */
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  supervisor: "Files production records for one department",
  manager: "Views production and stock dashboards",
  admin: "Manages users, access and system settings",
  procurement: "Reads stock data — cannot record receipts or counts",
  stock: "Records receipts, invoices, stock counts, dispatch and product returns",
  qc_officer: "Records and inspects water, product, and raw material quality tests",
  qc_manager: "Manages QC standards, reviews exceptions and monitors compliance",
}

/** Roles that may RECORD a physical stock movement. Mirrors SQL `can_write_stock()`. */
export const STOCK_WRITE_ROLES: UserRole[] = ["stock"]

/** Roles that may READ stock data. Mirrors SQL `can_read_stock()`. */
export const STOCK_READ_ROLES: UserRole[] = ["stock", "procurement", "manager"]

export const canWriteStock = (role: string): boolean =>
  (STOCK_WRITE_ROLES as string[]).includes(role)

export const canReadStock = (role: string): boolean =>
  (STOCK_READ_ROLES as string[]).includes(role)

/**
 * Herb stock is CONFIDENTIAL to the Production Manager (business decision,
 * 2026-11-19). Screens use this; the database enforces the same rule in 0015
 * (can_read_herbs), which additionally lets the Concentrate supervisors who RECORD
 * herbs see their own entries and the opening balance their form needs.
 */
export const canSeeHerbs = (role: string): boolean => role === "manager"

/** The one department whose record type writes herb stock. Mirrors 0015's can_read_herbs(). */
export const HERB_DEPARTMENT = "Concentrate"

export const canAccessQc = (role: string): boolean =>
  (["qc_officer", "qc_manager", "admin"] as string[]).includes(role)

export const canManageQc = (role: string): boolean =>
  (["qc_manager", "admin"] as string[]).includes(role)

/**
 * Role badge styling, on the semantic tokens.
 *
 * This is an EMPHASIS ramp, not four hues: privilege reads as weight, from a
 * filled brand fill for admin down to a plain outline for the most common role.
 * The obvious alternative — a colour per role — would have had to borrow from the
 * status or series ramps, and a role badge that looks like a stock warning is
 * exactly the collision the token layer exists to prevent.
 */
export const ROLE_COLORS: Record<string, string> = {
  admin: "bg-brand-solid text-brand-ink border-brand-solid",
  manager: "bg-brand-subtle text-brand-subtle-ink border-brand/25",
  qc_manager: "bg-brand-subtle text-brand-subtle-ink border-brand/25",
  stock: "bg-surface-sunken text-ink-secondary border-line-strong",
  procurement: "bg-surface-sunken text-ink-secondary border-line-strong",
  qc_officer: "bg-surface-sunken text-ink-secondary border-line-strong",
  supervisor: "bg-surface-card text-ink-muted border-hairline",
}

// Object.hasOwn, not `?? "Supervisor"`: a key that collides with an inherited
// Object member ("constructor", "toString") would otherwise resolve to that
// function, survive the ?? (it is not null), and render as source text.
export const roleLabel = (role: string) =>
  Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role] : "Supervisor"

export const isKnownRole = (role: string): role is UserRole =>
  (ROLES as string[]).includes(role)

// ── Navigation ──────────────────────────────────────────────────────────────
// Routes as pure data (icons are mapped in the nav component, which is where JSX
// belongs). This exists because navigation was previously ROLE-ABSENT, not just
// role-unaware: only the supervisor dashboard linked anywhere, so managers,
// admins and procurement had NO path to /dashboard/profile at all — not even to
// change their own password.
//
// Each list is capped at FIVE so it fits a thumb-reachable bottom tab bar without
// a "More" overflow. That cap is a real constraint, so each role gets the three to
// five things it actually does rather than every route it may access.

export type NavKey =
  | "home"
  | "submit"
  | "receive"
  | "history"
  | "stock"
  | "users"
  | "settings"
  | "profile"
  | "qc"
  | "production"
  | "reports"

export interface NavItem {
  key: NavKey
  href: string
  /** Short enough for a tab label under an icon. */
  label: string
  /** Optional extra pathname prefixes that match this destination (e.g. nested or related routes). */
  extraPrefixes?: string[]
}

const ITEM: Record<NavKey, NavItem> = {
  home: { key: "home", href: "/dashboard", label: "Home" },
  submit: { key: "submit", href: "/dashboard/forms", label: "Submit" },
  receive: { key: "receive", href: "/dashboard/stock/receipts", label: "Receive" },
  history: { key: "history", href: "/dashboard/history", label: "History" },
  stock: {
    key: "stock",
    href: "/dashboard/stock",
    label: "Stock",
    extraPrefixes: ["/dashboard/stock/analysis"],
  },
  production: { key: "production", href: "/dashboard/production", label: "Production" },
  reports: {
    key: "reports",
    href: "/dashboard/reports",
    label: "Reports",
    extraPrefixes: ["/dashboard/stock/monthly-report", "/dashboard/history"],
  },
  users: { key: "users", href: "/dashboard/admin/users", label: "Users" },
  settings: { key: "settings", href: "/dashboard/admin/settings", label: "Settings" },
  profile: { key: "profile", href: "/dashboard/profile", label: "Profile" },
  qc: { key: "qc", href: "/dashboard/qc", label: "QC" },
}

/**
 * Nav is scoped to what a role actually DOES, not to everything it may read.
 */
const NAV_BY_ROLE: Record<UserRole, NavKey[]> = {
  supervisor: ["home", "submit", "history", "profile"],
  manager: ["home", "production", "stock", "reports", "profile"],
  procurement: ["home", "stock", "history", "profile"],
  stock: ["home", "receive", "stock", "history", "profile"],
  admin: ["home", "users", "settings", "profile"],
  qc_officer: ["home", "qc", "profile"],
  qc_manager: ["home", "qc", "profile"],
}

export function navFor(role: string): NavItem[] {
  const keys = isKnownRole(role) ? NAV_BY_ROLE[role] : NAV_BY_ROLE.supervisor
  return keys.map((k) => ITEM[k])
}

/**
 * Whether `href` is the active nav destination for `pathname`.
 *
 * Longest-prefix, not `startsWith` alone: "/dashboard" prefixes every route, so a
 * naive check would light up Home on every page.
 *
 * Home is EXACT-MATCH ONLY, which is the same problem seen from the other side.
 * Once a role's tabs no longer cover every route it can open — a manager can still
 * reach /dashboard/history by URL, it is just not their tab — prefix matching would
 * fall back to Home and claim the user is on the home screen. "Home is lit" should
 * mean "you are on Home"; on an off-tab route nothing is lit.
 */
export function isActiveNav(href: string, pathname: string, all: NavDestination[]): boolean {
  return activeNavHref(pathname, all) === href
}

/** A link that can be "the current page": its href plus any extra prefixes it owns. */
export interface NavDestination {
  href: string
  extraPrefixes?: string[]
}

/** The href of the destination `pathname` belongs to, by the rule above; null if none. */
export function activeNavHref(pathname: string, all: NavDestination[]): string | null {
  const root = ITEM.home.href

  let bestItem: NavDestination | null = null
  let longestMatchLength = -1

  for (const item of all) {
    const candidates = [item.href, ...(item.extraPrefixes ?? [])]
    for (const prefix of candidates) {
      const isMatch =
        prefix === root
          ? pathname === root
          : pathname === prefix || pathname.startsWith(`${prefix}/`)

      if (isMatch && prefix.length > longestMatchLength) {
        longestMatchLength = prefix.length
        bestItem = item
      }
    }
  }

  return bestItem?.href ?? null
}

// ── Side navigation (office roles) ──────────────────────────────────────────
// The offices work at a desk across many screens — receipts, invoices, dispatch,
// returns, reports, inspections — which a five-tab bar cannot hold. On a desktop the
// stock office, procurement, the manager and the QC manager get an ERP-style left
// sidebar with every screen they can open, grouped by what the office is doing.
// Phones keep the five bottom tabs above.
//
// Presentation only, like every nav list here: each route still runs its own guard,
// and every item below is a page that role's guard admits (asserted in roles.test).

export type SideNavKey =
  | "home"
  | "production"
  | "stock"
  | "herbs"
  | "analysis"
  | "receive"
  | "invoices"
  | "dispatch"
  | "returns"
  | "donations"
  | "matrix"
  | "reports"
  | "monthly-report"
  | "procurement-report"
  | "qc-new"
  | "qc-history"
  | "qc-standards"
  | "history"
  | "profile"

export interface SideNavItem extends NavDestination {
  key: SideNavKey
  label: string
}

export interface SideNavSection {
  heading: string
  items: SideNavItem[]
}

/** Every sidebar destination, spelled once; each role picks the ones it uses. */
const SIDE: Record<SideNavKey, SideNavItem> = {
  home: { key: "home", href: "/dashboard", label: "Dashboard" },
  production: { key: "production", href: "/dashboard/production", label: "Production analysis" },
  stock: { key: "stock", href: "/dashboard/stock", label: "Stock levels", extraPrefixes: ["/dashboard/stock/material"] },
  herbs: { key: "herbs", href: "/dashboard/stock/herbs", label: "Herbs" },
  analysis: { key: "analysis", href: "/dashboard/stock/analysis", label: "Stock analysis" },
  receive: { key: "receive", href: "/dashboard/stock/receipts", label: "Receive & issue" },
  invoices: { key: "invoices", href: "/dashboard/stock/invoices", label: "Supplier invoices" },
  dispatch: { key: "dispatch", href: "/dashboard/stock/dispatch", label: "Dispatch" },
  returns: { key: "returns", href: "/dashboard/stock/returns", label: "Product returns" },
  donations: { key: "donations", href: "/dashboard/stock/donations", label: "Donations" },
  matrix: { key: "matrix", href: "/dashboard/reports/matrix", label: "Department matrices" },
  reports: { key: "reports", href: "/dashboard/reports", label: "All reports & exports" },
  "monthly-report": { key: "monthly-report", href: "/dashboard/stock/monthly-report", label: "Monthly stock report" },
  "procurement-report": { key: "procurement-report", href: "/dashboard/stock/procurement-report", label: "Procurement report" },
  "qc-new": { key: "qc-new", href: "/dashboard/qc/new", label: "New inspection" },
  // Inspection detail pages (/dashboard/qc/<id>) and the /dashboard/qc overview light this item.
  "qc-history": { key: "qc-history", href: "/dashboard/qc/history", label: "Inspection history", extraPrefixes: ["/dashboard/qc"] },
  "qc-standards": { key: "qc-standards", href: "/dashboard/qc/standards", label: "QC standards" },
  history: { key: "history", href: "/dashboard/history", label: "Submission history" },
  profile: { key: "profile", href: "/dashboard/profile", label: "Profile" },
}

const section = (heading: string, keys: SideNavKey[]): SideNavSection => ({ heading, items: keys.map((k) => SIDE[k]) })

const VIEW_MOVEMENTS: SideNavKey[] = ["invoices", "dispatch", "returns", "donations"]
// No herbs here: herb stock is the Production Manager's alone (see canSeeHerbs).
const INVENTORY: SideNavKey[] = ["stock", "analysis"]
const ACCOUNT = section("Account", ["history", "profile"])

const SIDE_NAV_BY_ROLE: Partial<Record<UserRole, SideNavSection[]>> = {
  stock: [
    section("Overview", ["home"]),
    section("Inventory", INVENTORY),
    section("Movements", ["receive", ...VIEW_MOVEMENTS]),
    section("Reports", ["monthly-report"]),
    ACCOUNT,
  ],
  // Read-only: no Receive & issue, which only the stock role may record.
  procurement: [
    section("Overview", ["home"]),
    section("Inventory", INVENTORY),
    section("Movements", VIEW_MOVEMENTS),
    section("Reports", ["monthly-report", "procurement-report"]),
    ACCOUNT,
  ],
  manager: [
    section("Overview", ["home", "production"]),
    section("Inventory", ["stock", "herbs", "analysis"]),
    section("Movements", VIEW_MOVEMENTS),
    section("Reports", ["matrix", "monthly-report", "reports"]),
    ACCOUNT,
  ],
  qc_manager: [
    section("Overview", ["home"]),
    section("Quality control", ["qc-new", "qc-history", "qc-standards"]),
    section("Account", ["profile"]),
  ],
}

/** The desktop sidebar for a role, or null when the role uses the header nav. */
export function sideNavFor(role: string): SideNavSection[] | null {
  return isKnownRole(role) ? (SIDE_NAV_BY_ROLE[role] ?? null) : null
}
