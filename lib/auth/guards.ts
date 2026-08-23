import type { User } from "@supabase/supabase-js"
import { createServerSupabase } from "@/lib/supabase/server"
import type { ProfileRow, UserRole } from "@/lib/db/types"

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

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  const profile = data as ProfileRow | null
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
export const requireProcurement = () => requireRole(["procurement", "manager", "admin"])
