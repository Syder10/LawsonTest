import { createServerSupabase } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft, Calendar, FileText } from "lucide-react"
import { Suspense } from "react"
import HistoryDateFilter from "./HistoryDateFilter"
import { RECORD_TYPES, recordTypesForDepartment, type RecordTypeDef } from "@/lib/domain/record-types"
import { enrichWithBalances } from "@/lib/domain/stock-ledger"

// Columns hidden from the per-record detail grid (envelope + internal + those
// already shown as badges). Everything else — including generated values like
// remaining_stock — is displayed.
const HIDDEN_KEYS = new Set([
  "id", "user_id", "created_at", "updated_at", "date", "shift",
  "department", "supervisor_name", "material", "product",
])

const formatLabel = (key: string) =>
  key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")

const formatDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  })

export const dynamic = "force-dynamic"

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; shift?: string }>
}) {
  const { date: filterDate, shift: filterShift } = await searchParams

  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("department, role, full_name")
    .eq("id", user.id)
    .single()

  const isManager = profile?.role === "manager" || profile?.role === "admin"
  const defs: RecordTypeDef[] = isManager
    ? RECORD_TYPES
    : profile?.department
      ? recordTypesForDepartment(profile.department)
      : []

  // RLS scopes supervisors to their own rows automatically.
  const results = await Promise.all(
    defs.map(async (def): Promise<Record<string, any>[]> => {
      const table = def.storage.kind === "table" ? def.storage.table : "stock_records"
      let query = (supabase.from(table) as any)
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
      if (def.storage.kind === "stock") query = query.eq("material", def.storage.material)
      if (filterDate) query = query.eq("date", filterDate)
      if (filterShift) query = query.eq("shift", filterShift)
      if (!filterDate) query = query.limit(20)
      const { data } = await query
      const rows = await enrichWithBalances(supabase, def.label, (data ?? []) as Record<string, any>[])
      return rows.map((r) => ({ ...r, __label: def.label }))
    }),
  )

  const allRecords: Record<string, any>[] = results.flat().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const grouped: Record<string, typeof allRecords> = {}
  for (const record of allRecords) (grouped[record.__label] ??= []).push(record)

  const hasRecords = allRecords.length > 0
  const hasFilter = !!filterDate || !!filterShift

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in-up">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-emerald-950">Submission History</h2>
          <p className="text-emerald-700/80 font-medium mt-1">
            {isManager ? "All departments" : profile?.department ? `${profile.department} department — your submissions` : "Your submitted production records"}
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="h-20 bg-white rounded-2xl border border-emerald-100 animate-pulse" />}>
        <HistoryDateFilter selectedDate={filterDate || null} selectedShift={filterShift || null} />
      </Suspense>

      {hasFilter && (
        <p className="text-sm font-semibold text-slate-500">
          {hasRecords ? `${allRecords.length} record${allRecords.length !== 1 ? "s" : ""} found` : "No records match this filter"}
        </p>
      )}

      {!hasRecords && (
        <div className="bg-white rounded-3xl p-12 text-center border border-emerald-100 shadow-sm">
          <FileText className="w-12 h-12 text-emerald-200 mx-auto mb-4" />
          {hasFilter ? (
            <>
              <p className="text-slate-500 font-medium">No records found for this date.</p>
              <p className="text-slate-400 text-sm mt-1">Try a different date or clear the filter.</p>
            </>
          ) : (
            <>
              <p className="text-slate-500 font-medium">No records found.</p>
              <Link href="/dashboard/forms" className="inline-flex items-center gap-2 mt-6 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors text-sm">
                Submit a Record
              </Link>
            </>
          )}
        </div>
      )}

      {Object.entries(grouped).map(([label, records]) => (
        <div key={label} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-emerald-100">
          <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <span className="font-bold text-emerald-900 text-sm">{label}</span>
            </div>
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full">
              {records.length} record{records.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="divide-y divide-emerald-50">
            {records.map((record) => {
              const details = Object.entries(record).filter(
                ([key, value]) => !HIDDEN_KEYS.has(key) && !key.startsWith("__") && value !== null && value !== undefined && value !== "",
              )
              return (
                <div key={record.id} className="p-4 sm:p-5 hover:bg-emerald-50/30 transition-colors space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-emerald-950">{formatDate(record.date)}</span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-xs font-semibold">{record.shift} Shift</span>
                      {record.product && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-semibold">{record.product}</span>}
                      {isManager && <span className="text-xs text-slate-400 font-medium">{record.supervisor_name}</span>}
                    </div>
                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                      Submitted {new Date(record.created_at).toLocaleString()}
                    </span>
                  </div>
                  {details.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-3 sm:p-4 bg-slate-50/60 rounded-xl sm:rounded-2xl border border-slate-100">
                      {details.map(([key, value]) => (
                        <div key={key} className="space-y-0.5">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{formatLabel(key)}</p>
                          <p className="text-sm font-semibold text-emerald-900">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
