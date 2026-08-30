import { createServerSupabase } from "@/lib/supabase/server"
import Link from "next/link"
import { Calendar, FileText } from "lucide-react"
import { Suspense } from "react"
import HistoryDateFilter from "./HistoryDateFilter"
import { RECORD_TYPES, recordTypesForDepartment, type RecordTypeDef } from "@/lib/domain/record-types"
import { enrichWithBalances } from "@/lib/domain/stock-ledger"
import { Card, Chip, EmptyState, PageHeader } from "@/components/primitives"

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

  // Always bounded. The limit was previously SKIPPED whenever a date filter was
  // present, so a manager filtering one day fetched every matching row across all
  // 12 record types with no ceiling — and then rendered every non-null column of
  // each as a label/value pair, which on a busy day is thousands of DOM nodes.
  // A filtered day cannot exceed 3 shifts × 3 groups × products, so 60 is
  // generous; `truncated` tells the reader when they are not seeing everything.
  const PER_TYPE_LIMIT = filterDate ? 60 : 20

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
      query = query.limit(PER_TYPE_LIMIT)
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

  // A group at exactly the limit is probably cut off — say so instead of
  // presenting a partial list as if it were complete.
  const truncated = Object.entries(grouped)
    .filter(([, rows]) => rows.length >= PER_TYPE_LIMIT)
    .map(([label]) => label)

  const hasRecords = allRecords.length > 0
  const hasFilter = !!filterDate || !!filterShift

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in-up">
      <PageHeader
        title="Submission history"
        description={
          isManager
            ? "All departments"
            : profile?.department
              ? `${profile.department} department — your submissions`
              : "Your submitted production records"
        }
      />

      <Suspense fallback={<div className="h-20 rounded-2xl border border-hairline bg-surface-sunken animate-pulse" />}>
        <HistoryDateFilter selectedDate={filterDate || null} selectedShift={filterShift || null} />
      </Suspense>

      {hasFilter && (
        <p className="text-sm font-medium text-ink-secondary">
          {hasRecords
            ? `${allRecords.length} record${allRecords.length !== 1 ? "s" : ""} found`
            : "No records match this filter"}
        </p>
      )}

      {truncated.length > 0 && (
        <p className="text-xs font-medium text-warning-ink bg-warning-subtle border border-warning/30 rounded-xl px-3 py-2">
          Showing the most recent {PER_TYPE_LIMIT} of {truncated.join(", ")}. Filter by date to see the rest.
        </p>
      )}

      {!hasRecords && (
        <Card>
          <EmptyState
            icon={<FileText className="w-5 h-5" />}
            title={hasFilter ? "Nothing recorded for this filter" : "No records yet"}
            description={
              hasFilter
                ? "Try another date, or clear the filter to see everything."
                : "Records you submit will appear here."
            }
            action={
              hasFilter ? undefined : (
                <Link
                  href="/dashboard/forms"
                  className="h-11 px-5 inline-flex items-center rounded-xl bg-brand-solid hover:bg-brand-solid-hover text-brand-ink text-sm font-bold transition-colors active:scale-[0.97]"
                >
                  Submit a record
                </Link>
              )
            }
          />
        </Card>
      )}

      {Object.entries(grouped).map(([label, records]) => (
        <Card key={label} tone="brand">
          <div className="bg-brand-subtle px-4 sm:px-6 py-3 border-b border-brand/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-brand shrink-0" aria-hidden="true" />
              <span className="font-bold text-brand-subtle-ink text-sm truncate">{label}</span>
            </div>
            <Chip tone="brand">
              {records.length} record{records.length !== 1 ? "s" : ""}
            </Chip>
          </div>
          <ul className="divide-y divide-hairline">
            {records.map((record) => {
              const details = Object.entries(record).filter(
                ([key, value]) =>
                  !HIDDEN_KEYS.has(key) && !key.startsWith("__") && value !== null && value !== undefined && value !== "",
              )
              return (
                <li key={record.id} className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-ink-primary">{formatDate(record.date)}</span>
                      <Chip tone="neutral">{record.shift} shift</Chip>
                      {record.product && (
                        <Chip tone={record.product === "Bitters" ? "bitters" : "ginger"}>{record.product}</Chip>
                      )}
                      {isManager && <span className="text-xs text-ink-muted font-medium">{record.supervisor_name}</span>}
                    </div>
                    <span className="text-xs text-ink-muted font-medium whitespace-nowrap">
                      {new Date(record.created_at).toLocaleString()}
                    </span>
                  </div>
                  {details.length > 0 && (
                    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-3 sm:p-4 bg-surface-sunken rounded-xl border border-hairline">
                      {details.map(([key, value]) => (
                        <div key={key} className="space-y-0.5 min-w-0">
                          <dt className="text-xs uppercase tracking-wider text-ink-muted font-bold truncate">
                            {formatLabel(key)}
                          </dt>
                          <dd className="text-sm font-semibold text-ink-primary tnum">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}
