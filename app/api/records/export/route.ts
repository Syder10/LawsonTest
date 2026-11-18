import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { generateExcelWorkbook } from "@/lib/excel-generator"
import { RECORD_TYPES, recordTypesForDepartment, type RecordTypeDef } from "@/lib/domain/record-types"
import { enrichWithBalances } from "@/lib/domain/stock-ledger"

const STRIP = new Set(["user_id", "updated_at"])

// Export records to .xlsx.
//
// vs the old route:
//   • uses the RLS-bound client — supervisors automatically get only their own
//     rows (no manual user_id pinning), managers/admins get everything.
//   • record types + storage come from the registry (stock types read from the
//     consolidated stock_records table, filtered by material).
//   • month boundaries built in UTC.
export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { profile, supabase } = auth.ctx
  const isStaff = profile.role === "manager" || profile.role === "admin"

  const { searchParams } = new URL(request.url)
  const requestedUserId = isStaff ? searchParams.get("userId") : null // staff-only filter
  const month = searchParams.get("month") // YYYY-MM

  // Which record types to export.
  let defs: RecordTypeDef[]
  if (isStaff) {
    const dept = searchParams.get("department")
    defs = dept ? recordTypesForDepartment(dept) : RECORD_TYPES
  } else {
    defs = profile.department ? recordTypesForDepartment(profile.department) : []
  }
  if (defs.length === 0) {
    return NextResponse.json({ error: "No record types available to export." }, { status: 400 })
  }

  // Supervisors always get a month window (default current month); staff optional.
  const now = new Date()
  const resolvedMonth =
    month || (isStaff ? null : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`)
  let startDate: string | null = null
  let endDate: string | null = null
  if (resolvedMonth) {
    const [y, m] = resolvedMonth.split("-").map(Number)
    startDate = `${y}-${String(m).padStart(2, "0")}-01`
    endDate = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  }

  const fetchRows = async (def: RecordTypeDef) => {
    const table = def.storage.kind === "table" ? def.storage.table : "stock_records"
    let q = (supabase.from(table) as any)
      .select("*")
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
    if (def.storage.kind === "stock") q = q.eq("material", def.storage.material)
    if (requestedUserId) q = q.eq("user_id", requestedUserId)
    if (startDate) q = q.gte("date", startDate)
    if (endDate) q = q.lte("date", endDate)
    const { data } = await q
    const enriched = await enrichWithBalances(supabase, def.label, (data ?? []) as Record<string, any>[])
    return enriched.map((row: Record<string, unknown>) => {
      const clean: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) if (!STRIP.has(k)) clean[k] = v
      return clean
    })
  }

  const results = await Promise.all(defs.map(fetchRows))
  const recordsByType: Record<string, Record<string, unknown>[]> = {}
  defs.forEach((def, i) => {
    if (results[i].length > 0) recordsByType[def.label] = results[i]
  })

  if (Object.keys(recordsByType).length === 0) {
    return NextResponse.json({ error: "No records found for this period." }, { status: 404 })
  }

  const workbook = await generateExcelWorkbook(recordsByType)
  const buffer = await workbook.xlsx.writeBuffer()

  const nameSlug = profile.full_name ? profile.full_name.toLowerCase().replace(/\s+/g, "_") : "records"
  const periodSlug = resolvedMonth || new Date().toISOString().slice(0, 10)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lawson_${nameSlug}_${periodSlug}.xlsx"`,
    },
  })
}
