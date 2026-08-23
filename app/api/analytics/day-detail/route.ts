import { NextResponse } from "next/server"
import { requireStaff } from "@/lib/auth/guards"
import { RECORD_TYPES } from "@/lib/domain/record-types"
import { enrichWithBalances } from "@/lib/domain/stock-ledger"
import type { Shift } from "@/lib/db/types"

// Drill-down: every record submitted for a specific day, grouped by record type.
// Optionally narrowed to a single shift and/or department. Managers/admins only
// (reads all rows via RLS). Powers the dashboard's "inspect this day" view.
export async function GET(request: Request) {
  const auth = await requireStaff()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const supabase = auth.ctx.supabase

  const url = new URL(request.url)
  const date = url.searchParams.get("date")
  const shift = url.searchParams.get("shift") as Shift | null
  const department = url.searchParams.get("department")
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 })

  const groups = await Promise.all(
    RECORD_TYPES.map(async (def) => {
      const table = def.storage.kind === "table" ? def.storage.table : "stock_records"
      let q = (supabase.from(table) as any).select("*").eq("date", date).order("created_at", { ascending: true })
      if (def.storage.kind === "stock") q = q.eq("material", def.storage.material)
      if (shift) q = q.eq("shift", shift)
      if (department) q = q.eq("department", department)
      const { data } = await q
      const rows = await enrichWithBalances(supabase, def.label, (data ?? []) as Record<string, any>[])
      return { recordType: def.label, department: def.departments[0], rows }
    }),
  )

  const nonEmpty = groups.filter((g) => g.rows.length > 0)
  return NextResponse.json({
    date,
    shift: shift ?? null,
    department: department ?? null,
    totalRecords: nonEmpty.reduce((s, g) => s + g.rows.length, 0),
    groups: nonEmpty,
  })
}
