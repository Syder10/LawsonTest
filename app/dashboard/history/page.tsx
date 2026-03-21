import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft, Calendar, FileText } from "lucide-react"
import { Suspense } from "react"
import HistoryDateFilter from "./HistoryDateFilter"

const DEPARTMENT_TABLES: Record<string, { table: string; label: string }[]> = {
  "Blowing": [
    { table: "blowing_daily_records",            label: "Daily Records (Preform Usage)" },
  ],
  "Alcohol and Blending": [
    { table: "alcohol_stock_level_records",      label: "Daily Usage of Alcohol And Stock Level" },
    { table: "alcohol_blending_daily_records",   label: "Daily Records for Alcohol and Blending" },
    { table: "ginger_production_records",        label: "Ginger Production" },
    { table: "extraction_monitoring_records",    label: "Extraction Monitoring Records" },
    { table: "caramel_stock_records",            label: "Caramel Stock" },
  ],
  "Filling Line": [
    { table: "filling_line_daily_records",       label: "Filling Line Daily Records" },
    { table: "caps_stock_records",               label: "Caps Stock" },
    { table: "labels_stock_records",             label: "Labels Stock" },
  ],
  "Packaging": [
    { table: "packaging_daily_records",          label: "Packaging Daily Records" },
  ],
  "Concentrate": [
    { table: "concentrate_alcohol_records",      label: "Daily Records Alcohol For Concentrate" },
    { table: "herbs_stock_records",              label: "Herbs Stock" },
  ],
}

const META_KEYS = new Set([
  "id", "user_id", "created_at", "updated_at",
  "record_type", "date", "shift", "department", "supervisor_name",
])

function formatLabel(key: string) {
  return key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  })
}

export const dynamic = "force-dynamic"

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; shift?: string }>
}) {
  const { date: filterDate, shift: filterShift } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("department, role, full_name")
    .eq("id", user.id)
    .single()

  const userDept  = profile?.department || null
  const isManager = profile?.role === "manager" || profile?.role === "admin"

  // Build list of tables to query based on role/department
  let tablesToQuery: { table: string; label: string; department: string }[] = []
  if (isManager) {
    Object.entries(DEPARTMENT_TABLES).forEach(([dept, entries]) => {
      entries.forEach(e => tablesToQuery.push({ ...e, department: dept }))
    })
  } else if (userDept && DEPARTMENT_TABLES[userDept]) {
    DEPARTMENT_TABLES[userDept].forEach(e =>
      tablesToQuery.push({ ...e, department: userDept })
    )
  }

  // Fetch records — apply user_id, date, and shift filters
  const fetchPromises = tablesToQuery.map(async ({ table, label, department }) => {
    let query = supabase
      .from(table)
      .select("*")
      .order("date",       { ascending: false })
      .order("created_at", { ascending: false })

    if (!isManager)  query = query.eq("user_id", user.id)
    if (filterDate)  query = query.eq("date", filterDate)
    if (filterShift) query = query.eq("shift", filterShift)

    // Limit per table only when no specific date is selected — keep results manageable
    if (!filterDate) query = query.limit(20)

    const { data } = await query
    return (data || []).map(r => ({ ...r, __table: table, __label: label, __department: department }))
  })

  const results    = await Promise.all(fetchPromises)
  const allRecords = results.flat().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  // Group by record type label
  const grouped: Record<string, typeof allRecords> = {}
  for (const record of allRecords) {
    const key = record.__label
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(record)
  }

  const hasRecords  = allRecords.length > 0
  const hasFilter   = !!filterDate || !!filterShift
  const totalCount  = allRecords.length

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in-up">

      {/* Page header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-emerald-950">Submission History</h2>
          <p className="text-emerald-700/80 font-medium mt-1">
            {isManager
              ? "All departments"
              : userDept
              ? `${userDept} department — your submissions`
              : "Your submitted production records"}
          </p>
        </div>
      </div>

      {/* Date + Shift filter — wrapped in Suspense because it uses useSearchParams */}
      <Suspense fallback={<div className="h-20 bg-white rounded-2xl border border-emerald-100 animate-pulse" />}>
        <HistoryDateFilter
          selectedDate={filterDate || null}
          selectedShift={filterShift || null}
        />
      </Suspense>

      {/* Result count when a filter is active */}
      {hasFilter && (
        <p className="text-sm font-semibold text-slate-500">
          {hasRecords
            ? `${totalCount} record${totalCount !== 1 ? "s" : ""} found`
            : "No records match this filter"}
        </p>
      )}

      {/* Empty state */}
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
              <p className="text-slate-400 text-sm mt-1">Submit a form to see it appear here.</p>
              <Link
                href="/dashboard/forms"
                className="inline-flex items-center gap-2 mt-6 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors text-sm"
              >
                Submit a Record
              </Link>
            </>
          )}
        </div>
      )}

      {/* Records grouped by type */}
      {Object.entries(grouped).map(([label, records]) => (
        <div key={label} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-emerald-100">

          {/* Section header */}
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
                ([key, value]) =>
                  !META_KEYS.has(key) &&
                  !key.startsWith("__") &&
                  value !== null &&
                  value !== undefined &&
                  value !== ""
              )

              return (
                <div key={record.id} className="p-5 hover:bg-emerald-50/30 transition-colors space-y-3">

                  {/* Record meta row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-emerald-950">{formatDate(record.date)}</span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-xs font-semibold">
                        {record.shift} Shift
                      </span>
                      {record.product && (
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-xs font-semibold">
                          {record.product}
                        </span>
                      )}
                      {isManager && (
                        <span className="text-xs text-slate-400 font-medium">
                          {record.supervisor_name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                      Submitted {new Date(record.created_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Dynamic details grid */}
                  {details.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 bg-slate-50/60 rounded-2xl border border-slate-100">
                      {details.map(([key, value]) => (
                        <div key={key} className="space-y-0.5">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            {formatLabel(key)}
                          </p>
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
