import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { RECORD_TYPES, recordTypesForDepartment, type RecordTypeDef } from "@/lib/domain/record-types"

// Which record types the caller has already submitted for a given date + shift.
// Replaces the old forms page probing up to 12 tables directly from the browser
// with the anon key. RLS scopes the reads to the caller's own rows.
export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, profile, supabase } = auth.ctx

  const { searchParams } = new URL(request.url)
  const date = searchParams.get("date")
  const shift = searchParams.get("shift")
  if (!date || !shift) return NextResponse.json({ error: "date and shift are required" }, { status: 400 })

  const isStaff = profile.role === "manager" || profile.role === "admin"
  const defs: RecordTypeDef[] = isStaff
    ? RECORD_TYPES
    : profile.department
      ? recordTypesForDepartment(profile.department)
      : []

  const checks = await Promise.all(
    defs.map(async (def) => {
      const table = def.storage.kind === "table" ? def.storage.table : "stock_records"
      let q = (supabase.from(table) as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("date", date)
        .eq("shift", shift)
        .limit(1)
      if (def.storage.kind === "stock") q = q.eq("material", def.storage.material)
      const { data } = await q
      return { label: def.label, submitted: (data?.length ?? 0) > 0 }
    }),
  )

  return NextResponse.json({ submitted: checks.filter((c) => c.submitted).map((c) => c.label) })
}
