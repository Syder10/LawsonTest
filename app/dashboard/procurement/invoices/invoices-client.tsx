"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Download, FileText, Loader2, Plus, RefreshCw } from "lucide-react"
import { shortDay, fmt } from "@/components/features/dashboard/manager/viz"
import {
  FULFILMENT_LABELS,
  fulfilment,
  totalMismatchNote,
  totalsAgree,
  type FulfilmentState,
  type InvoiceDetail,
  type InvoiceLineDetail,
} from "@/lib/domain/invoices"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Report {
  filters: { from: string; to: string }
  invoices: InvoiceDetail[]
  last_updated: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const PRESETS = [
  { label: "30d", from: () => daysAgo(29) },
  { label: "90d", from: () => daysAgo(89) },
  { label: "1y", from: () => daysAgo(364) },
]
const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Lines fully arrived (received or over-delivered) against the line count. Unit-safe:
// it counts lines by fulfilment state rather than summing quantities across units.
function receivedLines(inv: InvoiceDetail): { done: number; total: number } {
  const done = inv.lines.filter((l) => {
    const s = fulfilment(l).state
    return s === "complete" || s === "over"
  }).length
  return { done, total: inv.lines.length }
}

function toCsv(rows: InvoiceDetail[]): string {
  const head = ["Date", "Supplier", "Invoice number", "Currency", "Lines total", "Declared total", "Lines", "Lines received", "Recorded by", "Remarks"]
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = rows.map((inv) => {
    const rl = receivedLines(inv)
    return [inv.invoiceDate, inv.supplier, inv.invoiceNumber, inv.currency, inv.lineTotal, inv.declaredTotal ?? "", rl.total, rl.done, inv.recordedBy ?? "", inv.remarks ?? ""]
      .map(cell)
      .join(",")
  })
  return [head.join(","), ...body].join("\n")
}

// Received-against-invoiced by line (FR-10). Reuses the domain's `fulfilment` for the
// running difference and `FULFILMENT_LABELS` for the state, so nothing is recomputed
// here. Received is a pcs sum; a line billed in another unit is compared best-effort.
const STATE_TONE: Record<FulfilmentState, "good" | "warning" | "neutral"> = {
  complete: "good",
  over: "warning",
  part: "warning",
  outstanding: "neutral",
}

function InvoiceLineBreakdown({ invoice }: { invoice: InvoiceDetail }) {
  const note = totalMismatchNote(invoice.declaredTotal, invoice.lineTotal, invoice.currency)
  const columns: Column<InvoiceLineDetail>[] = [
    { key: "material", header: "Material", primary: true, cell: (l) => <span className="font-semibold text-ink-primary">{l.materialType}</span> },
    { key: "invoiced", header: "Invoiced", align: "right", numeric: true, cell: (l) => <span>{fmt(l.quantity)} <span className="text-ink-muted text-xs">{l.unit}</span></span> },
    { key: "received", header: "Received", align: "right", numeric: true, cell: (l) => <span>{fmt(l.receivedQuantity)} <span className="text-ink-muted text-xs">pcs</span></span> },
    { key: "outstanding", header: "Outstanding", align: "right", numeric: true, cell: (l) => <span className="font-semibold text-ink-primary">{fmt(fulfilment(l).outstanding)} <span className="text-ink-muted text-xs">{l.unit}</span></span> },
    { key: "status", header: "Status", cell: (l) => { const s = fulfilment(l).state; return <Chip tone={STATE_TONE[s]}>{FULFILMENT_LABELS[s]}</Chip> } },
  ]
  return (
    <div className="space-y-3">
      {note && (
        <p className="text-xs font-medium text-warning-ink bg-warning-subtle border border-warning/30 rounded-xl px-3 py-2">
          {note}
        </p>
      )}
      <DataTable
        columns={columns}
        rows={invoice.lines}
        rowKey={(l) => l.id}
        empty={<EmptyState compact title="This invoice has no lines" />}
      />
      <p className="text-xs text-ink-muted font-medium">
        Received is counted in pieces; lines billed in another unit are compared best-effort.
      </p>
    </div>
  )
}

export function InvoicesClient({ canWrite }: { canWrite: boolean }) {
  const [from, setFrom] = useState(daysAgo(89))
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<InvoiceDetail | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/invoices?from=${from}&to=${to}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])
  const exportCsv = () => {
    if (!data || data.invoices.length === 0) return
    const blob = new Blob([toCsv(data.invoices)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `lawson_invoices_${data.filters.from}_${data.filters.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const invoices = data?.invoices ?? []
  const lineCount = invoices.reduce((s, i) => s + i.lines.length, 0)
  const suppliers = new Set(invoices.map((i) => i.supplier)).size
  const outstanding = invoices.reduce((s, i) => {
    const rl = receivedLines(i)
    return s + (rl.total - rl.done)
  }, 0)

  const columns: Column<InvoiceDetail>[] = [
    { key: "date", header: "Date", primary: true, cell: (i) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(i.invoiceDate)}</span> },
    { key: "supplier", header: "Supplier", cell: (i) => i.supplier },
    { key: "number", header: "Invoice", cell: (i) => i.invoiceNumber },
    { key: "lines", header: "Lines total", align: "right", numeric: true, cell: (i) => <span className="font-bold text-ink-primary">{money(i.lineTotal, i.currency)}</span> },
    {
      key: "declared", header: "Declared", align: "right", numeric: true, hideOnMobile: true,
      cell: (i) =>
        i.declaredTotal === null ? (
          <span className="text-ink-muted">-</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            {!totalsAgree(i.declaredTotal, i.lineTotal) && <Chip tone="warning">Differs</Chip>}
            <span className="font-semibold">{money(i.declaredTotal, i.currency)}</span>
          </span>
        ),
    },
    {
      key: "received", header: "Received",
      cell: (i) => {
        const { done, total } = receivedLines(i)
        return <Chip tone={total > 0 && done === total ? "good" : done > 0 ? "warning" : "neutral"}>{done}/{total} lines</Chip>
      },
    },
    { key: "by", header: "Recorded by", hideOnMobile: true, cell: (i) => i.recordedBy ?? "-" },
    {
      key: "action", header: "", align: "right", interactive: true,
      cell: (i) => (
        <button
          onClick={() => setSelected(i)}
          className="h-8 px-3 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors whitespace-nowrap"
        >
          Lines
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Invoices"
        description={data ? `${data.invoices.length} invoices` : "Supplier invoice log"}
        actions={
          <>
            {canWrite && (
              <Link
                href="/dashboard/procurement/invoices/new"
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New invoice
              </Link>
            )}
            <button
              onClick={exportCsv}
              disabled={!data || data.invoices.length === 0}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors disabled:opacity-60"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export
            </button>
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
      </div>

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle className="w-5 h-5 text-critical" />}
            title="Couldn’t load invoices"
            description="The request failed. Check your connection and try again."
            action={<button onClick={load} className="h-11 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold active:scale-[0.97]">Retry</button>}
          />
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-ink-muted" aria-busy="true">
          <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading invoices</span>
        </div>
      )}

      {data && (
        <div className={loading ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Invoices" value={invoices.length} icon={<FileText className="w-5 h-5" />} accent="brand" />
            <StatTile label="Lines" value={lineCount} accent="neutral" />
            <StatTile label="Suppliers" value={suppliers} accent="neutral" />
            <StatTile label="Lines outstanding" value={outstanding} accent={outstanding > 0 ? "warning" : "good"} />
          </div>

          <Card>
            <CardHeader title="Invoice log" hint={`${shortDay(data.filters.from)} to ${shortDay(data.filters.to)}`} />
            <DataTable
              columns={columns}
              rows={invoices}
              rowKey={(i) => i.id}
              empty={<EmptyState compact title="No invoices in this range" description={canWrite ? "Use New invoice to record a supplier document." : undefined} />}
            />
          </Card>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{selected ? `${selected.supplier} · ${selected.invoiceNumber}` : "Invoice lines"}</DialogTitle>
            <DialogDescription>Quantity received against quantity invoiced, by line.</DialogDescription>
          </DialogHeader>
          {selected && <InvoiceLineBreakdown invoice={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
