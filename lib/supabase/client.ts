import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/db/types"

// Singleton browser client (anon key, RLS-enforced). Use in client components.
let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabaseBrowserClient() {
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return client
}
