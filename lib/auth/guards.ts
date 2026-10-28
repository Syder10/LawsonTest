import type { User } from "@supabase/supabase-js"
import { createServerSupabase } from "@/lib/supabase/server"
import type { ProfileRow, UserRole } from "@/lib/db/types"
import { getProfileForUser } from "@/lib/auth/profile"
import { STOCK_READ_ROLES, STOCK_WRITE_ROLES } from "@/lib/domain/roles"

// ============================================================================
// Auth guards — one implementation, used by every API route / server action.
// Replaces the duplicated requireAdmin / requireProcurement / inline
// "getUser() then fetch profiles.role" blocks scattered across the old routes.
// ============================================================================

type ServerClient = Awaited<ReturnType<typeof createServerSupabase>>

export interface AuthContext {
  user: User
  profile: ProfileRow
  /** RLS-bound client for the signed-in user — reuse it in the route. */
  supabase: ServerClient
}

export type GuardResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; status: 401 | 403; error: string }

/** Requires a signed-in user with a profile. */
export async function requireUser(): Promise<GuardResult> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, status: 401, error: "Unauthorized" }

  const { profile } = await getProfileForUser(supabase, user.id)
  if (!profile) return { ok: false, status: 403, error: "No profile found for this account." }

  return { ok: true, ctx: { user, profile, supabase } }
}

/** Requires a signed-in user whose role is one of `roles`. */
export async function requireRole(roles: UserRole[]): Promise<GuardResult> {
  const res = await requireUser()
  if (!res.ok) return res
  if (!roles.includes(res.ctx.profile.role)) {
    return { ok: false, status: 403, error: "Forbidden" }
  }
  return res
}

// Convenience wrappers for the common cases.
export const requireManager = () => requireRole(["manager"])
export const requireSupervisor = () => requireRole(["supervisor"])
export const requireAdmin = () => requireRole(["admin"])

/**
 * Staff view for production analytics and dashboards. Scoped to manager only,
 * as admin is restricted to system management and does not view operational records.
 */
export const requireStaff = requireManager

/**
 * May RECORD a physical stock movement: a receipt, an invoice, a stock count, a
 * dispatch or return. Only Stock Officer writes (0010); managers view dashboards
 * and admins manage the system.
 */
export const requireStockWrite = () => requireRole(STOCK_WRITE_ROLES)

/**
 * May READ stock data. Adds `procurement`, which writes nothing. Mirrors the SQL
 * predicate `can_read_stock()` (0010). Admin has system screens only.
 */
export const requireStockRead = () => requireRole(STOCK_READ_ROLES)

/**
 * QC access guards: QC Officers and QC Managers can view records and submit tests.
 * Only QC Managers (and admins) can configure standards or view executive QC metrics.
 */
export const requireQcAccess = () => requireRole(["qc_officer", "qc_manager", "admin"])
export const requireQcManager = () => requireRole(["qc_manager", "admin"])

// `requireProcurement` (procurement + manager + admin) is GONE as of 0008, rather
// than redefined. It meant "may touch stock", which the split makes ambiguous: the
// procurement office may now read stock and may not write it, so any single
// redefinition would have silently widened or narrowed every one of its call sites.
// Deleting it forces each one to state which half it needs, and a stale import fails
// the typecheck instead of quietly resolving to the wrong rule.
