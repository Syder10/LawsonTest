import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminSupabase } from "@/lib/supabase/admin"
import type { Database, ProfileRow } from "@/lib/db/types"

type RlsClient = SupabaseClient<Database>

/**
 * Loads the signed-in user's profile. The normal path remains RLS-bound; the
 * service-role fallback handles deployments where the profiles SELECT policy
 * was not applied correctly, without ever accepting a profile for another ID.
 */
export async function getProfileForUser(client: RlsClient, userId: string) {
  const primary = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()

  if (primary.data) return { profile: primary.data as ProfileRow, error: null }

  try {
    const privileged = await createAdminSupabase()
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    return {
      profile: (privileged.data as ProfileRow | null) ?? null,
      error: privileged.error ?? primary.error,
    }
  } catch {
    return { profile: null, error: primary.error }
  }
}
