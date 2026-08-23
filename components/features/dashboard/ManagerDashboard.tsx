"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { RefreshCw, Package, Droplet, Boxes, Layers, Download, Loader2, Warehouse } from "lucide-react"
import { FilterBar, DEFAULT_FILTERS, type Filters } from "./manager/filter-bar"
import { StatTile } from "./manager/stat-tile"
import { ProductionTrend, ShiftBreakdown } from "./manager/charts"
import { MaterialsTable } from "./manager/materials-table"
import { DayDetailDrawer } from "./manager/day-detail-drawer"
import { fmt1 } from "./manager/viz"
import type { AnalyticsReport } from "./manager/types"

export function ManagerDashboard(_props: { userId?: string }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ from: filters.from, to: filters.to })
      if (filters.shift) p.set("shift", filters.shift)
      if (filters.department) p.set("department", filters.department)
      if (filters.product) p.set("product", filters.product)
      const res = await fetch(`/api/analytics/report?${p}`)
      setReport(res.ok ? await res.json() : null)
    } catch {
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const t = report?.totals
  const avgPerDay = report && report.windowDays > 0 ? report.totals.production_cartons / report.windowDays : 0
  const criticalCount = report?.materials.filter((m) => m.level === "red").length ?? 0

  return (
    <div className="dash w-full bg-[#f7f7f5] min-h-screen -m-4 sm:-m-6 md:-m-10 px-4 sm:px-6 md:px-10 py-8">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <Image src="/logo.png" alt="Lawson" width={48} height={48} className="rounded-xl bg-white p-1 ring-1 ring-slate-200 shrink-0" />
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Lawson Limited Company</p>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mt-0.5">Manager Dashboard</h1>
              {report && (
                <p className="text-[10px] font-semibold text-slate-400 mt-1 tabular-nums">
                  Updated {new Date(report.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  <span className="mx-1.5 opacity-30">·</span>{report.windowDays} days
                  {criticalCount > 0 && <span className="ml-1.5 text-red-600 font-bold">· {criticalCount} material{criticalCount > 1 ? "s" : ""} critical</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/api/records/export" className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-400 transition-colors">
              <Download className="w-3.5 h-3.5" /> Export
            </Link>
            <button onClick={load} disabled={loading} className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors disabled:opacity-60">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
            </button>
          </div>
        </header>

        <FilterBar filters={filters} onChange={setFilters} />

        {/* Finished goods on hand (live, all-time balance — independent of the filter) */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Bitters — On Hand" value={report?.finishedGoods.bitters ?? 0} unit="ctn" sub="finished goods, ready to load" icon={<Warehouse className="w-5 h-5" />} accent="emerald" />
          <StatTile label="Ginger — On Hand" value={report?.finishedGoods.ginger ?? 0} unit="ctn" sub="finished goods, ready to load" icon={<Warehouse className="w-5 h-5" />} accent="amber" />
        </div>

        {/* Stat tiles (respect the filter window) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Total Production" value={t?.production_cartons ?? 0} unit="ctn" sub={`${fmt1(avgPerDay)}/day avg`} icon={<Package className="w-5 h-5" />} />
          <StatTile label="Bitters Produced" value={t?.bitters_cartons ?? 0} unit="ctn" accent="emerald" />
          <StatTile label="Ginger Produced" value={t?.ginger_cartons ?? 0} unit="ctn" accent="amber" />
          <StatTile label="Cartons Loaded" value={t?.cartons_loaded ?? 0} unit="ctn" accent="slate" icon={<Boxes className="w-5 h-5" />} />
          <StatTile label="Alcohol Used" value={t?.alcohol_used ?? 0} unit="L" accent="emerald" icon={<Droplet className="w-5 h-5" />} />
          <StatTile label="Preforms Used" value={t?.preforms_used ?? 0} unit="bags" accent="slate" icon={<Layers className="w-5 h-5" />} />
          <StatTile label="Bottles (Bitters)" value={(t?.bitters_cartons ?? 0) * 12} accent="emerald" />
          <StatTile label="Bottles (Ginger)" value={(t?.ginger_cartons ?? 0) * 12} accent="amber" />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><ProductionTrend data={report?.byDay ?? []} onSelectDay={setSelectedDay} /></div>
          <ShiftBreakdown data={report?.byShift ?? []} />
        </div>

        {/* Materials */}
        {report && <MaterialsTable materials={report.materials} redDays={report.thresholds.redDays} amberDays={report.thresholds.amberDays} onReconciled={load} />}

        {loading && !report && (
          <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-7 h-7 animate-spin" /></div>
        )}
      </div>

      <DayDetailDrawer date={selectedDay} shift={filters.shift} department={filters.department} onClose={() => setSelectedDay(null)} />
    </div>
  )
}
