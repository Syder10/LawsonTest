"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertTriangle, BarChart3, Layers,
  Filter, ArrowUpRight, ArrowDownRight, Minus, Calendar
} from "lucide-react"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

// ── Premium Brand Tokens (Gradients, Glass & Reflections) ──────────────────
const BITTERS = { border: "border-slate-200/60", bg: "bg-gradient-to-br from-slate-800 to-slate-900", softBg: "bg-slate-100/80 backdrop-blur", text: "text-slate-900", icon: "text-slate-700", badge: "bg-slate-100 text-slate-800 border border-slate-200/50", spark: "#334155" }
const GINGER  = { border: "border-amber-200/60", bg: "bg-gradient-to-br from-amber-400 to-amber-500", softBg: "bg-amber-100/80 backdrop-blur", text: "text-amber-950", icon: "text-amber-700", badge: "bg-amber-100 text-amber-800 border border-amber-200/50", spark: "#f59e0b" }
const GENERAL = { border: "border-emerald-200/60", bg: "bg-gradient-to-br from-emerald-400 to-emerald-600", softBg: "bg-emerald-50/80 backdrop-blur", text: "text-slate-900", icon: "text-emerald-600", badge: "bg-emerald-100 text-emerald-800 border border-emerald-200/50", spark: "#10b981" }

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

const MONTH_MAP: Record<string, number> = {
  "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
  "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
}

// ── KPI Card (Reflective / Premium) ────────────────────────────────────────
function KPICard({ label, value, unit, icon: Icon, token, spark, trend }: {
  label: string; value: number; unit?: string; icon?: React.ElementType
  token: typeof GENERAL; spark?: number[]; trend?: "up" | "down" | "flat"
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-slate-400"
  return (
    <div className={`group relative bg-white/70 backdrop-blur-xl rounded-2xl border ${token.border} p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between overflow-hidden`}>
      {/* Subtle reflection overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/60 to-transparent opacity-50 pointer-events-none" />
      
      <div className="relative z-10 flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl ${token.softBg} shadow-inner ring-1 ring-black/5`}>
          {Icon && <Icon className={`w-4 h-4 ${token.icon}`} />}
        </div>
        {trend && (
          <div className={`flex items-center justify-center p-1.5 rounded-full bg-white shadow-sm ring-1 ring-slate-100 ${trendColor}`}>
            <TrendIcon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      
      <div className="relative z-10">
        <p className="text-sm font-semibold text-slate-500 mb-1">{label}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className={`text-2xl font-black tabular-nums tracking-tight ${token.text} drop-shadow-sm`}>
            {value.toLocaleString()}
          </p>
          {unit && <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{unit}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Section Wrapper ────────────────────────────────────────────────────────
function Sec({ title, badge, token, children }: {
  title: string; badge?: string | number; token?: typeof GENERAL; children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-6 rounded-full ${token?.bg || GENERAL.bg} shadow-inner`} />
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex-1">{title}</h3>
        {badge != null && (
          <span className={`text-xs font-bold px-3 py-1 rounded-full shadow-sm ${token?.badge || GENERAL.badge}`}>
            {typeof badge === "number" ? badge.toLocaleString() : badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Interactive Trend Chart ────────────────────────────────────────────────
function TrendChart({ data, product, onDrilldown }: { data: KPIData["monthly_trend"]; product: Product; onDrilldown: (month: string) => void }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  if (data.length < 2) return <p className="text-sm text-slate-400 text-center py-10">Not enough data to display trend</p>
  
  const W = 700, H = 220, PL = 50, PR = 20, PT = 30, PB = 30
  const cW = W - PL - PR, cH = H - PT - PB
  const bitS = data.map(d => d.bitters), ginS = data.map(d => d.ginger), allS = data.map(d => d.total)
  const act = product === "Bitters" ? bitS : product === "Ginger" ? ginS : [...bitS, ...ginS, ...allS]
  const max = Math.max(...act, 1) * 1.1 // Add 10% padding to top

  const xp = (i: number) => PL + (data.length > 1 ? i / (data.length - 1) : 0.5) * cW
  const yp = (v: number) => PT + cH - (v / max) * cH

  const path = (vals: number[], clr: string) => {
    if (vals.every(v => v === 0)) return null
    const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${xp(i)},${yp(v)}`).join(" ")
    return <path d={d} fill="none" stroke={clr} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-md" />
  }

  return (
    <div className="w-full overflow-x-auto scrollbar-hide pt-2 pb-4 relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 400 }}>
        {/* Grid lines */}
        {Array.from({ length: 5 }, (_, i) => {
          const y = PT + (i / 4) * cH, val = Math.round(max - (i / 4) * max)
          return <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f1f5f9" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x={PL - 10} y={y + 3} textAnchor="end" fontSize="11" fill="#94a3b8" fontWeight="600">{val > 999 ? `${(val / 1000).toFixed(1)}k` : val}</text>
          </g>
        })}
        
        {/* X Axis Labels */}
        {data.map((d, i) => (
          <text key={i} x={xp(i)} y={H - 5} textAnchor="middle" fontSize="11" fill={hoverIdx === i ? "#0f172a" : "#64748b"} fontWeight="600" className="transition-colors cursor-pointer" onClick={() => onDrilldown(d.month)}>
            {d.month}
          </text>
        ))}

        {/* Lines */}
        {product === "all" && path(allS, GENERAL.spark)}
        {(product === "all" || product === "Bitters") && path(bitS, BITTERS.spark)}
        {(product === "all" || product === "Ginger")  && path(ginS, GINGER.spark)}

        {/* Interactive Points & Hit Areas */}
        {data.map((d, i) => (
          <g key={i} 
             onMouseEnter={() => setHoverIdx(i)} 
             onMouseLeave={() => setHoverIdx(null)}
             onClick={() => onDrilldown(d.month)}
             className="cursor-pointer">
            {/* Invisible larger hit area for easier clicking/hovering */}
            <circle cx={xp(i)} cy={cH/2 + PT} r={30} fill="transparent" />
            
            {/* Visible points */}
            {product === "all" && <circle cx={xp(i)} cy={yp(allS[i])} r={hoverIdx === i ? 6 : 4} fill={GENERAL.spark} stroke="#fff" strokeWidth={2} className="transition-all shadow-lg" />}
            {(product === "all" || product === "Bitters") && <circle cx={xp(i)} cy={yp(bitS[i])} r={hoverIdx === i ? 6 : 4} fill={BITTERS.spark} stroke="#fff" strokeWidth={2} className="transition-all shadow-lg" />}
            {(product === "all" || product === "Ginger")  && <circle cx={xp(i)} cy={yp(ginS[i])} r={hoverIdx === i ? 6 : 4} fill={GINGER.spark} stroke="#fff" strokeWidth={2} className="transition-all shadow-lg" />}
          </g>
        ))}
      </svg>

      {/* Floating Tooltip HTML Overlay */}
      {hoverIdx !== null && (
        <div className="absolute top-2 pointer-events-none transition-all duration-200 z-20 bg-white/90 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl p-3"
             style={{ left: `calc(${(hoverIdx / (data.length > 1 ? data.length - 1 : 1)) * 100}% - 60px)`, minWidth: '120px' }}>
          <p className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-1 mb-2">
            {data[hoverIdx].month} Output
          </p>
          <div className="space-y-1.5">
            {(product === "all" || product === "Bitters") && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-bold">Bitters</span>
                <span className="font-black text-slate-900">{data[hoverIdx].bitters.toLocaleString()}</span>
              </div>
            )}
            {(product === "all" || product === "Ginger") && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-amber-600 font-bold">Ginger</span>
                <span className="font-black text-amber-950">{data[hoverIdx].ginger.toLocaleString()}</span>
              </div>
            )}
            {product === "all" && (
              <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100 mt-1">
                <span className="text-emerald-600 font-bold">Total</span>
                <span className="font-black text-emerald-900">{data[hoverIdx].total.toLocaleString()}</span>
              </div>
            )}
          </div>
          <p className="text-[9px] text-slate-400 mt-2 text-center font-bold">CLICK TO DRILL DOWN</p>
        </div>
      )}
    </div>
  )
}

// ── Dept Activity Panel ────────────────────────────────────────────────────
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
    <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-slate-200/60 p-5 shadow-sm">
      <p className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4">{dept} Activity Hub</p>
      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-400 font-bold">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Syncing Department Data...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {rows.map(r => (
            <div key={r.table} className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-default">
              <div>
                <span className="block text-sm font-bold text-slate-700">{r.label}</span>
                {r.lastDate && <span className="text-[11px] font-semibold text-slate-400 mt-1 block">{new Date(r.lastDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
              </div>
              <span className="text-sm font-black text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">{r.count.toLocaleString()}</span>
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
  
  // Format YYYY-MM for the native month picker
  const [monthPicker, setMonthPicker] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  
  const [product, setProduct] = useState<Product>("all")
  const [dept, setDept]       = useState("All Departments")

  const fetchKPIs = useCallback(async (p = period, currentMonthPicker = monthPicker) => {
    try {
      setRefreshing(true); setError(null)
      const params = new URLSearchParams()
      if (p === "month") { 
        const [y, m] = currentMonthPicker.split('-')
        params.set("year", y)
        params.set("month", parseInt(m, 10).toString()) 
      }
      const res = await fetch(`/api/analytics/kpis?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch KPIs")
      setKpi(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error occurred")
    } finally { setLoading(false); setRefreshing(false) }
  }, [period, monthPicker])

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

  const handleDrilldown = (monthStr: string) => {
    // Extract month name (e.g. "Jan") and map to number. 
    // Assume current year if the chart doesn't provide year, or year from picker.
    const cleanMonth = monthStr.split(' ')[0] 
    const monthNum = MONTH_MAP[cleanMonth]
    if (monthNum) {
      const [y] = monthPicker.split('-')
      const newPickerValue = `${y}-${String(monthNum).padStart(2, '0')}`
      setPeriod("month")
      setMonthPicker(newPickerValue)
      fetchKPIs("month", newPickerValue)
      // Scroll to top to see new data
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleMonthPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val) {
      setMonthPicker(val)
      fetchKPIs("month", val)
    }
  }

  const d = kpi
  const showB = product === "all" || product === "Bitters"
  const showG = product === "all" || product === "Ginger"

  return (
    <div className="min-h-screen bg-slate-50/50 -m-4 sm:-m-6 md:-m-10 p-4 sm:p-6 md:p-8 animate-fade-in-up font-sans selection:bg-emerald-200">
      
      {/* Decorative Background Blob */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-emerald-400/20 blur-[120px] rounded-full pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto space-y-8">

        {/* ── Header & Glass Filters ───────────────────────────────────── */}
        <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-slate-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="p-5 sm:p-7 border-b border-slate-100/50 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shrink-0 shadow-inner ring-1 ring-white/20">
                <BarChart3 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Manager Dashboard</h1>
                <div className="flex items-center gap-2 mt-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">
                  <span className="text-emerald-600">Lawson Limited</span>
                  {d && (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      <span>Updated {new Date(d.last_updated).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button onClick={() => fetchKPIs()} disabled={refreshing}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-200 bg-white/50 hover:bg-white text-slate-700 font-bold text-sm transition-all shadow-sm hover:shadow disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-500" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button onClick={handleExport} disabled={exporting}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-sm transition-all shadow-[0_4px_14px_0_rgb(16,185,129,0.39)] disabled:opacity-50 border border-emerald-400/50">
                <Download className="w-4 h-4" />
                {exporting ? "Exporting…" : "Export XLSX"}
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-slate-50/40 px-5 sm:px-7 py-4 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
            
            <div className="flex flex-wrap items-center gap-4">
              {/* Period Toggles */}
              <div className="flex items-center bg-slate-200/50 p-1.5 rounded-xl border border-slate-200/50 shadow-inner">
                {(["all", "month"] as Period[]).map(p => (
                  <button key={p} onClick={() => { setPeriod(p); fetchKPIs(p) }}
                    className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${period === p ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
                    {p === "all" ? "All Time" : "Monthly"}
                  </button>
                ))}
              </div>

              {/* Native Date Range Picker (Month based) */}
              {period === "month" && (
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Calendar className="w-4 h-4 text-emerald-600 group-hover:text-emerald-500 transition-colors" />
                  </div>
                  <input 
                    type="month" 
                    value={monthPicker}
                    onChange={handleMonthPickerChange}
                    className="pl-10 pr-4 py-2 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-800 hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer shadow-sm transition-all"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {/* Product Filter */}
              <div className="flex items-center bg-slate-200/50 p-1.5 rounded-xl border border-slate-200/50 shadow-inner">
                {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
                  <button key={p} onClick={() => setProduct(p)}
                    className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                      product === p
                        ? p === "Bitters" ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-700"
                          : p === "Ginger" ? "bg-amber-500 text-white shadow-sm ring-1 ring-amber-400"
                          : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-500 hover:text-slate-700"
                    }`}>{p === "all" ? "All" : p}</button>
                ))}
              </div>

              <div className="w-px h-8 bg-slate-200 hidden lg:block" />

              {/* Dept Filter */}
              <div className="relative flex items-center flex-1 lg:flex-none">
                <select value={dept} onChange={e => setDept(e.target.value)}
                  className="w-full appearance-none pl-4 pr-10 py-2.5 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer shadow-sm transition-all">
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl p-5 flex items-center gap-4 shadow-sm">
            <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
            <p className="text-red-800 font-bold text-sm flex-1">{error}</p>
            <button onClick={() => fetchKPIs()} className="px-4 py-2 bg-white rounded-lg text-sm font-black text-red-600 hover:bg-red-50 shadow-sm border border-red-100 transition-colors shrink-0">Try Again</button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white/50 rounded-2xl border border-slate-100 p-6 h-36 animate-pulse flex flex-col justify-between">
                <div className="w-10 h-10 bg-slate-200 rounded-xl" />
                <div>
                  <div className="h-3 w-20 bg-slate-200 rounded mb-3" />
                  <div className="h-8 w-28 bg-slate-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && d && (
          <div className="space-y-10">

            {/* Dept activity panel */}
            {dept !== "All Departments" && <DeptPanel dept={dept} />}

            {/* ── Live Inventory ──────────────────────────────────────── */}
            <Sec title="Live Inventory Scanner">
              <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-slate-200/60 p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <LiveStocksDisplay />
              </div>
            </Sec>

            {/* ── Production Output ────────────────────────────────────── */}
            <Sec title="Production Output" badge={`${d.total_production_cartons} Cartons`} token={GENERAL}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {product === "all" && (
                  <KPICard label="Total Output" value={d.total_production_cartons} unit="Cartons"
                    icon={TrendingUp} token={GENERAL} trend="up" />
                )}
                {showB && <KPICard label="Bitters Output" value={d.bitters_cartons} unit="Cartons" token={BITTERS} />}
                {showG && <KPICard label="Ginger Output"  value={d.ginger_cartons}  unit="Cartons" token={GINGER} />}
              </div>

              {/* Trend Chart Area */}
              <div className="mt-4 bg-white/70 backdrop-blur-xl rounded-3xl border border-slate-200/60 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg shadow-inner ring-1 ring-slate-200/50">
                      <Layers className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                        {period === "month" ? "Daily Production Trend" : "6-Month Production Trend"}
                      </h4>
                      <p className="text-xs font-semibold text-slate-400 mt-0.5">Click a point to drill down into that month</p>
                    </div>
                  </div>
                </div>
                <TrendChart data={d.monthly_trend} product={product} onDrilldown={handleDrilldown} />
              </div>
            </Sec>

            {/* ── Available Stock ──────────────────────────────────────── */}
            <Sec title="Available Stock Overview" token={GENERAL}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard label="Alcohol Used"       value={d.total_alcohol_used_litres} unit="Litres"  icon={Droplet} token={GENERAL} />
                <KPICard label="Preforms Used"      value={d.total_preforms_used}       unit="Bags"    icon={Package} token={GENERAL} />
                <KPICard label="Caps Used"          value={d.total_caps_used}           unit="Units"   icon={Box}     token={GENERAL} />
                {showB && <KPICard label="Labels Used (Bitters)"  value={d.total_labels_bitters_used} unit="Units"  icon={Tag}     token={BITTERS} />}
                {showG && <KPICard label="Labels Used (Ginger)"   value={d.total_labels_ginger_used}  unit="Units"  icon={Tag}     token={GINGER}  />}
                {showB && <KPICard label="Bottles (Bitters)" value={d.total_bottles_bitters} unit="Units" icon={Package} token={BITTERS} />}
                {showG && <KPICard label="Bottles (Ginger)"  value={d.total_bottles_ginger}  unit="Units"  icon={Package} token={GINGER}  />}
              </div>
            </Sec>

            {/* ── Bitters Inputs ───────────────────────────────────────── */}
            {showB && (
              <div className="rounded-[2rem] border border-slate-200/80 bg-slate-100/30 backdrop-blur-md overflow-hidden shadow-lg shadow-slate-200/50 mt-8 relative">
                {/* Decorative glow */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-600 to-slate-900" />
                <div className="px-6 py-5 border-b border-slate-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/60">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 shadow-inner flex items-center justify-center ring-1 ring-black/10">
                      <FlaskConical className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">Bitters Production Data</h3>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">Raw Material Inputs</p>
                    </div>
                  </div>
                  <span className="text-sm font-black px-4 py-2 rounded-xl bg-white text-slate-800 shadow-sm border border-slate-200 self-start sm:self-auto">{d.bitters_cartons.toLocaleString()} Cartons Produced</span>
                </div>
                <div className="p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className="rounded-[2rem] border border-amber-200/80 bg-amber-50/40 backdrop-blur-md overflow-hidden shadow-lg shadow-amber-100/50 mt-8 relative">
                {/* Decorative glow */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-amber-600" />
                <div className="px-6 py-5 border-b border-amber-200/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 shadow-inner flex items-center justify-center ring-1 ring-amber-500/20">
                      <FlaskConical className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-amber-950 tracking-tight">Ginger Production Data</h3>
                      <p className="text-xs font-bold text-amber-700/70 uppercase tracking-widest mt-0.5">Raw Material Inputs</p>
                    </div>
                  </div>
                  <span className="text-sm font-black px-4 py-2 rounded-xl bg-white/80 text-amber-900 shadow-sm border border-amber-200/50 self-start sm:self-auto">{d.ginger_cartons.toLocaleString()} Cartons Produced</span>
                </div>
                <div className="p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
