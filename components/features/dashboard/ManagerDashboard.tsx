"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertTriangle, BarChart3, Layers,
  Filter, ArrowUpRight, ArrowDownRight, Minus, Calendar, MousePointer2
} from "lucide-react"

// ── UI/UX PRO-MAX DESIGN TOKENS ─────────────────────────────────────────────
const BITTERS = { border: "border-slate-300/40", bg: "bg-gradient-to-br from-slate-800 to-slate-950", glass: "bg-white/70 backdrop-blur-xl", text: "text-slate-900", icon: "text-slate-700", ring: "ring-slate-400/20" }
const GINGER  = { border: "border-amber-300/40", bg: "bg-gradient-to-br from-amber-400 to-amber-600", glass: "bg-amber-50/70 backdrop-blur-xl", text: "text-amber-950", icon: "text-amber-700", ring: "ring-amber-400/20" }
const PRIMARY = { border: "border-emerald-300/40", bg: "bg-emerald-500", glass: "bg-white/80 backdrop-blur-2xl", text: "text-slate-900", icon: "text-emerald-600", ring: "ring-emerald-400/20" }

// ── Interactive Components ──────────────────────────────────────────────────

function ProMaxCard({ label, value, unit, icon: Icon, token, trend }: any) {
  return (
    <div className={`group relative overflow-hidden rounded-3xl border ${token.border} ${token.glass} p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)]`}>
      {/* Surface Reflection */}
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/20 blur-2xl transition-opacity group-hover:opacity-40" />
      
      <div className="flex items-start justify-between">
        <div className={`rounded-2xl ${token.ring} bg-white p-3 shadow-sm ring-1`}>
          {Icon && <Icon className={`h-5 w-5 ${token.icon}`} />}
        </div>
        {trend && (
          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-600 ring-1 ring-emerald-100">
            <ArrowUpRight className="h-3 w-3" /> 12%
          </div>
        )}
      </div>

      <div className="mt-5">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-3xl font-black tabular-nums tracking-tight ${token.text}`}>
            {value.toLocaleString()}
          </span>
          <span className="text-[10px] font-black uppercase text-slate-400">{unit}</span>
        </div>
      </div>
    </div>
  )
}

// ── Main Interface ─────────────────────────────────────────────────────────

export default function RedesignedDashboard() {
  const [view, setView] = useState<"all" | "month">("all")
  const [selectedMonth, setSelectedMonth] = useState("2026-03")
  const [productFilter, setProductFilter] = useState("all")
  const [hoveredData, setHoveredData] = useState<any>(null)

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 font-sans text-slate-900 antialiased sm:p-8 lg:p-12">
      {/* Background Ambience */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-[10%] -top-[10%] h-[50%] w-[50%] rounded-full bg-emerald-100/40 blur-[120px]" />
        <div className="absolute -right-[10%] bottom-[10%] h-[40%] w-[40%] rounded-full bg-blue-100/30 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-10">
        
        {/* ── Dynamic Header & Date Pickers ─────────────────────────────── */}
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-900">Operations Hub</h1>
            <p className="mt-1 text-sm font-bold text-slate-400 uppercase tracking-widest">Real-time Supply Chain Design</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View Drilldown Toggle */}
            <div className="flex rounded-2xl bg-slate-200/50 p-1.5 backdrop-blur-md">
              <button 
                onClick={() => setView("all")}
                className={`rounded-xl px-6 py-2 text-xs font-black uppercase transition-all ${view === "all" ? "bg-white shadow-lg text-slate-900" : "text-slate-500"}`}>
                Global
              </button>
              <button 
                onClick={() => setView("month")}
                className={`rounded-xl px-6 py-2 text-xs font-black uppercase transition-all ${view === "month" ? "bg-white shadow-lg text-slate-900" : "text-slate-500"}`}>
                Monthly
              </button>
            </div>

            {/* Drilldown Month Picker */}
            {view === "month" && (
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                <input 
                  type="month" 
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="rounded-2xl border-none bg-white py-3 pl-11 pr-5 text-sm font-black text-slate-700 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer"
                />
              </div>
            )}
            
            <button className="flex items-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-white shadow-xl transition-transform hover:scale-105 active:scale-95">
              <Download className="h-4 w-4" />
              <span>Export Cartons</span>
            </button>
          </div>
        </header>

        {/* ── Trend Intelligence Chart (With Tooltip Logic) ─────────────── */}
        <section className="rounded-[2.5rem] border border-white/40 bg-white/40 p-8 shadow-2xl backdrop-blur-3xl">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-emerald-500 p-3 shadow-lg shadow-emerald-200">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-black text-slate-800">Production Velocity</h2>
            </div>
            <div className="flex gap-2">
               {["All", "Bitters", "Ginger"].map(f => (
                 <button key={f} onClick={() => setProductFilter(f.toLowerCase())}
                  className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest border transition-all ${productFilter === f.toLowerCase() ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-400 border-slate-200 hover:border-slate-400"}`}>
                   {f}
                 </button>
               ))}
            </div>
          </div>

          <div className="relative h-64 w-full">
            {/* Tooltip Overlay Example */}
            {hoveredData && (
               <div className="absolute z-50 rounded-2xl bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur-md animate-in fade-in zoom-in duration-200" style={{ left: '50%', top: '10%' }}>
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-2">March 2026 Details</p>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-8"><span className="text-xs font-bold">Bitters Cartons</span> <span className="text-xs font-black">12,400</span></div>
                    <div className="flex justify-between gap-8"><span className="text-xs font-bold">Ginger Cartons</span> <span className="text-xs font-black">8,200</span></div>
                  </div>
                  <div className="mt-2 flex items-center gap-1 border-t border-white/10 pt-2 text-[9px] font-black text-emerald-400">
                    <MousePointer2 className="h-3 w-3" /> CLICK TO DRILL DOWN
                  </div>
               </div>
            )}
            
            {/* Visual Placeholder for SVG Logic - Using stylized line */}
            <div className="flex h-full items-end justify-between gap-2 px-2" onMouseEnter={() => setHoveredData(true)} onMouseLeave={() => setHoveredData(null)}>
               {[40, 70, 45, 90, 65, 80, 95].map((h, i) => (
                 <div key={i} className="group relative flex-1">
                    <div style={{ height: `${h}%` }} className="w-full rounded-t-xl bg-gradient-to-t from-emerald-500/20 to-emerald-500 transition-all group-hover:to-emerald-400 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]" />
                 </div>
               ))}
            </div>
          </div>
        </section>

        {/* ── Core Metric Grids (Responsive) ────────────────────────────── */}
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <ProMaxCard label="Global Output" value={24500} unit="Cartons" icon={BarChart3} token={PRIMARY} trend />
          <ProMaxCard label="Bitters Stock" value={12000} unit="Cartons" icon={Package} token={BITTERS} />
          <ProMaxCard label="Ginger Stock" value={8500} unit="Cartons" icon={Package} token={GINGER} />
          <ProMaxCard label="Total Bottles" value={294000} unit="Units" icon={Droplet} token={PRIMARY} />
        </section>

        {/* ── Detailed Resource Drilldown ───────────────────────────────── */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Bitters Reflective Panel */}
          <div className={`rounded-[2.5rem] border ${BITTERS.border} ${BITTERS.bg} p-8 text-white shadow-2xl`}>
            <div className="flex items-center gap-4 mb-8">
              <FlaskConical className="h-6 w-6 text-slate-400" />
              <h3 className="text-xl font-black tracking-tight">Bitters Resources</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { l: "Concentrate", v: "1,200", u: "Litres" },
                { l: "Alcohol", v: "45", u: "Drums" },
                { l: "Caramel", v: "800", u: "Gallons" },
                { l: "Labels", v: "150,000", u: "Units" }
              ].map((item, idx) => (
                <div key={idx} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur-md">
                  <p className="text-[10px] font-black uppercase text-slate-400">{item.l}</p>
                  <p className="mt-1 text-lg font-black">{item.v} <span className="text-[10px] text-slate-500">{item.u}</span></p>
                </div>
              ))}
            </div>
          </div>

          {/* Ginger Reflective Panel */}
          <div className={`rounded-[2.5rem] border ${GINGER.border} ${GINGER.bg} p-8 text-white shadow-2xl`}>
             <div className="flex items-center gap-4 mb-8">
              <FlaskConical className="h-6 w-6 text-amber-200" />
              <h3 className="text-xl font-black tracking-tight">Ginger Resources</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { l: "G/T Juice", v: "2,400", u: "Litres" },
                { l: "Alcohol", v: "32", u: "Drums" },
                { l: "Caramel", v: "400", u: "Gallons" },
                { l: "Labels", v: "94,000", u: "Units" }
              ].map((item, idx) => (
                <div key={idx} className="rounded-2xl bg-black/10 p-4 ring-1 ring-white/10 backdrop-blur-md">
                  <p className="text-[10px] font-black uppercase text-amber-200/60">{item.l}</p>
                  <p className="mt-1 text-lg font-black">{item.v} <span className="text-[10px] text-amber-200/40">{item.u}</span></p>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
