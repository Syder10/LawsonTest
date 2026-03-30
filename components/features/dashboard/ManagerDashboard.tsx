"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, AlertCircle, ChevronDown, Filter, TrendingUp,
} from "lucide-react"
import Image from "next/image"

// ─────────────────────────────────────────────────────────────────────────────
// Brand tokens
// ─────────────────────────────────────────────────────────────────────────────
const BIT = {
  accent: "#111827", soft: "bg-slate-100", textMid: "text-slate-500",
  textVal: "text-slate-900", iconClr: "text-slate-400", dot: "#111827",
}
const GIN = {
  accent: "#d97706", soft: "bg-amber-50", textMid: "text-amber-700",
  textVal: "text-amber-950", iconClr: "text-amber-400", dot: "#d97706",
}

type Product = "all" | "Bitters" | "Ginger"
type Period = "all" | "month"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const DEPARTMENTS = [
  "All Departments","Blowing","Alcohol and Blending","Filling Line","Packaging","Concentrate",
]
const DEPT_TABLES: Record<string, { table: string; label: string }[]> = {
  "Blowing": [{ table: "blowing_daily_records", label: "Preform Usage" }],
  "Alcohol and Blending": [
    { table: "alcohol_stock_level_records", label: "Alcohol Stock" },
    { table: "alcohol_blending_daily_records", label: "Blending" },
    { table: "ginger_production_records", label: "Ginger Prod." },
    { table: "extraction_monitoring_records", label: "Extraction" },
    { table: "caramel_stock_records", label: "Caramel" },
  ],
  "Filling Line": [
    { table: "filling_line_daily_records", label: "Filling" },
    { table: "caps_stock_records", label: "Caps" },
    { table: "labels_stock_records", label: "Labels" },
  ],
  "Packaging": [{ table: "packaging_daily_records", label: "Packaging" }],
  "Concentrate": [
    { table: "concentrate_alcohol_records", label: "Concentrate Alc." },
    { table: "herbs_stock_records", label: "Herbs" },
  ],
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

// ─────────────────────────────────────────────────────────────────────────────
// Section heading
// ─────────────────────────────────────────────────────────────────────────────
function SectionLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      {sub && <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{sub}</p>}
      <h2 className="text-sm font-black text-slate-900 mt-0.5 leading-none">{title}</h2>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline — mini inline trend chart
// ─────────────────────────────────────────────────────────────────────────────
function Sparkline({
  data, color, gradId, width = 80, height = 28,
}: {
  data: number[]
  color: string
  gradId: string
  width?: number
  height?: number
}) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const pad = 2

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2)
    const y = pad + (1 - v / max) * (height - pad * 2)
    return [x, y] as [number, number]
  })

  const polyline = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const areaPath = `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
  const last = pts[pts.length - 1]

  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat tile
// ─────────────────────────────────────────────────────────────────────────────
function Tile({
  label, sub, value, unit, variant = "white",
}: {
  label: string; sub?: string; value: number; unit: string
  variant?: "white" | "bitters" | "ginger" | "slate" | "amber-soft"
}) {
  const styles: Record<string, string> = {
    white: "bg-white border border-slate-200",
    bitters: "bg-[#111827]",
    ginger: "bg-amber-500",
    slate: "bg-slate-100",
    "amber-soft": "bg-amber-50 border border-amber-100",
  }
  const lClr: Record<string, string> = {
    white: "text-slate-400", bitters: "text-slate-400", ginger: "text-amber-100",
    slate: "text-slate-500", "amber-soft": "text-amber-600",
  }
  const sClr: Record<string, string> = {
    white: "text-slate-400", bitters: "text-slate-500", ginger: "text-amber-100",
    slate: "text-slate-400", "amber-soft": "text-amber-500",
  }
  const vClr: Record<string, string> = {
    white: "text-slate-900", bitters: "text-white", ginger: "text-white",
    slate: "text-slate-900", "amber-soft": "text-amber-950",
  }
  const uClr: Record<string, string> = {
    white: "text-slate-400", bitters: "text-slate-500", ginger: "text-amber-100",
    slate: "text-slate-400", "amber-soft": "text-amber-400",
  }

  return (
    <div className={`rounded-2xl px-5 py-4 shadow-sm flex flex-col justify-between gap-3 ${styles[variant]}`}>
      <div>
        <p className={`text-[9px] font-black uppercase tracking-[0.18em] ${lClr[variant]}`}>{label}</p>
        {sub && <p className={`text-[9px] font-black uppercase tracking-wider mt-0.5 ${sClr[variant]}`}>{sub}</p>}
      </div>
      <div>
        <p className={`text-3xl font-black tabular-nums leading-none ${vClr[variant]}`}>
          {value.toLocaleString()}
        </p>
        <p className={`text-[9px] font-bold uppercase tracking-wider mt-1 ${uClr[variant]}`}>{unit}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend chart — matches "factory chart" style:
//   • Rotated date labels on X axis
//   • Dots always visible (r=3.5)
//   • Green-tinted dashed grid
//   • No area fills on main lines
//   • Tooltip on hover
// ─────────────────────────────────────────────────────────────────────────────
function TrendChart({
  data, filter, isMonthly, selMonth, selYear,
}: {
  data: KPIData["monthly_trend"]
  filter: Product
  isMonthly: boolean
  selMonth: number
  selYear: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  if (data.length < 2) return (
    <div className="py-12 text-center">
      <p className="text-xs text-slate-400 font-semibold">Not enough data for this period</p>
    </div>
  )

  // ── Chart geometry (matches pasted SVG proportions) ──
  const W = 800, H = 236
  const PL = 60, PR = 20, PT = 30, PB = 56
  const cW = W - PL - PR          // 720
  const cH = H - PT - PB          // 150
  const base = PT + cH            // 180
  const n = data.length

  const bitS = data.map(d => d.bitters)
  const ginS = data.map(d => d.ginger)
  const totS = data.map(d => d.total)

  const domainVals = [
    ...(filter !== "Ginger" ? bitS : []),
    ...(filter !== "Bitters" ? ginS : []),
    ...(filter === "all" ? totS : []),
  ]
  const rawMax = Math.max(...domainVals, 1)

  // Nice rounded grid maximum
  const gridMax = (() => {
    const m = rawMax * 1.08
    if (m <= 50) return Math.ceil(m / 10) * 10
    if (m <= 200) return Math.ceil(m / 25) * 25
    if (m <= 500) return Math.ceil(m / 50) * 50
    if (m <= 2000) return Math.ceil(m / 200) * 200
    if (m <= 5000) return Math.ceil(m / 500) * 500
    if (m <= 20000) return Math.ceil(m / 2000) * 2000
    return Math.ceil(m / 5000) * 5000
  })()
  const gridSteps = 5

  const xp = (i: number) => PL + (n > 1 ? i / (n - 1) : 0.5) * cW
  const yp = (v: number) => PT + cH - (v / gridMax) * cH

  const mkPolyline = (vals: number[]) =>
    vals.map((v, i) => `${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(" ")

  // ── X-axis label: "Mar 2" for monthly, month name for all-time ──
  const xLabel = (d: { month: string }): string => {
    if (isMonthly) {
      const num = parseInt(d.month, 10)
      return isNaN(num) ? d.month : `${MONTHS[selMonth - 1]} ${num}`
    }
    return d.month
  }

  // Skip crowded labels
  const shouldShowLabel = (i: number) => {
    if (n <= 12) return true
    if (n <= 20) return i % 2 === 0 || i === n - 1
    return i % Math.ceil(n / 15) === 0 || i === n - 1
  }

  const titleStr = isMonthly
    ? `Daily Trend — ${MONTHS[selMonth - 1]} ${selYear}`
    : "Monthly Trend"

  const fmtGrid = (val: number) =>
    val >= 1000 ? `${(val / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : val.toLocaleString()

  return (
    <div>
      {/* Header + Legend */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Production</p>
          <h3 className="text-sm font-black text-slate-900 mt-0.5">{titleStr}</h3>
        </div>
        <div className="flex items-center gap-5">
          {filter !== "Ginger" && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#111827]">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#111827] inline-block" />Bitters
            </span>
          )}
          {filter !== "Bitters" && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />Ginger
            </span>
          )}
          {filter === "all" && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />Total
            </span>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>

          {/* ── Horizontal grid lines + Y labels ── */}
          {Array.from({ length: gridSteps + 1 }).map((_, i) => {
            const y = PT + (i / gridSteps) * cH
            const val = Math.round(gridMax * (1 - i / gridSteps))
            return (
              <g key={i}>
                <line x1={PL} y1={y} x2={W - PR} y2={y}
                  stroke="#d1fae5" strokeWidth="1" strokeDasharray="4,4" />
                <text x={PL - 8} y={y + 4} textAnchor="end"
                  fontSize="10" fontWeight="500" fill="#6b7280">
                  {fmtGrid(val)}
                </text>
              </g>
            )
          })}

          {/* ── Polylines (no area fill — clean factory style) ── */}
          {filter !== "Ginger" && (
            <polyline points={mkPolyline(bitS)} fill="none"
              stroke="#111827" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          )}
          {filter !== "Bitters" && (
            <polyline points={mkPolyline(ginS)} fill="none"
              stroke="#ca8a04" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          )}
          {filter === "all" && (
            <polyline points={mkPolyline(totS)} fill="none"
              stroke="#10b981" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="5 3" />
          )}

          {/* ── Hover crosshair ── */}
          {hover !== null && (
            <line x1={xp(hover)} y1={PT} x2={xp(hover)} y2={base}
              stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 2" />
          )}

          {/* ── Dots + interactive hit areas ── */}
          {data.map((d, i) => (
            <g key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <rect x={xp(i) - 18} y={PT} width={36} height={cH}
                fill="transparent" className="cursor-default" />

              {filter !== "Ginger" && (
                <circle cx={xp(i)} cy={yp(bitS[i])}
                  r={hover === i ? 5 : 3.5}
                  fill="#111827"
                  stroke={hover === i ? "#fff" : "none"}
                  strokeWidth="2" />
              )}
              {filter !== "Bitters" && (
                <circle cx={xp(i)} cy={yp(ginS[i])}
                  r={hover === i ? 5 : 3.5}
                  fill="#ca8a04"
                  stroke={hover === i ? "#fff" : "none"}
                  strokeWidth="2" />
              )}
              {filter === "all" && (
                <circle cx={xp(i)} cy={yp(totS[i])}
                  r={hover === i ? 4 : 2.5}
                  fill="#10b981"
                  stroke={hover === i ? "#fff" : "none"}
                  strokeWidth="1.5" />
              )}
            </g>
          ))}

          {/* ── X-axis labels (rotated -45°) ── */}
          {data.map((d, i) => {
            if (!shouldShowLabel(i)) return null
            return (
              <text key={`xl-${i}`} x={xp(i)} y={base + 14} textAnchor="end"
                fontSize="9" fontWeight="500"
                fill={hover === i ? "#0f172a" : "#6b7280"}
                transform={`rotate(-45 ${xp(i)} ${base + 14})`}>
                {xLabel(d)}
              </text>
            )
          })}
        </svg>

        {/* ── Floating tooltip ── */}
        {hover !== null && (
          <div
            className="absolute top-0 pointer-events-none bg-slate-900/95 backdrop-blur-sm text-white rounded-xl px-3.5 py-2.5 shadow-2xl z-10"
            style={{
              left: `clamp(4px, calc(${n > 1 ? (hover / (n - 1)) * 100 : 50}% - 56px), calc(100% - 120px))`,
              minWidth: 112,
            }}
          >
            <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400 mb-2">
              {xLabel(data[hover])}
            </p>
            {filter !== "Ginger" && (
              <div className="flex justify-between items-center gap-4 text-[11px]">
                <span className="text-slate-400 font-semibold">Bitters</span>
                <span className="font-black tabular-nums">{data[hover].bitters.toLocaleString()}</span>
              </div>
            )}
            {filter !== "Bitters" && (
              <div className="flex justify-between items-center gap-4 text-[11px]">
                <span className="text-amber-400 font-semibold">Ginger</span>
                <span className="font-black tabular-nums">{data[hover].ginger.toLocaleString()}</span>
              </div>
            )}
            {filter === "all" && (
              <div className="flex justify-between items-center gap-4 text-[11px] border-t border-white/10 pt-1.5 mt-1.5">
                <span className="text-emerald-400 font-semibold">Total</span>
                <span className="font-black tabular-nums">{data[hover].total.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell — compact metric inside product panel
// ─────────────────────────────────────────────────────────────────────────────
function Cell({
  label, value, unit, icon: Icon, isBitters,
}: {
  label: string; value: number; unit: string; icon?: React.ElementType; isBitters: boolean
}) {
  const tk = isBitters ? BIT : GIN
  return (
    <div className={`rounded-xl px-4 py-3 flex flex-col gap-1 ${tk.soft}`}>
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className={`w-3 h-3 ${tk.iconClr} shrink-0`} />}
        <span className={`text-[9px] font-black uppercase tracking-widest ${tk.textMid}`}>{label}</span>
      </div>
      <span className={`text-xl font-black tabular-nums leading-none ${tk.textVal}`}>
        {value.toLocaleString()}
      </span>
      <span className={`text-[9px] font-bold uppercase tracking-wider ${isBitters ? "text-slate-400" : "text-amber-400"}`}>
        {unit}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dept panel
// ─────────────────────────────────────────────────────────────────────────────
function DeptPanel({ dept }: { dept: string }) {
  const [rows, setRows] = useState<DeptActivity[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (dept === "All Departments") { setRows([]); return }
    setLoading(true)
    Promise.all(
      (DEPT_TABLES[dept] || []).map(async ({ table, label }) => {
        try {
          const res = await fetch(`/api/admin/dept-activity?table=${table}`)
          if (!res.ok) return { table, label, count: 0, lastDate: null }
          const d = await res.json()
          return { table, label, count: d.count ?? 0, lastDate: d.lastDate ?? null }
        } catch { return { table, label, count: 0, lastDate: null } }
      })
    ).then(r => { setRows(r); setLoading(false) })
  }, [dept])

  if (dept === "All Departments" || rows.length === 0) return null

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mb-4">
        {dept} · Activity
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
          <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {rows.map(r => (
            <div key={r.table} className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{r.label}</p>
              <p className="text-xl font-black tabular-nums text-slate-900 mt-1">{r.count.toLocaleString()}</p>
              {r.lastDate && (
                <p className="text-[9px] font-semibold text-slate-400 mt-0.5">
                  {new Date(r.lastDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export function ManagerDashboard({ userId }: { userId: string }) {
  const [kpi, setKpi] = useState<KPIData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const now = new Date()
  const [period, setPeriod] = useState<Period>("all")
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [product, setProduct] = useState<Product>("all")
  const [dept, setDept] = useState("All Departments")

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
    setIsExporting(true)
    try {
      const res = await fetch("/api/records/export")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `lawson_production_${now.toISOString().split("T")[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { alert("Export failed") } finally { setIsExporting(false) }
  }

  const d = kpi
  const showB = product === "all" || product === "Bitters"
  const showG = product === "all" || product === "Ginger"
  const isMonthly = period === "month"
  const capsUsed = d ? (d.bitters_cartons + d.ginger_cartons) * 12 : 0
  const labB = d ? d.bitters_cartons * 12 : 0
  const labG = d ? d.ginger_cartons * 12 : 0
  const periodLabel = period === "all" ? "All Time" : `${MONTHS[selMonth - 1]} ${selYear}`

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        .dash { font-family: 'Instrument Sans', sans-serif; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .fu  { animation: fadeUp .3s ease both }
        .fu1 { animation-delay:.03s } .fu2 { animation-delay:.06s }
        .fu3 { animation-delay:.09s } .fu4 { animation-delay:.12s }
        .fu5 { animation-delay:.15s } .fu6 { animation-delay:.18s }
        .fu7 { animation-delay:.21s } .fu8 { animation-delay:.24s }
      `}</style>

      <div className="dash w-full bg-[#f7f7f5] min-h-screen -m-4 sm:-m-6 md:-m-10 px-4 sm:px-6 md:px-10 py-8">
        <div className="max-w-[1400px] mx-auto space-y-6">

          {/* ══ HEADER ══════════════════════════════════════════ */}
          <header className="fu flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="Lawson" width={48} height={48}
                className="rounded-xl bg-white p-1 ring-1 ring-slate-200 shrink-0" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Lawson Limited Company</p>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mt-0.5">
                  Manager Dashboard
                </h1>
                {d && (
                  <p className="text-[10px] font-semibold text-slate-400 mt-1 tabular-nums">
                    Updated {new Date(d.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    <span className="mx-1.5 opacity-30">·</span>{periodLabel}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => fetchKPIs()} disabled={refreshing}
                className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-sm">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-500" : ""}`} />
                Refresh
              </button>
              <button onClick={handleExport} disabled={isExporting}
                className="h-9 px-5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-sm">
                <Download className="w-3.5 h-3.5" />
                {isExporting ? "Exporting…" : "Export XLSX"}
              </button>
            </div>
          </header>

          {/* ══ FILTERS ═════════════════════════════════════════ */}
          <div className="fu fu1 flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-0.5 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
              {(["all", "month"] as Period[]).map(p => (
                <button key={p} onClick={() => { setPeriod(p); fetchKPIs(p) }}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all
                    ${period === p ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {p === "all" ? "All Time" : "Monthly"}
                </button>
              ))}
            </div>

            {period === "month" && (
              <>
                <div className="relative">
                  <select value={selMonth}
                    onChange={e => { setSelMonth(+e.target.value); fetchKPIs("month", selYear, +e.target.value) }}
                    className="appearance-none pl-3 pr-7 py-2 text-[11px] font-bold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm focus:outline-none cursor-pointer">
                    {MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select value={selYear}
                    onChange={e => { setSelYear(+e.target.value); fetchKPIs("month", +e.target.value, selMonth) }}
                    className="appearance-none pl-3 pr-7 py-2 text-[11px] font-bold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm focus:outline-none cursor-pointer">
                    {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y =>
                      <option key={y} value={y}>{y}</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                </div>
              </>
            )}

            <div className="flex items-center gap-0.5 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
              {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
                <button key={p} onClick={() => setProduct(p)}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all
                    ${product === p
                      ? p === "Bitters" ? "bg-[#111827] text-white shadow-sm"
                        : p === "Ginger" ? "bg-amber-500 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"}`}>
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="appearance-none pl-8 pr-7 py-2 text-[11px] font-bold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm focus:outline-none cursor-pointer">
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {dept !== "All Departments" && <DeptPanel dept={dept} />}

          {/* Error */}
          {error && !loading && (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm font-bold text-red-800 flex-1">{error}</p>
              <button onClick={() => fetchKPIs()}
                className="px-3 py-1.5 bg-white rounded-lg text-xs font-black text-red-600 border border-red-200 hover:bg-red-50 shrink-0">
                Retry
              </button>
            </div>
          )}

          {/* Skeleton */}
          {loading && (
            <div className="space-y-4">
              {[2, 3, 1, 5, 4].map((cols, row) => (
                <div key={row} className={`grid grid-cols-${Math.min(cols, 4)} sm:grid-cols-${cols} gap-3`}>
                  {Array.from({ length: cols }).map((_, i) => (
                    <div key={i} className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
                  ))}
                </div>
              ))}
              <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
            </div>
          )}

          {/* ══ DATA ════════════════════════════════════════════ */}
          {!loading && !error && d && (
            <div className="space-y-6">

              {/* ─── 1. AVAILABLE STOCK (live finished goods only) ── */}
              <section className="fu fu2">
                <SectionLabel title="Available Stock" sub="Live Inventory" />
                <div className="grid grid-cols-2 gap-3">
                  {showB && <Tile label="Live Stock" sub="Bitters" value={d.live_bitters_stock} unit="Cartons" variant="bitters" />}
                  {showG && <Tile label="Live Stock" sub="Ginger" value={d.live_ginger_stock} unit="Cartons" variant="ginger" />}
                </div>
              </section>

              {/* ─── 2. PRODUCTION OUTPUT (with sparklines) ──────── */}
              <section className="fu fu3">
                <SectionLabel title="Production Output" sub="Cartons Produced" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

                  {/* Total */}
                  <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-5 py-4 flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Total</p>
                      <TrendingUp className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-3xl font-black tabular-nums text-slate-900 leading-none">
                          {d.total_production_cartons.toLocaleString()}
                        </p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Cartons</p>
                      </div>
                      <Sparkline
                        data={d.monthly_trend.map(t => t.total)}
                        color="#64748b"
                        gradId="spark-total"
                      />
                    </div>
                  </div>

                  {/* Bitters */}
                  {showB && (
                    <div className="rounded-2xl bg-[#111827] shadow-sm px-5 py-4 flex flex-col justify-between gap-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Bitters</p>
                        {d.total_production_cartons > 0 && (
                          <span className="text-[9px] font-black text-slate-500 bg-white/10 px-2 py-0.5 rounded-full tabular-nums">
                            {((d.bitters_cartons / d.total_production_cartons) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-3xl font-black tabular-nums text-white leading-none">
                            {d.bitters_cartons.toLocaleString()}
                          </p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1">Cartons</p>
                        </div>
                        <Sparkline
                          data={d.monthly_trend.map(t => t.bitters)}
                          color="rgba(255,255,255,0.5)"
                          gradId="spark-bitters"
                        />
                      </div>
                    </div>
                  )}

                  {/* Ginger */}
                  {showG && (
                    <div className="rounded-2xl bg-amber-500 shadow-sm px-5 py-4 flex flex-col justify-between gap-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-100">Ginger</p>
                        {d.total_production_cartons > 0 && (
                          <span className="text-[9px] font-black text-amber-200 bg-white/20 px-2 py-0.5 rounded-full tabular-nums">
                            {((d.ginger_cartons / d.total_production_cartons) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-3xl font-black tabular-nums text-white leading-none">
                            {d.ginger_cartons.toLocaleString()}
                          </p>
                          <p className="text-[9px] font-bold text-amber-100 uppercase tracking-wider mt-1">Cartons</p>
                        </div>
                        <Sparkline
                          data={d.monthly_trend.map(t => t.ginger)}
                          color="rgba(255,255,255,0.6)"
                          gradId="spark-ginger"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ─── 3. TREND CHART ──────────────────────────────── */}
              <section className="fu fu4">
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 sm:p-6">
                  <TrendChart
                    data={d.monthly_trend}
                    filter={product}
                    isMonthly={isMonthly}
                    selMonth={selMonth}
                    selYear={selYear}
                  />
                </div>
              </section>

              {/* ─── 4. REMAINING QUANTITY (includes balances) ──── */}
              <section className="fu fu5">
                <SectionLabel title="Remaining Quantity" sub="Current Stock Levels" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <Tile label="Alcohol Balance" value={d.current_alcohol_balance} unit="Litres" variant="white" />
                  <Tile label="Caps Remaining"  value={d.caps_remaining}          unit="Units"  variant="white" />
                  <Tile label="Preforms Balance" value={d.current_preform_balance} unit="Bags"   variant="white" />
                  {showB && <Tile label="Labels"  sub="Bitters" value={d.labels_bitters_remaining}  unit="Units"   variant="slate" />}
                  {showG && <Tile label="Labels"  sub="Ginger"  value={d.labels_ginger_remaining}   unit="Units"   variant="amber-soft" />}
                  {showB && <Tile label="Caramel" sub="Bitters" value={d.caramel_bitters_remaining} unit="Gallons" variant="slate" />}
                  {showG && <Tile label="Caramel" sub="Ginger"  value={d.caramel_ginger_remaining}  unit="Gallons" variant="amber-soft" />}
                </div>
              </section>

              {/* ─── 5. QUANTITY USED ────────────────────────────── */}
              <section className="fu fu6">
                <SectionLabel title="Quantity Used" sub="Consumed This Period" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <Tile label="Alcohol Used"  value={d.total_alcohol_used_litres} unit="Litres" variant="white" />
                  <Tile label="Preforms Used" value={d.total_preforms_used}       unit="Bags"   variant="white" />
                  <Tile label="Caps Used"     value={d.total_caps_used}           unit="Units"  variant="white" />
                  {showB && <Tile label="Labels Used" sub="Bitters" value={d.total_labels_bitters_used} unit="Units" variant="slate" />}
                  {showG && <Tile label="Labels Used" sub="Ginger"  value={d.total_labels_ginger_used}  unit="Units" variant="amber-soft" />}
                  {showB && <Tile label="Bottles"     sub="Bitters" value={d.total_bottles_bitters}     unit="Units" variant="slate" />}
                  {showG && <Tile label="Bottles"     sub="Ginger"  value={d.total_bottles_ginger}      unit="Units" variant="amber-soft" />}
                </div>
              </section>

              {/* ─── 6. RAW MATERIALS — product panels ───────────── */}
              <section className="fu fu7">
                <SectionLabel title="Raw Materials" sub="Production Inputs" />
                <div className={`grid gap-5 ${showB && showG ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>

                  {showB && (
                    <div className="rounded-2xl overflow-hidden border border-[#1f2937]">
                      <div className="bg-[#111827] px-6 py-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                            <FlaskConical className="w-[18px] h-[18px] text-white" />
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">Product Line</p>
                            <h3 className="text-base font-black text-white">Bitters</h3>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-white tabular-nums">{d.bitters_cartons.toLocaleString()}</p>
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Cartons</p>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        <Cell label="Alcohol"     value={d.alcohol_used_for_bitters_drums} unit="Drums"   icon={Droplet}      isBitters />
                        <Cell label="Concentrate" value={d.total_concentrate_used_litres}  unit="Litres"                      isBitters />
                        <Cell label="Spices"      value={d.total_spices_used_litres}       unit="Litres"                      isBitters />
                        <Cell label="Caramel"     value={d.total_caramel_used_gallons}     unit="Gallons" icon={FlaskConical} isBitters />
                        <Cell label="Water"       value={d.total_water_litres}             unit="Litres"  icon={Droplet}      isBitters />
                        <Cell label="Labels"      value={labB}                             unit="Units"   icon={Tag}          isBitters />
                        <Cell label="Caps"        value={capsUsed}                         unit="Units"   icon={Box}          isBitters />
                        <Cell label="Bottles"     value={d.total_bottles_bitters}          unit="Units"   icon={Package}      isBitters />
                      </div>
                    </div>
                  )}

                  {showG && (
                    <div className="rounded-2xl overflow-hidden border border-amber-400">
                      <div className="bg-amber-500 px-6 py-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                            <FlaskConical className="w-[18px] h-[18px] text-white" />
                          </div>
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-amber-100">Product Line</p>
                            <h3 className="text-base font-black text-white">Ginger</h3>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-white tabular-nums">{d.ginger_cartons.toLocaleString()}</p>
                          <p className="text-[8px] font-black uppercase tracking-widest text-amber-100">Cartons</p>
                        </div>
                      </div>
                      <div className="bg-amber-50 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        <Cell label="Alcohol"   value={d.alcohol_used_for_ginger_drums} unit="Drums"   icon={Droplet}      isBitters={false} />
                        <Cell label="Water"     value={d.ginger_water_used_litres}      unit="Litres"  icon={Droplet}      isBitters={false} />
                        <Cell label="G/T Juice" value={d.ginger_gt_juice_litres}        unit="Litres"                      isBitters={false} />
                        <Cell label="Spices"    value={d.ginger_spices_used_litres}     unit="Litres"                      isBitters={false} />
                        <Cell label="Caramel"   value={d.ginger_caramel_used_gallons}   unit="Gallons" icon={FlaskConical} isBitters={false} />
                        <Cell label="Labels"    value={labG}                            unit="Units"   icon={Tag}          isBitters={false} />
                        <Cell label="Bottles"   value={d.total_bottles_ginger}          unit="Units"   icon={Package}      isBitters={false} />
                      </div>
                    </div>
                  )}
                </div>
              </section>

            </div>
          )}

          {/* No data */}
          {!loading && !error && !d && (
            <div className="rounded-2xl bg-white border border-slate-200 p-14 text-center shadow-sm">
              <p className="text-slate-500 font-semibold text-sm">No data available</p>
              <button onClick={() => fetchKPIs()}
                className="mt-4 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition-colors shadow-sm">
                Load Data
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
