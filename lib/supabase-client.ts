// Transitional shim. Prefer importing getSupabaseBrowserClient from
// "@/lib/supabase/client". This re-export keeps existing client components
// working until they are migrated in the frontend phase.
export { getSupabaseBrowserClient as getSupabaseClient } from "@/lib/supabase/client"
