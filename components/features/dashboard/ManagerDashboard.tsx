"use client"

import { useState, useEffect } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertTriangle, Activity, ChevronDown,
} from "lucide-react"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

// ── Colour tokens ──────────────────────────────────────────────────────────
const B = { border: "border-black",       badge: "bg-black text-white",         text: "text-black",         spark: "#000000" }
const G = { border: "border-yellow-400",  badge: "bg-yellow-400 text-black",    text: "text-yellow-600",    spark: "#ca8a04" }
const GEN = { border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-800", spark: "#059669" }

type Product = "all" | "Bitters" | "Ginger"
type Period  = "all" | "month"

interface KPIData {
  total_production_cartons:    number
  bitters_cartons:             number
  ginger_cartons:              number
  total_alcohol_used_litres:   number
  current_alcohol_balance:     number
  current_preform_balance:     number
  total_preforms_used:         number
  alcohol_used_for_bitters_drums: number
  total_concentrate_used_litres:  number
  total_spices_used_litres:    number
  total_caramel_used_gallons:  number
  total_water_litres:          number
  alcohol_used_for_ginger_drums:  number
  ginger_water_used_litres:    number
  ginger_gt_juice_litres:      number
  ginger_spices_used_litres:   number
  ginger_caramel_used_gallons: number
  live_bitters_stock:          number
  live_ginger_stock:           number
  caps_remaining:              number
  labels_bitters_remaining:    number
  labels_ginger_remaining:     number
  caramel_bitters_remaining:   number
  caramel_ginger_remaining:    number
  total_caps_used:             number
  total_labels_bitters_used:   number
  total_labels_ginger_used:    number
  total_bottles_bitters:       number
  total_bottles_ginger:        number
  monthly_trend: { month: string; total: number; bitters: number; ginger: number }[]
  last_updated:  string
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const w = 80, h = 28
  const max = Math.max(...data, 1), min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  }).join(" ")
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => {
        const x = (i / (data.length - 1)) * w
        const y = h - ((v - min) / range) * (h - 4) - 2
        return <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 2.5 : 1.5} fill={color} opacity={i === data.length - 1 ? 1 : 0.4} />
      })}
    </svg>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({
  label, value, unit, icon: Icon,
  borderClass = GEN.border, textClass = GEN.text,
  sparkData, sparkColor, highlight = false,
}: {
  label: string; value: number; unit?: string
  icon?: React.ElementType; borderClass?: string; textClass?: string
  sparkData?: number[]; sparkColor?: string; highlight?: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl border-2 ${borderClass} p-4 space-y-1.5 hover:shadow-md transition-shadow ${highlight ? "ring-2 ring-emerald-400/40 bg-emerald-50/30" : ""}`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 leading-tight">{label}</p>
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />}
      </div>
      <p className={`text-xl sm:text-2xl font-black tabular-nums ${textClass}`}>
        {value.toLocaleString()}
      </p>
      {unit && <p className="text-[9px] font-semibold text-slate-300 uppercase tracking-wide">{unit}</p>}
      {sparkData && <div className="pt-1"><Spark data={sparkData} color={sparkColor || GEN.spark} /></div>}
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────
function Section({ title, badge, badgeClass, children }: {
  title: string; badge?: string | number; badgeClass?: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-600">{title}</h3>
        {badge != null && (
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${badgeClass || "bg-emerald-100 text-emerald-800"}`}>
            {typeof badge === "number" ? badge.toLocaleString() : badge}
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

// ── Trend chart ────────────────────────────────────────────────────────────
function TrendChart({ data, product }: { data: KPIData["monthly_trend"]; product: Product }) {
  const W = 700, H = 200, PL = 52, PR = 16, PT = 24, PB = 32
  const cW = W - PL - PR, cH = H - PT - PB

  const bitS = data.map(d => d.bitters)
  const ginS = data.map(d => d.ginger)
  const allS = data.map(d => d.total)
  const active = product === "Bitters" ? bitS : product === "Ginger" ? ginS : [...bitS, ...ginS, ...allS]
  const max = Math.max(...active, 1)

  const line = (vals: number[], color: string) => {
    if (vals.every(v => v === 0) || vals.length < 2) return null
    const pts = vals.map((v, i) => `${PL + (i / (vals.length - 1)) * cW},${PT + cH - (v / max) * cH}`).join(" ")
    return <polyline key={color} points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  }
  const dots = (vals: number[], color: string) =>
    vals.map((v, i) => <circle key={`${color}${i}`} cx={PL + (i / (vals.length - 1)) * cW} cy={PT + cH - (v / max) * cH} r={i === vals.length - 1 ? 4 : 2.5} fill={color} opacity={i === vals.length - 1 ? 1 : 0.5} />)

  const ticks = 4
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 280 }}>
        {/* Grid */}
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const y = PT + (i / ticks) * cH
          const val = Math.round(max - (i / ticks) * max)
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={PL - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{val.toLocaleString()}</text>
            </g>
          )
        })}
        {/* X labels */}
        {data.map((d, i) => (
          <text key={i} x={PL + (data.length > 1 ? i / (data.length - 1) : 0.5) * cW} y={H - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">{d.month}</text>
        ))}
        {/* Lines */}
        {(product === "all" || product === "Bitters") && line(bitS, "#000")}
        {(product === "all" || product === "Ginger")  && line(ginS, "#ca8a04")}
        {product === "all" && line(allS, "#059669")}
        {(product === "all" || product === "Bitters") && dots(bitS, "#000")}
        {(product === "all" || product === "Ginger")  && dots(ginS, "#ca8a04")}
        {product === "all" && dots(allS, "#059669")}
        {/* Legend */}
        {product === "all" && (
          <g>
            <rect x={PL} y={6} width={8} height={8} rx={2} fill="#059669" />
            <text x={PL + 11} y={14} fontSize="9" fill="#475569">Total</text>
            <rect x={PL + 44} y={6} width={8} height={8} rx={2} fill="#000" />
            <text x={PL + 55} y={14} fontSize="9" fill="#475569">Bitters</text>
            <rect x={PL + 102} y={6} width={8} height={8} rx={2} fill="#ca8a04" />
            <text x={PL + 113} y={14} fontSize="9" fill="#475569">Ginger</text>
          </g>
        )}
      </svg>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export function ManagerDashboard({ userId }: { userId: string }) {
  const [kpi, setKpi]           = useState<KPIData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const now = new Date()
  const [period, setPeriod]       = useState<Period>("all")
  const [selYear, setSelYear]     = useState(now.getFullYear())
  const [selMonth, setSelMonth]   = useState(now.getMonth() + 1)
  const [product, setProduct]     = useState<Product>("all")

  const fetchKPIs = async (p: Period = period, y: number = selYear, m: number = selMonth) => {
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
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }

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
      a.href     = url
      a.download = `lawson_production_${new Date().toISOString().split("T")[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { alert("Export failed") } finally { setIsExporting(false) }
  }

  const d         = kpi
  const trendB    = d?.monthly_trend.map(m => m.bitters) || []
  const trendG    = d?.monthly_trend.map(m => m.ginger)  || []
  const trendAll  = d?.monthly_trend.map(m => m.total)   || []

  const showB = product === "all" || product === "Bitters"
  const showG = product === "all" || product === "Ginger"

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* ── Header bar ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">

          <div className="flex-1 min-w-0">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-950">
              Manager Dashboard
            </h2>
            <p className="text-sm text-emerald-700/60 font-medium mt-0.5">
              Lawson Limited Company — Production Analytics
            </p>
            {d && (
              <p className="text-[10px] text-slate-400 mt-1">
                Last updated: {new Date(d.last_updated).toLocaleString()}
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {/* Period toggle */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              {(["all", "month"] as Period[]).map(p => (
                <button key={p} onClick={() => { setPeriod(p); fetchKPIs(p) }}
                  className={`px-3 py-2 text-xs font-bold transition-colors ${period === p ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
                  {p === "all" ? "All Time" : "Monthly"}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button onClick={() => fetchKPIs()} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-xs font-bold transition-all disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>

            {/* Export */}
            <button onClick={handleExport} disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-60 shadow-sm">
              <Download className="w-3.5 h-3.5" />
              {isExporting ? "Exporting…" : "Export"}
            </button>
          </div>
        </div>

        {/* Month selector */}
        {period === "month" && (
          <div className="flex gap-2 mt-4 flex-wrap">
            <div className="relative">
              <select value={selMonth} onChange={e => { setSelMonth(+e.target.value); fetchKPIs("month", selYear, +e.target.value) }}
                className="appearance-none pl-3 pr-8 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-emerald-400">
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(2024, i).toLocaleString("default", { month: "long" })}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={selYear} onChange={e => { setSelYear(+e.target.value); fetchKPIs("month", +e.target.value, selMonth) }}
                className="appearance-none pl-3 pr-8 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-emerald-400">
                {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Product filter */}
        <div className="flex gap-2 mt-4">
          {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
            <button key={p} onClick={() => setProduct(p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${
                product === p
                  ? p === "Bitters" ? "bg-black text-white border-black"
                    : p === "Ginger"  ? "bg-yellow-400 text-black border-yellow-400"
                    : "bg-emerald-600 text-white border-emerald-600"
                  : p === "Bitters" ? "bg-white text-black border-black/30 hover:border-black"
                    : p === "Ginger"  ? "bg-white text-yellow-600 border-yellow-300 hover:border-yellow-400"
                    : "bg-white text-emerald-700 border-emerald-200 hover:border-emerald-400"
              }`}>
              {p === "all" ? "All Products" : p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading / Error ───────────────────────────────────────────────── */}
      {loading && (
        <div className="bg-white rounded-3xl border border-slate-100 p-16 text-center">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-medium text-sm">Loading analytics…</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 font-semibold text-sm">{error}</p>
          <button onClick={() => fetchKPIs()} className="ml-auto text-xs font-bold text-red-600 hover:text-red-800 underline">Retry</button>
        </div>
      )}

      {!loading && !error && d && (
        <div className="space-y-5">

          {/* ── Live Inventory ──────────────────────────────────────────── */}
          <Section title="Live Inventory Tracker">
            <LiveStocksDisplay />
          </Section>

          {/* ── Production Output ───────────────────────────────────────── */}
          <Section title="Production Output"
            badge={d.total_production_cartons}
            badgeClass="bg-emerald-100 text-emerald-800">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              {product === "all" && (
                <StatCard label="Total Production" value={d.total_production_cartons} unit="Cartons"
                  icon={TrendingUp} highlight sparkData={trendAll} sparkColor={GEN.spark} />
              )}
              {showB && (
                <StatCard label="Bitters" value={d.bitters_cartons} unit="Cartons"
                  borderClass={B.border} textClass={B.text} sparkData={trendB} sparkColor={B.spark} />
              )}
              {showG && (
                <StatCard label="Ginger" value={d.ginger_cartons} unit="Cartons"
                  borderClass={G.border} textClass={G.text} sparkData={trendG} sparkColor={G.spark} />
              )}
            </div>
            <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Production Trend</p>
              {d.monthly_trend.length > 1
                ? <TrendChart data={d.monthly_trend} product={product} />
                : <p className="text-sm text-slate-400 text-center py-6">Not enough data for trend chart</p>
              }
            </div>
          </Section>

          {/* ── Available Stock ─────────────────────────────────────────── */}
          <Section title="Available Stock (Live)">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Alcohol Balance" value={d.current_alcohol_balance} unit="Remaining"
                icon={Droplet} />
              <StatCard label="Preforms Balance" value={d.current_preform_balance} unit="Bags remaining"
                icon={Package} />
              {showB && <StatCard label="Bitters — Live Stock" value={d.live_bitters_stock} unit="Cartons"
                borderClass={B.border} textClass={B.text} icon={Package} />}
              {showG && <StatCard label="Ginger — Live Stock" value={d.live_ginger_stock} unit="Cartons"
                borderClass={G.border} textClass={G.text} icon={Package} />}
            </div>
          </Section>

          {/* ── Remaining Materials ─────────────────────────────────────── */}
          <Section title="Remaining Materials">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Caps Remaining" value={d.caps_remaining} unit="Units" icon={Box} />
              {showB && <StatCard label="Labels — Bitters" value={d.labels_bitters_remaining} unit="Units"
                icon={Tag} borderClass={B.border} textClass={B.text} />}
              {showG && <StatCard label="Labels — Ginger" value={d.labels_ginger_remaining} unit="Units"
                icon={Tag} borderClass={G.border} textClass={G.text} />}
              {showB && <StatCard label="Caramel — Bitters" value={d.caramel_bitters_remaining} unit="Remaining"
                icon={FlaskConical} borderClass={B.border} textClass={B.text} />}
              {showG && <StatCard label="Caramel — Ginger" value={d.caramel_ginger_remaining} unit="Remaining"
                icon={FlaskConical} borderClass={G.border} textClass={G.text} />}
            </div>
          </Section>

          {/* ── Quantity Used ────────────────────────────────────────────── */}
          <Section title="Quantity Used">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Alcohol Used" value={d.total_alcohol_used_litres} unit="Litres" icon={Droplet} />
              <StatCard label="Preforms Used" value={d.total_preforms_used} unit="Bags" icon={Package} />
              <StatCard label="Caps Used" value={d.total_caps_used} unit="Units" icon={Box} />
              {showB && <StatCard label="Labels Used — Bitters" value={d.total_labels_bitters_used} unit="Units"
                icon={Tag} borderClass={B.border} textClass={B.text} />}
              {showG && <StatCard label="Labels Used — Ginger" value={d.total_labels_ginger_used} unit="Units"
                icon={Tag} borderClass={G.border} textClass={G.text} />}
              {showB && <StatCard label="Bottles — Bitters" value={d.total_bottles_bitters} unit={`${d.bitters_cartons.toLocaleString()} ctns × 12`}
                icon={Package} borderClass={B.border} textClass={B.text} />}
              {showG && <StatCard label="Bottles — Ginger" value={d.total_bottles_ginger} unit={`${d.ginger_cartons.toLocaleString()} ctns × 12`}
                icon={Package} borderClass={G.border} textClass={G.text} />}
            </div>
          </Section>

          {/* ── Bitters Inputs ───────────────────────────────────────────── */}
          {showB && (
            <div className="bg-white rounded-3xl border-2 border-black overflow-hidden shadow-sm">
              <div className="bg-black px-5 py-3.5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-white">
                  Bitters — Production Inputs
                </h3>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-white text-black">
                  {d.bitters_cartons.toLocaleString()} ctns
                </span>
              </div>
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <StatCard label="Alcohol Used" value={d.alcohol_used_for_bitters_drums} unit="Drums"
                    icon={Droplet} borderClass={B.border} textClass={B.text} />
                  <StatCard label="Concentrate" value={d.total_concentrate_used_litres} unit="Litres"
                    borderClass={B.border} textClass={B.text} />
                  <StatCard label="Spices" value={d.total_spices_used_litres} unit="Litres"
                    borderClass={B.border} textClass={B.text} />
                  <StatCard label="Caramel" value={d.total_caramel_used_gallons} unit="Gallons"
                    borderClass={B.border} textClass={B.text} />
                  <StatCard label="Water" value={d.total_water_litres} unit="Litres"
                    borderClass={B.border} textClass={B.text} />
                  <StatCard label="Labels" value={d.total_labels_bitters_used} unit="Units"
                    icon={Tag} borderClass={B.border} textClass={B.text} />
                  <StatCard label="Caps" value={d.total_caps_used} unit="Units"
                    icon={Box} borderClass={B.border} textClass={B.text} />
                  <StatCard label="Bottles" value={d.total_bottles_bitters} unit="Units"
                    icon={Package} borderClass={B.border} textClass={B.text} />
                </div>
              </div>
            </div>
          )}

          {/* ── Ginger Inputs ────────────────────────────────────────────── */}
          {showG && (
            <div className="bg-white rounded-3xl border-2 border-yellow-400 overflow-hidden shadow-sm">
              <div className="bg-yellow-400 px-5 py-3.5 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-black">
                  Ginger — Production Inputs
                </h3>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-black text-yellow-400">
                  {d.ginger_cartons.toLocaleString()} ctns
                </span>
              </div>
              <div className="p-4 sm:p-5 bg-yellow-50/30">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <StatCard label="Alcohol Used" value={d.alcohol_used_for_ginger_drums} unit="Drums"
                    icon={Droplet} borderClass={G.border} textClass={G.text} />
                  <StatCard label="Water" value={d.ginger_water_used_litres} unit="Litres"
                    borderClass={G.border} textClass={G.text} />
                  <StatCard label="G/T Juice" value={d.ginger_gt_juice_litres} unit="Litres"
                    borderClass={G.border} textClass={G.text} />
                  <StatCard label="Spices" value={d.ginger_spices_used_litres} unit="Litres"
                    borderClass={G.border} textClass={G.text} />
                  <StatCard label="Caramel" value={d.ginger_caramel_used_gallons} unit="Gallons"
                    borderClass={G.border} textClass={G.text} />
                  <StatCard label="Labels" value={d.total_labels_ginger_used} unit="Units"
                    icon={Tag} borderClass={G.border} textClass={G.text} />
                  <StatCard label="Bottles" value={d.total_bottles_ginger} unit="Units"
                    icon={Package} borderClass={G.border} textClass={G.text} />
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
