"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  Warehouse,
  Factory,
  Calendar,
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  Layers,
  FileText,
  Loader2,
  RefreshCw,
  Boxes,
} from "lucide-react"
import { PackagingPivotTable } from "@/components/features/dashboard/manager/packaging-pivot-table"
import { BlowingPivotTable } from "@/components/features/dashboard/manager/blowing-pivot-table"
import { FillingPivotTable } from "@/components/features/dashboard/manager/filling-pivot-table"
import { BlendingPivotTable } from "@/components/features/dashboard/manager/blending-pivot-table"
import { Card, Eyebrow, StatTile, Chip, EmptyState } from "@/components/primitives"
import { fmt1 } from "@/components/features/dashboard/manager/viz"
import type { MaterialStatus } from "@/lib/domain/stock-status"
import { cn } from "@/lib/utils"

interface OverviewData {
  finishedGoods: { bitters: number; ginger: number }
  totals: {
    production_cartons: number
    bitters_cartons: number
    ginger_cartons: number
    cartons_loaded: number
  }
  materials: MaterialStatus[]
  last_updated: string
}

export function StockAnalysisClient() {
  const [activeTab, setActiveTab] = useState<"packaging" | "blowing" | "filling" | "blending" | "stock">("packaging")
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadStockData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/analytics/report")
      if (res.ok) {
        const data = await res.json()
        setOverview(data)
      }
    } catch {
      // Tolerated fallback
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStockData()
  }, [])

  const criticalMaterials = overview?.materials.filter((m) => m.level === "red") ?? []
  const warningMaterials = overview?.materials.filter((m) => m.level === "yellow") ?? []

  return (
    <div className="space-y-5">
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-hairline"
      >
        <div>
          <Eyebrow>Lawson Stock Office</Eyebrow>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink-primary leading-tight mt-0.5">
            Stock & Production Analysis
          </h1>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
            Operational analysis of packaging carton production, finished goods warehouse balances, and raw material stock.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/stock/monthly-report"
            className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors whitespace-nowrap active:scale-95"
          >
            <FileText className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
            <span>Monthly Stock Report</span>
          </Link>
          <Link
            href="/dashboard/stock"
            className="h-9 px-3 flex items-center gap-1.5 rounded-xl bg-brand text-brand-ink text-xs font-bold hover:bg-brand-hover transition-colors whitespace-nowrap active:scale-95"
          >
            <Warehouse className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Stock Ledger</span>
          </Link>
        </div>
      </motion.header>

      {/* ── TAB NAVIGATION ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-hairline pb-2 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab("packaging")}
          className={cn(
            "h-10 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all select-none active:scale-95",
            activeTab === "packaging"
              ? "bg-brand text-brand-ink shadow-sm"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-sunken"
          )}
        >
          <Factory className="w-4 h-4" aria-hidden="true" />
          <span>Packaging</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("blowing")}
          className={cn(
            "h-10 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all select-none active:scale-95",
            activeTab === "blowing"
              ? "bg-brand text-brand-ink shadow-sm"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-sunken"
          )}
        >
          <Layers className="w-4 h-4" aria-hidden="true" />
          <span>Blowing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("filling")}
          className={cn(
            "h-10 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all select-none active:scale-95",
            activeTab === "filling"
              ? "bg-brand text-brand-ink shadow-sm"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-sunken"
          )}
        >
          <Boxes className="w-4 h-4" aria-hidden="true" />
          <span>Filling Line</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("blending")}
          className={cn(
            "h-10 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all select-none active:scale-95",
            activeTab === "blending"
              ? "bg-brand text-brand-ink shadow-sm"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-sunken"
          )}
        >
          <Factory className="w-4 h-4" aria-hidden="true" />
          <span>Alcohol & Blending</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("stock")}
          className={cn(
            "h-10 px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all select-none active:scale-95",
            activeTab === "stock"
              ? "bg-brand text-brand-ink shadow-sm"
              : "text-ink-secondary hover:text-ink-primary hover:bg-surface-sunken"
          )}
        >
          <Warehouse className="w-4 h-4" aria-hidden="true" />
          <span>Stock & Material Coverage</span>
          {criticalMaterials.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-critical text-white">
              {criticalMaterials.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB CONTENT ───────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === "packaging" ? (
          <motion.div
            key="packaging-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <PackagingPivotTable />
          </motion.div>
        ) : activeTab === "blowing" ? (
          <motion.div
            key="blowing-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <BlowingPivotTable />
          </motion.div>
        ) : activeTab === "filling" ? (
          <motion.div
            key="filling-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <FillingPivotTable />
          </motion.div>
        ) : activeTab === "blending" ? (
          <motion.div
            key="blending-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <BlendingPivotTable />
          </motion.div>
        ) : (
          <motion.div
            key="stock-tab"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {/* Quick KPI Overview */}
            {overview && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile
                  label="Bitters — on hand"
                  value={overview.finishedGoods.bitters}
                  unit="ctn"
                  sub="warehouse stock balance"
                  icon={<Warehouse className="w-5 h-5" />}
                  accent="bitters"
                />
                <StatTile
                  label="Ginger — on hand"
                  value={overview.finishedGoods.ginger}
                  unit="ctn"
                  sub="warehouse stock balance"
                  icon={<Warehouse className="w-5 h-5" />}
                  accent="ginger"
                />
                <StatTile
                  label="Critical Items"
                  value={criticalMaterials.length}
                  unit="materials"
                  sub={criticalMaterials.length > 0 ? "Under critical threshold" : "All materials healthy"}
                  icon={<AlertTriangle className="w-5 h-5" />}
                  accent={criticalMaterials.length > 0 ? "critical" : "good"}
                />
                <StatTile
                  label="Cartons Loaded Out"
                  value={overview.totals.cartons_loaded}
                  unit="ctn"
                  sub="cumulative distribution"
                  icon={<Boxes className="w-5 h-5" />}
                  accent="brand"
                />
              </div>
            )}

            {/* Critical Materials Section */}
            {criticalMaterials.length > 0 && (
              <Card className="p-4 sm:p-5 border-l-4 border-l-critical space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-critical-ink" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-critical-ink">Urgent Reorder Required</h3>
                  </div>
                  <Chip tone="critical" className="text-[11px]">
                    {criticalMaterials.length} Critical
                  </Chip>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {criticalMaterials.map((m) => (
                    <Link
                      key={m.key}
                      href={`/dashboard/stock/material/${m.key}`}
                      className="p-3 rounded-xl border border-critical/30 bg-critical-subtle/10 hover:border-critical transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <span className="block text-xs font-bold text-ink-primary group-hover:text-critical transition-colors">
                          {m.label}
                        </span>
                        <span className="block text-[11px] text-critical-ink font-semibold mt-0.5">
                          {m.remaining.toLocaleString()} {m.unit} on hand · {m.operatingDaysLeft !== null ? `${fmt1(m.operatingDaysLeft)} days left` : "No burn"}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-critical-ink group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Materials Status Table */}
            {overview && (
              <Card className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-hairline pb-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-ink-primary">Stock Coverage & Burn Rates</h3>
                    <p className="text-xs text-ink-secondary">Live days of cover and average daily consumption.</p>
                  </div>
                  <Link
                    href="/dashboard/stock"
                    className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
                  >
                    <span>Full Ledger</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse min-w-[500px]">
                    <thead>
                      <tr className="border-b border-hairline bg-surface-sunken text-ink-muted text-xs font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-3">Material</th>
                        <th className="py-2.5 px-3 text-right">Current Balance</th>
                        <th className="py-2.5 px-3 text-right">Daily Burn</th>
                        <th className="py-2.5 px-3 text-right">Days of Cover</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {overview.materials.map((m) => {
                        const statusColor =
                          m.level === "red"
                            ? "bg-critical-subtle text-critical-ink border-critical/30"
                            : m.level === "yellow"
                            ? "bg-warning-subtle text-warning-ink border-warning/30"
                            : "bg-good-subtle text-good-ink border-good/30"
                        const statusLabel =
                          m.level === "red"
                            ? "Critical"
                            : m.level === "yellow"
                            ? "Low"
                            : "Healthy"

                        return (
                          <tr key={m.key} className="hover:bg-surface-sunken/40 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-ink-primary text-xs">
                              <Link
                                href={`/dashboard/stock/material/${m.key}`}
                                className="hover:text-brand transition-colors hover:underline"
                              >
                                {m.label}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-right tnum font-bold text-xs">
                              {m.remaining.toLocaleString()} {m.unit}
                            </td>
                            <td className="py-2.5 px-3 text-right tnum text-xs text-ink-secondary">
                              {m.avgPerDay !== null ? `${fmt1(m.avgPerDay)} ${m.unit}/day` : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right tnum font-bold text-xs">
                              {m.operatingDaysLeft !== null ? `${fmt1(m.operatingDaysLeft)} days` : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", statusColor)}>
                                {statusLabel}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {loading && !overview && (
              <div className="flex items-center justify-center py-20 text-ink-muted">
                <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
                <span className="sr-only">Loading stock data</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
