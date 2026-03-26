"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, 
  Box, TrendingUp, AlertTriangle, BarChart, Layers,
  Filter, ArrowUpRight, ArrowDownRight, Minus, Calendar, MousePointer, Activity
} from "lucide-react"

// ── UI/UX PRO-MAX COMPATIBLE TOKENS ─────────────────────────────────────────
const THEMES = {
  bitters: { border: "border-slate-300/40", bg: "bg-slate-900", glass: "bg-white/80 backdrop-blur-lg", text: "text-slate-900", icon: "text-slate-700" },
  ginger:  { border: "border-amber-300/40", bg: "bg-amber-500", glass: "bg-amber-50/80 backdrop-blur-lg", text: "text-amber-950", icon: "text-amber-700" },
  primary: { border: "border-emerald-300/40", bg: "bg-emerald-500", glass: "bg-white/90 backdrop-blur-xl", text: "text-slate-900", icon: "text-emerald-600" }
}

// ── Internal Components ─────────────────────────────────────────────────────

const CompactCard = ({ label, value, unit, icon: Icon, theme, trend }: any) => (
  <div className={`group relative overflow-hidden rounded-2xl border ${theme.border} ${theme.glass} p-5 shadow-sm transition-all hover:shadow-md`}>
    <div className="flex items-start justify-between">
      <div className="rounded-xl bg-white p-2.5 shadow-inner ring-1 ring-slate-100">
        {Icon && <Icon size={18} className={theme.icon} />}
      </div>
      {trend && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">+12%</span>}
    </div>
    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-black tabular-nums ${theme.text}`}>{value.toLocaleString()}</span>
        <span className="text-[9px] font-bold uppercase text-slate-400">{unit}</span>
      </div>
    </div>
  </div>
)

// ── Main Dashboard ──────────────────────────────────────────────────────────

export default function CompactDashboard() {
  const [view, setView] = useState<"all" | "month">("all")
  const [selectedMonth, setSelectedMonth] = useState("2026-03")
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // Mock Data for Chart
  const chartData = [3200, 4500, 2900, 6100, 5200, 7800]
  const maxVal = Math.max(...chartData)

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans selection:bg-emerald-100">
      <div className="mx-auto max-w-6xl space-y-6">
        
        {/* Header Section */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Operations Hub</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lawson Limited • v2.0</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {["all", "month"].map((v: any) => (
                <button key={v} onClick={() => setView(v)}
                  className={`rounded-lg px-4 py-1.5 text-[10px] font-black uppercase transition-all ${view === v ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
                  {v === "all" ? "Global" : "Monthly"}
                </button>
              ))}
            </div>

            {view === "month" && (
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none" />
            )}
            
            <button className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 transition-colors">
              <Download size={14} />
              <span>Export</span>
            </button>
          </div>
        </header>

        {/* Interactive Chart Section */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500 p-2 shadow-lg shadow-emerald-100">
                <TrendingUp size={16} className="text-white" />
              </div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">Production Trend</h2>
            </div>
          </div>

          <div className="relative flex h-48 items-end justify-between gap-2 px-2 pt-10">
            {chartData.map((val, i) => (
              <div key={i} className="group relative flex-1" onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                <div 
                  style={{ height: `${(val / maxVal) * 100}%` }} 
                  className={`w-full rounded-t-lg transition-all duration-300 ${hoverIdx === i ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-emerald-200'}`} 
                />
                
                {/* Safe Tooltip Logic */}
                {hoverIdx === i && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-black text-white animate-in fade-in slide-in-from-bottom-2">
                    {val.toLocaleString()} Cartons
                    <div className="mt-1 flex items-center gap-1 border-t border-white/10 pt-1 text-[8px] text-emerald-400">
                      <MousePointer size={10} /> DRILL DOWN
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Primary Metric Grid */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CompactCard label="Total Output" value={24500} unit="Cartons" icon={BarChart} theme={THEMES.primary} trend />
          <CompactCard label="Bitters Stock" value={12000} unit="Cartons" icon={Package} theme={THEMES.bitters} />
          <CompactCard label="Ginger Stock" value={8500} unit="Cartons" icon={Package} theme={THEMES.ginger} />
          <CompactCard label="Total Units" value={294000} unit="Bottles" icon={Activity} theme={THEMES.primary} />
        </section>

        {/* Resource Breakdown */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white">
            <div className="mb-4 flex items-center gap-3">
              <Box size={18} className="text-slate-400" />
              <h3 className="text-xs font-black uppercase tracking-widest">Bitters Resource Log</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { l: "Concentrate", v: "1,200", u: "Litres" },
                { l: "Alcohol", v: "45", u: "Drums" }
              ].map((item, idx) => (
                <div key={idx} className="rounded-xl bg-white/5 p-3 border border-white/10">
                  <p className="text-[9px] font-bold text-slate-500 uppercase">{item.l}</p>
                  <p className="text-sm font-black">{item.v} <span className="text-[9px] opacity-40">{item.u}</span></p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <div className="mb-4 flex items-center gap-3">
              <Activity size={18} className="text-amber-600" />
              <h3 className="text-xs font-black uppercase tracking-widest text-amber-900">Ginger Resource Log</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { l: "G/T Juice", v: "2,400", u: "Litres" },
                { l: "Labels", v: "94,000", u: "Units" }
              ].map((item, idx) => (
                <div key={idx} className="rounded-xl bg-white p-3 border border-amber-200 shadow-sm">
                  <p className="text-[9px] font-bold text-amber-700/60 uppercase">{item.l}</p>
                  <p className="text-sm font-black text-amber-950">{item.v} <span className="text-[9px] opacity-40">{item.u}</span></p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
