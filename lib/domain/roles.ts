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

export const ROLE_COLORS: Record<string, string> = {
  supervisor: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manager: "bg-slate-100 text-slate-700 border-slate-200",
  admin: "bg-zinc-800 text-zinc-100 border-zinc-700",
  procurement: "bg-blue-50 text-blue-700 border-blue-200",
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
// admins and procurement had NO path to /dashboard/history or /dashboard/profile
// at all — not even to change their own password. Both were URL-typing-only,
// even though history/page.tsx explicitly builds an all-departments manager view.
//
// Each list is capped at FIVE so it fits a thumb-reachable bottom tab bar without
// a "More" overflow. That cap is a real constraint, so each role gets the four or
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

const NAV_BY_ROLE: Record<UserRole, NavKey[]> = {
  supervisor: ["home", "submit", "history", "profile"],
  manager: ["home", "submit", "history", "stock", "profile"],
  procurement: ["home", "receive", "stock", "history", "profile"],
  // Admins get Users over Submit: they manage accounts rather than sit on a
  // shift roster, and the cap is five.
  admin: ["home", "users", "history", "stock", "profile"],
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
 */
export function isActiveNav(href: string, pathname: string, all: NavItem[]): boolean {
  const matches = all
    .map((i) => i.href)
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
  if (matches.length === 0) return false
  const best = matches.reduce((a, b) => (b.length > a.length ? b : a))
  return href === best
}
