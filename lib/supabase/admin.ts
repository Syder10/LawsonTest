import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/db/types"

// ⚠️  SERVICE-ROLE CLIENT — bypasses Row Level Security entirely.
//
// This is the ONLY place the service-role key should be used. Reach for it only
// when an operation genuinely cannot go through the user's RLS-bound session:
//   • admin user management (auth.admin.* + writing other users' profiles)
//   • privileged gamification writes (streaks/badges on behalf of a user)
//
// Everything else must use createServerSupabase() so RLS is enforced. Never
// import this into a client component — the key must stay server-side.
let admin: ReturnType<typeof createClient<Database>> | null = null

export function createAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — required for admin/service operations.",
    )
  }
  if (!admin) {
    admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return admin
}
