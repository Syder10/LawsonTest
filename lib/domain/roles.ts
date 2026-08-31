import type { UserRole } from "@/lib/db/types"

// Shared role presentation. The label map was duplicated in the dashboard
// layout header and the user-management screen.
export const ROLES: UserRole[] = ["supervisor", "manager", "admin", "procurement"]

export const ROLE_LABELS: Record<string, string> = {
  supervisor: "Supervisor",
  manager: "Manager",
  admin: "Administrator",
  procurement: "Stock Office",
}

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
  procurement: "bg-surface-sunken text-ink-secondary border-line-strong",
  supervisor: "bg-surface-card text-ink-muted border-hairline",
}

// Object.hasOwn, not `?? "Supervisor"`: a key that collides with an inherited
// Object member ("constructor", "toString") would otherwise resolve to that
// function, survive the ?? (it is not null), and render as source text.
export const roleLabel = (role: string) =>
  Object.hasOwn(ROLE_LABELS, role) ? ROLE_LABELS[role] : "Supervisor"

export const isKnownRole = (role: string): role is UserRole =>
  (ROLES as string[]).includes(role)

// ── Login forms ─────────────────────────────────────────────────────────────
// The login screen offers three forms. The mode is only a UI affordance: what a
// user can actually DO is decided entirely by profiles.role once they are in
// (app/dashboard/page.tsx routes on it, and lib/auth/guards.ts enforces it).
export type LoginMode = "supervisor" | "manager" | "admin"

const LOGIN_MODES: LoginMode[] = ["supervisor", "manager", "admin"]

export const normalizeLoginMode = (raw: string | null | undefined): LoginMode =>
  LOGIN_MODES.includes(raw as LoginMode) ? (raw as LoginMode) : "supervisor"

/**
 * Whether `role` may sign in through the `mode` form.
 *
 * FLOOR semantics — a mode states the MINIMUM privilege its form requires, not
 * an exact match. This still stops a supervisor reaching the manager/admin
 * forms, but does NOT lock higher-privileged users out of the default one.
 *
 * The supervisor form is the general entry point, so every valid role may use
 * it; an admin signing in there just lands on the admin dashboard. Requiring an
 * exact match there used to sign admins and managers straight back out with
 * "This account must use its assigned access level.", and gave `procurement`
 * (which has no form of its own) no coherent way in.
 */
export function roleSatisfiesMode(role: string, mode: LoginMode): boolean {
  if (mode === "admin") return role === "admin"
  if (mode === "manager") return role === "manager" || role === "admin"
  return isKnownRole(role)
}

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

export type NavKey = "home" | "submit" | "receive" | "history" | "stock" | "users" | "profile"

export interface NavItem {
  key: NavKey
  href: string
  /** Short enough for a tab label under an icon. */
  label: string
}

const ITEM: Record<NavKey, NavItem> = {
  home: { key: "home", href: "/dashboard", label: "Home" },
  submit: { key: "submit", href: "/dashboard/forms", label: "Submit" },
  receive: { key: "receive", href: "/dashboard/procurement/submit", label: "Receive" },
  history: { key: "history", href: "/dashboard/history", label: "History" },
  stock: { key: "stock", href: "/dashboard/procurement/stock", label: "Stock" },
  users: { key: "users", href: "/dashboard/admin/users", label: "Users" },
  profile: { key: "profile", href: "/dashboard/profile", label: "Profile" },
}

/**
 * Nav is scoped to what a role actually DOES, not to everything it may read.
 *
 * Only supervisors submit production records, so only they get Submit. Procurement
 * gets Receive (raw materials in, PPE issued out) and History, because their history
 * IS their receipts log — but not Submit, since they file no production records.
 * Managers and admins file nothing at all: they read the analytics dashboard, so
 * neither Submit nor History belongs on their bar. Managers still see record-level
 * detail through the dashboard's day drawer and the export, and /dashboard/history
 * remains reachable by URL for anyone whose role permits it — it is simply not a
 * tab, because it was never part of their job.
 */
const NAV_BY_ROLE: Record<UserRole, NavKey[]> = {
  supervisor: ["home", "submit", "history", "profile"],
  manager: ["home", "stock", "profile"],
  procurement: ["home", "receive", "stock", "history", "profile"],
  admin: ["home", "users", "stock", "profile"],
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
