"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertTriangle, BarChart3, Layers,
  ChevronDown, Filter, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

// ── Brand tokens ───────────────────────────────────────────────────────────
const BITTERS = { border: "border-zinc-900", bg: "bg-zinc-900",  text: "text-zinc-900",    light: "bg-zinc-50",     badge: "bg-zinc-900 text-white",        spark: "#18181b" }
const GINGER  = { border: "border-amber-400", bg: "bg-amber-400", text: "text-amber-600",  light: "bg-amber-50",    badge: "bg-amber-400 text-zinc-900",    spark: "#d97706" }
const GENERAL = { border: "border-emerald-200", bg: "bg-emerald-600", text: "text-emerald-700", light: "bg-emerald-50", badge: "bg-emerald-600 text-white", spark: "#059669" }

type Product = "all" | "Bitters" | "Ginger"
type Period  = "all" | "month"

const DEPARTMENTS = ["All Departments", "Blowing", "Alcohol and Blending", "Filling Line", "Packaging", "Concentrate"]
const DEPT_TABLES: Record<string, { table: string; label: string }[]> = {
  "Blowing":              [{ table: "blowing_daily_records",           label: "Preform Usage" }],
  "Alcohol and Blending": [{ table: "alcohol_stock_level_records",     label: "Alcohol Stock" },
                           { table: "alcohol_blending_daily_records",  label: "Blending" },
                           { table: "ginger_production_records",       label: "Ginger Prod." },
                           { table: "extraction_monitoring_records",   label: "Extraction" },
                           { table: "caramel_stock_records",           label: "Caramel" }],
  "Filling Line":         [{ table: "filling_line_daily_records",      label: "Filling" },
                           { table: "caps_stock_records",              label: "Caps" },
                           { table: "labels_stock_records",            label: "Labels" }],
  "Packaging":            [{ table: "packaging_daily_records",         label: "Packaging" }],
  "Concentrate":          [{ table: "concentrate_alcohol_records",     label: "Concentrate Alc." },
                           { table: "herbs_stock_records",             label: "Herbs" }],
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
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => {
        const x = (i / (data.length - 1)) * w, y = h - ((v - min) / range) * (h - 4) - 2
        return <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 3 : 1.5} fill={color} opacity={i === data.length - 1 ? 1 : 0.3} />
      })}
    </svg>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KPICard({ label, value, unit, icon: Icon, token, spark, trend, wide = false }: {
  label: string; value: number; unit?: string; icon?: React.ElementType
  token: typeof GENERAL; spark?: number[]; trend?: "up" | "down" | "flat"; wide?: boolean
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-400" : "text-slate-300"
  return (
    <div className={`group relative bg-white rounded-2xl border ${token.border} p-4 hover:shadow-lg transition-all duration-300 overflow-hidden ${wide ? "col-span-2 sm:col-span-1" : ""}`}>
      {/* Accent strip */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${token.bg}`} />
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 leading-tight pr-1">{label}</p>
        <div className="flex items-center gap-1 shrink-0">
          {trend && <TrendIcon className={`w-3 h-3 ${trendColor}`} />}
          {Icon && <Icon className={`w-3.5 h-3.5 ${token.text} opacity-40`} />}
        </div>
      </div>
      <p className={`text-2xl font-black tabular-nums tracking-tight ${token.text}`}>
        {value.toLocaleString()}
      </p>
      {unit && <p className="text-[9px] font-semibold text-slate-300 uppercase tracking-wider mt-0.5">{unit}</p>}
      {spark && spark.length > 1 && (
        <div className="mt-2 flex justify-end">
          <Spark data={spark} color={token.spark} />
        </div>
      )}
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────
function Sec({ title, badge, token, children }: {
  title: string; badge?: string | number; token?: typeof GENERAL; children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={`w-1 h-5 rounded-full ${token?.bg || "bg-emerald-600"}`} />
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-600 flex-1">{title}</h3>
        {badge != null && (
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${token?.badge || "bg-emerald-100 text-emerald-800"}`}>
            {typeof badge === "number" ? badge.toLocaleString() : badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Trend chart ────────────────────────────────────────────────────────────
function TrendChart({ data, product }: { data: KPIData["monthly_trend"]; product: Product }) {
  if (data.length < 2) return <p className="text-xs text-slate-300 text-center py-10">Not enough data</p>
  const W = 640, H = 180, PL = 44, PR = 12, PT = 20, PB = 28
  const cW = W - PL - PR, cH = H - PT - PB
  const bitS = data.map(d => d.bitters), ginS = data.map(d => d.ginger), allS = data.map(d => d.total)
  const act = product === "Bitters" ? bitS : product === "Ginger" ? ginS : [...bitS, ...ginS, ...allS]
  const max = Math.max(...act, 1)
  const xp = (i: number) => PL + (data.length > 1 ? i / (data.length - 1) : 0.5) * cW
  const yp = (v: number) => PT + cH - (v / max) * cH
  const path = (vals: number[], clr: string, width = 1.8) => {
    if (vals.every(v => v === 0)) return null
    const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${xp(i)},${yp(v)}`).join(" ")
    return <path key={clr} d={d} fill="none" stroke={clr} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  }
  const dots = (vals: number[], clr: string) => vals.map((v, i) => (
    <circle key={`${clr}${i}`} cx={xp(i)} cy={yp(v)} r={i === vals.length - 1 ? 4 : 2} fill={clr} opacity={i === vals.length - 1 ? 1 : 0.4} />
  ))
  const ticks = 4
  return (
    <div className="w-full overflow-x-auto scrollbar-hide">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 260 }}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const y = PT + (i / ticks) * cH, val = Math.round(max - (i / ticks) * max)
          return <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PL - 5} y={y + 4} textAnchor="end" fontSize="8" fill="#cbd5e1">{val > 999 ? `${(val / 1000).toFixed(0)}k` : val}</text>
          </g>
        })}
        {data.map((d, i) => <text key={i} x={xp(i)} y={H - 4} textAnchor="middle" fontSize="8" fill="#94a3b8">{d.month}</text>)}
        {product === "all" && path(allS, "#059669", 2)}
        {(product === "all" || product === "Bitters") && path(bitS, "#18181b")}
        {(product === "all" || product === "Ginger")  && path(ginS, "#d97706")}
        {product === "all" && dots(allS, "#059669")}
        {(product === "all" || product === "Bitters") && dots(bitS, "#18181b")}
        {(product === "all" || product === "Ginger")  && dots(ginS, "#d97706")}
        {product === "all" && (
          <g>
            {[["#059669","Total"], ["#18181b","Bitters"], ["#d97706","Ginger"]].map(([c, l], i) => (
              <g key={l}><rect x={PL + i * 58} y={4} width={7} height={7} rx={2} fill={c} /><text x={PL + i * 58 + 10} y={11} fontSize="8" fill="#94a3b8">{l}</text></g>
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
    <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 mb-3">{dept} — Activity</p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <div className="w-3 h-3 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.table} className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">{r.label}</span>
              <div className="flex items-center gap-3">
                {r.lastDate && <span className="text-slate-300 text-[10px]">{new Date(r.lastDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
                <span className="font-bold text-slate-600 tabular-nums">{r.count.toLocaleString()} records</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
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
      if (!res.ok) throw new Error(data.error || "Failed")
      setKpi(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally { setLoading(false); setRefreshing(false) }
  }, [period, selYear, selMonth])

  useEffect(() => {
    fetchKPIs()
    const iv = setInterval(() => fetchKPIs(), 5 * 60_000)
    return () => clearInterval(iv)
  }, [])

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
    <div className="min-h-screen bg-slate-50/60 -m-4 sm:-m-6 md:-m-10 p-4 sm:p-6 md:p-8 animate-fade-in-up">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="p-5 sm:p-6 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">Manager Dashboard</h1>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Lawson Limited Company</p>
                </div>
              </div>
              {d && <p className="text-[10px] text-slate-300 mt-2 ml-11">Updated {new Date(d.last_updated).toLocaleString()}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => fetchKPIs()} disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-40">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold transition-all disabled:opacity-60 shadow-sm shadow-emerald-600/20">
                <Download className="w-3.5 h-3.5" />
                {exporting ? "Exporting…" : "Export .xlsx"}
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="px-5 sm:px-6 py-4 flex flex-wrap gap-3 items-center">
            {/* Period */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              {(["all", "month"] as Period[]).map(p => (
                <button key={p} onClick={() => { setPeriod(p); fetchKPIs(p) }}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${period === p ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                  {p === "all" ? "All Time" : "Monthly"}
                </button>
              ))}
            </div>

            {/* Month selectors */}
            {period === "month" && (
              <div className="flex gap-2">
                <div className="relative">
                  <select value={selMonth} onChange={e => { setSelMonth(+e.target.value); fetchKPIs("month", selYear, +e.target.value) }}
                    className="appearance-none pl-3 pr-7 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-emerald-400 cursor-pointer">
                    {MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={selYear} onChange={e => { setSelYear(+e.target.value); fetchKPIs("month", +e.target.value, selMonth) }}
                    className="appearance-none pl-3 pr-7 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-emerald-400 cursor-pointer">
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            <div className="w-px h-5 bg-slate-200 hidden sm:block" />

            {/* Product filter */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
                <button key={p} onClick={() => setProduct(p)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    product === p
                      ? p === "Bitters" ? "bg-zinc-900 text-white shadow-sm"
                        : p === "Ginger" ? "bg-amber-400 text-zinc-900 shadow-sm"
                        : "bg-white text-slate-800 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}>{p === "all" ? "All" : p}</button>
              ))}
            </div>

            <div className="w-px h-5 bg-slate-200 hidden sm:block" />

            {/* Dept filter */}
            <div className="relative flex items-center gap-1">
              <Filter className="w-3 h-3 text-slate-400 absolute left-3 pointer-events-none" />
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="appearance-none pl-7 pr-7 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-emerald-400 cursor-pointer">
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-red-700 font-semibold text-sm flex-1">{error}</p>
            <button onClick={() => fetchKPIs()} className="text-xs font-bold text-red-600 hover:text-red-800 underline shrink-0">Retry</button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 h-24 animate-pulse">
                <div className="h-2 w-16 bg-slate-100 rounded mb-3" />
                <div className="h-6 w-20 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && d && (
          <div className="space-y-6">

            {/* Dept activity panel */}
            {dept !== "All Departments" && <DeptPanel dept={dept} />}

            {/* ── Live Inventory ──────────────────────────────────────── */}
            <Sec title="Live Inventory">
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <LiveStocksDisplay />
              </div>
            </Sec>

            {/* ── Production Output ────────────────────────────────────── */}
            <Sec title="Production Output" badge={d.total_production_cartons} token={GENERAL}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {product === "all" && (
                  <KPICard label="Total Production" value={d.total_production_cartons} unit="Cartons"
                    icon={TrendingUp} token={GENERAL} spark={tA} />
                )}
                {showB && <KPICard label="Bitters" value={d.bitters_cartons} unit="Cartons" token={BITTERS} spark={tB} />}
                {showG && <KPICard label="Ginger"  value={d.ginger_cartons}  unit="Cartons" token={GINGER}  spark={tG} />}
              </div>

              {/* Trend */}
              <div className="mt-4 bg-slate-50 rounded-2xl border border-slate-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                    {period === "month" ? `Daily Trend — ${MONTHS[selMonth - 1]} ${selYear}` : "6-Month Trend"}
                  </p>
                </div>
                <TrendChart data={d.monthly_trend} product={product} />
              </div>
            </Sec>

            {/* ── Available Stock ──────────────────────────────────────── */}
            <Sec title="Available Stock" token={GENERAL}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <KPICard label="Alcohol Balance"    value={d.current_alcohol_balance}  unit="Remaining"       icon={Droplet}  token={GENERAL} />
                <KPICard label="Preforms Balance"   value={d.current_preform_balance}  unit="Bags remaining"  icon={Package}  token={GENERAL} />
                <KPICard label="Caps Remaining"     value={d.caps_remaining}           unit="Units"           icon={Box}      token={GENERAL} />
                {showB && <KPICard label="Bitters Live Stock"    value={d.live_bitters_stock}       unit="Cartons"         icon={Package}  token={BITTERS} />}
                {showG && <KPICard label="Ginger Live Stock"     value={d.live_ginger_stock}        unit="Cartons"         icon={Package}  token={GINGER}  />}
                {showB && <KPICard label="Labels — Bitters"      value={d.labels_bitters_remaining} unit="Units remaining" icon={Tag}      token={BITTERS} />}
                {showG && <KPICard label="Labels — Ginger"       value={d.labels_ginger_remaining}  unit="Units remaining" icon={Tag}      token={GINGER}  />}
                {showB && <KPICard label="Caramel — Bitters"     value={d.caramel_bitters_remaining} unit="Remaining"     icon={FlaskConical} token={BITTERS} />}
                {showG && <KPICard label="Caramel — Ginger"      value={d.caramel_ginger_remaining}  unit="Remaining"     icon={FlaskConical} token={GINGER}  />}
              </div>
            </Sec>

            {/* ── Quantity Used ────────────────────────────────────────── */}
            <Sec title="Quantity Used" token={GENERAL}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <KPICard label="Alcohol Used"       value={d.total_alcohol_used_litres} unit="Litres"  icon={Droplet} token={GENERAL} />
                <KPICard label="Preforms Used"      value={d.total_preforms_used}       unit="Bags"    icon={Package} token={GENERAL} />
                <KPICard label="Caps Used"          value={d.total_caps_used}           unit="Units"   icon={Box}     token={GENERAL} />
                {showB && <KPICard label="Labels Used — Bitters"  value={d.total_labels_bitters_used} unit="Units"  icon={Tag}     token={BITTERS} />}
                {showG && <KPICard label="Labels Used — Ginger"   value={d.total_labels_ginger_used}  unit="Units"  icon={Tag}     token={GINGER}  />}
                {showB && <KPICard label="Bottles — Bitters" value={d.total_bottles_bitters} unit={`${d.bitters_cartons.toLocaleString()} ctns ×12`} icon={Package} token={BITTERS} />}
                {showG && <KPICard label="Bottles — Ginger"  value={d.total_bottles_ginger}  unit={`${d.ginger_cartons.toLocaleString()} ctns ×12`}  icon={Package} token={GINGER}  />}
              </div>
            </Sec>

            {/* ── Bitters Inputs ───────────────────────────────────────── */}
            {showB && (
              <div className="rounded-3xl border-2 border-zinc-900 overflow-hidden">
                <div className="bg-zinc-900 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Bitters — Production Inputs</h3>
                  </div>
                  <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-white text-zinc-900">{d.bitters_cartons.toLocaleString()} ctns</span>
                </div>
                <div className="bg-white p-4 sm:p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
              </div>
            )}

            {/* ── Ginger Inputs ────────────────────────────────────────── */}
            {showG && (
              <div className="rounded-3xl border-2 border-amber-400 overflow-hidden">
                <div className="bg-amber-400 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-amber-900 animate-pulse" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-900">Ginger — Production Inputs</h3>
                  </div>
                  <span className="text-[10px] font-black px-3 py-1.5 rounded-full bg-amber-900 text-amber-400">{d.ginger_cartons.toLocaleString()} ctns</span>
                </div>
                <div className="bg-amber-50/20 p-4 sm:p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <KPICard label="Alcohol Used"  value={d.alcohol_used_for_ginger_drums} unit="Drums"   icon={Droplet}  token={GINGER} />
                    <KPICard label="Water"         value={d.ginger_water_used_litres}      unit="Litres"                  token={GINGER} />
                    <KPICard label="G/T Juice"     value={d.ginger_gt_juice_litres}        unit="Litres"                  token={GINGER} />
                    <KPICard label="Spices"        value={d.ginger_spices_used_litres}     unit="Litres"                  token={GINGER} />
                    <KPICard label="Caramel"       value={d.ginger_caramel_used_gallons}   unit="Gallons"                 token={GINGER} />
                    <KPICard label="Labels"        value={d.total_labels_ginger_used}      unit="Units"   icon={Tag}      token={GINGER} />
                    <KPICard label="Bottles"       value={d.total_bottles_ginger}          unit="Units"   icon={Package}  token={GINGER} />
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
