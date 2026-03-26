"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertTriangle, BarChart3, Layers,
  ChevronDown, Filter, Settings2, Calendar, LayoutDashboard,
  ArrowUpRight, Clock
} from "lucide-react"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

// ── Refined Design Tokens ──────────────────────────────────────────────────
const BITTERS = { border: "border-zinc-200", bg: "bg-zinc-900", text: "text-zinc-900", icon: "text-zinc-400", light: "bg-zinc-50", badge: "bg-zinc-900 text-white" }
const GINGER  = { border: "border-amber-200", bg: "bg-amber-400", text: "text-amber-700", icon: "text-amber-500", light: "bg-amber-50", badge: "bg-amber-400 text-amber-950" }
const GENERAL = { border: "border-emerald-200", bg: "bg-emerald-600", text: "text-emerald-700", icon: "text-emerald-500", light: "bg-emerald-50", badge: "bg-emerald-600 text-white" }

type Product = "all" | "Bitters" | "Ginger"
type Period  = "all" | "month"

const DEPARTMENTS = ["All Departments", "Blowing", "Alcohol and Blending", "Filling Line", "Packaging", "Concentrate"]

// ── Re-designed KPI Card ───────────────────────────────────────────────────
function KPICard({ label, value, unit, icon: Icon, token }: {
  label: string; value: number; unit?: string; icon?: React.ElementType; token: typeof GENERAL
}) {
  return (
    <div className={`group relative bg-white p-5 rounded-3xl border ${token.border} shadow-sm hover:shadow-md transition-all duration-300`}>
      <div className="flex justify-between items-start mb-3">
        <div className={`p-2.5 rounded-2xl ${token.light}`}>
          {Icon && <Icon className={`w-5 h-5 ${token.icon}`} />}
        </div>
        {unit && (
          <span className={`text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-tighter ${token.badge}`}>
            {unit}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
        <h4 className={`text-2xl font-black tabular-nums tracking-tight ${token.text}`}>
          {value.toLocaleString()}
        </h4>
      </div>
    </div>
  )
}

export function ManagerDashboard({ userId }: { userId: string }) {
  const [kpi, setKpi] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const now = new Date()
  const [period, setPeriod] = useState<Period>("all")
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [product, setProduct] = useState<Product>("all")
  const [dept, setDept] = useState("All Departments")

  const fetchKPIs = useCallback(async (p = period, y = selYear, m = selMonth) => {
    try {
      setRefreshing(true)
      const params = new URLSearchParams()
      if (p === "month") { params.set("year", String(y)); params.set("month", String(m)) }
      const res = await fetch(`/api/analytics/kpis?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      setKpi(data)
    } catch (e) {
      setError("Sync failed. Check connection.")
    } finally { setLoading(false); setRefreshing(false) }
  }, [period, selYear, selMonth])

  useEffect(() => { fetchKPIs() }, [fetchKPIs])

  const showB = product === "all" || product === "Bitters"
  const showG = product === "all" || product === "Ginger"

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans -m-4 sm:-m-6 md:-m-10">
      <div className="flex flex-col lg:flex-row min-h-screen">
        
        {/* ── PERSISTENT NAVIGATION SIDEBAR ──────────────────────────────── */}
        <aside className="w-full lg:w-72 bg-white border-b lg:border-r border-slate-200 p-6 lg:fixed lg:h-screen overflow-y-auto z-30">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-200">
              <BarChart3 className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-lg tracking-tight">Lawson <span className="text-emerald-600">HQ</span></h1>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Analytics</p>
            </div>
          </div>

          <nav className="space-y-8">
            {/* Filter Section: Department */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                <Filter className="w-3 h-3" /> Department Filter
              </label>
              <select 
                value={dept} 
                onChange={e => setDept(e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Filter Section: Product */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                <Settings2 className="w-3 h-3" /> Scope
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
                  <button key={p} onClick={() => setProduct(p)}
                    className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                      product === p ? "bg-slate-900 text-white shadow-md" : "bg-transparent text-slate-500 hover:bg-slate-50"
                    }`}>
                    {p === "all" ? "All Products" : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Section: Timeline */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Time Period
              </label>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                {["all", "month"].map((p) => (
                  <button key={p} onClick={() => setPeriod(p as Period)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}>
                    {p === "all" ? "Lifetime" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-3">
              <button onClick={() => fetchKPIs()} disabled={refreshing}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 font-bold text-xs hover:bg-slate-50 transition-all">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Refresh Data
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-all">
                <Download className="w-3.5 h-3.5" />
                Download XLSX
              </button>
            </div>
          </nav>
        </aside>

        {/* ── MAIN CONTENT AREA ───────────────────────────────────────────── */}
        <main className="flex-1 lg:ml-72 p-6 lg:p-10">
          <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-slate-900">
                {dept === "All Departments" ? "Factory Overview" : dept}
              </h2>
              <div className="flex items-center gap-2 mt-2 text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                <p className="text-xs font-medium">Last sync: {kpi ? new Date(kpi.last_updated).toLocaleTimeString() : '...'}</p>
              </div>
            </div>
            
            {period === "month" && (
               <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
                 <select value={selMonth} className="bg-transparent border-none text-xs font-black focus:ring-0 cursor-pointer">
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                 </select>
                 <div className="w-px h-4 bg-slate-200 mx-1" />
                 <select value={selYear} className="bg-transparent border-none text-xs font-black focus:ring-0 cursor-pointer">
                    {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
                 </select>
               </div>
            )}
          </header>

          {!loading && kpi && (
            <div className="space-y-10">
              
              {/* Live Inventory - Highlighted Section */}
              <section className="bg-white rounded-[2rem] p-6 lg:p-8 border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-800">Live Inventory Monitoring</h3>
                </div>
                <LiveStocksDisplay />
              </section>

              {/* Core Output Metrics */}
              <div className="space-y-4">
                 <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Output Summary</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <KPICard label="Total Production" value={kpi.total_production_cartons} unit="Cartons" icon={LayoutDashboard} token={GENERAL} />
                    {showB && <KPICard label="Bitters Output" value={kpi.bitters_cartons} unit="Cartons" icon={Package} token={BITTERS} />}
                    {showG && <KPICard label="Ginger Output" value={kpi.ginger_cartons} unit="Cartons" icon={Package} token={GINGER} />}
                 </div>
              </div>

              {/* Resource Balances */}
              <div className="space-y-4">
                 <div className="flex items-center gap-2">
                    <Droplet className="w-4 h-4 text-blue-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Stock Balances</h3>
                 </div>
                 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KPICard label="Alcohol" value={kpi.current_alcohol_balance} unit="Litres" token={GENERAL} />
                    <KPICard label="Preforms" value={kpi.current_preform_balance} unit="Bags" token={GENERAL} />
                    <KPICard label="Caps" value={kpi.caps_remaining} unit="Units" token={GENERAL} />
                    <KPICard label="Concentrate" value={kpi.total_concentrate_used_litres} unit="Litres" token={GENERAL} />
                 </div>
              </div>

              {/* Production Inputs - Specialized Cards */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {showB && (
                  <div className="bg-zinc-900 rounded-[2.5rem] p-8 text-white shadow-xl">
                    <div className="flex justify-between items-center mb-10">
                      <div>
                        <h3 className="text-xl font-black italic tracking-tighter uppercase">Bitters Inputs</h3>
                        <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-1">Material Consumption</p>
                      </div>
                      <div className="px-5 py-2 bg-white/10 rounded-2xl border border-white/10 text-xs font-black">
                        {kpi.bitters_cartons.toLocaleString()} Cartons
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { l: "Alcohol", v: kpi.alcohol_used_for_bitters_drums, u: "Drums" },
                        { l: "Spices", v: kpi.total_spices_used_litres, u: "Litres" },
                        { l: "Bottles", v: kpi.total_bottles_bitters, u: "Units" },
                        { l: "Live Stock", v: kpi.live_bitters_stock, u: "Cartons" }
                      ].map((item, i) => (
                        <div key={i} className="bg-white/5 border border-white/5 p-5 rounded-3xl">
                           <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">{item.l}</p>
                           <p className="text-xl font-black tabular-nums">{item.v.toLocaleString()} <span className="text-[10px] text-zinc-600 uppercase ml-1">{item.u}</span></p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showG && (
                  <div className="bg-amber-400 rounded-[2.5rem] p-8 text-amber-950 shadow-xl shadow-amber-100/50">
                    <div className="flex justify-between items-center mb-10">
                      <div>
                        <h3 className="text-xl font-black italic tracking-tighter uppercase">Ginger Inputs</h3>
                        <p className="text-amber-900/40 text-[10px] uppercase font-bold tracking-widest mt-1">Material Consumption</p>
                      </div>
                      <div className="px-5 py-2 bg-amber-950/10 rounded-2xl border border-amber-950/10 text-xs font-black">
                        {kpi.ginger_cartons.toLocaleString()} Cartons
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { l: "Alcohol", v: kpi.alcohol_used_for_ginger_drums, u: "Drums" },
                        { l: "G/T Juice", v: kpi.ginger_gt_juice_litres, u: "Litres" },
                        { l: "Bottles", v: kpi.total_bottles_ginger, u: "Units" },
                        { l: "Live Stock", v: kpi.live_ginger_stock, u: "Cartons" }
                      ].map((item, i) => (
                        <div key={i} className="bg-amber-950/5 border border-amber-950/5 p-5 rounded-3xl">
                           <p className="text-[10px] uppercase font-bold text-amber-900/50 mb-1">{item.l}</p>
                           <p className="text-xl font-black tabular-nums">{item.v.toLocaleString()} <span className="text-[10px] text-amber-900/40 uppercase ml-1">{item.u}</span></p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  )
}
