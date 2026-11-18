"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Droplet,
  FileSpreadsheet,
  FlaskConical,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react"
import {
  getQcRecordType,
  QC_CATEGORIES,
  QC_STATUS_CONFIG,
  type QcStatus,
} from "@/lib/domain/qc"
import type { QcRecordRow } from "@/lib/db/types"
import { Card, Chip, DataTable, EmptyState, PageHeader, StatTile, type Column } from "@/components/primitives"

export function QcDashboardClient({ isManager }: { isManager: boolean }) {
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
      const res = await fetch("/api/qc/records?limit=10")
      if (!res.ok) throw new Error()
      const json = await res.json()
      setRecords(json.records || [])
      setStatusCounts(json.statusCounts || {})
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const exceptions = records.filter(
    (r) => r.record_status === "out_of_range" || r.record_status === "above_range" || r.record_status === "below_range",
  )

  const exceptionColumns: Column<QcRecordRow>[] = [
    {
      key: "ref",
      header: "Reference",
      primary: true,
      cell: (r) => (
        <Link href={`/dashboard/qc/${r.id}`} className="font-bold text-brand-solid hover:underline">
          {r.record_reference}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Inspection",
      cell: (r) => {
        const def = getQcRecordType(r.record_type)
        return <span className="font-semibold text-ink-primary">{def?.label || r.record_type}</span>
      },
    },
    {
      key: "date",
      header: "Date & Time",
      cell: (r) => <span className="text-xs text-ink-secondary">{r.test_date} · {r.test_time}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => {
        const cfg = QC_STATUS_CONFIG[r.record_status as QcStatus]
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold border ${cfg?.badgeClass}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dotClass}`} />
            {cfg?.label || r.record_status}
          </span>
        )
      },
    },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (r) => (
        <Link href={`/dashboard/qc/${r.id}`} className="text-xs font-bold text-brand-solid hover:underline inline-flex items-center gap-1">
          Review <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in-up pb-16">
      <PageHeader
        title={isManager ? "QC Executive Management Dashboard" : "Quality Control Operations"}
        description={
          isManager
            ? "Compliance monitoring, exception tracking, and standards administration"
            : "Quality inspection records for water, products, and raw materials"
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/qc/new"
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New Inspection
            </Link>
            <Link
              href="/dashboard/qc/history"
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" /> All Records
            </Link>
            {isManager && (
              <Link
                href="/dashboard/qc/standards"
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> Manage Standards
              </Link>
            )}
            <button
              onClick={load}
              disabled={loading}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          </div>
        }
      />

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Total Records"
          value={statusCounts.total}
          unit="inspections"
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
          label="Active Exceptions"
          value={statusCounts.out_of_range + statusCounts.above_range + statusCounts.below_range}
          unit="alerts"
          icon={<ShieldAlert className="w-5 h-5 text-critical" />}
          accent="critical"
        />
        <StatTile
          label="Recent Activity"
          value={records.length}
          unit="recent"
          accent="neutral"
        />
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/dashboard/qc/new"
          className="p-4 rounded-2xl border border-hairline bg-surface-card hover:border-brand transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-secondary">Record Inspection</span>
            <Plus className="w-4 h-4 text-brand-solid group-hover:scale-110 transition-transform" />
          </div>
          <p className="text-base font-bold text-ink-primary mt-2">Log New QC Test</p>
          <p className="text-xs text-ink-muted mt-1">Water, products, preforms, bottles & ethanol</p>
        </Link>

        <Link
          href="/dashboard/qc/history"
          className="p-4 rounded-2xl border border-hairline bg-surface-card hover:border-brand transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-secondary">Records Archive</span>
            <FileSpreadsheet className="w-4 h-4 text-brand-solid group-hover:scale-110 transition-transform" />
          </div>
          <p className="text-base font-bold text-ink-primary mt-2">Search QC History</p>
          <p className="text-xs text-ink-muted mt-1">Shared test results, batch numbers & dates</p>
        </Link>

        <Link
          href="/dashboard/qc/standards"
          className="p-4 rounded-2xl border border-hairline bg-surface-card hover:border-brand transition-all group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-secondary">Quality Standards</span>
            <Settings2 className="w-4 h-4 text-brand-solid group-hover:scale-110 transition-transform" />
          </div>
          <p className="text-base font-bold text-ink-primary mt-2">Reference Specifications</p>
          <p className="text-xs text-ink-muted mt-1">Approved tolerance limits & alcohol % ranges</p>
        </Link>
      </div>

      {/* Exception Attention Queue */}
      {exceptions.length > 0 && (
        <Card padded className="space-y-4 border-critical/30 bg-critical-subtle/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-critical" />
              <div>
                <h3 className="text-sm font-bold text-ink-primary">Quality Exceptions Needing Attention</h3>
                <p className="text-xs text-ink-secondary">
                  Recent measurements that deviated outside configured tolerance limits.
                </p>
              </div>
            </div>
            <Chip tone="critical">{exceptions.length} Flagged</Chip>
          </div>

          <DataTable
            columns={exceptionColumns}
            rows={exceptions}
            rowKey={(r) => r.id}
          />
        </Card>
      )}

      {/* Recent Inspections Table */}
      <Card padded className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-ink-primary">Recent Inspections</h3>
            <p className="text-xs text-ink-secondary">Latest QC test records across the plant.</p>
          </div>
          <Link href="/dashboard/qc/history" className="text-xs font-bold text-brand-solid hover:underline">
            View all records →
          </Link>
        </div>

        <DataTable
          columns={exceptionColumns}
          rows={records.slice(0, 5)}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              compact
              title="No inspection records filed yet"
              description="Use New Inspection above to log your first QC test."
            />
          }
        />
      </Card>
    </div>
  )
}
