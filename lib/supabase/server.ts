import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/lib/db/types"

// Server-side client bound to the request's auth cookies. RLS-enforced — this
// is the DEFAULT client for server components, server actions, and API routes.
// The caller acts as the signed-in user, so the database's RLS policies decide
// what they can see and do.
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — safe to ignore when middleware
            // is refreshing the session.
          }
        },
      },
    },
  )
}

/** @deprecated Transitional alias for the old name. Use createServerSupabase. */
export const createClient = createServerSupabase
