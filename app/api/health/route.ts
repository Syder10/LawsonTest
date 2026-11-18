import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Deployment diagnostics. Reports whether the server's Supabase configuration
// works, WITHOUT revealing key values or any row data.
//
// Deliberately unauthenticated: the failures it diagnoses (missing service-role
// key, unreadable profiles table) are precisely the ones that stop anyone
// signing in, so requiring a login would make it useless. It exposes only
// configuration state and database error codes — never table contents.
//
// Visit /api/health on the deployed site.
export const dynamic = "force-dynamic"

type Check = { name: string; status: "ok" | "MISSING" | "INVALID" | "FAILED"; detail: string }

const TIMEOUT_MS = 6000

function describeEnv(name: string, value: string | undefined, expect?: (v: string) => string | null): Check {
  if (!value) return { name, status: "MISSING", detail: "not set in this environment" }
  const problem = expect?.(value) ?? null
  return problem
    ? { name, status: "INVALID", detail: problem }
    : { name, status: "ok", detail: `set (${value.length} chars)` }
}

/** Maps the errors that actually occur here to the specific thing to go fix. */
function explain(code: string | undefined, message: string): string {
  const c = code ?? ""
  if (c === "PGRST205" || /schema cache/i.test(message)) {
    return "PostgREST cannot see the table. Reload the schema cache (Supabase: Settings -> API -> " +
      "Reload schema, or run `notify pgrst, 'reload schema';`) and confirm `public` is listed under " +
      "Settings -> API -> Exposed schemas."
  }
  if (c === "42P01" || /does not exist/i.test(message)) {
    return "The table does not exist in the project this deployment points at. Either the migrations " +
      "were never applied here, or NEXT_PUBLIC_SUPABASE_URL points at a DIFFERENT Supabase project."
  }
  if (c === "42501" || /permission denied/i.test(message)) {
    return /schema/i.test(message)
      ? "The API roles have no USAGE on schema `public`. This is what a " +
        "`drop schema public cascade` leaves behind — it destroys Supabase's default " +
        "grants. Apply supabase/migrations/0005_ledger_and_grants.sql."
      : "Missing table grants. Grants are checked BEFORE RLS, so no policy can " +
        "compensate. Apply supabase/migrations/0005_ledger_and_grants.sql."
  }
  if (c === "42P17" || /infinite recursion/i.test(message)) {
    return "A profiles RLS policy queries profiles without SECURITY DEFINER. Re-apply " +
      "0001_foundation.sql (is_staff/is_admin) then 0003_identity.sql."
  }
  if (/fetch failed|ENOTFOUND|ETIMEDOUT|getaddrinfo/i.test(message)) {
    return "Could not reach Supabase at all. Check NEXT_PUBLIC_SUPABASE_URL."
  }
  return "See supabase/diagnose-login.sql for a step-by-step check."
}

async function withTimeout<T>(p: PromiseLike<T>, label: string): Promise<T> {
  return (await Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
    ),
  ])) as T
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY

  const checks: Check[] = [
    describeEnv("NEXT_PUBLIC_SUPABASE_URL", url, (v) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(v.trim())
        ? null
        : "should look like https://<project-ref>.supabase.co",
    ),
    describeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", anon),
    describeEnv("SUPABASE_SERVICE_ROLE_KEY", service, (v) =>
      anon && v.trim() === anon.trim()
        ? "is identical to the ANON key — paste the service_role key instead " +
          "(Supabase: Settings -> API -> Project API keys -> service_role)"
        : null,
    ),
  ]

  // A legacy Supabase key is a JWT carrying its role, so a swapped anon/service
  // key can be caught before it becomes a confusing runtime failure. Newer
  // `sb_secret_…` keys are opaque — skip for those.
  if (service?.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(service.split(".")[1], "base64").toString())
      if (payload.role && payload.role !== "service_role") {
        const entry = checks.find((c) => c.name === "SUPABASE_SERVICE_ROLE_KEY")
        if (entry) {
          entry.status = "INVALID"
          entry.detail = `this key's role is "${payload.role}", expected "service_role"`
        }
      }
    } catch {
      /* unparseable payload — presence check stands */
    }
  }

  // ── Live database checks: the exact reads login depends on ─────────────────
  if (url && anon) {
    // As `anon` (no session). RLS has no policy for anon, so the expected result
    // is ZERO ROWS WITHOUT AN ERROR. An error here means grants or the schema
    // cache are broken — i.e. a problem no RLS policy could ever fix.
    try {
      const anonClient = createClient(url, anon, { auth: { persistSession: false } })
      const { error } = await withTimeout(
        anonClient.from("profiles").select("id", { count: "exact", head: true }),
        "anon profiles read",
      )
      checks.push(
        error
          ? {
              name: "profiles reachable (anon key)",
              status: "FAILED",
              detail: `${error.code ?? ""} ${error.message}`.trim() + " — " + explain(error.code, error.message),
            }
          : {
              name: "profiles reachable (anon key)",
              status: "ok",
              detail: "table reachable; rows correctly filtered by RLS",
            },
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      checks.push({
        name: "profiles reachable (anon key)",
        status: "FAILED",
        detail: `${message} — ${explain(undefined, message)}`,
      })
    }
  }

  if (url && service) {
    // As `service_role` (bypasses RLS). This is the cross-check login uses to
    // tell "no profile row" from "hidden by RLS". It must succeed.
    try {
      const admin = createClient(url, service, { auth: { persistSession: false } })
      const { count, error } = await withTimeout(
        admin.from("profiles").select("id", { count: "exact", head: true }),
        "service-role profiles read",
      )
      checks.push(
        error
          ? {
              name: "profiles readable (service role)",
              status: "FAILED",
              detail: `${error.code ?? ""} ${error.message}`.trim() + " — " + explain(error.code, error.message),
            }
          : {
              name: "profiles readable (service role)",
              status: "ok",
              detail: `${count ?? 0} profile row(s) visible`,
            },
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      checks.push({
        name: "profiles readable (service role)",
        status: "FAILED",
        detail: `${message} — ${explain(undefined, message)}`,
      })
    }
  }

  const failures = checks.filter((c) => c.status !== "ok")

  return NextResponse.json(
    {
      ok: failures.length === 0,
      checks,
      ...(failures.length > 0 && {
        hint:
          "Fix the items above, then REDEPLOY — on Vercel, environment-variable changes do not " +
          "apply to existing deployments. Server-only vars (SUPABASE_SERVICE_ROLE_KEY) must NOT be " +
          "prefixed NEXT_PUBLIC_.",
      }),
    },
    { status: failures.length === 0 ? 200 : 503 },
  )
}
