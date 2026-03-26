"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Download, Package, Droplet, Tag, FlaskConical,
  Box, TrendingUp, AlertTriangle, BarChart3, Layers,
  ChevronDown, Filter, LayoutDashboard, Settings2, Calendar
} from "lucide-react"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

// ── Refined Brand Tokens ──────────────────────────────────────────────────
const BITTERS = { border: "border-zinc-200", bg: "bg-zinc-900", text: "text-zinc-900", icon: "text-zinc-400", light: "bg-zinc-50", badge: "bg-zinc-900 text-white", spark: "#18181b" }
const GINGER  = { border: "border-amber-200", bg: "bg-amber-400", text: "text-amber-700", icon: "text-amber-500", light: "bg-amber-50", badge: "bg-amber-400 text-amber-950", spark: "#d97706" }
const GENERAL = { border: "border-emerald-200", bg: "bg-emerald-600", text: "text-emerald-700", icon: "text-emerald-500", light: "bg-emerald-50", badge: "bg-emerald-600 text-white", spark: "#059669" }

type Product = "all" | "Bitters" | "Ginger"
type Period  = "all" | "month"

const DEPARTMENTS = ["All Departments", "Blowing", "Alcohol and Blending", "Filling Line", "Packaging", "Concentrate"]

// ── Modern KPI Card ───────────────────────────────────────────────────────
function KPICard({ label, value, unit, icon: Icon, token }: {
  label: string; value: number; unit?: string; icon?: React.ElementType; token: typeof GENERAL
}) {
  return (
    <div className={`group relative bg-white p-6 rounded-3xl border ${token.border} shadow-sm hover:shadow-md transition-all duration-300`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-2xl ${token.light}`}>
          {Icon && <Icon className={`w-6 h-6 ${token.icon}`} />}
        </div>
        <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${token.badge}`}>
          {unit || "Total"}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
        <h4 className={`text-3xl font-black tabular-nums tracking-tight ${token.text}`}>
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
      setError("Unable to sync dashboard data.")
    } finally { setLoading(false); setRefreshing(false) }
  }, [period, selYear, selMonth])

  useEffect(() => {
    fetchKPIs()
  }, [fetchKPIs])

  const showB = product === "all" || product === "Bitters"
  const showG = product === "all" || product === "Ginger"

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      <div className="flex flex-col lg:flex-row min-h-screen">
        
        {/* ── LEFT SIDEBAR (Desktop) / TOP CONTROLS (Mobile) ──────────────── */}
        <aside className="w-full lg:w-80 bg-white border-b lg:border-r border-slate-200 p-6 lg:fixed lg:h-screen overflow-y-auto z-20">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-emerald-600 rounded-2xl flex items-center justify-center">
              <BarChart3 className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tight">Lawson</h1>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Manager Portal</p>
            </div>
          </div>

          <div className="space-y-8">
            {/* Filter Group: Scope */}
            <div className="space-y-4">
              <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                <Settings2 className="w-3 h-3" /> Dashboard Filters
              </label>
              
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-600">Product Focus</p>
                <div className="grid grid-cols-1 gap-1">
                  {(["all", "Bitters", "Ginger"] as Product[]).map(p => (
                    <button key={p} onClick={() => setProduct(p)}
                      className={`text-left px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                        product === p ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      }`}>
                      {p === "all" ? "All Products" : p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-600">Department View</p>
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select 
                    value={dept} 
                    onChange={e => setDept(e.target.value)}
                    className="w-full appearance-none bg-slate-50 border-none rounded-xl py-3 pl-10 pr-10 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-600">Time Period</p>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {["all", "month"].map((p) => (
                    <button key={p} onClick={() => setPeriod(p as Period)}
                      className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-tighter transition-all ${period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}>
                      {p === "all" ? "Lifetime" : "Monthly"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-3">
              <button onClick={() => fetchKPIs()} disabled={refreshing}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-slate-100 font-bold text-sm hover:bg-slate-50 transition-all">
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                Sync Data
              </button>
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100">
                <Download className="w-4 h-4" />
                Export Report
              </button>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT AREA ───────────────────────────────────────────── */}
        <main className="flex-1 lg:ml-80 p-6 lg:p-10">
          <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-slate-900">
                {dept === "All Departments" ? "Factory Overview" : dept}
              </h2>
              {kpi && <p className="text-slate-400 text-sm font-medium mt-1">Live data as of {new Date(kpi.last_updated).toLocaleTimeString()}</p>}
            </div>
            {period === "month" && (
               <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200">
                 <Calendar className="w-4 h-4 text-emerald-600 ml-2" />
                 <select value={selMonth} className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer">
                    {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                 </select>
                 <select value={selYear} className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer">
                    {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
                 </select>
               </div>
            )}
          </header>

          {!loading && kpi && (
            <div className="space-y-12">
              
              {/* Live Inventory - Prominent Section */}
              <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-2 h-6 bg-emerald-500 rounded-full" />
                  <h3 className="text-lg font-black uppercase tracking-widest text-slate-800">Live Inventory</h3>
                </div>
                <LiveStocksDisplay />
              </section>

              {/* Main KPIs Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <KPICard label="Total Production" value={kpi.total_production_cartons} unit="Cartons" icon={TrendingUp} token={GENERAL} />
                <KPICard label="Alcohol Balance" value={kpi.current_alcohol_balance} unit="Litres" icon={Droplet} token={GENERAL} />
                <KPICard label="Preforms Remaining" value={kpi.current_preform_balance} unit="Bags" icon={Package} token={GENERAL} />
                <KPICard label="Caps Inventory" value={kpi.caps_remaining} unit="Units" icon={Box} token={GENERAL} />
              </div>

              {/* Product Specific Sections */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {showB && (
                  <div className="bg-zinc-900 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-zinc-200">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xl font-black uppercase tracking-tighter italic">Bitters Production</h3>
                      <div className="px-4 py-2 bg-white/10 rounded-full text-xs font-bold">
                        {kpi.bitters_cartons.toLocaleString()} Cartons
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/5 p-4 rounded-2xl">
                         <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Alcohol Used</p>
                         <p className="text-xl font-bold">{kpi.alcohol_used_for_bitters_drums} Drums</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl">
                         <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Concentrate</p>
                         <p className="text-xl font-bold">{kpi.total_concentrate_used_litres} Litres</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl">
                         <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Bottles Used</p>
                         <p className="text-xl font-bold">{kpi.total_bottles_bitters.toLocaleString()} Units</p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl">
                         <p className="text-[10px] uppercase font-bold text-zinc-500 mb-1">Live Stock</p>
                         <p className="text-xl font-bold text-emerald-400">{kpi.live_bitters_stock.toLocaleString()} Cartons</p>
                      </div>
                    </div>
                  </div>
                )}

                {showG && (
                  <div className="bg-amber-400 rounded-[2.5rem] p-8 text-amber-950 shadow-2xl shadow-amber-100">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xl font-black uppercase tracking-tighter italic">Ginger Production</h3>
                      <div className="px-4 py-2 bg-amber-950/10 rounded-full text-xs font-bold">
                        {kpi.ginger_cartons.toLocaleString()} Cartons
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-amber-950/5 p-4 rounded-2xl">
                         <p className="text-[10px] uppercase font-bold text-amber-800/60 mb-1">Alcohol Used</p>
                         <p className="text-xl font-bold">{kpi.alcohol_used_for_ginger_drums} Drums</p>
                      </div>
                      <div className="bg-amber-950/5 p-4 rounded-2xl">
                         <p className="text-[10px] uppercase font-bold text-amber-800/60 mb-1">G/T Juice</p>
                         <p className="text-xl font-bold">{kpi.ginger_gt_juice_litres} Litres</p>
                      </div>
                      <div className="bg-amber-950/5 p-4 rounded-2xl">
                         <p className="text-[10px] uppercase font-bold text-amber-800/60 mb-1">Bottles Used</p>
                         <p className="text-xl font-bold">{kpi.total_bottles_ginger.toLocaleString()} Units</p>
                      </div>
                      <div className="bg-amber-950/5 p-4 rounded-2xl">
                         <p className="text-[10px] uppercase font-bold text-amber-800/60 mb-1">Live Stock</p>
                         <p className="text-xl font-bold text-emerald-700">{kpi.live_ginger_stock.toLocaleString()} Cartons</p>
                      </div>
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
