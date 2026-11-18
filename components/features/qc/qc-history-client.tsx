"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Download,
  Filter,
  FlaskConical,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react"
import {
  getQcRecordType,
  QC_CATEGORIES,
  QC_STATUS_CONFIG,
  type QcCategory,
  type QcStatus,
} from "@/lib/domain/qc"
import type { QcRecordRow } from "@/lib/db/types"
import { Card, Chip, DataTable, EmptyState, PageHeader, StatTile, type Column } from "@/components/primitives"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))

export function QcHistoryClient({ isManager }: { isManager: boolean }) {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(iso(new Date()))
  const [category, setCategory] = useState<string>("")
  const [status, setStatus] = useState<string>("")
  const [search, setSearch] = useState<string>("")
  const [records, setRecords] = useState<QcRecordRow[]>([])
  const [statusCounts, setStatusCounts] = useState<{
    total: number
    in_range: number
    below_range: number
    above_range: number
    out_of_range: number
  }>({ total: 0, in_range: 0, below_range: 0, above_range: 0, out_of_range: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const p = new URLSearchParams()
      if (from) p.set("from", from)
      if (to) p.set("to", to)
      if (category) p.set("category", category)
      if (status) p.set("status", status)
      if (search.trim()) p.set("search", search.trim())

      const res = await fetch(`/api/qc/records?${p.toString()}`)
      if (!res.ok) throw new Error()
      const json = await res.json()
      setRecords(json.records || [])
      setStatusCounts(json.statusCounts || {})
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [from, to, category, status, search])

  useEffect(() => {
    load()
  }, [load])

  const columns: Column<QcRecordRow>[] = [
    {
      key: "reference",
      header: "Reference",
      primary: true,
      cell: (r) => (
        <Link
          href={`/dashboard/qc/${r.id}`}
          className="font-bold text-brand-solid hover:underline flex items-center gap-1"
        >
          {r.record_reference}
        </Link>
      ),
    },
    {
      key: "timing",
      header: "Test Timing",
      cell: (r) => (
        <div>
          <span className="font-semibold text-ink-primary whitespace-nowrap">{r.test_date}</span>
          <p className="text-xs text-ink-secondary">{r.test_time} · {r.day_name || "—"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Inspection Type",
      cell: (r) => {
        const typeDef = getQcRecordType(r.record_type)
        return (
          <div>
            <span className="font-bold text-ink-primary">{typeDef?.label || r.record_type}</span>
            <p className="text-xs text-ink-secondary capitalize">{r.category.replace("_", " ")}</p>
          </div>
        )
      },
    },
    {
      key: "identifier",
      header: "Batch / Detail",
      cell: (r) => (
        <span className="text-xs font-medium text-ink-primary">
          {r.batch_no ? `Batch: ${r.batch_no}` : r.supplier ? `Supplier: ${r.supplier}` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Compliance Status",
      cell: (r) => {
        const cfg = QC_STATUS_CONFIG[r.record_status as QcStatus]
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
              cfg?.badgeClass || "bg-surface-sunken"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dotClass || "bg-ink-muted"}`} />
            {cfg?.label || r.record_status}
          </span>
        )
      },
    },
    {
      key: "officer",
      header: "Officer",
      hideOnMobile: true,
      cell: (r) => <span className="text-xs text-ink-secondary">{r.submitted_by}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Link
          href={`/dashboard/qc/${r.id}`}
          className="p-1 text-ink-muted hover:text-ink-primary inline-flex items-center"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in-up pb-16">
      <PageHeader
        title="Quality Control Record History"
        description="Shared inspection records across all QC Officers and Quality Management"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/qc/new"
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New Record
            </Link>
            <button
              onClick={load}
              disabled={loading}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Refresh
            </button>
          </div>
        }
      />

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Total Inspections"
          value={statusCounts.total}
          unit="tests"
          icon={<FlaskConical className="w-5 h-5" />}
          accent="brand"
        />
        <StatTile
          label="In Range / Compliant"
          value={statusCounts.in_range}
          unit="passed"
          accent="neutral"
        />
        <StatTile
          label="Flagged / Exceptions"
          value={statusCounts.out_of_range + statusCounts.above_range + statusCounts.below_range}
          unit="alerts"
          accent="critical"
        />
        <StatTile
          label="Recent Records"
          value={records.length}
          unit="rows"
          accent="neutral"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface-card rounded-2xl border border-hairline p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="Search by reference, batch, or supplier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-hairline bg-surface-sunken text-xs text-ink-primary focus:border-brand focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 px-3 rounded-xl border border-hairline bg-surface-card text-xs font-bold text-ink-primary outline-none cursor-pointer"
            >
              <option value="">All Categories</option>
              {QC_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 px-3 rounded-xl border border-hairline bg-surface-card text-xs font-bold text-ink-primary outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="in_range">In Range</option>
              <option value="out_of_range">Flagged / Out of Range</option>
              <option value="below_range">Below Range</option>
              <option value="above_range">Above Range</option>
              <option value="standard_not_configured">Standard Not Configured</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <Card padded>
          <EmptyState
            icon={<AlertCircle className="w-6 h-6 text-critical" />}
            title="Failed to load QC history"
            description="Could not fetch quality inspection records. Check your connection and retry."
            action={
              <button
                onClick={load}
                className="h-10 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold"
              >
                Retry
              </button>
            }
          />
        </Card>
      )}

      {!error && (
        <Card>
          <DataTable
            columns={columns}
            rows={records}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                compact
                title="No QC records found"
                description="No quality inspection records match the current filters."
              />
            }
          />
        </Card>
      )}
    </div>
  )
}
