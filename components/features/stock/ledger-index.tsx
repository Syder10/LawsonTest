"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, AlertCircle, RefreshCw } from "lucide-react"
import { fmt, shortDay } from "@/components/features/dashboard/manager/viz"
import { materialDescriptorForKey } from "@/lib/domain/stock-materials"
import { ALL_TIME, isAllTime, requestFrom, ALL_TIME_LABEL } from "@/lib/domain/date-window"
import { Card, CardHeader, DataTable, EmptyState, Field, Select, type Column } from "@/components/primitives"

// The stock office's History IS the stock ledger: current on-hand for every
// material, each row opening that material's full dated record on the shared
// detail page. Below it, a dated activity feed answers who submitted what and
// when — the receipts and issuances the office filed — from the same
// /api/procurement/report the Stock dashboard reads (NFR-2, nothing recomputed).
// On-hand is as-of today and window-independent; the date range scopes only the
// activity feed.
interface MaterialRow {
  key: string
  label: string
  unit: string
  remaining: number
  group: "procurement" | "production"
}
// One filed receipt/issuance as the report projects it. received_pcs is the
// quantity received; given_pcs the quantity issued out (PPE). The unit follows
// the material, not the field, so it is read from the shared descriptor.
interface ReceiptActivity {
  id: string
  date: string
  material_type: string
  received_by: string | null
  received_pcs: number | null
  given_pcs: number
  given_to: string | null
  remarks: string | null
}
interface Report {
  filters: { from: string; to: string }
  materials: MaterialRow[]
  receipts: ReceiptActivity[]
  last_updated: string
}

type GroupFilter = "all" | "procurement" | "production"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const PRESETS = [
  { label: "All time", from: () => ALL_TIME },
  { label: "30d", from: () => daysAgo(29) },
  { label: "90d", from: () => daysAgo(89) },
  { label: "1y", from: () => daysAgo(364) },
]

export function StockLedgerIndex() {
  const [from, setFrom] = useState(ALL_TIME)
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [group, setGroup] = useState<GroupFilter>("all")

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/procurement/report?from=${requestFrom(from)}&to=${to}`)
      if (!res.ok) throw new Error()
      setData((await res.json()) as Report)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  // An inner async keeps the setState calls in load() off the effect's synchronous
  // path (react-compiler's set-state-in-effect rule), matching the app's other
  // data-loading effects.
  useEffect(() => {
    const run = async () => { await load() }
    void run()
  }, [load])

  const materials = data?.materials ?? []
  const shown = group === "all" ? materials : materials.filter((m) => m.group === group)
  const receipts = data?.receipts ?? []

  // Received/issued figures follow the material's own unit (pcs for stamps and
  // cartons, packs for most PPE), read from the shared descriptor so the feed and
  // the drill-down page never caption the same number differently.
  const unitFor = (materialType: string) => materialDescriptorForKey(materialType)?.unit ?? "pcs"
  const labelFor = (materialType: string) => materialDescriptorForKey(materialType)?.label ?? materialType

  const columns: Column<MaterialRow>[] = [
    { key: "label", header: "Material", primary: true, cell: (m) => <span className="font-bold text-ink-primary">{m.label}</span> },
    {
      key: "group", header: "Type", hideOnMobile: true,
      cell: (m) => <span className="text-ink-muted text-xs font-medium">{m.group === "procurement" ? "Procurement" : "Production"}</span>,
    },
    {
      key: "remaining", header: "On hand", align: "right", numeric: true,
      cell: (m) => (
        <span className="font-semibold text-ink-primary">
          {fmt(m.remaining)} <span className="text-ink-muted text-xs font-medium">{m.unit}</span>
        </span>
      ),
    },
  ]

  const activityColumns: Column<ReceiptActivity>[] = [
    {
      key: "date", header: "Date", primary: true,
      cell: (r) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(r.date)}</span>,
    },
    { key: "material", header: "Material", cell: (r) => <span className="font-medium text-ink-primary">{labelFor(r.material_type)}</span> },
    {
      key: "in", header: "Received", align: "right", numeric: true,
      cell: (r) => (r.received_pcs && r.received_pcs > 0
        ? <span className="text-good-ink font-semibold">+{fmt(r.received_pcs)} <span className="text-ink-muted text-xs font-medium">{unitFor(r.material_type)}</span></span>
        : <span className="text-ink-muted">—</span>),
    },
    {
      key: "out", header: "Issued", align: "right", numeric: true,
      cell: (r) => (r.given_pcs > 0
        ? <span className="font-semibold text-ink-primary">{fmt(r.given_pcs)} <span className="text-ink-muted text-xs font-medium">{unitFor(r.material_type)}</span></span>
        : <span className="text-ink-muted">—</span>),
    },
    { key: "by", header: "Submitted by", cell: (r) => <span className="text-ink-secondary">{r.received_by ?? "—"}</span> },
    { key: "to", header: "Issued to", hideOnMobile: true, cell: (r) => <span className="text-ink-secondary">{r.given_to ?? "—"}</span> },
    { key: "note", header: "Note", hideOnMobile: true, cell: (r) => <span className="text-ink-muted">{r.remarks ?? "—"}</span> },
  ]

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={<AlertCircle className="w-5 h-5 text-critical" />}
          title="Couldn’t load stock"
          description="The request failed. Refresh to try again."
        />
      </Card>
    )
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-ink-muted" aria-busy="true">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading stock</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-card rounded-2xl border border-hairline p-3 flex items-center gap-2">
        <Field label="Group" className="w-full sm:w-56">
          {(a11y) => (
            <Select {...a11y} value={group} onChange={(e) => setGroup(e.target.value as GroupFilter)}>
              <option value="all">All materials</option>
              <option value="procurement">Procurement</option>
              <option value="production">Production</option>
            </Select>
          )}
        </Field>
      </div>

      <Card>
        <CardHeader title="Stock on hand" hint="tap a material for its full dated history" />
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(m) => m.key}
          rowHref={(m) => `/dashboard/procurement/stock/material/${m.key}`}
          empty={<EmptyState compact title="No materials to show" />}
        />
      </Card>

      <div className="bg-surface-card rounded-2xl border border-hairline p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 mr-1">
          {PRESETS.map((p) => {
            const active = p.from() === from && to === iso(new Date())
            return (
              <button
                key={p.label}
                onClick={() => { setFrom(p.from()); setTo(iso(new Date())) }}
                aria-pressed={active}
                className={`h-9 px-3 text-xs font-bold rounded-lg border transition-colors ${
                  active ? "bg-brand-solid text-brand-ink border-brand-solid" : "bg-surface-card text-ink-secondary border-hairline hover:border-brand"
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="h-9 min-w-0 flex-1 px-2 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none" />
        <span className="text-ink-muted text-xs" aria-hidden="true">to</span>
        <input type="date" value={to} min={from} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="h-9 min-w-0 flex-1 px-2 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none" />
        <button
          onClick={load}
          disabled={loading}
          className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
          Refresh
        </button>
      </div>

      <Card>
        <CardHeader
          title="Recent submissions"
          hint={data
            ? isAllTime(from)
              ? `${ALL_TIME_LABEL} · most recent 200`
              : `receipts & issuances · ${shortDay(data.filters.from)} to ${shortDay(data.filters.to)}`
            : undefined}
        />
        <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <DataTable
            columns={activityColumns}
            rows={receipts}
            rowKey={(r) => r.id}
            empty={<EmptyState compact title="No receipts or issuances in this range" description="Receipts the stock office files will appear here." />}
          />
        </div>
      </Card>
    </div>
  )
}
