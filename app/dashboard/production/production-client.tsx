"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
  RefreshCw,
  Package,
  Droplet,
  Boxes,
  Layers,
  Download,
  Loader2,
  Warehouse,
  Factory,
} from "lucide-react"
import { FilterBar, DEFAULT_FILTERS, type Filters } from "@/components/features/dashboard/manager/filter-bar"
import { ProductionTrend, ShiftBreakdown } from "@/components/features/dashboard/manager/charts"
import { MaterialsTable } from "@/components/features/dashboard/manager/materials-table"
import { DayDetailDrawer } from "@/components/features/dashboard/manager/day-detail-drawer"
import { BomPanel } from "@/components/features/dashboard/manager/bom-panel"
import { fmt1 } from "@/components/features/dashboard/manager/viz"
import { isDepartmentReport, type AnalyticsResponse } from "@/lib/domain/analytics-contract"
import type { MaterialStatus } from "@/lib/domain/stock-status"
import { isAllTime, requestFrom, ALL_TIME_LABEL } from "@/lib/domain/date-window"
import { Card, Eyebrow, EmptyState, StatTile } from "@/components/primitives"

/** A value that may be uncomputable (rate with no production) — never NaN. */
const kpiValue = (v: number | null) => (v === null ? "—" : v)

/**
 * "250 litres each" under the drum count, from the material row rather than from a
 * constant here: how much a drum holds is an admin setting.
 */
const alcoholEach = (materials: MaterialStatus[]): string | undefined => {
  const each = materials.find((m) => m.key === "alcohol")?.unitEach
  return each ? `${each.qty.toLocaleString()} ${each.unit} each` : undefined
}

export function ProductionClient() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [report, setReport] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  // Guards against a slow response for an old filter landing after a newer one.
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const seq = ++requestRef.current
    setLoading(true)
    try {
      const p = new URLSearchParams({ from: requestFrom(filters.from), to: filters.to })
      if (filters.shift) p.set("shift", filters.shift)
      if (filters.department) p.set("department", filters.department)
      if (filters.product) p.set("product", filters.product)
      const res = await fetch(`/api/analytics/report?${p}`)
      const data = res.ok ? await res.json() : null
      if (seq === requestRef.current) setReport(data)
    } catch {
      if (seq === requestRef.current) setReport(null)
    } finally {
      if (seq === requestRef.current) setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const criticalCount = report?.materials.filter((m) => m.level === "red").length ?? 0
  const dept = report && isDepartmentReport(report) ? report : null
  const overview = report && !isDepartmentReport(report) ? report : null

  return (
    <div className="space-y-5">
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
            {dept ? dept.department : "Production Analysis"}
          </h1>
          {dept && <p className="text-sm text-ink-secondary mt-1">{dept.summary}</p>}
          {report && (
            <p className="text-xs font-medium text-ink-muted mt-1 tnum">
              Updated {new Date(report.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              <span className="mx-1.5 opacity-40">·</span>
              {isAllTime(filters.from) ? (
                ALL_TIME_LABEL
              ) : (
                <>
                  {report.windowDays} days
                  <span className="mx-1.5 opacity-40">·</span>
                  {report.operatingDaysInWindow} operating
                </>
              )}
              {criticalCount > 0 && (
                <span className="ml-1.5 text-critical-ink font-bold">
                  · {criticalCount} material{criticalCount > 1 ? "s" : ""} critical
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/api/records/export"
            className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Export
          </Link>
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

      <FilterBar filters={filters} onChange={setFilters} />

      {/* Main Content Area with Transitions */}
      <div className={loading && report ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <AnimatePresence mode="wait">
          {/* ── OVERVIEW ───────────────────────────────────────────────────── */}
          {overview && (
            <motion.div
              key="overview-section"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              {/* Finished goods: a cumulative warehouse balance */}
              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  label="Bitters — on hand"
                  value={overview.finishedGoods.bitters}
                  unit="ctn"
                  sub="all-time balance, not the filtered window"
                  icon={<Warehouse className="w-5 h-5" />}
                  accent="bitters"
                />
                <StatTile
                  label="Ginger — on hand"
                  value={overview.finishedGoods.ginger}
                  unit="ctn"
                  sub="all-time balance, not the filtered window"
                  icon={<Warehouse className="w-5 h-5" />}
                  accent="ginger"
                />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatTile
                  label="Total production"
                  value={overview.totals.production_cartons}
                  unit="ctn"
                  sub={`${fmt1(overview.windowDays > 0 ? overview.totals.production_cartons / overview.windowDays : 0)}/day avg`}
                  icon={<Package className="w-5 h-5" />}
                  accent="brand"
                />
                <StatTile label="Bitters produced" value={overview.totals.bitters_cartons} unit="ctn" accent="bitters" />
                <StatTile label="Ginger produced" value={overview.totals.ginger_cartons} unit="ctn" accent="ginger" />
                <StatTile
                  label="Cartons loaded"
                  value={overview.totals.cartons_loaded}
                  unit="ctn"
                  icon={<Boxes className="w-5 h-5" />}
                />
                <StatTile
                  label="Alcohol used"
                  value={overview.totals.alcohol_used}
                  unit="drums"
                  sub={alcoholEach(overview.materials)}
                  icon={<Droplet className="w-5 h-5" />}
                />
                <StatTile
                  label="Preforms used"
                  value={overview.totals.preforms_used}
                  unit="bags"
                  icon={<Layers className="w-5 h-5" />}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <ProductionTrend data={overview.byDay} onSelectDay={setSelectedDay} label="Cartons produced" />
                </div>
                <ShiftBreakdown data={overview.byShift} />
              </div>

              <BomPanel
                bitters={overview.totals.bitters_cartons}
                ginger={overview.totals.ginger_cartons}
                bom={overview.bom}
              />
            </motion.div>
          )}

          {/* ── DEPARTMENT ─────────────────────────────────────────────────── */}
          {dept && (
            <motion.div
              key={`dept-section-${dept.department}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-5"
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {dept.kpis.map((k) => (
                  <StatTile
                    key={k.key}
                    label={k.label}
                    value={kpiValue(k.value)}
                    unit={k.value === null ? undefined : k.unit}
                    sub={k.hint}
                    accent={k.goodDirection === "down" ? "warning" : "brand"}
                  />
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <ProductionTrend
                    data={dept.byDay}
                    onSelectDay={setSelectedDay}
                    label={dept.trend.label}
                    unit={dept.trend.unit}
                    productSplit={dept.productSplit}
                  />
                </div>
                <ShiftBreakdown data={dept.byShift} productSplit={dept.productSplit} label={dept.trend.label} />
              </div>

              {dept.materials.length === 0 && (
                <Card>
                  <EmptyState
                    compact
                    icon={<Factory className="w-5 h-5" />}
                    title="No tracked materials"
                    description="This department does not hold a stock ledger of its own."
                  />
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {report && report.materials.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mt-5"
          >
            <MaterialsTable
              materials={report.materials}
              redDays={report.thresholds.redDays}
              amberDays={report.thresholds.amberDays}
              onReconciled={load}
            />
          </motion.div>
        )}
      </div>

      {loading && !report && (
        <div className="flex items-center justify-center py-20 text-ink-muted">
          <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
          <span className="sr-only">Loading report</span>
        </div>
      )}

      {!loading && !report && (
        <Card>
          <EmptyState
            title="Couldn’t load the report"
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
        shift={filters.shift}
        department={filters.department}
        onClose={() => setSelectedDay(null)}
      />
    </div>
  )
}
