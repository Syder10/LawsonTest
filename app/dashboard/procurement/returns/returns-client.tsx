"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Download, Loader2, Plus, RefreshCw, RotateCcw } from "lucide-react"
import { shortDay } from "@/components/features/dashboard/manager/viz"
import type { ProductReturnDetail, ProductReturnTotal } from "@/lib/domain/product-returns"
import type { Product } from "@/lib/db/types"
import {
  Card,
  Chip,
  DataTable,
  EmptyState,
  PageHeader,
  StatTile,
  type Column,
} from "@/components/primitives"

interface ReturnsReport {
  filters: { from: string; to: string }
  totals: ProductReturnTotal[]
  returns: ProductReturnDetail[]
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

function toCsv(rows: ProductReturnDetail[]): string {
  const head = ["Date", "Shift", "Branch/Source", "Product", "Cartons", "Driver", "Car", "Received By", "Remarks"]
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = rows.map((r) =>
    [
      r.date,
      r.shift,
      r.returned_from ?? "",
      r.product,
      r.cartons,
      r.driver_name ?? "",
      r.vehicle_reg ?? "",
      r.received_by ?? "",
      r.remarks ?? "",
    ]
      .map(cell)
      .join(","),
  )
  return [head.join(","), ...body].join("\n")
}

export function ReturnsClient({ canWrite }: { canWrite: boolean }) {
  const [from, setFrom] = useState(daysAgo(29))
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<ReturnsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/returns?from=${from}&to=${to}`)
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
    if (!data || data.returns.length === 0) return
    const blob = new Blob([toCsv(data.returns)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `lawson_product_returns_${data.filters.from}_${data.filters.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const grandTotal = data ? data.returns.reduce((sum, r) => sum + r.cartons, 0) : 0
  const cartonsOf = (p: Product) => data?.totals.find((t) => t.product === p)?.cartons ?? 0

  const columns: Column<ProductReturnDetail>[] = [
    {
      key: "date",
      header: "Date",
      primary: true,
      cell: (r) => (
        <span className="font-semibold text-ink-primary whitespace-nowrap">
          {shortDay(r.date)} · {r.shift}
        </span>
      ),
    },
    {
      key: "branch",
      header: "Branch / Source",
      cell: (r) => (
        <span className="font-medium text-ink-primary">
          {r.returned_from || "—"}
        </span>
      ),
    },
    {
      key: "product",
      header: "Product",
      cell: (r) => (
        <Chip tone={r.product === "Bitters" ? "bitters" : "ginger"}>
          {r.product}
        </Chip>
      ),
    },
    {
      key: "cartons",
      header: "Cartons",
      align: "right",
      numeric: true,
      cell: (r) => <span className="font-bold text-ink-primary">{fmt(r.cartons)}</span>,
    },
    {
      key: "driver",
      header: "Driver",
      hideOnMobile: true,
      cell: (r) => r.driver_name || "—",
    },
    {
      key: "car",
      header: "Car",
      hideOnMobile: true,
      cell: (r) => r.vehicle_reg || "—",
    },
    {
      key: "received_by",
      header: "Received by",
      hideOnMobile: true,
      cell: (r) => r.received_by || "—",
    },
    {
      key: "remarks",
      header: "Remarks",
      hideOnMobile: true,
      cell: (r) => r.remarks || "—",
    },
  ]

  return (
    <div className="space-y-5 animate-fade-in-up">
      <PageHeader
        title="Product Returns"
        description={data ? `${data.returns.length} return events · ${fmt(grandTotal)} cartons` : "Finished goods returned to stock"}
        actions={
          <>
            {canWrite && (
              <Link
                href="/dashboard/procurement/returns/new"
                className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New return
              </Link>
            )}
            <button
              onClick={exportCsv}
              disabled={!data || data.returns.length === 0}
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
        <div className="flex items-center gap-2 text-xs text-ink-secondary">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 px-2 rounded-lg border border-hairline bg-surface-card text-xs text-ink-primary"
          />
          <span>to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 px-2 rounded-lg border border-hairline bg-surface-card text-xs text-ink-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Total returned"
          value={data ? grandTotal : "—"}
          unit="ctn"
          icon={<RotateCcw className="w-5 h-5" />}
          accent="brand"
        />
        <StatTile
          label="Bitters returned"
          value={data ? cartonsOf("Bitters") : "—"}
          unit="ctn"
          accent="bitters"
        />
        <StatTile
          label="Ginger returned"
          value={data ? cartonsOf("Ginger") : "—"}
          unit="ctn"
          accent="ginger"
        />
        <StatTile
          label="Return records"
          value={data ? data.returns.length : "—"}
          unit="rows"
          accent="neutral"
        />
      </div>

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle className="w-5 h-5 text-critical" />}
            title="Failed to load returns"
            description="The request failed. Check your connection and try again."
            action={
              <button onClick={load} className="h-10 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold active:scale-[0.97]">
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
            rows={data?.returns ?? []}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                compact
                title="No returns in this range"
                description={canWrite ? "Use New return to log returned finished goods." : "No returns were filed in this date window."}
              />
            }
          />
        </Card>
      )}
    </div>
  )
}
