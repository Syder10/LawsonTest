"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertCircle, Layers, ChevronDown, Filter,
} from "lucide-react"
import Image from "next/image"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

// ── Product colour tokens ──────────────────────────────────────────────────
// Bitters: deep emerald-black (fits the app glass theme, distinct from Ginger)
const BITTERS_COLOR   = "#1e3a2f"   // near-black green
const BITTERS_ACCENT  = "#2d5a45"
const BITTERS_SPARK   = "#1e3a2f"

// Ginger: warm yellow
const GINGER_COLOR    = "#ca8a04"   // yellow-600
const GINGER_ACCENT   = "#a16207"   // yellow-700
const GINGER_SPARK    = "#ca8a04"

type Product = "all" | "Bitters" | "Ginger"
type Period  = "all" | "month"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const DEPARTMENTS = ["All Departments","Blowing","Alcohol and Blending","Filling Line","Packaging","Concentrate"]
const DEPT_TABLES: Record<string, { table: string; label: string }[]> = {
  "Blowing":              [{ table: "blowing_daily_records",           label: "Preform Usage"    }],
  "Alcohol and Blending": [{ table: "alcohol_stock_level_records",     label: "Alcohol Stock"    },
                           { table: "alcohol_blending_daily_records",  label: "Blending"         },
                           { table: "ginger_production_records",       label: "Ginger Prod."     },
                           { table: "extraction_monitoring_records",   label: "Extraction"       },
                           { table: "caramel_stock_records",           label: "Caramel"          }],
  "Filling Line":         [{ table: "filling_line_daily_records",      label: "Filling"          },
                           { table: "caps_stock_records",              label: "Caps"             },
                           { table: "labels_stock_records",            label: "Labels"           }],
  "Packaging":            [{ table: "packaging_daily_records",         label: "Packaging"        }],
  "Concentrate":          [{ table: "concentrate_alcohol_records",     label: "Concentrate Alc." },
                           { table: "herbs_stock_records",             label: "Herbs"            }],
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

// ── Live signal dot ────────────────────────────────────────────────────────
function LiveDot({ available }: { available: number }) {
  const color = available <= 0 ? "#ef4444" : available <= 50 ? "#f59e0b" : "#22c55e"
  return (
    <span className="relative inline-flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full h-3 w-3" style={{ backgroundColor: color }} />
    </span>
  )
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#059669", height = 36 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null
  const w = 120, h = height
  const max = Math.max(...data, 1), min = Math.min(...data), range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 6) - 3
    return `${x},${y}`
  })
  const polyline = pts.join(" ")
  const area = `0,${h} ${polyline} ${w},${h}`
  const gradId = `sg-${color.replace("#","")}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => {
        const x = (i / (data.length - 1)) * w
        const y = h - ((v - min) / range) * (h - 6) - 3
        return <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 3 : 2}
          fill={color} opacity={i === data.length - 1 ? 1 : 0.5} />
      })}
    </svg>
  )
}

// ── Stat card — original glass aesthetic with product accent ───────────────
function StatCard({ label, value, sub, icon: Icon, sparkData, sparkColor, accentColor, highlight = false }: {
  label: string; value: string | number; sub?: string; icon?: React.ElementType
  sparkData?: number[]; sparkColor?: string; accentColor?: string; highlight?: boolean
}) {
  return (
    <div
      className={`glass-panel p-4 space-y-2 hover:scale-[1.02] transition-all ${highlight ? "ring-2 ring-emerald-400/40" : ""}`}
      style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : {}}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] text-emerald-700/70 font-bold uppercase tracking-widest leading-tight">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
      </div>
      <p className="text-2xl md:text-3xl font-black tabular-nums"
        style={{ color: accentColor || "#064e3b" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-[10px] text-emerald-600/60 font-semibold">{sub}</p>}
      {sparkData && sparkData.length > 1 && (
        <div className="pt-1">
          <Sparkline data={sparkData} color={sparkColor || "#059669"} />
        </div>
      )}
    </div>
  )
}

// ── Available stock card with live signal dot ──────────────────────────────
function AvailCard({ product, value, liveStock, trend, color }: {
  product: string; value: number; liveStock: number; trend: number[]; color: string
}) {
  return (
    <div className="glass-panel overflow-hidden hover:scale-[1.02] transition-all">
      <div className="h-1 w-full" style={{ backgroundColor: color }} />
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/70">
            Available — {product}
          </p>
          <span className="flex items-center gap-1.5">
            <LiveDot available={liveStock} />
            <span className="text-[10px] font-semibold text-emerald-600/60">Live</span>
          </span>
        </div>
        <p className="text-3xl md:text-4xl font-black tabular-nums" style={{ color }}>
          {value.toLocaleString()}
        </p>
        <p className="text-[10px] text-emerald-600/60 font-semibold">Cartons in stock</p>
        {trend.length > 1 && <Sparkline data={trend} color={color} />}
      </div>
    </div>
  )
}

// ── Section header with product badges ────────────────────────────────────
function SectionHeader({ label, bittersBadge, gingerBadge }: {
  label: string; bittersBadge?: number; gingerBadge?: number
}) {
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <h2 className="text-sm md:text-base font-black text-emerald-950 uppercase tracking-widest">{label}</h2>
      <div className="flex gap-2 flex-wrap">
        {bittersBadge != null && (
          <span className="text-xs font-bold px-3 py-1 rounded-full text-white"
            style={{ backgroundColor: BITTERS_COLOR }}>
            {bittersBadge.toLocaleString()} Cartons — Bitters
          </span>
        )}
        {gingerBadge != null && (
          <span className="text-xs font-bold px-3 py-1 rounded-full text-white"
            style={{ backgroundColor: GINGER_COLOR }}>
            {gingerBadge.toLocaleString()} Cartons — Ginger
          </span>
        )}
      </div>
    </div>
  )
}

// ── Production line chart ──────────────────────────────────────────────────
function ProductionLineChart({ data, filter, isMonthly }: {
  data: KPIData["monthly_trend"]; filter: Product; isMonthly?: boolean
}) {
  const W = 800, PT = 30, PR = 20, PL = 60
  const PB = isMonthly && data.length > 10 ? 56 : 40
  const H  = 220 + (isMonthly && data.length > 10 ? 16 : 0)
  const cW = W - PL - PR, cH = H - PT - PB

  const bitS = data.map(d => d.bitters)
  const ginS = data.map(d => d.ginger)
  const act  = filter === "Bitters" ? bitS : filter === "Ginger" ? ginS : [...bitS, ...ginS]
  const max  = Math.max(...act, 1)
  const yTicks = 5
  const tickStep = Math.ceil(max / yTicks / 10) * 10 || 1
  const yMax = tickStep * yTicks

  const xPos = (i: number) => PL + (data.length > 1 ? i / (data.length - 1) : 0.5) * cW
  const yPos = (v: number) => PT + cH - (v / yMax) * cH
  const rotateTicks = isMonthly && data.length > 10

  const toPath = (vals: number[], clr: string) => {
    if (vals.every(v => v === 0) || vals.length < 2) return null
    const pts = vals.map((v, i) => `${xPos(i)},${yPos(v)}`)
    return <polyline key={clr} points={pts.join(" ")} fill="none" stroke={clr}
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  }
  const toDots = (vals: number[], clr: string) =>
    vals.map((v, i) => <circle key={`${clr}-${i}`} cx={xPos(i)} cy={yPos(v)} r={3.5} fill={clr} />)

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
        {/* Legend */}
        {filter !== "Ginger" && (
          <g>
            <rect x={PL} y={8} width={10} height={10} rx={2} fill={BITTERS_COLOR} />
            <text x={PL+14} y={17} fontSize="11" fill={BITTERS_COLOR} fontWeight="500">Bitters</text>
          </g>
        )}
        {filter !== "Bitters" && (
          <g>
            <rect x={PL+65} y={8} width={10} height={10} rx={2} fill={GINGER_COLOR} />
            <text x={PL+79} y={17} fontSize="11" fill={GINGER_COLOR} fontWeight="500">Ginger</text>
          </g>
        )}
        {/* Y-axis */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const val = tickStep * (yTicks - i)
          const y   = yPos(val)
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#d1fae5" strokeWidth="1" strokeDasharray="4,4" />
              <text x={PL-8} y={y+4} textAnchor="end" fontSize="10" fill="#6b7280">{val.toLocaleString()}</text>
            </g>
          )
        })}
        {/* X-axis */}
        {data.map((d, i) => rotateTicks
          ? <text key={i} x={xPos(i)} y={H-PB+14} textAnchor="end" fontSize="9" fill="#6b7280"
              transform={`rotate(-45 ${xPos(i)} ${H-PB+14})`}>{d.month}</text>
          : <text key={i} x={xPos(i)} y={H-6} textAnchor="middle" fontSize="10" fill="#6b7280">{d.month}</text>
        )}
        {/* Series */}
        {(filter === "all" || filter === "Bitters") && toPath(bitS, BITTERS_COLOR)}
        {(filter === "all" || filter === "Ginger")  && toPath(ginS, GINGER_COLOR)}
        {(filter === "all" || filter === "Bitters") && toDots(bitS, BITTERS_COLOR)}
        {(filter === "all" || filter === "Ginger")  && toDots(ginS, GINGER_COLOR)}
      </svg>
    </div>
  )
}

// ── Department activity panel ──────────────────────────────────────────────
function DeptPanel({ dept }: { dept: string }) {
  const [rows, setRows]     = useState<DeptActivity[]>([])
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
          const d   = await res.json()
          return { table, label, count: d.count || 0, lastDate: d.lastDate || null }
        } catch { return { table, label, count: 0, lastDate: null } }
      })
    ).then(r => { setRows(r); setLoading(false) })
  }, [dept])

  if (dept === "All Departments" || rows.length === 0) return null

  return (
    <div className="glass-panel p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700/60 mb-3">
        {dept} — Submission Activity
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-emerald-600/40">
          <div className="w-3 h-3 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.table} className="flex items-center justify-between text-xs">
              <span className="text-emerald-700/70 font-medium">{r.label}</span>
              <div className="flex items-center gap-4">
                {r.lastDate && (
                  <span className="text-emerald-600/40 text-[10px]">
                    {new Date(r.lastDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                )}
                <span className="font-bold text-emerald-900 tabular-nums">{r.count.toLocaleString()} records</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export function ManagerDashboard({ userId }: { userId: string }) {
  const [kpi, setKpi]           = useState<KPIData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const now = new Date()
  const [period, setPeriod]     = useState<Period>("all")
  const [selYear, setSelYear]   = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [product, setProduct]   = useState<Product>("all")
  const [dept, setDept]         = useState("All Departments")

  const fetchKPIs = useCallback(async (p = period, y = selYear, m = selMonth) => {
    try {
      setRefreshing(true); setError(null)
      const params = new URLSearchParams()
      if (p === "month") { params.set("year", String(y)); params.set("month", String(m)) }
      const res  = await fetch(`/api/analytics/kpis?${params}`)
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
    setIsExporting(true)
    try {
      const res  = await fetch("/api/records/export")
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href = url
      a.download = `lawson_production_${now.toISOString().split("T")[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { alert("Export failed") } finally { setIsExporting(false) }
  }

  const d        = kpi
  const showB    = product === "all" || product === "Bitters"
  const showG    = product === "all" || product === "Ginger"
  const trendB   = d?.monthly_trend.map(m => m.bitters) || []
  const trendG   = d?.monthly_trend.map(m => m.ginger)  || []
  const capsUsed = d ? (d.bitters_cartons + d.ginger_cartons) * 12 : 0
  const labB     = d ? d.bitters_cartons * 12 : 0
  const labG     = d ? d.ginger_cartons  * 12 : 0

  return (
    <div className="w-full min-h-screen bg-mesh p-3 md:p-6 mb-12 animate-fade-in-up">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="glass-panel p-4 md:p-6 animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="Lawson LLC" width={64} height={64}
                className="drop-shadow-xl rounded-lg bg-white p-1.5 shrink-0" />
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-emerald-950 tracking-tight">
                  Manager Dashboard
                </h1>
                <p className="text-xs font-bold text-emerald-700/50 uppercase tracking-[0.2em] mt-0.5">
                  Lawson Limited Company
                </p>
                {d && (
                  <p className="text-[10px] text-emerald-600/50 mt-1">
                    Updated: {new Date(d.last_updated).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 w-full md:w-auto min-w-0 md:min-w-[380px]">
              {/* Period + refresh + export */}
              <div className="flex gap-2">
                {(["all", "month"] as Period[]).map(t => (
                  <button key={t} onClick={() => { setPeriod(t); fetchKPIs(t) }}
                    className={`flex-1 glass-button py-2 px-4 rounded-lg text-sm font-bold ${
                      period === t ? "bg-primary/20 border-primary text-primary" : "border-primary/30 text-primary"
                    }`}>
                    {t === "all" ? "All Time" : "Monthly"}
                  </button>
                ))}
                <button onClick={() => fetchKPIs()} disabled={refreshing}
                  className="glass-button py-2 px-3 rounded-lg border-primary/30 disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 text-primary ${refreshing ? "animate-spin" : ""}`} />
                </button>
                <button onClick={handleExport} disabled={isExporting}
                  className="glass-button-primary py-2 px-3 rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                  <Download className="w-4 h-4" />
                  <span className="text-xs font-bold hidden sm:inline">
                    {isExporting ? "…" : "Export"}
                  </span>
                </button>
              </div>

              {/* Month/year pickers */}
              {period === "month" && (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <select value={selMonth}
                      onChange={e => { setSelMonth(+e.target.value); fetchKPIs("month", selYear, +e.target.value) }}
                      className="w-full glass-button py-2 pl-3 pr-7 rounded-lg text-sm text-primary border-primary/30 bg-white/10 appearance-none">
                      {MONTHS.map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-primary/60 pointer-events-none" />
                  </div>
                  <div className="relative flex-1">
                    <select value={selYear}
                      onChange={e => { setSelYear(+e.target.value); fetchKPIs("month", +e.target.value, selMonth) }}
                      className="w-full glass-button py-2 pl-3 pr-7 rounded-lg text-sm text-primary border-primary/30 bg-white/10 appearance-none">
                      {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y =>
                        <option key={y} value={y}>{y}</option>
                      )}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-primary/60 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Product filter */}
              <div className="flex gap-2">
                {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
                  <button key={p} onClick={() => setProduct(p)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                      product === p
                        ? p === "Bitters" ? "text-white border-transparent"
                          : p === "Ginger" ? "text-white border-transparent"
                          : "bg-primary/20 border-primary text-primary"
                        : "glass-button border-primary/30 text-primary"
                    }`}
                    style={
                      product === p && p === "Bitters" ? { backgroundColor: BITTERS_COLOR }
                      : product === p && p === "Ginger"  ? { backgroundColor: GINGER_COLOR }
                      : {}
                    }>
                    {p === "all" ? "All Products" : p}
                  </button>
                ))}
              </div>

              {/* Department filter */}
              <div className="relative flex items-center">
                <Filter className="absolute left-3 w-3 h-3 text-primary/50 pointer-events-none" />
                <select value={dept} onChange={e => setDept(e.target.value)}
                  className="w-full glass-button py-2 pl-8 pr-7 rounded-lg text-sm text-primary border-primary/30 bg-white/10 appearance-none">
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-primary/60 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Dept activity ────────────────────────────────────────────────── */}
        {dept !== "All Departments" && <DeptPanel dept={dept} />}

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {loading && (
          <div className="glass-panel p-16 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full mx-auto mb-4" />
            <p className="text-emerald-700/60 font-semibold">Loading analytics...</p>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────────────── */}
        {!loading && error && (
          <div className="glass-panel p-12 text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h3 className="text-lg font-bold text-emerald-950">Failed to Load Analytics</h3>
            <p className="text-sm text-emerald-700/60">{error}</p>
            <button onClick={() => fetchKPIs()} className="glass-button-primary py-2 px-6 rounded-lg font-semibold">
              Retry
            </button>
          </div>
        )}

        {/* ── Data ────────────────────────────────────────────────────────── */}
        {!loading && !error && d && (
          <div className="space-y-6">

            {/* ── Live Inventory + Available Stock — combined ─────────── */}
            <div className="glass-panel p-5 md:p-6">
              <SectionHeader label="Live Inventory — Available Stock" />
              {/* Real-time tracker (updates every 30s from packaging_live_stocks table) */}
              <LiveStocksDisplay />
              {/* KPI-based available stock cards with sparkline trend */}
              <div className={`grid gap-4 mt-5 ${product === "all" ? "grid-cols-2" : "grid-cols-1 max-w-xs"}`}>
                {showB && (
                  <AvailCard product="Bitters" value={d.live_bitters_stock}
                    liveStock={d.live_bitters_stock} trend={trendB} color={BITTERS_COLOR} />
                )}
                {showG && (
                  <AvailCard product="Ginger" value={d.live_ginger_stock}
                    liveStock={d.live_ginger_stock} trend={trendG} color={GINGER_COLOR} />
                )}
              </div>
            </div>

            {/* ROW 2 — Remaining Materials */}
            <div className="glass-panel p-5 md:p-6">
              <SectionHeader label="Remaining Materials" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                <StatCard label="Alcohol Stock"   value={d.current_alcohol_balance}   sub="Remaining"     icon={Droplet} />
                <StatCard label="Caps Remaining"  value={d.caps_remaining}            sub="Units"         icon={Box} />
                <StatCard label="Preforms Balance" value={d.current_preform_balance}  sub="Bags remaining" icon={Package} />
                {showB && <StatCard label="Labels — Bitters"  value={d.labels_bitters_remaining}  sub="Units"     icon={Tag}       accentColor={BITTERS_COLOR} />}
                {showG && <StatCard label="Labels — Ginger"   value={d.labels_ginger_remaining}   sub="Units"     icon={Tag}       accentColor={GINGER_COLOR}  />}
                {showB && <StatCard label="Caramel — Bitters" value={d.caramel_bitters_remaining} sub="Remaining" icon={FlaskConical} accentColor={BITTERS_COLOR} />}
                {showG && <StatCard label="Caramel — Ginger"  value={d.caramel_ginger_remaining}  sub="Remaining" icon={FlaskConical} accentColor={GINGER_COLOR}  />}
              </div>
            </div>

            {/* ROW 3 — Quantity Used */}
            <div className="glass-panel p-5 md:p-6">
              <SectionHeader label="Quantity Used" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard label="Alcohol Used"  value={d.total_alcohol_used_litres} sub="Drums"  icon={Droplet} />
                <StatCard label="Preforms Used" value={d.total_preforms_used}       sub="Bags"   icon={Package} />
                <StatCard label="Caps Used"     value={capsUsed}                    sub="Units"  icon={Box} />
                {showB && <StatCard label="Labels Used — Bitters" value={labB}                   sub="Units"   icon={Tag}     accentColor={BITTERS_COLOR} />}
                {showG && <StatCard label="Labels Used — Ginger"  value={labG}                   sub="Units"   icon={Tag}     accentColor={GINGER_COLOR}  />}
                {showB && <StatCard label="Bottles — Bitters"     value={d.total_bottles_bitters} sub="Bottles" icon={Package} accentColor={BITTERS_COLOR} />}
                {showG && <StatCard label="Bottles — Ginger"      value={d.total_bottles_ginger}  sub="Bottles" icon={Package} accentColor={GINGER_COLOR}  />}
              </div>
            </div>

            {/* ROW 4 — Production Output + Chart */}
            <div className="glass-panel p-5 md:p-6">
              <SectionHeader label="Production Output"
                bittersBadge={showB ? d.bitters_cartons : undefined}
                gingerBadge={showG  ? d.ginger_cartons  : undefined} />
              <div className={`grid gap-4 mb-6 ${product === "all" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 max-w-xs"}`}>
                {showB && (
                  <StatCard label="Bitters Production" value={d.bitters_cartons} sub="Cartons"
                    icon={Package} sparkData={trendB} sparkColor={BITTERS_SPARK} accentColor={BITTERS_COLOR} />
                )}
                {showG && (
                  <StatCard label="Ginger Production" value={d.ginger_cartons} sub="Cartons"
                    icon={Package} sparkData={trendG} sparkColor={GINGER_SPARK} accentColor={GINGER_COLOR} />
                )}
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs font-bold text-emerald-700/60 uppercase tracking-widest mb-3">
                  {period === "month"
                    ? `Daily Production — ${MONTHS[selMonth-1]} ${selYear}`
                    : "Production Trend — Last 6 Months"}
                </p>
                {d.monthly_trend.length > 1
                  ? <ProductionLineChart data={d.monthly_trend} filter={product} isMonthly={period === "month"} />
                  : <p className="text-sm text-emerald-700/40 text-center py-8">No production data for this period</p>
                }
              </div>
            </div>

            {/* ROW 5 — Bitters Production Inputs */}
            {showB && (
              <div className="glass-panel p-5 md:p-6"
                style={{ borderLeft: `4px solid ${BITTERS_COLOR}` }}>
                <SectionHeader label="Production Inputs & Materials — Bitters"
                  bittersBadge={d.bitters_cartons} />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <StatCard label="Alcohol for Bitters" value={d.alcohol_used_for_bitters_drums} sub="Drums"   icon={Droplet}     accentColor={BITTERS_COLOR} />
                  <StatCard label="Concentrate Used"    value={d.total_concentrate_used_litres}   sub="Litres"                    accentColor={BITTERS_COLOR} />
                  <StatCard label="Spices Used"         value={d.total_spices_used_litres}        sub="Litres"                    accentColor={BITTERS_COLOR} />
                  <StatCard label="Caramel Used"        value={d.total_caramel_used_gallons}      sub="Gallons"                   accentColor={BITTERS_COLOR} />
                  <StatCard label="Water Used"          value={d.total_water_litres}              sub="Litres"                    accentColor={BITTERS_COLOR} />
                  <StatCard label="Labels Used"         value={labB}                              sub="Units"    icon={Tag}        accentColor={BITTERS_COLOR} />
                  <StatCard label="Caps Used"           value={capsUsed}                          sub="Units"    icon={Box}        />
                  <StatCard label="Bottles Used"        value={d.total_bottles_bitters}           sub="Bottles"  icon={Package}    accentColor={BITTERS_COLOR} />
                </div>
              </div>
            )}

            {/* ROW 6 — Ginger Production Inputs */}
            {showG && (
              <div className="glass-panel p-5 md:p-6"
                style={{ borderLeft: `4px solid ${GINGER_COLOR}` }}>
                <SectionHeader label="Production Inputs & Materials — Ginger"
                  gingerBadge={d.ginger_cartons} />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <StatCard label="Alcohol for Ginger" value={d.alcohol_used_for_ginger_drums} sub="Drums"   icon={Droplet}  accentColor={GINGER_COLOR} />
                  <StatCard label="Water Used"         value={d.ginger_water_used_litres}       sub="Litres"                 accentColor={GINGER_COLOR} />
                  <StatCard label="G/T Juice"          value={d.ginger_gt_juice_litres}         sub="Litres"                 accentColor={GINGER_COLOR} />
                  <StatCard label="Spices Used"        value={d.ginger_spices_used_litres}      sub="Litres"                 accentColor={GINGER_COLOR} />
                  <StatCard label="Caramel Used"       value={d.ginger_caramel_used_gallons}    sub="Gallons"                accentColor={GINGER_COLOR} />
                  <StatCard label="Labels Used"        value={labG}                             sub="Units"    icon={Tag}     accentColor={GINGER_COLOR} />
                  <StatCard label="Bottles Used"       value={d.total_bottles_ginger}           sub="Bottles"  icon={Package} accentColor={GINGER_COLOR} />
                </div>
              </div>
            )}

          </div>
        )}

        {/* No data */}
        {!loading && !error && !d && (
          <div className="glass-panel p-12 text-center">
            <p className="text-emerald-700/60 font-semibold">No data available</p>
            <button onClick={() => fetchKPIs()} className="mt-4 glass-button-primary py-2 px-6 rounded-lg font-semibold">
              Load Data
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
