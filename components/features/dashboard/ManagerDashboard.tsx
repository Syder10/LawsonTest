"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertTriangle, BarChart3, Layers,
  Filter, ArrowUpRight, ArrowDownRight, Minus, Calendar,
  Activity, ChevronDown
} from "lucide-react"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

// ── Design Tokens ──────────────────────────────────────────────────────────
// Bitters = obsidian/black   Ginger = amber/yellow   Shared = slate

const T = {
  bitters: {
    bg:        "bg-[#0f0f0f]",
    bgSoft:    "bg-neutral-900/5",
    bgPill:    "bg-neutral-900",
    border:    "border-neutral-800/30",
    borderSoft:"border-neutral-200",
    text:      "text-neutral-900",
    textOn:    "text-white",
    textMuted: "text-neutral-500",
    badge:     "bg-neutral-900 text-white",
    badgeSoft: "bg-neutral-100 text-neutral-800",
    dot:       "bg-neutral-800",
    ring:      "ring-neutral-900/20",
    accent:    "#0f0f0f",
    accentMid: "#525252",
    gradBar:   "from-neutral-700 to-neutral-900",
    section:   "border-l-4 border-neutral-900 pl-4",
    cardHover: "hover:border-neutral-300 hover:shadow-neutral-100/60",
  },
  ginger: {
    bg:        "bg-amber-400",
    bgSoft:    "bg-amber-400/8",
    bgPill:    "bg-amber-400",
    border:    "border-amber-300/50",
    borderSoft:"border-amber-200",
    text:      "text-amber-950",
    textOn:    "text-amber-950",
    textMuted: "text-amber-700/70",
    badge:     "bg-amber-400 text-amber-950",
    badgeSoft: "bg-amber-50 text-amber-800",
    dot:       "bg-amber-400",
    ring:      "ring-amber-400/25",
    accent:    "#f59e0b",
    accentMid: "#fbbf24",
    gradBar:   "from-amber-300 to-amber-500",
    section:   "border-l-4 border-amber-400 pl-4",
    cardHover: "hover:border-amber-300 hover:shadow-amber-50",
  },
  shared: {
    bg:        "bg-emerald-600",
    bgSoft:    "bg-emerald-50",
    border:    "border-emerald-200",
    text:      "text-slate-900",
    badge:     "bg-emerald-50 text-emerald-800 border border-emerald-200",
    accent:    "#059669",
    gradBar:   "from-emerald-400 to-emerald-600",
    cardHover: "hover:border-emerald-200 hover:shadow-emerald-50",
  },
}

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

const MONTH_MAP: Record<string, number> = {
  "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
  "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
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

// ── KPI Metric Card ────────────────────────────────────────────────────────
function MetricCard({
  label, value, unit, icon: Icon, product, trend,
}: {
  label: string; value: number; unit?: string
  icon?: React.ElementType; product?: "Bitters" | "Ginger" | "shared"
  trend?: "up" | "down" | "flat"
}) {
  const isB = product === "Bitters"
  const isG = product === "Ginger"
  const TIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus
  const trendCls = trend === "up"
    ? "text-emerald-600 bg-emerald-50"
    : trend === "down" ? "text-red-500 bg-red-50"
    : "text-slate-400 bg-slate-50"

  return (
    <div className={`
      relative bg-white rounded-2xl border p-5 flex flex-col gap-4
      shadow-sm transition-all duration-200 overflow-hidden
      hover:shadow-md hover:-translate-y-0.5 cursor-default
      ${isB ? "border-neutral-200 hover:border-neutral-300" : ""}
      ${isG ? "border-amber-200/60 hover:border-amber-300" : ""}
      ${!isB && !isG ? "border-slate-200 hover:border-slate-300" : ""}
    `}>
      {/* Product color strip — top edge */}
      {isB && <div className="absolute top-0 inset-x-0 h-[3px] bg-neutral-900 rounded-t-2xl" />}
      {isG && <div className="absolute top-0 inset-x-0 h-[3px] bg-amber-400 rounded-t-2xl" />}

      <div className="flex items-start justify-between mt-0.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
          ${isB ? "bg-neutral-100 text-neutral-600" : ""}
          ${isG ? "bg-amber-100 text-amber-700" : ""}
          ${!isB && !isG ? "bg-slate-100 text-slate-500" : ""}
        `}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-black ${trendCls}`}>
            <TIcon className="w-3 h-3" />
          </span>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 mb-1 leading-tight">{label}</p>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <p className={`text-2xl font-black tabular-nums tracking-tight leading-none
            ${isB ? "text-neutral-900" : isG ? "text-amber-950" : "text-slate-900"}
          `}>
            {value.toLocaleString()}
          </p>
          {unit && <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{unit}</p>}
        </div>
      </div>
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────
function SectionHeader({
  title, sub, badge, product,
}: {
  title: string; sub?: string; badge?: string | number; product?: "Bitters" | "Ginger"
}) {
  return (
    <div className="flex items-center gap-4 mb-5">
      <div className={`w-1 h-8 rounded-full shrink-0
        ${product === "Bitters" ? "bg-neutral-900" : product === "Ginger" ? "bg-amber-400" : "bg-emerald-500"}`}
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest leading-none">{title}</h3>
        {sub && <p className="text-[11px] text-slate-400 font-semibold mt-1">{sub}</p>}
      </div>
      {badge != null && (
        <span className={`text-xs font-black px-3 py-1.5 rounded-xl
          ${product === "Bitters" ? "bg-neutral-900 text-white" : ""}
          ${product === "Ginger" ? "bg-amber-400 text-amber-950" : ""}
          ${!product ? "bg-slate-100 text-slate-700 border border-slate-200" : ""}
        `}>
          {typeof badge === "number" ? badge.toLocaleString() : badge}
        </span>
      )}
    </div>
  )
}

// ── Split Production Banner ────────────────────────────────────────────────
function ProductionSplit({ bitters, ginger }: { bitters: number; ginger: number }) {
  const total = bitters + ginger
  const bPct  = total > 0 ? Math.round((bitters / total) * 100) : 50
  const gPct  = 100 - bPct

  return (
    <div className="rounded-3xl overflow-hidden border border-slate-200 shadow-sm flex flex-col sm:flex-row">
      {/* Bitters half */}
      <div className="flex-1 bg-neutral-950 px-7 py-6 flex flex-col justify-between relative overflow-hidden min-h-[140px]">
        <div className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, white 0, white 1px, transparent 0, transparent 50%)", backgroundSize: "8px 8px" }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-white/25" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Bitters</span>
          </div>
          <p className="text-4xl sm:text-5xl font-black text-white tabular-nums tracking-tight leading-none">
            {bitters.toLocaleString()}
          </p>
          <p className="text-white/40 text-xs font-bold mt-2 uppercase tracking-widest">Cartons Produced</p>
        </div>
        <div className="relative z-10 mt-4">
          <div className="flex items-end justify-between">
            <span className="text-[10px] font-black text-white/25 uppercase tracking-widest">Share</span>
            <span className="text-4xl font-black text-white/10 select-none tabular-nums">{bPct}%</span>
          </div>
          <div className="h-1 w-full bg-white/10 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-white/30 rounded-full" style={{ width: `${bPct}%` }} />
          </div>
        </div>
      </div>

      {/* Ginger half */}
      <div className="flex-1 bg-amber-400 px-7 py-6 flex flex-col justify-between relative overflow-hidden min-h-[140px]">
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "repeating-linear-gradient(-45deg, rgba(0,0,0,1) 0, rgba(0,0,0,1) 1px, transparent 0, transparent 50%)", backgroundSize: "8px 8px" }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-amber-900/30" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-900/60">Ginger</span>
          </div>
          <p className="text-4xl sm:text-5xl font-black text-amber-950 tabular-nums tracking-tight leading-none">
            {ginger.toLocaleString()}
          </p>
          <p className="text-amber-900/50 text-xs font-bold mt-2 uppercase tracking-widest">Cartons Produced</p>
        </div>
        <div className="relative z-10 mt-4">
          <div className="flex items-end justify-between">
            <span className="text-[10px] font-black text-amber-900/30 uppercase tracking-widest">Share</span>
            <span className="text-4xl font-black text-amber-900/10 select-none tabular-nums">{gPct}%</span>
          </div>
          <div className="h-1 w-full bg-amber-900/15 rounded-full mt-1 overflow-hidden">
            <div className="h-full bg-amber-900/25 rounded-full" style={{ width: `${gPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Trend Chart ────────────────────────────────────────────────────────────
function TrendChart({ data, product, onDrilldown }: {
  data: KPIData["monthly_trend"]; product: Product; onDrilldown: (month: string) => void
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  if (data.length < 2) return (
    <div className="flex items-center justify-center py-16 text-sm text-slate-400 font-semibold">
      Not enough data to display trend
    </div>
  )

  const W = 680, H = 200, PL = 44, PR = 16, PT = 24, PB = 28
  const cW = W - PL - PR, cH = H - PT - PB

  const bitS = data.map(d => d.bitters)
  const ginS = data.map(d => d.ginger)
  const allS = data.map(d => d.total)

  const activeVals = product === "Bitters" ? bitS : product === "Ginger" ? ginS : [...bitS, ...ginS, ...allS]
  const max = Math.max(...activeVals, 1) * 1.12

  const xp = (i: number) => PL + (data.length > 1 ? i / (data.length - 1) : 0.5) * cW
  const yp = (v: number) => PT + cH - (v / max) * cH

  const linePath = (vals: number[]) =>
    vals.every(v => v === 0) ? "" :
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${xp(i).toFixed(1)},${yp(v).toFixed(1)}`).join(" ")

  const areaPath = (vals: number[]) =>
    vals.every(v => v === 0) ? "" :
    `${linePath(vals)} L${xp(data.length - 1).toFixed(1)},${(PT + cH).toFixed(1)} L${xp(0).toFixed(1)},${(PT + cH).toFixed(1)} Z`

  const gridVals = Array.from({ length: 4 }, (_, i) => Math.round(max * (1 - i / 3)))

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ minWidth: 360 }}>
        <defs>
          <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f0f0f" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#0f0f0f" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {gridVals.map((val, i) => {
          const y = PT + (i / 3) * cH
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 4" />
              <text x={PL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontWeight="600">
                {val > 999 ? `${(val / 1000).toFixed(0)}k` : val}
              </text>
            </g>
          )
        })}

        {/* Area fills */}
        {product === "all" && <path d={areaPath(allS)} fill="url(#ge)" />}
        {(product === "all" || product === "Bitters") && <path d={areaPath(bitS)} fill="url(#gb)" />}
        {(product === "all" || product === "Ginger")  && <path d={areaPath(ginS)} fill="url(#gg)" />}

        {/* Lines */}
        {product === "all" && (
          <path d={linePath(allS)} fill="none" stroke="#059669" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />
        )}
        {(product === "all" || product === "Bitters") && (
          <path d={linePath(bitS)} fill="none" stroke="#0f0f0f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {(product === "all" || product === "Ginger") && (
          <path d={linePath(ginS)} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        )}

        {/* X labels + hit areas + points */}
        {data.map((d, i) => (
          <g key={i}
            className="cursor-pointer"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={() => onDrilldown(d.month)}
          >
            <rect x={xp(i) - 24} y={PT} width={48} height={cH + PB} fill="transparent" />
            {hoverIdx === i && (
              <line x1={xp(i)} y1={PT} x2={xp(i)} y2={PT + cH} stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="3 3" />
            )}
            {(product === "all" || product === "Bitters") && (
              <circle cx={xp(i)} cy={yp(bitS[i])} r={hoverIdx === i ? 5 : 3.5}
                fill="#0f0f0f" stroke="#fff" strokeWidth="2" className="transition-all duration-150" />
            )}
            {(product === "all" || product === "Ginger") && (
              <circle cx={xp(i)} cy={yp(ginS[i])} r={hoverIdx === i ? 5 : 3.5}
                fill="#f59e0b" stroke="#fff" strokeWidth="2" className="transition-all duration-150" />
            )}
            {product === "all" && (
              <circle cx={xp(i)} cy={yp(allS[i])} r={hoverIdx === i ? 4 : 2.5}
                fill="#059669" stroke="#fff" strokeWidth="1.5" className="transition-all duration-150" />
            )}
            <text x={xp(i)} y={H - 4} textAnchor="middle" fontSize="10"
              fill={hoverIdx === i ? "#0f172a" : "#94a3b8"} fontWeight="700"
              className="transition-colors select-none">
              {d.month}
            </text>
          </g>
        ))}
      </svg>

      {/* Floating tooltip */}
      {hoverIdx !== null && (() => {
        const pt   = data[hoverIdx]
        const left = hoverIdx / Math.max(data.length - 1, 1)
        return (
          <div
            className="absolute top-0 pointer-events-none z-20 bg-white border border-slate-200 shadow-xl rounded-2xl p-3.5 w-[148px]"
            style={{ left: `clamp(0px, calc(${left * 100}% - 74px), calc(100% - 148px))` }}
          >
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{pt.month}</p>
            <div className="space-y-1.5">
              {(product === "all" || product === "Bitters") && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-neutral-900 shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-500">Bitters</span>
                  </div>
                  <span className="text-[11px] font-black text-slate-900 tabular-nums">{pt.bitters.toLocaleString()}</span>
                </div>
              )}
              {(product === "all" || product === "Ginger") && (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-500">Ginger</span>
                  </div>
                  <span className="text-[11px] font-black text-amber-900 tabular-nums">{pt.ginger.toLocaleString()}</span>
                </div>
              )}
              {product === "all" && (
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-[11px] font-semibold text-emerald-600">Total</span>
                  </div>
                  <span className="text-[11px] font-black text-emerald-800 tabular-nums">{pt.total.toLocaleString()}</span>
                </div>
              )}
            </div>
            <p className="text-[8px] text-slate-300 mt-2 font-bold text-center">Click to drill in</p>
          </div>
        )
      })()}
    </div>
  )
}

// ── Chart Legend ───────────────────────────────────────────────────────────
function ChartLegend({ product }: { product: Product }) {
  return (
    <div className="flex items-center gap-4">
      {(product === "all" || product === "Bitters") && (
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[3px] rounded-full bg-neutral-900" />
          <span className="text-[11px] font-bold text-slate-500">Bitters</span>
        </div>
      )}
      {(product === "all" || product === "Ginger") && (
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[3px] rounded-full bg-amber-400" />
          <span className="text-[11px] font-bold text-slate-500">Ginger</span>
        </div>
      )}
      {product === "all" && (
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-[3px] rounded-full bg-emerald-500 opacity-60" />
          <span className="text-[11px] font-bold text-slate-400">Total</span>
        </div>
      )}
    </div>
  )
}

// ── Product Panel ──────────────────────────────────────────────────────────
function ProductPanel({
  product, cartons, items,
}: {
  product: "Bitters" | "Ginger"
  cartons: number
  items: { label: string; value: number; unit?: string; icon?: React.ElementType }[]
}) {
  const isB = product === "Bitters"

  return (
    <div className={`rounded-3xl overflow-hidden border
      ${isB ? "border-neutral-200" : "border-amber-200/60"}
    `}>
      {/* Panel header */}
      <div className={`px-6 py-5 flex items-center justify-between border-b
        ${isB ? "bg-neutral-950 border-neutral-800" : "bg-amber-400 border-amber-300/50"}
      `}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center
            ${isB ? "bg-white/10" : "bg-amber-900/10"}
          `}>
            <FlaskConical className={`w-4.5 h-4.5 ${isB ? "text-white" : "text-amber-950"}`} />
          </div>
          <div>
            <p className={`text-base font-black tracking-tight ${isB ? "text-white" : "text-amber-950"}`}>
              {product} Production
            </p>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${isB ? "text-white/40" : "text-amber-900/50"}`}>
              Raw Material Inputs
            </p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-xl text-xs font-black
          ${isB ? "bg-white/10 text-white" : "bg-amber-900/10 text-amber-950"}
        `}>
          {cartons.toLocaleString()} Cartons
        </div>
      </div>

      {/* Metric grid */}
      <div className={`p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 ${isB ? "bg-white" : "bg-amber-50/30"}`}>
        {items.map(({ label, value, unit, icon: Icon }) => (
          <div key={label} className={`rounded-xl p-4 border flex flex-col gap-3 transition-colors cursor-default
            ${isB
              ? "bg-neutral-50 border-neutral-100 hover:bg-neutral-100/60"
              : "bg-white border-amber-100 hover:bg-amber-50/80"
            }
          `}>
            {Icon && <Icon className={`w-4 h-4 ${isB ? "text-neutral-400" : "text-amber-600"}`} />}
            <div>
              <p className={`text-[10px] font-semibold leading-tight mb-1.5
                ${isB ? "text-neutral-500" : "text-amber-700/70"}`}>
                {label}
              </p>
              <p className={`text-xl font-black tabular-nums leading-none ${isB ? "text-neutral-900" : "text-amber-950"}`}>
                {value.toLocaleString()}
              </p>
              {unit && (
                <p className={`text-[9px] font-black uppercase tracking-wider mt-0.5
                  ${isB ? "text-neutral-400" : "text-amber-700/40"}`}>
                  {unit}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Dept Panel ─────────────────────────────────────────────────────────────
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
      <SectionHeader title={`${dept} Activity`} sub="Live record counts per module" />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 font-bold py-4">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          Syncing...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {rows.map(r => (
            <div key={r.table} className="bg-slate-50 rounded-xl p-4 border border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">{r.label}</p>
                {r.lastDate && (
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                    {new Date(r.lastDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                )}
              </div>
              <span className="text-sm font-black text-slate-800 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm tabular-nums">
                {r.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Segment Toggle ─────────────────────────────────────────────────────────
function SegmentToggle<T extends string>({
  options, value, onChange, labels,
}: {
  options: T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>>
}) {
  return (
    <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-0.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap
            ${value === opt
              ? opt === "Bitters"
                ? "bg-neutral-900 text-white shadow-sm"
                : opt === "Ginger"
                  ? "bg-amber-400 text-amber-950 shadow-sm"
                  : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-500 hover:text-slate-700"
            }`}
        >
          {labels?.[opt] ?? (opt === "all" ? "All" : opt)}
        </button>
      ))}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export function ManagerDashboard({ userId }: { userId: string }) {
  const now     = new Date()
  const [kpi, setKpi]             = useState<KPIData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [period, setPeriod]       = useState<Period>("all")
  const [monthPicker, setMonthPicker] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  )
  const [product, setProduct]     = useState<Product>("all")
  const [dept, setDept]           = useState("All Departments")

  const fetchKPIs = useCallback(async (p = period, picker = monthPicker) => {
    try {
      setRefreshing(true); setError(null)
      const params = new URLSearchParams()
      if (p === "month") {
        const [y, m] = picker.split("-")
        params.set("year", y)
        params.set("month", parseInt(m, 10).toString())
      }
      const res  = await fetch(`/api/analytics/kpis?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to fetch KPIs")
      setKpi(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error")
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
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href = url
      a.download = `lawson_${now.toISOString().split("T")[0]}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch { alert("Export failed") } finally { setExporting(false) }
  }

  const handleDrilldown = (monthStr: string) => {
    const clean    = monthStr.split(" ")[0]
    const monthNum = MONTH_MAP[clean]
    if (!monthNum) return
    const [y] = monthPicker.split("-")
    const newPicker = `${y}-${String(monthNum).padStart(2, "0")}`
    setPeriod("month"); setMonthPicker(newPicker)
    fetchKPIs("month", newPicker)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (!val) return
    setMonthPicker(val)
    fetchKPIs("month", val)
  }

  const d     = kpi
  const showB = product === "all" || product === "Bitters"
  const showG = product === "all" || product === "Ginger"

  return (
    <div className="min-h-screen bg-[#f6f7f9] -m-4 sm:-m-6 md:-m-10 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">

          {/* Top: Brand + Actions */}
          <div className="px-5 sm:px-7 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100">
            <div className="flex items-center gap-4">
              {/* Dual-product icon */}
              <div className="w-12 h-12 rounded-2xl overflow-hidden grid grid-cols-2 shrink-0 shadow-md border border-slate-200">
                <div className="bg-neutral-950" />
                <div className="bg-amber-400" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  Manager Dashboard
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Lawson Limited</span>
                  {d && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span className="text-[11px] text-slate-400 font-semibold">
                        Updated {new Date(d.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </>
                  )}
                  {refreshing && <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => fetchKPIs()} disabled={refreshing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm transition-all shadow-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-emerald-500" : "text-slate-400"}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={handleExport} disabled={exporting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-sm transition-all shadow-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting ? "Exporting…" : "Export XLSX"}
              </button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="px-5 sm:px-7 py-4 flex flex-col lg:flex-row gap-3 lg:items-center justify-between bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentToggle<Period>
                options={["all", "month"]}
                value={period}
                onChange={p => { setPeriod(p); fetchKPIs(p) }}
                labels={{ all: "All Time", month: "Monthly" }}
              />
              {period === "month" && (
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="month" value={monthPicker} onChange={handleMonthChange}
                    className="pl-9 pr-3 py-2 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-800 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-sm cursor-pointer transition-all"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <SegmentToggle<Product>
                options={["all", "Bitters", "Ginger"]}
                value={product}
                onChange={setProduct}
                labels={{ all: "All Products" }}
              />
              <div className="relative">
                <select
                  value={dept} onChange={e => setDept(e.target.value)}
                  className="appearance-none pl-4 pr-9 py-2 text-sm font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 shadow-sm cursor-pointer transition-all"
                >
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-red-800 font-semibold text-sm flex-1">{error}</p>
            <button onClick={() => fetchKPIs()}
              className="px-4 py-2 bg-white rounded-xl text-sm font-black text-red-600 hover:bg-red-50 border border-red-100 transition-colors shrink-0 shadow-sm">
              Retry
            </button>
          </div>
        )}

        {/* ── Skeleton ─────────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-5 animate-pulse">
            <div className="rounded-3xl overflow-hidden border border-slate-200 flex min-h-[160px]">
              <div className="flex-1 bg-neutral-200" />
              <div className="flex-1 bg-amber-100" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 h-32">
                  <div className="w-8 h-8 bg-slate-100 rounded-xl mb-4" />
                  <div className="h-3 w-16 bg-slate-100 rounded mb-2.5" />
                  <div className="h-7 w-20 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────────── */}
        {!loading && !error && d && (
          <div className="space-y-8">

            {/* Dept Activity */}
            {dept !== "All Departments" && <DeptPanel dept={dept} />}

            {/* ── Production Split ─────────────────────────────────────── */}
            <div>
              <SectionHeader
                title="Production Output"
                sub={`${period === "month" ? "This month" : "All time"} — cartons produced per product`}
                badge={`${d.total_production_cartons.toLocaleString()} Total`}
              />
              <ProductionSplit bitters={d.bitters_cartons} ginger={d.ginger_cartons} />
            </div>

            {/* ── Trend Chart ──────────────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900 uppercase tracking-widest">
                    {period === "month" ? "Daily Trend" : "Monthly Trend"}
                  </p>
                  <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Click a point to drill into that period</p>
                </div>
                <ChartLegend product={product} />
              </div>
              <div className="p-5 sm:p-6">
                <TrendChart data={d.monthly_trend} product={product} onDrilldown={handleDrilldown} />
              </div>
            </div>

            {/* ── Live Inventory ───────────────────────────────────────── */}
            <div>
              <SectionHeader title="Live Inventory" sub="Real-time stock levels" />
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-3">
                <LiveStocksDisplay />
              </div>
            </div>

            {/* ── Available Stock ──────────────────────────────────────── */}
            <div>
              <SectionHeader title="Available Stock" sub="Current balances across all stores" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <MetricCard label="Alcohol Balance"  value={d.current_alcohol_balance}   unit="Litres"  icon={Droplet}      trend="up" />
                <MetricCard label="Preforms Balance" value={d.current_preform_balance}   unit="Bags"    icon={Package} />
                <MetricCard label="Caps Remaining"   value={d.caps_remaining}            unit="Units"   icon={Box} />
                {showB && <MetricCard label="Live Stock"  value={d.live_bitters_stock}        unit="Cartons" icon={Package}     product="Bitters" />}
                {showG && <MetricCard label="Live Stock"  value={d.live_ginger_stock}         unit="Cartons" icon={Package}     product="Ginger" />}
                {showB && <MetricCard label="Labels"      value={d.labels_bitters_remaining}  unit="Units"   icon={Tag}         product="Bitters" />}
                {showG && <MetricCard label="Labels"      value={d.labels_ginger_remaining}   unit="Units"   icon={Tag}         product="Ginger" />}
                {showB && <MetricCard label="Caramel"     value={d.caramel_bitters_remaining} unit="Gallons" icon={FlaskConical} product="Bitters" />}
                {showG && <MetricCard label="Caramel"     value={d.caramel_ginger_remaining}  unit="Gallons" icon={FlaskConical} product="Ginger" />}
              </div>
            </div>

            {/* ── Material Consumption ─────────────────────────────────── */}
            <div>
              <SectionHeader title="Material Consumption" sub="Raw inputs used in production" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <MetricCard label="Alcohol Used"   value={d.total_alcohol_used_litres}   unit="Litres" icon={Droplet}  trend="down" />
                <MetricCard label="Preforms Used"  value={d.total_preforms_used}         unit="Bags"   icon={Package} />
                <MetricCard label="Caps Used"      value={d.total_caps_used}             unit="Units"  icon={Box} />
                {showB && <MetricCard label="Labels Used" value={d.total_labels_bitters_used}  unit="Units" icon={Tag}     product="Bitters" />}
                {showG && <MetricCard label="Labels Used" value={d.total_labels_ginger_used}   unit="Units" icon={Tag}     product="Ginger" />}
                {showB && <MetricCard label="Bottles"     value={d.total_bottles_bitters}      unit="Units" icon={Package} product="Bitters" />}
                {showG && <MetricCard label="Bottles"     value={d.total_bottles_ginger}       unit="Units" icon={Package} product="Ginger" />}
              </div>
            </div>

            {/* ── Bitters + Ginger product panels ─────────────────────── */}
            <div className="space-y-5">
              {showB && (
                <ProductPanel
                  product="Bitters"
                  cartons={d.bitters_cartons}
                  items={[
                    { label: "Alcohol",     value: d.alcohol_used_for_bitters_drums, unit: "Drums",   icon: Droplet },
                    { label: "Concentrate", value: d.total_concentrate_used_litres,  unit: "Litres"               },
                    { label: "Spices",      value: d.total_spices_used_litres,       unit: "Litres"               },
                    { label: "Caramel",     value: d.total_caramel_used_gallons,     unit: "Gallons"              },
                    { label: "Water",       value: d.total_water_litres,             unit: "Litres"               },
                    { label: "Labels",      value: d.total_labels_bitters_used,      unit: "Units",   icon: Tag    },
                    { label: "Caps",        value: d.total_caps_used,                unit: "Units",   icon: Box    },
                    { label: "Bottles",     value: d.total_bottles_bitters,          unit: "Units",   icon: Package },
                  ]}
                />
              )}
              {showG && (
                <ProductPanel
                  product="Ginger"
                  cartons={d.ginger_cartons}
                  items={[
                    { label: "Alcohol",   value: d.alcohol_used_for_ginger_drums, unit: "Drums",   icon: Droplet },
                    { label: "Water",     value: d.ginger_water_used_litres,      unit: "Litres"               },
                    { label: "G/T Juice", value: d.ginger_gt_juice_litres,        unit: "Litres"               },
                    { label: "Spices",    value: d.ginger_spices_used_litres,     unit: "Litres"               },
                    { label: "Caramel",   value: d.ginger_caramel_used_gallons,   unit: "Gallons"              },
                    { label: "Labels",    value: d.total_labels_ginger_used,      unit: "Units",   icon: Tag    },
                    { label: "Bottles",   value: d.total_bottles_ginger,          unit: "Units",   icon: Package },
                  ]}
                />
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
