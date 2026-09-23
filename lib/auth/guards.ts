import type { User } from "@supabase/supabase-js"
import { createServerSupabase } from "@/lib/supabase/server"
import type { ProfileRow, UserRole } from "@/lib/db/types"
import { getProfileForUser } from "@/lib/auth/profile"

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
export const requireStaff = () => requireRole(["manager", "admin"])
export const requireAdmin = () => requireRole(["admin"])

/**
 * May RECORD a physical stock movement: a receipt, an invoice, a stock count, a
 * dispatch. Mirrors the SQL predicate `can_write_stock()` (0008).
 *
 * Managers and admins are included because management owns reconciliation — a stock
 * count is their instrument for correcting ledger drift.
 */
export const requireStockWrite = () => requireRole(["stock", "manager", "admin"])

/**
 * May READ stock data. Adds `procurement`, which writes nothing. Mirrors the SQL
 * predicate `can_read_stock()` (0008).
 */
export const requireStockRead = () => requireRole(["stock", "procurement", "manager", "admin"])

// `requireProcurement` (procurement + manager + admin) is GONE as of 0008, rather
// than redefined. It meant "may touch stock", which the split makes ambiguous: the
// procurement office may now read stock and may not write it, so any single
// redefinition would have silently widened or narrowed every one of its call sites.
// Deleting it forces each one to state which half it needs, and a stale import fails
// the typecheck instead of quietly resolving to the wrong rule.
