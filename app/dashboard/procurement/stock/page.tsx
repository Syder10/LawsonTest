"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { RefreshCw, Loader2, AlertCircle, AlertTriangle, PackageCheck, Send, ClipboardCheck } from "lucide-react"
import { fmt, fmt1, shortDay } from "@/components/features/dashboard/manager/viz"
import { MIN_SAMPLE_DAYS, burnLooksImplausible, byUrgency } from "@/lib/domain/stock-status"
import type { ProcurementMaterialStatus } from "@/lib/domain/stock-status"
import {
  Card,
  CardHeader,
  Chip,
  DataTable,
  EmptyState,
  PageHeader,
  StatTile,
  StatusBadge,
  type Column,
} from "@/components/primitives"
import { ReconcileModal, ledgerTargetForKey, type ReconcileTarget } from "@/components/features/stock/reconcile-modal"

// The row shape comes from lib/domain/stock-status, shared with the route that
// produces it — this file used to re-declare it, which is how the two drifted.
type MaterialRow = ProcurementMaterialStatus

interface Receipt {
  date: string; material_type: string; received_by: string | null
  received_pcs: number; given_pcs: number; given_to: string | null; remarks: string | null
}
interface Report {
  filters: { from: string; to: string }
  materials: MaterialRow[]
  finishedGoods: { bitters: number; ginger: number }
  receipts: Receipt[]
  thresholds: { redDays: number; amberDays: number }
  last_updated: string
}
interface StockCount {
  id: string; date: string; shift: string | null; material: string
  product: string | null; variant: string | null
  counted_qty: number; computed_qty: number; variance: number
  kind: "baseline" | "reconciliation"; note: string | null; counted_by: string | null; created_at: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const PRESETS = [
  { label: "7d", from: () => daysAgo(6) },
  { label: "30d", from: () => daysAgo(29) },
  { label: "90d", from: () => daysAgo(89) },
]
const MAT_LABEL: Record<string, string> = {
  tax_stamp: "Tax Stamps", carton_bitters: "Cartons — Bitters", carton_ginger: "Cartons — Ginger",
  seal_tape: "Seal Tape", hair_net: "Hair Nets", nose_mask: "Nose Masks", gloves: "Gloves",
}

// ============================================================================
// Procurement stock dashboard.
//
// This was the least usable screen on a phone: an 11-column table whose only
// mobile strategy was horizontal scroll — roughly three screens of sideways drag
// with no affordance and no frozen first column — inside a page that broke out of
// the layout with `-m-4 sm:-m-6 md:-m-10` and painted its own background.
//
// Now every table is a DataTable (each row becomes a card below `sm`) and the page
// sits inside the normal layout, so it gains the header and tab bar like
// everything else.
// ============================================================================
export default function ProcurementStockPage() {
  const [from, setFrom] = useState(daysAgo(29))
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [counts, setCounts] = useState<StockCount[]>([])
  const [reconcile, setReconcile] = useState<ReconcileTarget | null>(null)
  const [showReconcile, setShowReconcile] = useState(false)

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/stock/reconcile?limit=50")
      if (res.ok) setCounts((await res.json()).counts ?? [])
    } catch { /* silent — the panel simply stays empty */ }
  }, [])

  // The date range is a dependency rather than a ref written during render (a
  // render-phase ref write is unsafe under concurrent rendering). The 60s poll
  // therefore restarts when the filter changes, which is what you want anyway:
  // the next tick already refetches the range now on screen.
  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/procurement/report?from=${from}&to=${to}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
      loadCounts()
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [from, to, loadCounts])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [load])

  const sorted = data ? [...data.materials].sort(byUrgency) : []
  const critical = sorted.filter((m) => m.level === "red").length
  const low = sorted.filter((m) => m.level === "yellow").length

  const materialColumns: Column<MaterialRow>[] = [
    { key: "label", header: "Material", primary: true, cell: (m) => <span className="font-bold text-ink-primary">{m.label}</span> },
    {
      key: "group", header: "Type",
      cell: (m) => <Chip tone={m.group === "procurement" ? "brand" : "neutral"}>{m.group === "procurement" ? "Procurement" : "Production"}</Chip>,
    },
    { key: "breakdown", header: "Breakdown", hideOnMobile: true, cell: (m) => <span className="text-ink-muted text-xs">{m.breakdown ?? "—"}</span> },
    {
      key: "remaining", header: "Remaining", align: "right", numeric: true,
      cell: (m) => (
        <span className="inline-flex flex-col items-start sm:items-end leading-tight">
          <span className="font-semibold text-ink-primary">
            {fmt(m.remaining)} <span className="text-ink-muted text-xs font-medium">{m.unit}</span>
          </span>
          {/* Containers are the unit procurement buys and counts in; the second line is
              the same quantity in pieces or litres. Both, so neither can be mistaken
              for the other. */}
          {m.unitEach && m.remaining > 0 && (
            <span className="text-xs font-medium text-ink-muted">
              {fmt(m.remaining * m.unitEach.qty)} {m.unitEach.unit}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "received", header: "Received", align: "right", numeric: true,
      cell: (m) => (m.receivedInWindow > 0 ? <span className="text-good-ink font-semibold">+{fmt(m.receivedInWindow)}</span> : "—"),
    },
    { key: "used", header: "Used / issued", align: "right", numeric: true, cell: (m) => fmt(m.usedInWindow) },
    {
      key: "avg", header: "Avg/op-day", align: "right", numeric: true, hideOnMobile: true,
      cell: (m) => {
        if (m.avgPerDay <= 0) return "—"
        return (
          <span className="inline-flex flex-col items-start sm:items-end leading-tight">
            <span className={burnLooksImplausible(m) ? "text-warning-ink font-semibold" : undefined}>
              {fmt1(m.avgPerDay)}
            </span>
            {m.expectedPerDay !== null && burnLooksImplausible(m) && (
              <span className="text-xs font-medium text-ink-muted">expect ~{fmt(m.expectedPerDay)}</span>
            )}
          </span>
        )
      },
    },
    {
      key: "days", header: "Days left", align: "right", numeric: true,
      cell: (m) =>
        m.operatingDaysLeft === null ? (
          <span className="text-ink-muted font-medium">no usage</span>
        ) : (
          <span className="inline-flex flex-col items-start sm:items-end leading-tight">
            <span className={`font-bold ${m.level === "red" ? "text-critical-ink" : m.level === "yellow" ? "text-warning-ink" : "text-ink-primary"}`}>
              {fmt1(m.operatingDaysLeft)}d
            </span>
            {/* How much data is behind the number — a projection from one recorded
                day should not look like a projection from a month of them. */}
            {/* Where the figure came from. A projection from the known normal rate is
                not the same claim as one measured from a month of records, and saying
                which is the difference between a number you can act on and a guess. */}
            {m.basis === "expected" ? (
              <span className="text-xs font-medium text-ink-muted">
                at ~{fmt(m.expectedPerDay ?? 0)}/day expected
              </span>
            ) : m.sampleDays > 0 && m.sampleDays < MIN_SAMPLE_DAYS ? (
              <span className="text-xs font-medium text-ink-muted">
                {m.sampleDays} day{m.sampleDays === 1 ? "" : "s"} of data
              </span>
            ) : null}
          </span>
        ),
    },
    { key: "runout", header: "Runs out", align: "right", hideOnMobile: true, cell: (m) => (m.runOutDate ? shortDay(m.runOutDate) : "—") },
    { key: "status", header: "Status", align: "right", cell: (m) => <StatusBadge level={m.level} /> },
    {
      key: "action", header: "Action", align: "right",
      cell: (m) => {
        const target = ledgerTargetForKey(m.key)
        if (!target) return <span className="text-ink-muted text-xs">—</span>
        return (
          <button
            onClick={() => {
              setReconcile({ ...target, label: m.label, unit: m.unit, currentRemaining: m.remaining })
              setShowReconcile(true)
            }}
            className="h-9 px-2 text-xs font-bold text-brand hover:underline whitespace-nowrap"
          >
            Count
          </button>
        )
      },
    },
  ]

  const receiptColumns: Column<Receipt>[] = [
    { key: "date", header: "Date", primary: true, cell: (r) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(r.date)}</span> },
    { key: "material", header: "Material", cell: (r) => MAT_LABEL[r.material_type] ?? r.material_type },
    {
      key: "received", header: "Received", align: "right", numeric: true,
      cell: (r) => (r.received_pcs > 0 ? <span className="text-good-ink font-semibold">+{fmt(r.received_pcs)}</span> : "—"),
    },
    { key: "issued", header: "Issued", align: "right", numeric: true, cell: (r) => (r.given_pcs > 0 ? fmt(r.given_pcs) : "—") },
    { key: "to", header: "Issued to", hideOnMobile: true, cell: (r) => r.given_to ?? "—" },
    { key: "by", header: "By", hideOnMobile: true, cell: (r) => r.received_by ?? "—" },
  ]

  const countColumns: Column<StockCount>[] = [
    {
      key: "date", header: "Date", primary: true,
      cell: (c) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(c.date)}{c.shift ? ` · ${c.shift}` : ""}</span>,
    },
    {
      key: "material", header: "Material",
      cell: (c) => `${c.material}${c.product ? ` — ${c.product}` : ""}${c.variant ? ` (${c.variant})` : ""}`,
    },
    { key: "counted", header: "Counted", align: "right", numeric: true, cell: (c) => fmt(c.counted_qty) },
    { key: "system", header: "System", align: "right", numeric: true, cell: (c) => fmt(c.computed_qty) },
    {
      key: "variance", header: "Variance", align: "right", numeric: true,
      cell: (c) => (
        <span className={`font-bold ${c.variance === 0 ? "text-ink-muted" : c.variance > 0 ? "text-good-ink" : "text-critical-ink"}`}>
          {c.variance > 0 ? "+" : ""}{fmt(c.variance)}
        </span>
      ),
    },
    { key: "kind", header: "Type", cell: (c) => <Chip tone={c.kind === "baseline" ? "neutral" : "warning"}>{c.kind}</Chip> },
    { key: "by", header: "By", hideOnMobile: true, cell: (c) => c.counted_by ?? "—" },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Stock levels"
        description={
          data
            ? `Updated ${new Date(data.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${
                critical > 0 ? ` · ${critical} material${critical > 1 ? "s" : ""} critical` : ""
              }`
            : "Procurement office"
        }
        actions={
          <>
            <button
              onClick={() => { setReconcile(null); setShowReconcile(true) }}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" /> New count
            </button>
            <Link
              href="/dashboard/procurement/submit"
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" /> Log receipt
            </Link>
            <button
              onClick={load}
              disabled={loading}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
              Refresh
            </button>
          </>
        }
      />

      {/* One filter row above everything it scopes. */}
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
                  active
                    ? "bg-brand-solid text-brand-ink border-brand-solid"
                    : "bg-surface-card text-ink-secondary border-hairline hover:border-brand"
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <input
          type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date"
          className="h-9 min-w-0 flex-1 px-2 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none"
        />
        <span className="text-ink-muted text-xs" aria-hidden="true">→</span>
        <input
          type="date" value={to} min={from} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} aria-label="To date"
          className="h-9 min-w-0 flex-1 px-2 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none"
        />
      </div>

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle className="w-5 h-5 text-critical" />}
            title="Couldn’t load stock data"
            description="The request failed. Check your connection and try again."
            action={
              <button onClick={load} className="h-11 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold active:scale-[0.97]">
                Retry
              </button>
            }
          />
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-ink-muted" aria-busy="true">
          <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading stock levels</span>
        </div>
      )}

      {data && (
        // Hold the previous render at reduced opacity while refetching (this page
        // polls every 60s) — no skeleton flash, no layout jump.
        <div className={loading ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Bitters — finished" value={data.finishedGoods.bitters} unit="ctn" icon={<PackageCheck className="w-5 h-5" />} accent="bitters" />
            <StatTile label="Ginger — finished" value={data.finishedGoods.ginger} unit="ctn" icon={<PackageCheck className="w-5 h-5" />} accent="ginger" />
            <StatTile label="Restock now" value={critical} unit="items" icon={<AlertCircle className="w-5 h-5" />} accent={critical > 0 ? "critical" : "neutral"} />
            <StatTile label="Reorder soon" value={low} unit="items" icon={<AlertTriangle className="w-5 h-5" />} accent={low > 0 ? "warning" : "neutral"} />
          </div>

          <Card>
            <CardHeader
              title="Materials — stock & days left"
              hint={`operating days (Mon–Sat) · critical ≤ ${data.thresholds.redDays} · low ≤ ${data.thresholds.amberDays}`}
            />
            <DataTable columns={materialColumns} rows={sorted} rowKey={(m) => m.key} />
          </Card>

          <Card>
            <CardHeader title="Receipts & issuance" hint={`${shortDay(data.filters.from)} – ${shortDay(data.filters.to)}`} />
            <DataTable
              columns={receiptColumns}
              rows={data.receipts}
              rowKey={(r) => `${r.date}-${r.material_type}-${r.received_pcs}-${r.given_pcs}`}
              empty={<EmptyState compact title="No receipts or issues in this range" />}
            />
          </Card>

          <Card>
            <CardHeader title="Stock counts & variances" hint="baselines + reconciliations · latest 50" />
            <DataTable
              columns={countColumns}
              rows={counts}
              rowKey={(c) => c.id}
              empty={
                <EmptyState
                  compact
                  title="No counts recorded yet"
                  description="Use “New count” to set a baseline or reconcile a material."
                />
              }
            />
          </Card>
        </div>
      )}

      <ReconcileModal open={showReconcile} onClose={() => setShowReconcile(false)} onDone={load} target={reconcile} />
    </div>
  )
}
