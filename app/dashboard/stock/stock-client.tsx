"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  AlertTriangle,
  PackageCheck,
  Send,
  ClipboardCheck,
  Truck,
  FileText,
  Factory,
  RotateCcw,
  Calendar,
  Gift,
  Boxes,
  Search,
  Filter,
  CheckCircle2,
  ArrowRight,
  TrendingDown,
  Warehouse,
} from "lucide-react"
import { fmt, fmt1, shortDay } from "@/components/features/dashboard/manager/viz"
import { MIN_SAMPLE_DAYS, burnLooksImplausible, byUrgency } from "@/lib/domain/stock-status"
import type { ProcurementMaterialStatus } from "@/lib/domain/stock-status"
import { ALL_TIME, isAllTime, requestFrom, ALL_TIME_LABEL } from "@/lib/domain/date-window"
import type { ProducedDay, ProducedTotals } from "@/lib/domain/production"
import type { DispatchBreakdownRow, DispatchTotal } from "@/lib/domain/dispatch"
import type { Product } from "@/lib/db/types"
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
import { DispatchBreakdownCards } from "@/components/features/dispatch/breakdown-cards"
import { ReconcileModal, ledgerTargetForKey, type ReconcileTarget } from "@/components/features/stock/reconcile-modal"
import { Button } from "@/components/ui/button"

type MaterialRow = ProcurementMaterialStatus

interface Receipt {
  date: string
  material_type: string
  received_by: string | null
  received_pcs: number
  given_pcs: number
  given_to: string | null
  remarks: string | null
}

interface Report {
  filters: { from: string; to: string }
  materials: MaterialRow[]
  finishedGoods: { bitters: number; ginger: number }
  produced: ProducedTotals
  producedByDay: ProducedDay[]
  receipts: Receipt[]
  thresholds: { redDays: number; amberDays: number }
  last_updated: string
}

interface DispatchSummary {
  totals: DispatchTotal[]
  byVehicle: DispatchBreakdownRow[]
  byDriver: DispatchBreakdownRow[]
  byDestination: DispatchBreakdownRow[]
}

interface StockCount {
  id: string
  date: string
  shift: string | null
  material: string
  product: string | null
  variant: string | null
  counted_qty: number
  computed_qty: number
  variance: number
  kind: "baseline" | "reconciliation"
  note: string | null
  counted_by: string | null
  created_at: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))

const PRESETS = [
  { label: "All Time", from: () => ALL_TIME },
  { label: "Last 7 Days", from: () => daysAgo(6) },
  { label: "Last 30 Days", from: () => daysAgo(29) },
  { label: "Last 90 Days", from: () => daysAgo(89) },
]

const MAT_LABEL: Record<string, string> = {
  tax_stamp: "Tax Stamps",
  carton_bitters: "Cartons — Bitters",
  carton_ginger: "Cartons — Ginger",
  seal_tape: "Seal Tape",
  hair_net: "Hair Nets",
  nose_mask: "Nose Masks",
  gloves: "Gloves",
}

type StockTab = "materials" | "production" | "dispatch" | "receipts" | "counts"

export function StockClient({ canWrite }: { canWrite: boolean }) {
  const [from, setFrom] = useState(ALL_TIME)
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [counts, setCounts] = useState<StockCount[]>([])
  const [dispatch, setDispatch] = useState<DispatchSummary | null>(null)
  const [reconcile, setReconcile] = useState<ReconcileTarget | null>(null)
  const [showReconcile, setShowReconcile] = useState(false)

  // Sub-tab & filter state
  const [activeTab, setActiveTab] = useState<StockTab>("materials")
  const [materialSearch, setMaterialSearch] = useState("")
  const [materialUrgency, setMaterialUrgency] = useState<"all" | "critical" | "warning" | "ok">("all")

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/stock/reconcile?limit=50")
      if (res.ok) setCounts((await res.json()).counts ?? [])
    } catch {
      /* silent */
    }
  }, [])

  const loadDispatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/dispatch?from=${requestFrom(from)}&to=${to}`)
      if (res.ok) setDispatch(await res.json())
    } catch {
      /* silent */
    }
  }, [from, to])

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/procurement/report?from=${requestFrom(from)}&to=${to}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
      loadCounts()
      loadDispatch()
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [from, to, loadCounts, loadDispatch])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [load])

  const sortedMaterials = useMemo(
    () => (data ? [...data.materials].sort(byUrgency) : []),
    [data],
  )
  const criticalCount = sortedMaterials.filter((m) => m.level === "red").length
  const lowCount = sortedMaterials.filter((m) => m.level === "yellow").length

  const filteredMaterials = useMemo(() => {
    return sortedMaterials.filter((m) => {
      const matchesSearch =
        m.label.toLowerCase().includes(materialSearch.toLowerCase()) ||
        m.unit.toLowerCase().includes(materialSearch.toLowerCase())
      if (!matchesSearch) return false
      if (materialUrgency === "critical") return m.level === "red"
      if (materialUrgency === "warning") return m.level === "yellow"
      if (materialUrgency === "ok") return m.level === "none"
      return true
    })
  }, [sortedMaterials, materialSearch, materialUrgency])

  const windowLabel = isAllTime(from)
    ? ALL_TIME_LABEL
    : data
      ? `${shortDay(data.filters.from)} – ${shortDay(data.filters.to)}`
      : ""

  const producedRows = useMemo(
    () => (data ? [...data.producedByDay].reverse() : []),
    [data],
  )

  const dispatchedOf = (p: Product) => dispatch?.totals.find((t) => t.product === p)?.cartons ?? 0
  const dispatchedTotal = (dispatch?.totals ?? []).reduce((s, t) => s + t.cartons, 0)

  // Table Columns
  const materialColumns: Column<MaterialRow>[] = [
    {
      key: "label",
      header: "Material",
      primary: true,
      cell: (m) => (
        <div className="flex flex-col">
          <span className="font-bold text-ink-primary">{m.label}</span>
          {m.breakdown && (
            <span className="text-[11px] font-medium text-ink-muted">{m.breakdown}</span>
          )}
        </div>
      ),
    },
    {
      key: "group",
      header: "Classification",
      hideOnMobile: true,
      cell: (m) => (
        <Chip tone={m.group === "procurement" ? "brand" : "neutral"}>
          {m.group === "procurement" ? "Procurement" : "Production"}
        </Chip>
      ),
    },
    {
      key: "remaining",
      header: "Live On-Hand",
      align: "right",
      numeric: true,
      cell: (m) => (
        <div className="flex flex-col items-end">
          <span className="font-bold text-ink-primary">
            {fmt(m.remaining)} <span className="font-normal text-ink-muted text-xs">{m.unit}</span>
          </span>
          {m.unitEach && (
            <span className="text-[11px] text-ink-muted">
              ~{fmt(m.remaining * m.unitEach.qty)} {m.unitEach.unit}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "days",
      header: "Operating Days Left",
      align: "right",
      numeric: true,
      cell: (m) => (
        <div className="flex flex-col items-end">
          <span
            className={`font-bold ${
              m.level === "red"
                ? "text-critical"
                : m.level === "yellow"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-good-ink"
            }`}
          >
            {m.operatingDaysLeft === null ? "—" : `${fmt1(m.operatingDaysLeft)} d`}
          </span>
          {m.basis === "expected" ? (
            <span className="text-[11px] text-ink-muted">~{fmt(m.expectedPerDay ?? 0)}/d exp</span>
          ) : m.sampleDays > 0 && m.sampleDays < MIN_SAMPLE_DAYS ? (
            <span className="text-[11px] text-ink-muted">{m.sampleDays}d history</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "runout",
      header: "Est. Runout",
      align: "right",
      hideOnMobile: true,
      cell: (m) => (m.runOutDate ? shortDay(m.runOutDate) : "—"),
    },
    {
      key: "status",
      header: "Stock Status",
      align: "right",
      cell: (m) => <StatusBadge level={m.level} />,
    },
  ]

  if (canWrite) {
    materialColumns.push({
      key: "action",
      header: "Action",
      align: "right",
      interactive: true,
      cell: (m) => {
        const target = ledgerTargetForKey(m.key)
        if (!target) return <span className="text-ink-muted text-xs">—</span>
        return (
          <button
            onClick={() => {
              setReconcile({
                ...target,
                label: m.label,
                unit: m.unit,
                currentRemaining: m.remaining,
              })
              setShowReconcile(true)
            }}
            className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-2.5 py-1 text-xs font-bold text-brand-primary hover:bg-brand-primary hover:text-white transition-colors"
          >
            Count
          </button>
        )
      },
    })
  }

  const producedColumns: Column<ProducedDay>[] = [
    {
      key: "date",
      header: "Production Date",
      primary: true,
      cell: (d) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(d.date)}</span>,
    },
    {
      key: "bitters",
      header: "Bitters (ctn)",
      align: "right",
      numeric: true,
      cell: (d) => fmt(d.bitters),
    },
    {
      key: "ginger",
      header: "Ginger (ctn)",
      align: "right",
      numeric: true,
      cell: (d) => fmt(d.ginger),
    },
    {
      key: "total",
      header: "Total Cartons",
      align: "right",
      numeric: true,
      cell: (d) => <span className="font-bold text-ink-primary">{fmt(d.total)}</span>,
    },
  ]

  const receiptColumns: Column<Receipt>[] = [
    {
      key: "date",
      header: "Date",
      primary: true,
      cell: (r) => <span className="font-semibold text-ink-primary whitespace-nowrap">{shortDay(r.date)}</span>,
    },
    {
      key: "material",
      header: "Material Item",
      cell: (r) => MAT_LABEL[r.material_type] ?? r.material_type,
    },
    {
      key: "received",
      header: "Received",
      align: "right",
      numeric: true,
      cell: (r) =>
        r.received_pcs > 0 ? (
          <span className="text-good-ink font-semibold">+{fmt(r.received_pcs)}</span>
        ) : (
          "—"
        ),
    },
    {
      key: "issued",
      header: "Issued",
      align: "right",
      numeric: true,
      cell: (r) => (r.given_pcs > 0 ? fmt(r.given_pcs) : "—"),
    },
    {
      key: "to",
      header: "Issued To",
      hideOnMobile: true,
      cell: (r) => r.given_to ?? "—",
    },
    {
      key: "by",
      header: "Recorded By",
      hideOnMobile: true,
      cell: (r) => r.received_by ?? "—",
    },
  ]

  const countColumns: Column<StockCount>[] = [
    {
      key: "date",
      header: "Audit Date",
      primary: true,
      cell: (c) => (
        <span className="font-semibold text-ink-primary whitespace-nowrap">
          {shortDay(c.date)}
          {c.shift ? ` (${c.shift})` : ""}
        </span>
      ),
    },
    {
      key: "material",
      header: "Counted Material",
      cell: (c) => (
        <div className="flex flex-col">
          <span className="font-semibold text-ink-primary">
            {c.material.charAt(0).toUpperCase() + c.material.slice(1)}
          </span>
          <span className="text-xs text-ink-muted">
            {c.variant ?? (c.product ? `(${c.product})` : "")}
          </span>
        </div>
      ),
    },
    {
      key: "counted",
      header: "Physical Count",
      align: "right",
      numeric: true,
      cell: (c) => <span className="font-bold text-ink-primary">{fmt(c.counted_qty)}</span>,
    },
    {
      key: "variance",
      header: "Audit Variance",
      align: "right",
      numeric: true,
      cell: (c) =>
        c.variance === 0 ? (
          <span className="text-ink-muted font-medium">0 (match)</span>
        ) : c.variance > 0 ? (
          <span className="text-good-ink font-bold">+{fmt(c.variance)}</span>
        ) : (
          <span className="text-critical font-bold">{fmt(c.variance)}</span>
        ),
    },
    {
      key: "kind",
      header: "Count Type",
      hideOnMobile: true,
      cell: (c) => (
        <Chip tone={c.kind === "baseline" ? "brand" : "neutral"}>
          {c.kind === "baseline" ? "Baseline" : "Reconciliation"}
        </Chip>
      ),
    },
    {
      key: "auditor",
      header: "Counted By",
      hideOnMobile: true,
      cell: (c) => c.counted_by ?? "—",
    },
  ]

  return (
    <div className="space-y-6 pb-16">
      {/* Top Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Stock Management & Ledger"
          description="Complete inventory, raw materials burn rates, daily production output, and physical reconciliations."
        />

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setReconcile(null)
                  setShowReconcile(true)
                }}
                className="gap-2 border-border-subtle hover:border-brand-primary"
              >
                <ClipboardCheck className="h-4 w-4 text-brand-primary" />
                New Count
              </Button>
              <Link href="/dashboard/stock/receipts">
                <Button size="sm" className="gap-2 bg-brand-primary text-white hover:bg-brand-secondary">
                  <Send className="h-4 w-4" />
                  Log Receipt
                </Button>
              </Link>
            </>
          )}

          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Navigation Strip to Sibling Stock Operations */}
      <div className="flex flex-wrap items-center gap-2 border-y border-border-subtle py-3">
        <span className="text-xs font-semibold text-ink-muted mr-1">Workflows:</span>
        <Link
          href="/dashboard/stock/monthly-report"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/40 bg-brand-primary/5 px-3 py-1.5 text-xs font-bold text-brand-primary hover:bg-brand-primary/10 transition-colors"
        >
          <Calendar className="h-3.5 w-3.5" /> Monthly Stock Report
        </Link>
        <Link
          href="/dashboard/stock/dispatch"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-brand-primary hover:text-ink-primary transition-colors"
        >
          <Truck className="h-3.5 w-3.5" /> Dispatch Outbound
        </Link>
        <Link
          href="/dashboard/stock/returns"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-brand-primary hover:text-ink-primary transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Returns (Repack/Spoilage)
        </Link>
        <Link
          href="/dashboard/stock/donations"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-brand-primary hover:text-ink-primary transition-colors"
        >
          <Gift className="h-3.5 w-3.5" /> Donations & Samples
        </Link>
        <Link
          href="/dashboard/stock/invoices"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-brand-primary hover:text-ink-primary transition-colors"
        >
          <FileText className="h-3.5 w-3.5" /> Supplier Invoices
        </Link>
      </div>

      {/* Date Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => {
            const active = p.from() === from && to === iso(new Date())
            return (
              <button
                key={p.label}
                onClick={() => {
                  setFrom(p.from())
                  setTo(iso(new Date()))
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  active
                    ? "bg-brand-solid text-brand-ink shadow-sm"
                    : "bg-surface-base text-ink-secondary hover:text-ink-primary hover:border-brand-primary"
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-border-subtle bg-surface-base px-2.5 font-semibold text-ink-primary focus:border-brand-primary focus:outline-none"
          />
          <span className="text-ink-muted">→</span>
          <input
            type="date"
            value={to}
            min={from}
            max={iso(new Date())}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-border-subtle bg-surface-base px-2.5 font-semibold text-ink-primary focus:border-brand-primary focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <Card>
          <EmptyState
            icon={<AlertCircle className="h-6 w-6 text-critical" />}
            title="Failed to load stock ledger"
            description="The request failed. Please check your network connection."
            action={
              <Button onClick={load} className="bg-brand-primary text-white">
                Retry Connection
              </Button>
            }
          />
        </Card>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-24 text-ink-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Bitters — Finished"
              value={data.finishedGoods.bitters}
              unit="ctn"
              icon={<PackageCheck className="h-5 w-5" />}
              accent="bitters"
            />
            <StatTile
              label="Ginger — Finished"
              value={data.finishedGoods.ginger}
              unit="ctn"
              icon={<PackageCheck className="h-5 w-5" />}
              accent="ginger"
            />
            <StatTile
              label="Restock Now"
              value={criticalCount}
              unit="critical"
              icon={<AlertCircle className="h-5 w-5" />}
              accent={criticalCount > 0 ? "critical" : "neutral"}
            />
            <StatTile
              label="Reorder Soon"
              value={lowCount}
              unit="items"
              icon={<AlertTriangle className="h-5 w-5" />}
              accent={lowCount > 0 ? "warning" : "neutral"}
            />
          </div>

          {/* Tab Navigation with Animated Indicator */}
          <div className="border-b border-border-subtle">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab("materials")}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${
                  activeTab === "materials"
                    ? "text-brand-primary"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <Boxes className="h-4 w-4" />
                Raw Materials & Inventory
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-ink-muted">
                  {sortedMaterials.length}
                </span>
                {activeTab === "materials" && (
                  <motion.div
                    layoutId="activeStockTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("production")}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${
                  activeTab === "production"
                    ? "text-brand-primary"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <Factory className="h-4 w-4" />
                Finished Goods & Production
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-ink-muted">
                  {fmt(data.produced.total)} ctn
                </span>
                {activeTab === "production" && (
                  <motion.div
                    layoutId="activeStockTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("dispatch")}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${
                  activeTab === "dispatch"
                    ? "text-brand-primary"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <Truck className="h-4 w-4" />
                Outbound Dispatches
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-ink-muted">
                  {fmt(dispatchedTotal)} ctn
                </span>
                {activeTab === "dispatch" && (
                  <motion.div
                    layoutId="activeStockTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("receipts")}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${
                  activeTab === "receipts"
                    ? "text-brand-primary"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <Send className="h-4 w-4" />
                Receipts & Issues
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-ink-muted">
                  {data.receipts.length}
                </span>
                {activeTab === "receipts" && (
                  <motion.div
                    layoutId="activeStockTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary"
                  />
                )}
              </button>

              <button
                onClick={() => setActiveTab("counts")}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-bold transition-colors ${
                  activeTab === "counts"
                    ? "text-brand-primary"
                    : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                <ClipboardCheck className="h-4 w-4" />
                Physical Counts & Audits
                <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-ink-muted">
                  {counts.length}
                </span>
                {activeTab === "counts" && (
                  <motion.div
                    layoutId="activeStockTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-primary"
                  />
                )}
              </button>
            </div>
          </div>

          {/* Tab Content Panels */}
          <AnimatePresence mode="wait">
            {activeTab === "materials" && (
              <motion.div
                key="materials"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <Card>
                  <div className="p-4 sm:p-5">
                    {/* Filter and Search Bar */}
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => setMaterialUrgency("all")}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                            materialUrgency === "all"
                              ? "bg-brand-solid text-brand-ink"
                              : "bg-surface-base text-ink-secondary hover:text-ink-primary"
                          }`}
                        >
                          All ({sortedMaterials.length})
                        </button>
                        <button
                          onClick={() => setMaterialUrgency("critical")}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                            materialUrgency === "critical"
                              ? "bg-critical text-white"
                              : "bg-surface-base text-ink-secondary hover:text-ink-primary"
                          }`}
                        >
                          Critical Restock ({criticalCount})
                        </button>
                        <button
                          onClick={() => setMaterialUrgency("warning")}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                            materialUrgency === "warning"
                              ? "bg-warning text-ink-primary"
                              : "bg-surface-base text-ink-secondary hover:text-ink-primary"
                          }`}
                        >
                          Reorder Soon ({lowCount})
                        </button>
                        <button
                          onClick={() => setMaterialUrgency("ok")}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                            materialUrgency === "ok"
                              ? "bg-good-subtle text-good-ink"
                              : "bg-surface-base text-ink-secondary hover:text-ink-primary"
                          }`}
                        >
                          Adequate ({sortedMaterials.filter((m) => m.level === "none").length})
                        </button>
                      </div>

                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-muted" />
                        <input
                          type="text"
                          placeholder="Search material..."
                          value={materialSearch}
                          onChange={(e) => setMaterialSearch(e.target.value)}
                          className="h-8.5 w-full rounded-xl border border-border-subtle bg-surface-base pl-8 pr-3 text-xs text-ink-primary placeholder:text-ink-muted focus:border-brand-primary focus:outline-none"
                        />
                      </div>
                    </div>

                    <DataTable
                      columns={materialColumns}
                      rows={filteredMaterials}
                      rowKey={(m) => m.key}
                      rowHref={(m) =>
                        m.key === "herb" || m.key.startsWith("herb")
                          ? "/dashboard/stock/herbs"
                          : `/dashboard/stock/material/${m.key}`
                      }
                      empty={
                        <EmptyState
                          compact
                          title="No materials found"
                          description="Try clearing your search query or filters."
                        />
                      }
                    />
                  </div>
                </Card>
              </motion.div>
            )}

            {activeTab === "production" && (
              <motion.div
                key="production"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatTile
                    label="Bitters Produced"
                    value={data.produced.bitters}
                    unit="ctn"
                    icon={<Factory className="h-5 w-5" />}
                    accent="bitters"
                  />
                  <StatTile
                    label="Ginger Produced"
                    value={data.produced.ginger}
                    unit="ctn"
                    icon={<Factory className="h-5 w-5" />}
                    accent="ginger"
                  />
                  <StatTile
                    label="Total Plant Production"
                    value={data.produced.total}
                    unit="ctn"
                    icon={<Factory className="h-5 w-5" />}
                    accent="brand"
                  />
                </div>

                <Card>
                  <CardHeader title="Daily Production Runs" hint={windowLabel} />
                  <DataTable
                    columns={producedColumns}
                    rows={producedRows}
                    rowKey={(d) => d.date}
                    empty={<EmptyState compact title="No production logged in this date range" />}
                  />
                </Card>
              </motion.div>
            )}

            {activeTab === "dispatch" && (
              <motion.div
                key="dispatch"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <StatTile
                    label="Bitters Dispatched"
                    value={dispatchedOf("Bitters")}
                    unit="ctn"
                    icon={<Truck className="h-5 w-5" />}
                    accent="bitters"
                  />
                  <StatTile
                    label="Ginger Dispatched"
                    value={dispatchedOf("Ginger")}
                    unit="ctn"
                    icon={<Truck className="h-5 w-5" />}
                    accent="ginger"
                  />
                  <StatTile
                    label="Total Dispatched"
                    value={dispatchedTotal}
                    unit="ctn"
                    icon={<Truck className="h-5 w-5" />}
                    accent="brand"
                  />
                </div>

                <DispatchBreakdownCards
                  byVehicle={dispatch?.byVehicle ?? []}
                  byDriver={dispatch?.byDriver ?? []}
                  byDestination={dispatch?.byDestination ?? []}
                />
              </motion.div>
            )}

            {activeTab === "receipts" && (
              <motion.div
                key="receipts"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <Card>
                  <CardHeader title="Raw Materials Inbound & Floor Issuance" hint={windowLabel} />
                  <DataTable
                    columns={receiptColumns}
                    rows={data.receipts}
                    rowKey={(r) => `${r.date}-${r.material_type}-${r.received_pcs}-${r.given_pcs}`}
                    empty={<EmptyState compact title="No receipts or issues recorded in this range" />}
                  />
                </Card>
              </motion.div>
            )}

            {activeTab === "counts" && (
              <motion.div
                key="counts"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <Card>
                  <CardHeader
                    title="Physical Stock Counts & Audit Reconciliations"
                    hint="Audited ledger baseline count entries"
                    actions={
                      canWrite ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setReconcile(null)
                            setShowReconcile(true)
                          }}
                          className="bg-brand-primary text-white"
                        >
                          <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                          Record New Count
                        </Button>
                      ) : undefined
                    }
                  />
                  <DataTable
                    columns={countColumns}
                    rows={counts}
                    rowKey={(c) => c.id}
                    empty={<EmptyState compact title="No physical stock counts recorded yet" />}
                  />
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Reconcile Modal for Physical Counts */}
      {showReconcile && (
        <ReconcileModal
          open={showReconcile}
          onClose={() => {
            setShowReconcile(false)
            setReconcile(null)
          }}
          target={reconcile}
          onDone={() => {
            load()
            loadCounts()
          }}
        />
      )}
    </div>
  )
}
