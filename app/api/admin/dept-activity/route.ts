import { NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { RECORD_TYPES } from "@/lib/domain/record-types"

// Activity summary (row count + latest date) for every record type, for the
// admin/manager dashboard.
//
// vs the old route:
//   • one call returns ALL record types (was one HTTP call per table).
//   • uses the RLS-bound client — managers/admins read all rows via policy, so
//     no service-role key is needed.
//   • record types come from the registry (no separate table allowlist).
export async function GET() {
  const auth = await requireStaff()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  const activity = await Promise.all(
    RECORD_TYPES.map(async (def) => {
      const table = def.storage.kind === "table" ? def.storage.table : "stock_records"

      const countQuery = supabase.from(table).select("id", { count: "exact", head: true })
      const latestQuery = supabase.from(table).select("date").order("date", { ascending: false }).limit(1)

      if (def.storage.kind === "stock") {
        countQuery.eq("material", def.storage.material)
        latestQuery.eq("material", def.storage.material)
      }

      const [{ count }, { data: latest }] = await Promise.all([countQuery, latestQuery])
      return {
        recordType: def.label,
        departments: def.departments,
        count: count ?? 0,
        lastDate: latest?.[0]?.date ?? null,
      }
    }),
  )

  return NextResponse.json({ activity })
}
