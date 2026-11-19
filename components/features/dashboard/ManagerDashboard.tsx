"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Package,
  RefreshCw,
  Table2,
  Warehouse,
} from "lucide-react"
import { Card, CardHeader, EmptyState, Eyebrow, StatTile, StatusBadge } from "@/components/primitives"
import { GroupBreakdown, ProductionTrend } from "./manager/charts"
import { DayDetailDrawer } from "./manager/day-detail-drawer"
import { fmt, fmt1 } from "./manager/viz"
import type { OverviewReport } from "@/lib/domain/analytics-contract"
import { burnLooksImplausible } from "@/lib/domain/stock-status"

// ============================================================================
// Manager landing — office style, beside the ERP sidebar.
//
// Navigation lives in the sidebar now (lib/domain/roles → manager), so this page
// is the overview only: plain cards on the shared tokens, the same as the Stock
// Office. What the business reads is unchanged from every previous version:
//
//   • the same request (/api/analytics/report, last 7 days) with the same
//     request-sequence guard, the previous render held at reduced opacity while
//     refetching, and the same loading / failed states;
//   • the same four figures (produced, critical count, Bitters and Ginger on
//     hand) from the same fields, and the same /day average;
//   • the same "Needs attention" rule — red, yellow, or an implausible burn —
//     and the same top-five cut, with StatusBadge carrying the level;
//   • the same ProductionTrend → DayDetailDrawer drill-down.
//
// GroupBreakdown shows more of the SAME report (byGroup / byShift), through the
// component the manager already uses on /dashboard/production.
// ============================================================================

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const PRINTABLE = [
  { href: "/dashboard/reports/matrix", Icon: Table2, title: "Department matrices", body: "Monthly production by day, group and shift." },
  { href: "/dashboard/stock/monthly-report", Icon: FileText, title: "Monthly stock report", body: "End-of-month stock reconciliation." },
  { href: "/dashboard/stock/procurement-report", Icon: ClipboardList, title: "Procurement report", body: "Stock analysis and priority actions." },
] as const

export function ManagerDashboard({ userName = null }: { userName?: string | null }) {
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
  const criticalCount = criticalMaterials.length

  const containerVariants = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }
  const itemVariants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-hairline">
        <div className="min-w-0">
          <Eyebrow>Lawson Limited Company</Eyebrow>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink-primary leading-tight mt-0.5">Operations Overview</h1>
          <p className="text-sm text-ink-secondary mt-1">
            {userName ? `Welcome back, ${userName}. ` : ""}Plant throughput, warehouse balances and inventory attention
            items for the last 7 days.
          </p>
          {report && (
            <p className="text-xs font-medium text-ink-muted mt-1 tnum flex items-center flex-wrap gap-x-1.5">
              <span>
                Updated {new Date(report.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="opacity-40" aria-hidden="true">·</span>
              <span>Last 7 days</span>
              <span className="opacity-40" aria-hidden="true">·</span>
              {criticalCount > 0 ? (
                <span className="text-critical-ink font-bold inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-critical" aria-hidden="true" />
                  {criticalCount} material{criticalCount > 1 ? "s" : ""} critical
                </span>
              ) : (
                <span className="text-good-ink font-semibold inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-good" aria-hidden="true" />
                  All materials healthy
                </span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="h-11 px-4 flex items-center gap-2 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold hover:bg-brand-solid-hover transition-colors disabled:opacity-60 active:scale-[0.97]"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
          Refresh
        </button>
      </header>

      {/* Hold the previous render at reduced opacity while refetching. */}
      <div className={loading && report ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {report && (
          <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
            {/* Key figures */}
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
                value={criticalCount}
                unit={criticalCount === 1 ? "item" : "items"}
                sub={criticalCount > 0 ? "urgent replenishment needed" : "all materials healthy"}
                icon={<AlertTriangle className="w-5 h-5" />}
                accent={criticalCount > 0 ? "critical" : "brand"}
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

            {/* Trend + attention */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <ProductionTrend data={report.byDay} onSelectDay={setSelectedDay} label="Daily Output (7 Days)" />
              </div>

              <Card className="flex flex-col">
                <CardHeader
                  title="Needs attention"
                  hint={
                    attentionMaterials.length > 0
                      ? `${attentionMaterials.length} material${attentionMaterials.length > 1 ? "s" : ""} flagged`
                      : "Stock health"
                  }
                />
                <div className="p-4 pt-3 flex-1 flex flex-col justify-between gap-3">
                  {attentionMaterials.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center text-center">
                      <div className="w-10 h-10 rounded-full bg-brand-subtle text-brand flex items-center justify-center mb-2">
                        <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-bold text-ink-primary">All materials healthy</p>
                      <p className="text-xs text-ink-muted mt-1 max-w-[220px]">
                        Operating stock is above the critical threshold and burn rates are within expected parameters.
                      </p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-hairline">
                      {attentionMaterials.slice(0, 5).map((m) => (
                        <li key={m.key} className="py-2.5 first:pt-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink-primary break-words">{m.label}</p>
                            <p className="text-xs text-ink-muted tnum">
                              {fmt(m.remaining)} {m.unit} on hand ·{" "}
                              {m.operatingDaysLeft !== null ? `${fmt1(m.operatingDaysLeft)}d left` : "no usage"}
                            </p>
                          </div>
                          <StatusBadge level={m.level} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href="/dashboard/production"
                    className="min-h-11 pt-3 border-t border-hairline text-sm font-bold text-brand hover:underline flex items-center justify-between"
                  >
                    <span>View complete material status</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
              </Card>
            </motion.div>

            {/* Output by group + printable reports */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <GroupBreakdown data={report.byGroup} shiftData={report.byShift} label="Cartons produced" />
              </div>
              <Card>
                <CardHeader title="Printable reports" />
                <ul className="divide-y divide-hairline">
                  {PRINTABLE.map(({ href, Icon, title, body }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="group flex items-center gap-3 px-4 py-3 min-h-11 hover:bg-surface-sunken transition-colors"
                      >
                        <span className="w-9 h-9 rounded-lg bg-surface-sunken text-ink-secondary flex items-center justify-center shrink-0 group-hover:bg-brand-subtle group-hover:text-brand-subtle-ink transition-colors">
                          <Icon className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <span className="flex-1">
                          <span className="block text-sm font-bold text-ink-primary">{title}</span>
                          <span className="block text-xs text-ink-muted">{body}</span>
                        </span>
                        <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-brand transition-colors" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
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
              <button onClick={load} className="h-11 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold active:scale-[0.97]">
                Retry
              </button>
            }
          />
        </Card>
      )}

      <DayDetailDrawer date={selectedDay} shift="" department="" onClose={() => setSelectedDay(null)} />
    </div>
  )
}
