"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertTriangle, BarChart3, Layers,
  ChevronDown, Filter, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

// ── Brand tokens (Refined for softer, modern UI) ───────────────────────────
const BITTERS = { border: "border-slate-200", bg: "bg-slate-800", softBg: "bg-slate-100", text: "text-slate-900", icon: "text-slate-700", badge: "bg-slate-100 text-slate-800", spark: "#334155" }
const GINGER  = { border: "border-amber-200", bg: "bg-amber-500", softBg: "bg-amber-100", text: "text-amber-950", icon: "text-amber-700", badge: "bg-amber-100 text-amber-800", spark: "#f59e0b" }
const GENERAL = { border: "border-emerald-200", bg: "bg-emerald-500", softBg: "bg-emerald-50", text: "text-slate-900", icon: "text-emerald-600", badge: "bg-emerald-100 text-emerald-800", spark: "#10b981" }

type Product = "all" | "Bitters" | "Ginger"
type Period  = "all" | "month"

const DEPARTMENTS = ["All Departments", "Blowing", "Alcohol and Blending", "Filling Line", "Packaging", "Concentrate"]
const DEPT_TABLES: Record<string, { table: string; label: string }[]> = {
  "Blowing":              [{ table: "blowing_daily_records",            label: "Preform Usage" }],
  "Alcohol and Blending": [{ table: "alcohol_stock_level_records",      label: "Alcohol Stock" },
                           { table: "alcohol_blending_daily_records",   label: "Blending" },
                           { table: "ginger_production_records",        label: "Ginger Prod." },
                           { table: "extraction_monitoring_records",    label: "Extraction" },
                           { table: "caramel_stock_records",            label: "Caramel" }],
  "Filling Line":         [{ table: "filling_line_daily_records",       label: "Filling" },
                           { table: "caps_stock_records",               label: "Caps" },
                           { table: "labels_stock_records",             label: "Labels" }],
  "Packaging":            [{ table: "packaging_daily_records",          label: "Packaging" }],
  "Concentrate":          [{ table: "concentrate_alcohol_records",      label: "Concentrate Alc." },
                           { table: "herbs_stock_records",              label: "Herbs" }],
}

interface KPIData {
  total_production_cartons: number; bitters_cartons: number; ginger_cartons: number
  total_alcohol_used_litres: number; current_alcohol_balance: number
  current_preform_balance: number; total_preforms_used: number
  alcohol_used_for_bitters_drums: number; total_concentrate_used_litres: number
  total_spices_used_litres: number; total_caramel_used_gallons: number; total_water_litres: number
  alcohol_used_for_ginger_drums: number; ginger_water_used_litres: number
  ginger_gt_juice_litres: number; ginger_spices_used_litres: number; ginger_caramel_used_gallons: number
  live_bitters_stock: number; live_ginger_stock: number
  caps_remaining: number; labels_bitters_remaining: number; labels_ginger_remaining: number
  caramel_bitters_remaining: number; caramel_ginger_remaining: number
  total_caps_used: number; total_labels_bitters_used: number; total_labels_ginger_used: number
  total_bottles_bitters: number; total_bottles_ginger: number
  monthly_trend: { month: string; total: number; bitters: number; ginger: number }[]
  last_updated: string
}

interface DeptActivity { table: string; label: string; count: number; lastDate: string | null }

// ── Micro sparkline ────────────────────────────────────────────────────────
function Spark({ data, color, h = 32 }: { data: number[]; color: string; h?: number }) {
  if (data.length < 2) return null
  const w = 72, max = Math.max(...data, 1), min = Math.min(...data), range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ")
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible opacity-90">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => {
        const x = (i / (data.length - 1)) * w, y = h - ((v - min) / range) * (h - 4) - 2
        return <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 3 : 1.5} fill={color} opacity={i === data.length - 1 ? 1 : 0.2} />
      })}
    </svg>
  )
}

// ── KPI Card (Redesigned) ──────────────────────────────────────────────────
function KPICard({ label, value, unit, icon: Icon, token, spark, trend, wide = false }: {
  label: string; value: number; unit?: string; icon?: React.ElementType
  token: typeof GENERAL; spark?: number[]; trend?: "up" | "down" | "flat"; wide?: boolean
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-slate-400"
  return (
    <div className={`group bg-white rounded-2xl border ${token.border} p-5 hover:shadow-md hover:border-slate-300 transition-all duration-300 flex flex-col justify-between ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2 rounded-xl ${token.softBg}`}>
          {Icon && <Icon className={`w-4 h-4 ${token.icon}`} />}
        </div>
        {trend && (
          <div className={`flex items-center justify-center p-1 rounded-full bg-slate-50 ${trendColor}`}>
            <TrendIcon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className={`text-2xl font-bold tabular-nums tracking-tight ${token.text}`}>
            {value.toLocaleString()}
          </p>
          {unit && <p className="text-xs font-medium text-slate-400">{unit}</p>}
        </div>
      </div>

      {spark && spark.length > 1 && (
        <div className="mt-3 flex justify-end">
          <Spark data={spark} color={token.spark} />
        </div>
      )}
    </div>
  )
}

// ── Section wrapper (Redesigned) ───────────────────────────────────────────
function Sec({ title, badge, token, children }: {
  title: string; badge?: string | number; token?: typeof GENERAL; children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${token?.bg || "bg-emerald-500"} shadow-sm`} />
        <h3 className="text-sm font-bold text-slate-800 flex-1">{title}</h3>
        {badge != null && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${token?.badge || "bg-slate-100 text-slate-700"}`}>
            {typeof badge === "number" ? badge.toLocaleString() : badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Trend chart (Colors Refined) ───────────────────────────────────────────
function TrendChart({ data, product }: { data: KPIData["monthly_trend"]; product: Product }) {
  if (data.length < 2) return <p className="text-sm text-slate-400 text-center py-10">Not enough data to display trend</p>
  const W = 640, H = 180, PL = 44, PR = 12, PT = 20, PB = 28
  const cW = W - PL - PR, cH = H - PT - PB
  const bitS = data.map(d => d.bitters), ginS = data.map(d => d.ginger), allS = data.map(d => d.total)
  const act = product === "Bitters" ? bitS : product === "Ginger" ? ginS : [...bitS, ...ginS, ...allS]
  const max = Math.max(...act, 1)
  const xp = (i: number) => PL + (data.length > 1 ? i / (data.length - 1) : 0.5) * cW
  const yp = (v: number) => PT + cH - (v / max) * cH
  const path = (vals: number[], clr: string, width = 2) => {
    if (vals.every(v => v === 0)) return null
    const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${xp(i)},${yp(v)}`).join(" ")
    return <path key={clr} d={d} fill="none" stroke={clr} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  }
  const dots = (vals: number[], clr: string) => vals.map((v, i) => (
    <circle key={`${clr}${i}`} cx={xp(i)} cy={yp(v)} r={i === vals.length - 1 ? 4 : 2.5} fill={clr} stroke="#fff" strokeWidth={1} opacity={i === vals.length - 1 ? 1 : 0.6} />
  ))
  const ticks = 4
  return (
    <div className="w-full overflow-x-auto scrollbar-hide pt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 260 }}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const y = PT + (i / ticks) * cH, val = Math.round(max - (i / ticks) * max)
          return <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f1f5f9" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x={PL - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="500">{val > 999 ? `${(val / 1000).toFixed(0)}k` : val}</text>
          </g>
        })}
        {data.map((d, i) => <text key={i} x={xp(i)} y={H - 4} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="500">{d.month}</text>)}
        {product === "all" && path(allS, GENERAL.spark, 2.5)}
        {(product === "all" || product === "Bitters") && path(bitS, BITTERS.spark)}
        {(product === "all" || product === "Ginger")  && path(ginS, GINGER.spark)}
        {product === "all" && dots(allS, GENERAL.spark)}
        {(product === "all" || product === "Bitters") && dots(bitS, BITTERS.spark)}
        {(product === "all" || product === "Ginger")  && dots(ginS, GINGER.spark)}
        {product === "all" && (
          <g>
            {[["#10b981","Total"], ["#334155","Bitters"], ["#f59e0b","Ginger"]].map(([c, l], i) => (
              <g key={l}><rect x={PL + i * 65} y={0} width={8} height={8} rx={2} fill={c} /><text x={PL + i * 65 + 14} y={8} fontSize="10" fill="#64748b" fontWeight="500">{l}</text></g>
            ))}
          </g>
        )}
      </svg>
    </div>
  )
}

// ── Dept activity panel ────────────────────────────────────────────────────
function DeptPanel({ dept }: { dept: string }) {
  const [rows, setRows] = useState<DeptActivity[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (dept === "All Departments") { setRows([]); return }
    const tables = DEPT_TABLES[dept] || []
    setLoading(true)
    Promise.all(
      tables.map(async ({ table, label }) => {
        try {
          const res = await fetch(`/api/admin/dept-activity?table=${table}`)
          if (!res.ok) return { table, label, count: 0, lastDate: null }
          const d = await res.json()
          return { table, label, count: d.count || 0, lastDate: d.lastDate || null }
        } catch { return { table, label, count: 0, lastDate: null } }
      })
    ).then(r => { setRows(r); setLoading(false) })
  }, [dept])

  if (dept === "All Departments" || rows.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">{dept} Activity</p>
      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
          Syncing records...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {rows.map(r => (
            <div key={r.table} className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
              <div>
                <span className="block text-sm font-semibold text-slate-700">{r.label}</span>
                {r.lastDate && <span className="text-[11px] text-slate-400 mt-0.5 block">{new Date(r.lastDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
              </div>
              <span className="text-sm font-bold text-slate-600 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm">{r.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export function ManagerDashboard({ userId }: { userId: string }) {
  const [kpi, setKpi]         = useState<KPIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const now = new Date()
  const [period, setPeriod]   = useState<Period>("all")
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [product, setProduct] = useState<Product>("all")
  const [dept, setDept]       = useState("All Departments")

  const fetchKPIs = useCallback(async (p = period, y = selYear, m = selMonth) => {
    try {
      setRefreshing(true); setError(null)
      const params = new URLSearchParams()
      if (p === "month") { params.set("year", String(y)); params.set("month", String(m)) }
      const res = await fetch(`/api/analytics/kpis?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch KPIs")
      setKpi(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error occurred")
    } finally { setLoading(false); setRefreshing(false) }
  }, [period, selYear, selMonth])

  useEffect(() => {
    fetchKPIs()
    const iv = setInterval(() => fetchKPIs(), 5 * 60_000)
    return () => clearInterval(iv)
  }, [fetchKPIs])

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetch("/api/records/export")
      if (!res.ok) { alert("No records found or export failed."); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url
      a.download = `lawson_${now.toISOString().split("T")[0]}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch { alert("Export failed") } finally { setExporting(false) }
  }

  const d = kpi
  const showB = product === "all" || product === "Bitters"
  const showG = product === "all" || product === "Ginger"
  const tB = d?.monthly_trend.map(m => m.bitters) || []
  const tG = d?.monthly_trend.map(m => m.ginger) || []
  const tA = d?.monthly_trend.map(m => m.total) || []
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

  return (
    <div className="min-h-screen bg-slate-50/50 -m-4 sm:-m-6 md:-m-10 p-4 sm:p-6 md:p-8 animate-fade-in-up font-sans">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header & Filters ─────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shrink-0 shadow-inner">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Manager Dashboard</h1>
                <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
                  <span className="font-medium">Lawson Limited</span>
                  {d && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span>Updated {new Date(d.last_updated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button onClick={() => fetchKPIs()} disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 text-sm font-semibold transition-all disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-500" : ""}`} />
                <span className="hidden sm:inline">Refresh Data</span>
              </button>
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-all shadow-sm disabled:opacity-50">
                <Download className="w-4 h-4" />
                {exporting ? "Exporting…" : "Export XLSX"}
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-slate-50/50 px-5 sm:px-6 py-4 flex flex-wrap gap-4 items-center">
            
            {/* Time Period Filter */}
            <div className="flex items-center bg-slate-200/50 p-1 rounded-xl">
              {(["all", "month"] as Period[]).map(p => (
                <button key={p} onClick={() => { setPeriod(p); fetchKPIs(p) }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {p === "all" ? "All Time" : "Monthly"}
                </button>
              ))}
            </div>

            {/* Date Dropdowns */}
            {period === "month" && (
              <div className="flex gap-2">
                <div className="relative">
                  <select value={selMonth} onChange={e => { setSelMonth(+e.target.value); fetchKPIs("month", selYear, +e.target.value) }}
                    className="appearance-none pl-4 pr-8 py-2 text-sm font-medium rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer shadow-sm">
                    {MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={selYear} onChange={e => { setSelYear(+e.target.value); fetchKPIs("month", +e.target.value, selMonth) }}
                    className="appearance-none pl-4 pr-8 py-2 text-sm font-medium rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer shadow-sm">
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            <div className="w-px h-6 bg-slate-200 hidden sm:block" />

            {/* Product Filter */}
            <div className="flex items-center bg-slate-200/50 p-1 rounded-xl">
              {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
                <button key={p} onClick={() => setProduct(p)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    product === p
                      ? p === "Bitters" ? "bg-slate-800 text-white shadow-sm"
                        : p === "Ginger" ? "bg-amber-500 text-white shadow-sm"
                        : "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}>{p === "all" ? "All Products" : p}</button>
              ))}
            </div>

            <div className="w-px h-6 bg-slate-200 hidden sm:block" />

            {/* Dept Filter */}
            <div className="relative flex items-center">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="appearance-none pl-9 pr-9 py-2 text-sm font-medium rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer shadow-sm">
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-700 font-medium text-sm flex-1">{error}</p>
            <button onClick={() => fetchKPIs()} className="text-sm font-semibold text-red-700 hover:text-red-900 underline shrink-0">Try Again</button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 h-32 animate-pulse flex flex-col justify-between">
                <div className="w-8 h-8 bg-slate-100 rounded-xl" />
                <div>
                  <div className="h-3 w-16 bg-slate-100 rounded mb-2" />
                  <div className="h-7 w-24 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && d && (
          <div className="space-y-8">

            {/* Dept activity panel */}
            {dept !== "All Departments" && <DeptPanel dept={dept} />}

            {/* ── Live Inventory ──────────────────────────────────────── */}
            <Sec title="Live Inventory Scanner">
              <div className="bg-white rounded-3xl border border-slate-200 p-2 shadow-sm">
                <LiveStocksDisplay />
              </div>
            </Sec>

            {/* ── Production Output ────────────────────────────────────── */}
            <Sec title="Production Output" badge={`${d.total_production_cartons} Total`} token={GENERAL}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {product === "all" && (
                  <KPICard label="Total Output" value={d.total_production_cartons} unit="Cartons"
                    icon={TrendingUp} token={GENERAL} spark={tA} trend="up" />
                )}
                {showB && <KPICard label="Bitters Output" value={d.bitters_cartons} unit="Cartons" token={BITTERS} spark={tB} />}
                {showG && <KPICard label="Ginger Output"  value={d.ginger_cartons}  unit="Cartons" token={GINGER}  spark={tG} />}
              </div>

              {/* Trend Chart */}
              <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="w-4 h-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-600">
                    {period === "month" ? `Daily Trend — ${MONTHS[selMonth - 1]} ${selYear}` : "6-Month Production Trend"}
                  </h4>
                </div>
                <TrendChart data={d.monthly_trend} product={product} />
              </div>
            </Sec>

            {/* ── Available Stock ──────────────────────────────────────── */}
            <Sec title="Available Stock" token={GENERAL}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Alcohol Balance"    value={d.current_alcohol_balance}  unit="Litres"       icon={Droplet}  token={GENERAL} />
                <KPICard label="Preforms Balance"   value={d.current_preform_balance}  unit="Bags"         icon={Package}  token={GENERAL} />
                <KPICard label="Caps Remaining"     value={d.caps_remaining}           unit="Units"        icon={Box}      token={GENERAL} />
                {showB && <KPICard label="Live Stock (Bitters)" value={d.live_bitters_stock}        unit="Cartons"         icon={Package}  token={BITTERS} />}
                {showG && <KPICard label="Live Stock (Ginger)"  value={d.live_ginger_stock}         unit="Cartons"         icon={Package}  token={GINGER}  />}
                {showB && <KPICard label="Labels (Bitters)"     value={d.labels_bitters_remaining}  unit="Units"           icon={Tag}      token={BITTERS} />}
                {showG && <KPICard label="Labels (Ginger)"      value={d.labels_ginger_remaining}   unit="Units"           icon={Tag}      token={GINGER}  />}
                {showB && <KPICard label="Caramel (Bitters)"    value={d.caramel_bitters_remaining} unit="Gallons"         icon={FlaskConical} token={BITTERS} />}
                {showG && <KPICard label="Caramel (Ginger)"     value={d.caramel_ginger_remaining}  unit="Gallons"         icon={FlaskConical} token={GINGER}  />}
              </div>
            </Sec>

            {/* ── Quantity Used ────────────────────────────────────────── */}
            <Sec title="Material Consumption" token={GENERAL}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Alcohol Used"       value={d.total_alcohol_used_litres} unit="Litres"  icon={Droplet} token={GENERAL} />
                <KPICard label="Preforms Used"      value={d.total_preforms_used}       unit="Bags"    icon={Package} token={GENERAL} />
                <KPICard label="Caps Used"          value={d.total_caps_used}           unit="Units"   icon={Box}     token={GENERAL} />
                {showB && <KPICard label="Labels Used (Bitters)"  value={d.total_labels_bitters_used} unit="Units"  icon={Tag}     token={BITTERS} />}
                {showG && <KPICard label="Labels Used (Ginger)"   value={d.total_labels_ginger_used}  unit="Units"  icon={Tag}     token={GINGER}  />}
                {showB && <KPICard label="Bottles (Bitters)" value={d.total_bottles_bitters} unit={`${d.bitters_cartons.toLocaleString()} ctns ×12`} icon={Package} token={BITTERS} />}
                {showG && <KPICard label="Bottles (Ginger)"  value={d.total_bottles_ginger}  unit={`${d.ginger_cartons.toLocaleString()} ctns ×12`}  icon={Package} token={GINGER}  />}
              </div>
            </Sec>

            {/* ── Bitters Inputs ───────────────────────────────────────── */}
            {showB && (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-800 shadow-sm" />
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">Bitters Production Inputs</h3>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">{d.bitters_cartons.toLocaleString()} ctns produced</span>
                </div>
                <div className="p-5 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <KPICard label="Alcohol Used"  value={d.alcohol_used_for_bitters_drums}  unit="Drums"   icon={Droplet}     token={BITTERS} />
                  <KPICard label="Concentrate"   value={d.total_concentrate_used_litres}   unit="Litres"                     token={BITTERS} />
                  <KPICard label="Spices"        value={d.total_spices_used_litres}        unit="Litres"                     token={BITTERS} />
                  <KPICard label="Caramel"       value={d.total_caramel_used_gallons}      unit="Gallons"                    token={BITTERS} />
                  <KPICard label="Water"         value={d.total_water_litres}              unit="Litres"                     token={BITTERS} />
                  <KPICard label="Labels"        value={d.total_labels_bitters_used}       unit="Units"   icon={Tag}         token={BITTERS} />
                  <KPICard label="Caps"          value={d.total_caps_used}                 unit="Units"   icon={Box}         token={BITTERS} />
                  <KPICard label="Bottles"       value={d.total_bottles_bitters}           unit="Units"   icon={Package}     token={BITTERS} />
                </div>
              </div>
            )}

            {/* ── Ginger Inputs ────────────────────────────────────────── */}
            {showG && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50/30 overflow-hidden mt-6">
                <div className="px-6 py-5 border-b border-amber-200/60 flex items-center justify-between bg-white/50 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm" />
                    <h3 className="text-base font-bold text-amber-950 tracking-tight">Ginger Production Inputs</h3>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">{d.ginger_cartons.toLocaleString()} ctns produced</span>
                </div>
                <div className="p-5 sm:p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <KPICard label="Alcohol Used"  value={d.alcohol_used_for_ginger_drums} unit="Drums"   icon={Droplet}  token={GINGER} />
                  <KPICard label="Water"         value={d.ginger_water_used_litres}      unit="Litres"                  token={GINGER} />
                  <KPICard label="G/T Juice"     value={d.ginger_gt_juice_litres}        unit="Litres"                  token={GINGER} />
                  <KPICard label="Spices"        value={d.ginger_spices_used_litres}     unit="Litres"                  token={GINGER} />
                  <KPICard label="Caramel"       value={d.ginger_caramel_used_gallons}   unit="Gallons"                 token={GINGER} />
                  <KPICard label="Labels"        value={d.total_labels_ginger_used}      unit="Units"   icon={Tag}      token={GINGER} />
                  <KPICard label="Bottles"       value={d.total_bottles_ginger}          unit="Units"   icon={Package}  token={GINGER} />
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
