import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminSupabase } from "@/lib/supabase/admin"
import type { Database, ProfileRow } from "@/lib/db/types"

type RlsClient = SupabaseClient<Database>

export interface ProfileLookup {
  profile: ProfileRow | null
  /**
   * Why the lookup produced no profile:
   *   ok          — found it.
   *   missing     — CONFIRMED absent (the service role looked and found nothing).
   *   unreadable  — could not determine; the read errored, or the service-role
   *                 cross-check was unavailable. A config problem, not a data one.
   * The two failures need opposite fixes, so they must not share a message.
   */
  reason: "ok" | "missing" | "unreadable"
  error: string | null
}

/**
 * Loads the signed-in user's profile.
 *
 * The normal path is RLS-bound. The service-role retry is a repair path for
 * deployments where the `profiles_select` policy or the table grants are wrong —
 * it only ever looks up the SAME id, so it can never return another user's row.
 *
 * CRITICAL: RLS filters rows SILENTLY. A blocked read returns
 * `{ data: null, error: null }` — indistinguishable from "no such row" — so the
 * absence of an error proves nothing and we must always cross-check with the
 * service role before declaring a profile missing. See supabase/diagnose-login.sql.
 */
export async function getProfileForUser(client: RlsClient, userId: string): Promise<ProfileLookup> {
  const primary = await client.from("profiles").select("*").eq("id", userId).maybeSingle()

  if (primary.data) return { profile: primary.data as ProfileRow, reason: "ok", error: null }

  const rlsError = primary.error?.message ?? null

  try {
    const privileged = await createAdminSupabase()
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    if (privileged.data) {
      // The row exists but the user cannot see it themselves: a broken
      // profiles_select policy, or missing SELECT grants for `authenticated`.
      console.error(
        `[profile] Profile ${userId} EXISTS but is invisible to its own RLS read ` +
          `(${rlsError ?? "no error returned, so RLS or table grants are filtering it"}). ` +
          `Serving it via the service role. Fix the profiles_select policy / grants — ` +
          `run supabase/diagnose-login.sql.`,
      )
      return { profile: privileged.data as ProfileRow, reason: "ok", error: null }
    }

    if (privileged.error) {
      console.error(`[profile] Could not read profile ${userId}: ${privileged.error.message}`)
      return { profile: null, reason: "unreadable", error: privileged.error.message }
    }

    // Both the user's read and a privileged read found nothing: genuinely absent.
    return { profile: null, reason: "missing", error: rlsError }
  } catch (e) {
    // createAdminSupabase() throws when SUPABASE_SERVICE_ROLE_KEY is unset, so we
    // cannot tell "absent" from "hidden by RLS" — report it as a config problem
    // rather than guessing.
    const message = e instanceof Error ? e.message : String(e)
    console.error(
      `[profile] Profile ${userId} was not returned by its own RLS read ` +
        `(${rlsError ?? "no error"}), and the service-role cross-check is unavailable: ${message}`,
    )
    return { profile: null, reason: "unreadable", error: rlsError ?? message }
  }
}
