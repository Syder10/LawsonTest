"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Download, Loader2, Plus, RefreshCw, Truck } from "lucide-react"
import { shortDay } from "@/components/features/dashboard/manager/viz"
import { grandTotalCartons, type DispatchBreakdownRow, type DispatchDetail, type DispatchTotal } from "@/lib/domain/dispatch"
import { PRODUCTS } from "@/lib/domain/record-types"
import type { Product } from "@/lib/db/types"
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
import { DispatchBreakdownCards } from "@/components/features/dispatch/breakdown-cards"

interface Report {
  filters: { from: string; to: string }
  totals: DispatchTotal[]
  byVehicle: DispatchBreakdownRow[]
  byDriver: DispatchBreakdownRow[]
  byDestination: DispatchBreakdownRow[]
  dispatches: DispatchDetail[]
  last_updated: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const PRESETS = [
  { label: "7d", from: () => daysAgo(6) },
  { label: "30d", from: () => daysAgo(29) },
  { label: "90d", from: () => daysAgo(89) },
]
const fmt = (n: number) => n.toLocaleString()

// Build a CSV of the loaded window. Client-side so it exports exactly what is on
// screen; product columns come from PRODUCTS so a new product needs no change here.
function toCsv(rows: DispatchDetail[]): string {
  const head = ["Date", "Shift", "Vehicle", "Driver", "Destination", "Waybill", ...PRODUCTS, "Total cartons", "Released by", "Remarks"]
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cartonsFor = (d: DispatchDetail, p: Product) => d.lines.find((l) => l.product === p)?.cartons ?? 0
  const body = rows.map((d) =>
    [d.date, d.shift, d.vehicleReg, d.driverName, d.destination, d.waybillNumber ?? "", ...PRODUCTS.map((p) => cartonsFor(d, p)), d.totalCartons, d.releasedBy ?? "", d.remarks ?? ""]
      .map(cell)
      .join(","),
  )
  return [head.join(","), ...body].join("\n")
}

export function DispatchClient({ canWrite }: { canWrite: boolean }) {
  const [from, setFrom] = useState(daysAgo(29))
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/dispatch?from=${from}&to=${to}`)
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
    if (!data || data.dispatches.length === 0) return
    const blob = new Blob([toCsv(data.dispatches)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `lawson_dispatch_${data.filters.from}_${data.filters.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const grandTotal = data ? grandTotalCartons(data.dispatches) : 0
  const cartonsOf = (p: Product) => data?.totals.find((t) => t.product === p)?.cartons ?? 0

  const columns: Column<DispatchDetail>[] = [
    { key: "date", header: "Date", primary: true, cell: (d) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(d.date)} · {d.shift}</span> },
    { key: "vehicle", header: "Vehicle", cell: (d) => d.vehicleReg },
    { key: "driver", header: "Driver", cell: (d) => d.driverName },
    { key: "destination", header: "Destination", cell: (d) => d.destination },
    {
      key: "products", header: "Cartons",
      cell: (d) => (
        <span className="flex flex-wrap gap-1">
          {d.lines.map((l) => (
            <Chip key={l.product} tone={l.product === "Bitters" ? "bitters" : "ginger"}>{l.product} {fmt(l.cartons)}</Chip>
          ))}
        </span>
      ),
    },
    { key: "total", header: "Total", align: "right", numeric: true, cell: (d) => <span className="font-bold text-ink-primary">{fmt(d.totalCartons)}</span> },
    { key: "waybill", header: "Waybill", hideOnMobile: true, cell: (d) => d.waybillNumber ?? "-" },
    { key: "by", header: "Released by", hideOnMobile: true, cell: (d) => d.releasedBy ?? "-" },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Dispatch"
        description={data ? `${data.dispatches.length} loads · ${fmt(grandTotal)} cartons` : "Outbound delivery log"}
        actions={
          <>
            {canWrite && (
              <Link
                href="/dashboard/procurement/dispatch/new"
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New dispatch
              </Link>
            )}
            <button
              onClick={exportCsv}
              disabled={!data || data.dispatches.length === 0}
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
            title="Couldn’t load dispatches"
            description="The request failed. Check your connection and try again."
            action={<button onClick={load} className="h-11 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold active:scale-[0.97]">Retry</button>}
          />
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-20 text-ink-muted" aria-busy="true">
          <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading dispatches</span>
        </div>
      )}

      {data && (
        <div className={loading ? "space-y-5 opacity-60 transition-opacity" : "space-y-5 transition-opacity"}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Total cartons" value={grandTotal} unit="ctn" icon={<Truck className="w-5 h-5" />} accent="brand" />
            <StatTile label="Loads" value={data.dispatches.length} unit="loads" accent="neutral" />
            <StatTile label="Bitters out" value={cartonsOf("Bitters")} unit="ctn" accent="bitters" />
            <StatTile label="Ginger out" value={cartonsOf("Ginger")} unit="ctn" accent="ginger" />
          </div>

          <DispatchBreakdownCards byVehicle={data.byVehicle} byDriver={data.byDriver} byDestination={data.byDestination} />

          <Card>
            <CardHeader title="Dispatch log" hint={`${shortDay(data.filters.from)} to ${shortDay(data.filters.to)}`} />
            <DataTable
              columns={columns}
              rows={data.dispatches}
              rowKey={(d) => d.id}
              empty={<EmptyState compact title="No dispatches in this range" description={canWrite ? "Use New dispatch to log an outbound load." : undefined} />}
            />
          </Card>
        </div>
      )}
    </div>
  )
}
