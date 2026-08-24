import { NextResponse } from "next/server"

// Reports whether the server's Supabase environment variables are present and
// well-formed, WITHOUT revealing their values. Deliberately unauthenticated:
// the failure it diagnoses (a missing service-role key) is exactly the one that
// prevents anybody from signing in to authenticate.
//
// Visit /api/health to check a deployment.
function describe(name: string, value: string | undefined, expect?: (v: string) => string | null) {
  if (!value) return { name, status: "MISSING" as const, detail: "not set in this environment" }
  const problem = expect?.(value) ?? null
  return problem
    ? { name, status: "INVALID" as const, detail: problem }
    : { name, status: "ok" as const, detail: `set (${value.length} chars)` }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY

  const checks = [
    describe("NEXT_PUBLIC_SUPABASE_URL", url, (v) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(v.trim())
        ? null
        : "should look like https://<project-ref>.supabase.co",
    ),
    describe("NEXT_PUBLIC_SUPABASE_ANON_KEY", anon),
    describe("SUPABASE_SERVICE_ROLE_KEY", service, (v) =>
      anon && v.trim() === anon.trim()
        ? "is identical to the ANON key — paste the service_role key instead " +
          "(Supabase: Settings -> API -> Project API keys -> service_role)"
        : null,
    ),
  ]

  // A legacy Supabase JWT key encodes its role in the payload, so a swapped
  // anon/service key can be caught before it causes a confusing runtime failure.
  // Newer `sb_secret_…` / publishable keys are opaque — skip the check for those.
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
      // Unparseable payload — leave the presence check as the verdict.
    }
  }

  const failures = checks.filter((c) => c.status !== "ok")

  return NextResponse.json(
    {
      ok: failures.length === 0,
      checks,
      ...(failures.length > 0 && {
        hint:
          "Set these in your hosting provider's environment variables, then REDEPLOY — " +
          "on Vercel, env changes do not apply to existing deployments. " +
          "Server-only vars (SUPABASE_SERVICE_ROLE_KEY) must NOT be prefixed NEXT_PUBLIC_.",
      }),
    },
    { status: failures.length === 0 ? 200 : 503 },
  )
}
