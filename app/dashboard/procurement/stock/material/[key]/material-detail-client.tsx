"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, ClipboardCheck, PackageCheck } from "lucide-react"
import { fmt, shortDay } from "@/components/features/dashboard/manager/viz"
import type { StockMaterialDescriptor } from "@/lib/domain/stock-materials"
import type { CountEntry, LedgerEntry, MaterialDetail, SourceRecord } from "@/lib/domain/material-detail"
import { ALL_TIME, isAllTime, ALL_TIME_LABEL } from "@/lib/domain/date-window"
import {
  Card,
  CardHeader,
  Chip,
  DataTable,
  EmptyState,
  PageHeader,
  StatTile,
  type Column,
} from "@/components/primitives"
import { ReconcileModal, ledgerTargetForKey, type ReconcileTarget } from "@/components/features/stock/reconcile-modal"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const PRESETS = [
  { label: "7d", from: () => daysAgo(6) },
  { label: "30d", from: () => daysAgo(29) },
  { label: "90d", from: () => daysAgo(89) },
  { label: "All time", from: () => ALL_TIME },
]
const numOrDash = (v: number | null) => (v === null ? "—" : fmt(v))

// One material's dated history over a window. The date range lives in the URL so the
// server re-assembles from the same tables the dashboard reads — no client fetch, no
// figure recomputed here (NFR-2). Count re-anchors the ledger for canWrite readers.
export function MaterialDetailClient({
  descriptor,
  detail,
  from,
  to,
  canWrite,
  backHref = "/dashboard/procurement/stock",
  backLabel = "Stock levels",
}: {
  descriptor: StockMaterialDescriptor
  detail: MaterialDetail
  from: string
  to: string
  canWrite: boolean
  /** Where the top back-link returns. Herbs come from their own hub, everything
      else from the stock levels page. */
  backHref?: string
  backLabel?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [showReconcile, setShowReconcile] = useState(false)

  const setRange = (nextFrom: string, nextTo: string) =>
    startTransition(() => router.push(`${pathname}?from=${nextFrom}&to=${nextTo}`))

  // Count target: null for PPE (a running total, not a re-anchored ledger).
  const target = ledgerTargetForKey(descriptor.key)
  const reconcileTarget: ReconcileTarget | null = target
    ? { ...target, label: descriptor.label, unit: descriptor.unit, currentRemaining: detail.remaining }
    : null

  const totalIn = detail.sourceRecords.reduce((s, r) => s + (r.received ?? 0), 0)
  const totalOut = detail.sourceRecords.reduce((s, r) => s + (r.used ?? 0), 0)

  const inHeader = descriptor.kind === "consumable" ? "In" : "Received"
  const outHeader = descriptor.kind === "consumable" ? "Issued" : "Used"

  // All-time travels as the empty sentinel, so caption it "All time" rather than
  // formatting the floor date the query actually ran against.
  const rangeLabel = isAllTime(from) ? ALL_TIME_LABEL : `${shortDay(from)} – ${shortDay(to)}`

  const sourceColumns: Column<SourceRecord>[] = [
    {
      key: "date", header: "Date", primary: true,
      cell: (r) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(r.date)}{r.shift ? ` · ${r.shift}` : ""}</span>,
    },
    {
      key: "in", header: inHeader, align: "right", numeric: true,
      cell: (r) => (r.received !== null && r.received > 0 ? <span className="text-good-ink font-semibold">+{fmt(r.received)}</span> : numOrDash(r.received)),
    },
  ]
  // Derived materials (tax stamps, cartons) have no filed "used" side — consumption
  // is derived from production — so that column is dropped for them.
  if (descriptor.kind !== "derived") {
    sourceColumns.push({ key: "out", header: outHeader, align: "right", numeric: true, cell: (r) => numOrDash(r.used) })
  }
  if (descriptor.kind === "consumable") {
    sourceColumns.push({ key: "to", header: "Issued to", hideOnMobile: true, cell: (r) => r.destination ?? "—" })
  } else if (descriptor.kind === "ledger") {
    sourceColumns.push({ key: "dest", header: "Destination", hideOnMobile: true, cell: (r) => r.destination ?? "—" })
  }
  sourceColumns.push({ key: "by", header: "By", hideOnMobile: true, cell: (r) => r.by ?? "—" })
  sourceColumns.push({ key: "note", header: "Note", hideOnMobile: true, cell: (r) => r.remarks ?? "—" })

  const ledgerColumns: Column<LedgerEntry>[] = [
    {
      key: "date", header: "Date", primary: true,
      cell: (l) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(l.date)} · {l.shift}</span>,
    },
    { key: "opening", header: "Opening", align: "right", numeric: true, cell: (l) => fmt(l.opening) },
    { key: "received", header: "Received", align: "right", numeric: true, cell: (l) => (l.received > 0 ? <span className="text-good-ink font-semibold">+{fmt(l.received)}</span> : "—") },
    { key: "used", header: "Used", align: "right", numeric: true, cell: (l) => (l.used > 0 ? fmt(l.used) : "—") },
    { key: "remaining", header: "Remaining", align: "right", numeric: true, cell: (l) => <span className="font-bold text-ink-primary">{fmt(l.remaining)}</span> },
  ]

  const countColumns: Column<CountEntry>[] = [
    {
      key: "date", header: "Date", primary: true,
      cell: (c) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(c.date)}{c.shift ? ` · ${c.shift}` : ""}</span>,
    },
    { key: "counted", header: "Counted", align: "right", numeric: true, cell: (c) => fmt(c.counted) },
    { key: "system", header: "System", align: "right", numeric: true, cell: (c) => fmt(c.computed) },
    {
      key: "variance", header: "Variance", align: "right", numeric: true,
      cell: (c) => (
        <span className={`font-bold ${c.variance === 0 ? "text-ink-muted" : c.variance > 0 ? "text-good-ink" : "text-critical-ink"}`}>
          {c.variance > 0 ? "+" : ""}{fmt(c.variance)}
        </span>
      ),
    },
    { key: "kind", header: "Type", cell: (c) => <Chip tone={c.kind === "baseline" ? "neutral" : "warning"}>{c.kind}</Chip> },
    { key: "by", header: "By", hideOnMobile: true, cell: (c) => c.by ?? "—" },
  ]
  return (
    <div className="space-y-5 max-w-5xl mx-auto animate-fade-in-up">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-secondary hover:text-brand transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {backLabel}
      </Link>

      <PageHeader
        title={descriptor.label}
        description={rangeLabel}
        actions={
          canWrite && reconcileTarget ? (
            <button
              onClick={() => setShowReconcile(true)}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" /> Count
            </button>
          ) : undefined
        }
      />

      <div className="bg-surface-card rounded-2xl border border-hairline p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 mr-1">
          {PRESETS.map((p) => {
            const active = p.from() === from && to === iso(new Date())
            return (
              <button
                key={p.label}
                onClick={() => setRange(p.from(), iso(new Date()))}
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
        <input type="date" value={from} max={to} onChange={(e) => setRange(e.target.value, to)} aria-label="From date" className="h-9 min-w-0 flex-1 px-2 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none" />
        <span className="text-ink-muted text-xs" aria-hidden="true">→</span>
        <input type="date" value={to} min={from} max={iso(new Date())} onChange={(e) => setRange(from, e.target.value)} aria-label="To date" className="h-9 min-w-0 flex-1 px-2 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none" />
      </div>

      <div className={pending ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"}>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatTile label="On hand" value={detail.remaining} unit={descriptor.unit} icon={<PackageCheck className="w-5 h-5" />} accent="brand" />
          <StatTile label={inHeader} value={totalIn} unit={descriptor.unit} accent="neutral" />
          {descriptor.kind !== "derived" && (
            <StatTile label={outHeader} value={totalOut} unit={descriptor.unit} accent="neutral" />
          )}
        </div>

        {descriptor.kind === "derived" && (
          <p className="text-xs font-medium text-ink-secondary bg-surface-sunken border border-hairline rounded-xl px-3 py-2">
            Consumption is derived from cartons produced and is not itemised here. The receipts below are the recorded deliveries; the on-hand figure already nets out that derived usage.
          </p>
        )}
        {descriptor.kind === "ledger" && (
          <Card>
            <CardHeader title="Stock ledger" hint="per shift · opening → remaining" />
            <DataTable
              columns={ledgerColumns}
              rows={detail.ledger}
              rowKey={(l) => `${l.date}-${l.shift}`}
              empty={<EmptyState compact title="No movements in this range" />}
            />
          </Card>
        )}

        <Card>
          <CardHeader
            title={descriptor.kind === "ledger" ? "Filed records" : "Receipts & issuance"}
            hint={rangeLabel}
          />
          <DataTable
            columns={sourceColumns}
            rows={detail.sourceRecords}
            rowKey={(r) => r.id}
            empty={<EmptyState compact title="No records in this range" />}
          />
        </Card>

        {descriptor.kind !== "consumable" && (
          <Card>
            <CardHeader title="Stock counts & variances" hint="baselines + reconciliations in range" />
            <DataTable
              columns={countColumns}
              rows={detail.counts}
              rowKey={(c) => c.id}
              empty={<EmptyState compact title="No counts recorded in this range" />}
            />
          </Card>
        )}
      </div>

      {canWrite && reconcileTarget && (
        <ReconcileModal
          open={showReconcile}
          onClose={() => setShowReconcile(false)}
          onDone={() => router.refresh()}
          target={reconcileTarget}
        />
      )}
    </div>
  )
}
