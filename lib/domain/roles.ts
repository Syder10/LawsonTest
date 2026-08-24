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
