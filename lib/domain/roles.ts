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

export type NavKey = "home" | "submit" | "receive" | "history" | "stock" | "users" | "settings" | "profile" | "qc"

export interface NavItem {
  key: NavKey
  href: string
  /** Short enough for a tab label under an icon. */
  label: string
}

const ITEM: Record<NavKey, NavItem> = {
  home: { key: "home", href: "/dashboard", label: "Home" },
  submit: { key: "submit", href: "/dashboard/forms", label: "Submit" },
  receive: { key: "receive", href: "/dashboard/stock/receipts", label: "Receive" },
  history: { key: "history", href: "/dashboard/history", label: "History" },
  stock: { key: "stock", href: "/dashboard/stock", label: "Stock" },
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
  manager: ["home", "stock", "profile"],
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
export function isActiveNav(href: string, pathname: string, all: NavItem[]): boolean {
  const root = ITEM.home.href
  const matches = all
    .map((i) => i.href)
    .filter((h) => pathname === h || (h !== root && pathname.startsWith(`${h}/`)))
  if (matches.length === 0) return false
  const best = matches.reduce((a, b) => (b.length > a.length ? b : a))
  return href === best
}
