"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Factory,
  FileSpreadsheet,
  Loader2,
  Package,
  RefreshCw,
  Warehouse,
} from "lucide-react"
import { Card, CardHeader, EmptyState, Eyebrow, StatTile, StatusBadge } from "@/components/primitives"
import { ProductionTrend } from "./manager/charts"
import { DayDetailDrawer } from "./manager/day-detail-drawer"
import { fmt, fmt1 } from "./manager/viz"
import type { OverviewReport } from "@/lib/domain/analytics-contract"
import { burnLooksImplausible } from "@/lib/domain/stock-status"

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000)
  return d.toISOString().slice(0, 10)
}

export function ManagerDashboard() {
  const [report, setReport] = useState<OverviewReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++requestRef.current
    setLoading(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      const from = daysAgo(6)
      const res = await fetch(`/api/analytics/report?from=${from}&to=${today}`)
      const data = res.ok ? await res.json() : null
      if (seq === requestRef.current) {
        if (data && data.scope === "overview") {
          setReport(data as OverviewReport)
        } else {
          setReport(null)
        }
      }
    } catch {
      if (seq === requestRef.current) setReport(null)
    } finally {
      if (seq === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const criticalMaterials = report?.materials.filter((m) => m.level === "red") ?? []
  const attentionMaterials =
    report?.materials.filter((m) => m.level === "red" || m.level === "yellow" || burnLooksImplausible(m)) ?? []

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline"
      >
        <div>
          <Eyebrow>Lawson Limited Company</Eyebrow>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink-primary leading-tight mt-0.5">
            Operations Overview
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            Executive summary of 7-day plant throughput, warehouse balances, and inventory attention items.
          </p>
          {report && (
            <p className="text-xs font-medium text-ink-muted mt-1 tnum">
              Updated {new Date(report.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              <span className="mx-1.5 opacity-40">·</span>
              Last 7 days
              {criticalMaterials.length > 0 && (
                <span className="ml-1.5 text-critical-ink font-bold">
                  · {criticalMaterials.length} material{criticalMaterials.length > 1 ? "s" : ""} critical
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors disabled:opacity-60 active:scale-[0.97]"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            Refresh
          </button>
        </div>
      </motion.header>

      {/* Main Content */}
      <div className={loading && report ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {report && (
          <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
            {/* 4 Primary Summary Tiles */}
            <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile
                label="Produced (last 7 days)"
                value={report.totals.production_cartons}
                unit="ctn"
                sub={`${fmt1(report.totals.production_cartons / 7)}/day avg`}
                icon={<Package className="w-5 h-5" />}
                accent="brand"
              />
              <StatTile
                label="Critical materials"
                value={criticalMaterials.length}
                unit={criticalMaterials.length === 1 ? "item" : "items"}
                sub={criticalMaterials.length > 0 ? "urgent replenishment needed" : "all materials healthy"}
                icon={<AlertTriangle className="w-5 h-5" />}
                accent={criticalMaterials.length > 0 ? "critical" : "brand"}
              />
              <StatTile
                label="Bitters on hand"
                value={report.finishedGoods.bitters}
                unit="ctn"
                sub="warehouse stock balance"
                icon={<Warehouse className="w-5 h-5" />}
                accent="bitters"
              />
              <StatTile
                label="Ginger on hand"
                value={report.finishedGoods.ginger}
                unit="ctn"
                sub="warehouse stock balance"
                icon={<Warehouse className="w-5 h-5" />}
                accent="ginger"
              />
            </motion.div>

            {/* Quick Hub Navigation Cards */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Link
                href="/dashboard/production"
                className="group rounded-2xl border border-hairline bg-surface-card p-4 hover:border-brand transition-all duration-200 hover:shadow-sm flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded-xl bg-brand-subtle text-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Factory className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-brand group-hover:translate-x-1 transition-all" />
                </div>
                <div className="mt-3">
                  <h3 className="text-sm font-bold text-ink-primary group-hover:text-brand transition-colors">
                    Production Analysis
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Department tabs, shift breakdown, recipe BOM, and materials.
                  </p>
                </div>
              </Link>

              <Link
                href="/dashboard/stock"
                className="group rounded-2xl border border-hairline bg-surface-card p-4 hover:border-brand transition-all duration-200 hover:shadow-sm flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded-xl bg-brand-subtle text-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Boxes className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-brand group-hover:translate-x-1 transition-all" />
                </div>
                <div className="mt-3">
                  <h3 className="text-sm font-bold text-ink-primary group-hover:text-brand transition-colors">
                    Stock Office
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Warehouse inventory, material receipts, dispatches & counts.
                  </p>
                </div>
              </Link>

              <Link
                href="/dashboard/reports"
                className="group rounded-2xl border border-hairline bg-surface-card p-4 hover:border-brand transition-all duration-200 hover:shadow-sm flex flex-col justify-between"
              >
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded-xl bg-brand-subtle text-brand flex items-center justify-center group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-brand group-hover:translate-x-1 transition-all" />
                </div>
                <div className="mt-3">
                  <h3 className="text-sm font-bold text-ink-primary group-hover:text-brand transition-colors">
                    Reports & Audits
                  </h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Monthly reconciliation matrix, shift audit trail & raw export.
                  </p>
                </div>
              </Link>
            </motion.div>

            {/* Middle Grid: Small Trend & Needs Attention */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* 7-Day Production Trend */}
              <div className="lg:col-span-2">
                <ProductionTrend
                  data={report.byDay}
                  onSelectDay={setSelectedDay}
                  label="Daily Output (7 Days)"
                />
              </div>

              {/* Needs Attention List */}
              <div className="space-y-3">
                <Card className="h-full flex flex-col">
                  <CardHeader
                    title="Needs Attention"
                    hint={
                      attentionMaterials.length > 0
                        ? `${attentionMaterials.length} material${attentionMaterials.length > 1 ? "s" : ""} flagged`
                        : "Stock health"
                    }
                  />
                  <div className="p-4 pt-1 flex-1 flex flex-col justify-between">
                    {attentionMaterials.length === 0 ? (
                      <div className="py-8 flex flex-col items-center justify-center text-center">
                        <div className="w-10 h-10 rounded-full bg-brand-subtle text-brand flex items-center justify-center mb-2">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-ink-primary">All Materials Healthy</p>
                        <p className="text-[11px] text-ink-muted mt-1 max-w-[200px]">
                          Operating stock is above critical threshold and burn rates are within expected parameters.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {attentionMaterials.slice(0, 5).map((m) => (
                          <div
                            key={m.key}
                            className="p-2.5 rounded-xl border border-hairline bg-surface-sunken flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-ink-primary truncate">{m.label}</p>
                              <p className="text-[11px] text-ink-muted">
                                {fmt(m.remaining)} {m.unit} on hand ·{" "}
                                {m.operatingDaysLeft !== null ? `${fmt1(m.operatingDaysLeft)}d left` : "no usage"}
                              </p>
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5">
                              <StatusBadge level={m.level} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-3 mt-3 border-t border-hairline">
                      <Link
                        href="/dashboard/production"
                        className="text-xs font-bold text-brand hover:underline flex items-center justify-between"
                      >
                        <span>View complete material status</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </Card>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>

      {loading && !report && (
        <div className="flex items-center justify-center py-20 text-ink-muted">
          <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading overview</span>
        </div>
      )}

      {!loading && !report && (
        <Card>
          <EmptyState
            title="Couldn’t load the overview"
            description="The request failed. Check your connection and try again."
            action={
              <button
                onClick={load}
                className="h-10 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold active:scale-[0.97]"
              >
                Retry
              </button>
            }
          />
        </Card>
      )}

      <DayDetailDrawer
        date={selectedDay}
        shift=""
        department=""
        onClose={() => setSelectedDay(null)}
      />
    </div>
  )
}
