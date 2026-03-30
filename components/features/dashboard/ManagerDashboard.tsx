"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, AlertCircle, ChevronDown, Filter,
} from "lucide-react"
import Image from "next/image"

// ─────────────────────────────────────────────────────────────────────────────
//  Brand tokens
//  Bitters = near-black  |  Ginger = amber-gold
// ─────────────────────────────────────────────────────────────────────────────
const BIT = {
  bg:       "bg-[#111827]",
  bgHover:  "hover:bg-[#1f2937]",
  border:   "border-[#111827]",
  text:     "text-[#111827]",
  textOn:   "text-white",
  muted:    "text-slate-400",
  accent:   "#111827",
  bar:      "bg-[#111827]",
  soft:     "bg-slate-100",
  softText: "text-slate-700",
  ring:     "ring-[#111827]/20",
  label:    "Bitters",
}
const GIN = {
  bg:       "bg-amber-500",
  bgHover:  "hover:bg-amber-600",
  border:   "border-amber-500",
  text:     "text-amber-600",
  textOn:   "text-white",
  muted:    "text-amber-800",
  accent:   "#d97706",
  bar:      "bg-amber-500",
  soft:     "bg-amber-50",
  softText: "text-amber-900",
  ring:     "ring-amber-500/20",
  label:    "Ginger",
}

type Product = "all" | "Bitters" | "Ginger"
type Period  = "all" | "month"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

const DEPARTMENTS = [
  "All Departments","Blowing","Alcohol and Blending","Filling Line","Packaging","Concentrate",
]
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

// ─────────────────────────────────────────────────────────────────────────────
//  Inline chart — tight, no external libs
// ─────────────────────────────────────────────────────────────────────────────
function LineChart({
  data, filter,
}: {
  data: KPIData["monthly_trend"]
  filter: Product
}) {
  const [hover, setHover] = useState<number | null>(null)
  if (data.length < 2) return (
    <p className="text-xs text-slate-400 font-medium text-center py-8">Not enough data</p>
  )

  const W = 680, H = 160, PL = 40, PR = 12, PT = 12, PB = 24
  const cW = W - PL - PR, cH = H - PT - PB

  const bitS = data.map(d => d.bitters)
  const ginS = data.map(d => d.ginger)
  const allVals = [
    ...(filter !== "Ginger" ? bitS : []),
    ...(filter !== "Bitters" ? ginS : []),
  ]
  const maxV = Math.max(...allVals, 1)

  const xp = (i: number) => PL + (i / (data.length - 1)) * cW
  const yp = (v: number) => PT + cH - (v / maxV) * cH

  const line = (vals: number[], clr: string) => {
    const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(" ")
    return <path d={d} fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 280 }}>
        {/* Gridlines */}
        {[0, 0.5, 1].map((f, i) => (
          <line key={i}
            x1={PL} y1={PT + f * cH} x2={W - PR} y2={PT + f * cH}
            stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 3"
          />
        ))}
        {/* X labels */}
        {data.map((d, i) => (
          <text key={i} x={xp(i)} y={H - 4}
            textAnchor="middle" fontSize="9" fontWeight="600"
            fill={hover === i ? "#0f172a" : "#94a3b8"}>
            {d.month}
          </text>
        ))}
        {/* Lines */}
        {filter !== "Ginger"  && line(bitS, BIT.accent)}
        {filter !== "Bitters" && line(ginS, GIN.accent)}
        {/* Hit areas + dots */}
        {data.map((d, i) => (
          <g key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default"
          >
            <rect x={xp(i) - 16} y={PT} width={32} height={cH} fill="transparent" />
            {filter !== "Ginger" && (
              <circle cx={xp(i)} cy={yp(bitS[i])} r={hover === i ? 5 : 3}
                fill={BIT.accent} stroke="#fff" strokeWidth="2" />
            )}
            {filter !== "Bitters" && (
              <circle cx={xp(i)} cy={yp(ginS[i])} r={hover === i ? 5 : 3}
                fill={GIN.accent} stroke="#fff" strokeWidth="2" />
            )}
            {hover === i && (
              <line x1={xp(i)} y1={PT} x2={xp(i)} y2={PT + cH}
                stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 2" />
            )}
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hover !== null && (
        <div
          className="absolute top-0 pointer-events-none bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-xl z-10"
          style={{
            left: `clamp(4px, calc(${(hover / (data.length - 1)) * 100}% - 52px), calc(100% - 112px))`,
            minWidth: 100,
          }}
        >
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
            {data[hover].month}
          </p>
          {filter !== "Ginger" && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-400 font-semibold">Bitters</span>
              <span className="font-black tabular-nums">{data[hover].bitters.toLocaleString()}</span>
            </div>
          )}
          {filter !== "Bitters" && (
            <div className="flex justify-between gap-3">
              <span className="text-amber-400 font-semibold">Ginger</span>
              <span className="font-black tabular-nums">{data[hover].ginger.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Stat cell — compact, used inside product panels
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
        {Icon && <Icon className={`w-3 h-3 ${isBitters ? "text-slate-400" : "text-amber-400"} shrink-0`} />}
        <span className={`text-[9px] font-black uppercase tracking-widest ${isBitters ? "text-slate-500" : "text-amber-700"}`}>
          {label}
        </span>
      </div>
      <span className={`text-xl font-black tabular-nums leading-none ${isBitters ? "text-slate-900" : "text-amber-950"}`}>
        {value.toLocaleString()}
      </span>
      <span className={`text-[9px] font-bold uppercase tracking-wider ${isBitters ? "text-slate-400" : "text-amber-500"}`}>
        {unit}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared material row
// ─────────────────────────────────────────────────────────────────────────────
function MatRow({
  label, value, unit, icon: Icon, last = false,
}: {
  label: string; value: number; unit: string; icon?: React.ElementType; last?: boolean
}) {
  return (
    <div className={`flex items-center justify-between py-3 ${!last ? "border-b border-slate-100" : ""}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-black tabular-nums text-slate-900">{value.toLocaleString()}</span>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{unit}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  Dept panel
// ─────────────────────────────────────────────────────────────────────────────
function DeptPanel({ dept }: { dept: string }) {
  const [rows, setRows]       = useState<DeptActivity[]>([])
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
          return { table, label, count: d.count ?? 0, lastDate: d.lastDate ?? null }
        } catch { return { table, label, count: 0, lastDate: null } }
      })
    ).then(r => { setRows(r); setLoading(false) })
  }, [dept])

  if (dept === "All Departments" || rows.length === 0) return null

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400 mb-4">
        {dept} · Activity
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
          <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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
//  Main
// ─────────────────────────────────────────────────────────────────────────────
export function ManagerDashboard({ userId }: { userId: string }) {
  const [kpi, setKpi]               = useState<KPIData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState<string | null>(null)
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

  const d     = kpi
  const showB = product === "all" || product === "Bitters"
  const showG = product === "all" || product === "Ginger"
  const capsUsed = d ? (d.bitters_cartons + d.ginger_cartons) * 12 : 0
  const labB  = d ? d.bitters_cartons * 12 : 0
  const labG  = d ? d.ginger_cartons  * 12 : 0

  const periodLabel = period === "all" ? "All time" :
    `${MONTHS[selMonth - 1]} ${selYear}`

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap');
        .dash { font-family: 'Instrument Sans', sans-serif; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        .fu  { animation: fadeUp .35s ease both }
        .fu1 { animation-delay:.04s }
        .fu2 { animation-delay:.08s }
        .fu3 { animation-delay:.12s }
        .fu4 { animation-delay:.16s }
        .fu5 { animation-delay:.20s }
        .fu6 { animation-delay:.24s }
      `}</style>

      <div className="dash w-full bg-[#f7f7f5] min-h-screen -m-4 sm:-m-6 md:-m-10 px-4 sm:px-6 md:px-10 py-8">
        <div className="max-w-[1400px] mx-auto space-y-5">

          {/* ── Top bar ──────────────────────────────────────────────── */}
          <header className="fu flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="Lawson" width={48} height={48}
                className="rounded-xl shrink-0 bg-white p-1 ring-1 ring-slate-200" />
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Lawson Limited Company</p>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mt-0.5">
                  Manager Dashboard
                </h1>
                {d && (
                  <p className="text-[10px] font-semibold text-slate-400 mt-1 tabular-nums">
                    Updated {new Date(d.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    <span className="mx-1.5 opacity-40">·</span>
                    {periodLabel}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => fetchKPIs()} disabled={refreshing}
                className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 transition-colors disabled:opacity-50 shadow-sm">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-500" : ""}`} />
                Refresh
              </button>
              <button onClick={handleExport} disabled={isExporting}
                className="h-9 px-4 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-sm">
                <Download className="w-3.5 h-3.5" />
                {isExporting ? "Exporting…" : "Export XLSX"}
              </button>
            </div>
          </header>

          {/* ── Filter row ───────────────────────────────────────────── */}
          <div className="fu fu1 flex flex-wrap gap-2">
            {/* Period */}
            <div className="flex items-center gap-0.5 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
              {(["all", "month"] as Period[]).map(p => (
                <button key={p} onClick={() => { setPeriod(p); fetchKPIs(p) }}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all
                    ${period === p ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {p === "all" ? "All Time" : "Monthly"}
                </button>
              ))}
            </div>

            {/* Month/year */}
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

            {/* Product */}
            <div className="flex items-center gap-0.5 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
              {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
                <button key={p} onClick={() => setProduct(p)}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all
                    ${product === p
                      ? p === "Bitters" ? "bg-[#111827] text-white shadow-sm"
                        : p === "Ginger" ? "bg-amber-500 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                    }`}>
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>

            {/* Dept */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="appearance-none pl-8 pr-7 py-2 text-[11px] font-bold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm focus:outline-none cursor-pointer">
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* ── Dept activity ────────────────────────────────────────── */}
          {dept !== "All Departments" && <DeptPanel dept={dept} />}

          {/* ── Error ────────────────────────────────────────────────── */}
          {error && !loading && (
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm font-bold text-red-800 flex-1">{error}</p>
              <button onClick={() => fetchKPIs()}
                className="px-3 py-1.5 bg-white rounded-lg text-xs font-black text-red-600 border border-red-200 hover:bg-red-50 transition-colors shrink-0">
                Retry
              </button>
            </div>
          )}

          {/* ── Skeleton ─────────────────────────────────────────────── */}
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-slate-200 animate-pulse" />
              ))}
            </div>
          )}

          {/* ── DATA ─────────────────────────────────────────────────── */}
          {!loading && !error && d && (
            <div className="space-y-5">

              {/* ── 1. Hero summary strip ──────────────────────────── */}
              <div className="fu fu2 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total */}
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-5 py-4 flex flex-col justify-between gap-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Total Output</p>
                  <div>
                    <p className="text-3xl font-black tabular-nums text-slate-900 leading-none">
                      {d.total_production_cartons.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Cartons</p>
                  </div>
                </div>

                {/* Bitters hero */}
                <div className="rounded-2xl bg-[#111827] shadow-sm px-5 py-4 flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Bitters</p>
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 bg-white/10 px-2 py-0.5 rounded-full">
                      {d.total_production_cartons > 0
                        ? `${((d.bitters_cartons / d.total_production_cartons) * 100).toFixed(0)}%`
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <p className="text-3xl font-black tabular-nums text-white leading-none">
                      {d.bitters_cartons.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1">Cartons</p>
                  </div>
                </div>

                {/* Ginger hero */}
                <div className="rounded-2xl bg-amber-500 shadow-sm px-5 py-4 flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-100">Ginger</p>
                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-200 bg-white/20 px-2 py-0.5 rounded-full">
                      {d.total_production_cartons > 0
                        ? `${((d.ginger_cartons / d.total_production_cartons) * 100).toFixed(0)}%`
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <p className="text-3xl font-black tabular-nums text-white leading-none">
                      {d.ginger_cartons.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-bold text-amber-100 uppercase tracking-wider mt-1">Cartons</p>
                  </div>
                </div>

                {/* Alcohol balance */}
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-5 py-4 flex flex-col justify-between gap-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Alcohol Balance</p>
                  <div>
                    <p className="text-3xl font-black tabular-nums text-slate-900 leading-none">
                      {d.current_alcohol_balance.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Litres</p>
                  </div>
                </div>
              </div>

              {/* ── 2. Trend chart ────────────────────────────────── */}
              <div className="fu fu3 rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
                      {period === "month" ? "Daily" : "Monthly"} Trend
                    </p>
                    <h3 className="text-sm font-black text-slate-900 mt-0.5">Production Over Time</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    {product !== "Ginger" && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-0.5 rounded bg-[#111827] inline-block" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Bitters</span>
                      </div>
                    )}
                    {product !== "Bitters" && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-0.5 rounded bg-amber-500 inline-block" />
                        <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Ginger</span>
                      </div>
                    )}
                  </div>
                </div>
                <LineChart data={d.monthly_trend} filter={product} />
              </div>

              {/* ── 3. Live stock + remaining materials ────────────── */}
              <div className="fu fu4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Live stock Bitters */}
                {showB && (
                  <div className="rounded-2xl bg-[#111827] shadow-sm px-5 py-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Live Stock</p>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 mt-0.5">Bitters</p>
                    <p className="text-3xl font-black tabular-nums text-white mt-2 leading-none">
                      {d.live_bitters_stock.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mt-1">Cartons</p>
                  </div>
                )}
                {/* Live stock Ginger */}
                {showG && (
                  <div className="rounded-2xl bg-amber-500 shadow-sm px-5 py-4">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-100">Live Stock</p>
                    <p className="text-[9px] font-black uppercase tracking-wider text-amber-200 mt-0.5">Ginger</p>
                    <p className="text-3xl font-black tabular-nums text-white mt-2 leading-none">
                      {d.live_ginger_stock.toLocaleString()}
                    </p>
                    <p className="text-[9px] font-bold text-amber-100 uppercase tracking-wider mt-1">Cartons</p>
                  </div>
                )}
                {/* Caps */}
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-5 py-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Caps Remaining</p>
                  <p className="text-3xl font-black tabular-nums text-slate-900 mt-2 leading-none">
                    {d.caps_remaining.toLocaleString()}
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Units</p>
                </div>
                {/* Preforms */}
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm px-5 py-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Preforms Balance</p>
                  <p className="text-3xl font-black tabular-nums text-slate-900 mt-2 leading-none">
                    {d.current_preform_balance.toLocaleString()}
                  </p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Bags</p>
                </div>
              </div>

              {/* ── 4. Labels & Caramel remaining ────────────────── */}
              {(showB || showG) && (
                <div className="fu fu5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {showB && (
                    <div className="rounded-2xl bg-slate-100 px-5 py-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Labels Remaining</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5">Bitters</p>
                      <p className="text-2xl font-black tabular-nums text-slate-900 mt-2 leading-none">
                        {d.labels_bitters_remaining.toLocaleString()}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Units</p>
                    </div>
                  )}
                  {showG && (
                    <div className="rounded-2xl bg-amber-50 border border-amber-100 px-5 py-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-amber-600">Labels Remaining</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-amber-400 mt-0.5">Ginger</p>
                      <p className="text-2xl font-black tabular-nums text-amber-950 mt-2 leading-none">
                        {d.labels_ginger_remaining.toLocaleString()}
                      </p>
                      <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider mt-1">Units</p>
                    </div>
                  )}
                  {showB && (
                    <div className="rounded-2xl bg-slate-100 px-5 py-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-500">Caramel Remaining</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5">Bitters</p>
                      <p className="text-2xl font-black tabular-nums text-slate-900 mt-2 leading-none">
                        {d.caramel_bitters_remaining.toLocaleString()}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">Gallons</p>
                    </div>
                  )}
                  {showG && (
                    <div className="rounded-2xl bg-amber-50 border border-amber-100 px-5 py-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-amber-600">Caramel Remaining</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-amber-400 mt-0.5">Ginger</p>
                      <p className="text-2xl font-black tabular-nums text-amber-950 mt-2 leading-none">
                        {d.caramel_ginger_remaining.toLocaleString()}
                      </p>
                      <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider mt-1">Gallons</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── 5. Shared consumption ──────────────────────────── */}
              <div className="fu fu6 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Shared Inputs</p>
                  <h3 className="text-sm font-black text-slate-900 mt-0.5">Material Consumption</h3>
                </div>
                <div className="px-5">
                  <MatRow label="Alcohol Used"  value={d.total_alcohol_used_litres} unit="Litres" icon={Droplet} />
                  <MatRow label="Preforms Used" value={d.total_preforms_used}       unit="Bags"   icon={Package} />
                  <MatRow label="Caps Used"     value={d.total_caps_used}           unit="Units"  icon={Box}     last />
                </div>
              </div>

              {/* ── 6. Product panels side-by-side ────────────────── */}
              <div className={`grid gap-5 ${showB && showG ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>

                {/* Bitters panel */}
                {showB && (
                  <div className="rounded-2xl overflow-hidden border border-[#1f2937]">
                    {/* Header */}
                    <div className="bg-[#111827] px-6 py-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                          <FlaskConical className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Product Line</p>
                          <h3 className="text-base font-black text-white leading-tight">Bitters</h3>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-white tabular-nums">
                          {d.bitters_cartons.toLocaleString()}
                        </p>
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Cartons</p>
                      </div>
                    </div>
                    {/* Cells */}
                    <div className="bg-slate-50 p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <Cell label="Alcohol"    value={d.alcohol_used_for_bitters_drums}  unit="Drums"   icon={Droplet}      isBitters />
                      <Cell label="Concentrate" value={d.total_concentrate_used_litres}  unit="Litres"                      isBitters />
                      <Cell label="Spices"     value={d.total_spices_used_litres}        unit="Litres"                      isBitters />
                      <Cell label="Caramel"    value={d.total_caramel_used_gallons}      unit="Gallons" icon={FlaskConical} isBitters />
                      <Cell label="Water"      value={d.total_water_litres}              unit="Litres"  icon={Droplet}      isBitters />
                      <Cell label="Labels"     value={labB}                              unit="Units"   icon={Tag}          isBitters />
                      <Cell label="Caps"       value={capsUsed}                          unit="Units"   icon={Box}          isBitters />
                      <Cell label="Bottles"    value={d.total_bottles_bitters}           unit="Units"   icon={Package}      isBitters />
                    </div>
                  </div>
                )}

                {/* Ginger panel */}
                {showG && (
                  <div className="rounded-2xl overflow-hidden border border-amber-400">
                    {/* Header */}
                    <div className="bg-amber-500 px-6 py-5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                          <FlaskConical className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-100">Product Line</p>
                          <h3 className="text-base font-black text-white leading-tight">Ginger</h3>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-white tabular-nums">
                          {d.ginger_cartons.toLocaleString()}
                        </p>
                        <p className="text-[8px] font-black uppercase tracking-widest text-amber-100">Cartons</p>
                      </div>
                    </div>
                    {/* Cells */}
                    <div className="bg-amber-50 p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <Cell label="Alcohol"  value={d.alcohol_used_for_ginger_drums} unit="Drums"   icon={Droplet}      isBitters={false} />
                      <Cell label="Water"    value={d.ginger_water_used_litres}      unit="Litres"  icon={Droplet}      isBitters={false} />
                      <Cell label="G/T Juice" value={d.ginger_gt_juice_litres}       unit="Litres"                      isBitters={false} />
                      <Cell label="Spices"   value={d.ginger_spices_used_litres}     unit="Litres"                      isBitters={false} />
                      <Cell label="Caramel"  value={d.ginger_caramel_used_gallons}   unit="Gallons" icon={FlaskConical} isBitters={false} />
                      <Cell label="Labels"   value={labG}                            unit="Units"   icon={Tag}          isBitters={false} />
                      <Cell label="Bottles"  value={d.total_bottles_ginger}          unit="Units"   icon={Package}      isBitters={false} />
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* No data */}
          {!loading && !error && !d && (
            <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center">
              <p className="text-slate-500 font-semibold text-sm">No data available</p>
              <button onClick={() => fetchKPIs()}
                className="mt-4 px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition-colors">
                Load Data
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
