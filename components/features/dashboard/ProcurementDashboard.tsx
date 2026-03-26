"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, Package, Droplet, Tag, FlaskConical, Box, AlertTriangle, Activity, TrendingDown, ArrowRight } from "lucide-react"

// ── Colour tokens ──────────────────────────────────────────────────────────
const BITTERS = { border: "border-zinc-900", bg: "bg-zinc-900",  text: "text-zinc-900",   light: "bg-zinc-50",    badge: "bg-zinc-900 text-white",       dot: "bg-zinc-900" }
const GINGER  = { border: "border-amber-400", bg: "bg-amber-400", text: "text-amber-700",  light: "bg-amber-50",   badge: "bg-amber-400 text-zinc-900",   dot: "bg-amber-400" }
const GENERAL = { border: "border-emerald-200", bg: "bg-emerald-600", text: "text-emerald-700", light: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" }

interface KPIData {
  current_alcohol_balance: number; current_preform_balance: number
  total_alcohol_used_litres: number; total_preforms_used: number; total_caps_used: number
  caps_remaining: number; labels_bitters_remaining: number; labels_ginger_remaining: number
  caramel_bitters_remaining: number; caramel_ginger_remaining: number
  total_labels_bitters_used: number; total_labels_ginger_used: number
  live_bitters_stock: number; live_ginger_stock: number
  last_updated: string
}

interface LiveStock {
  available: number; quantityProduced: number; quantityLoaded: number; minimumThreshold: number
}

// ── Horizontal gauge ───────────────────────────────────────────────────────
function Gauge({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100)
  return (
    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Stock card (for live inventory) ───────────────────────────────────────
function StockCard({ name, data }: { name: "Bitters" | "Ginger"; data: LiveStock }) {
  const tok       = name === "Bitters" ? BITTERS : GINGER
  const threshold = data.minimumThreshold > 0 ? data.minimumThreshold : 50
  const isLow     = data.available <= threshold
  const isEmpty   = data.available <= 0
  const alert     = isEmpty || isLow
  const statusColor = isEmpty ? "bg-red-500" : isLow ? "bg-red-400 animate-pulse" : tok.dot

  return (
    <div className={`relative bg-white rounded-2xl border-2 overflow-hidden transition-all duration-300 ${alert ? "border-red-400" : tok.border}`}>
      {/* Top accent */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${alert ? "bg-red-500" : tok.bg}`} />

      <div className="p-5 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor} shrink-0`} />
            <span className={`text-sm font-black uppercase tracking-widest ${alert ? "text-red-700" : tok.text}`}>{name}</span>
            {alert && (
              <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-2.5 h-2.5" />
                {isEmpty ? "Out" : "Low"}
              </span>
            )}
          </div>
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${alert ? "bg-red-100 text-red-700" : tok.badge}`}>
            {name}
          </span>
        </div>

        {/* Big number */}
        <div className="mb-1">
          <span className={`text-5xl font-black tabular-nums tracking-tight ${alert ? "text-red-700" : tok.text}`}>
            {data.available.toLocaleString()}
          </span>
          <span className="text-sm text-slate-300 font-semibold ml-2">ctns</span>
        </div>
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Live cartons available</p>

        {/* Gauge */}
        {data.minimumThreshold > 0 && (
          <Gauge value={data.available} max={data.minimumThreshold * 4} color={alert ? "bg-red-400" : tok.bg} />
        )}

        {/* Footer breakdown */}
        {(data.quantityProduced > 0 || data.quantityLoaded > 0) && (
          <div className="mt-4 pt-3 border-t border-slate-50 flex gap-4">
            {data.quantityProduced > 0 && (
              <div>
                <p className="text-[9px] text-slate-300 uppercase tracking-wider font-bold">Last in</p>
                <p className="text-sm font-black text-emerald-600 tabular-nums">+{data.quantityProduced}</p>
              </div>
            )}
            {data.quantityLoaded > 0 && (
              <div>
                <p className="text-[9px] text-slate-300 uppercase tracking-wider font-bold">Last out</p>
                <p className="text-sm font-black text-slate-500 tabular-nums">−{data.quantityLoaded}</p>
              </div>
            )}
            {data.minimumThreshold > 0 && (
              <div className="ml-auto">
                <p className="text-[9px] text-slate-300 uppercase tracking-wider font-bold">Min. threshold</p>
                <p className="text-sm font-black text-slate-400 tabular-nums">{data.minimumThreshold}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Material row (for remaining + used) ───────────────────────────────────
function MatRow({ label, remaining, used, unit, icon: Icon, tok }: {
  label: string; remaining: number; used: number; unit: string
  icon?: React.ElementType; tok: typeof GENERAL
}) {
  const total = remaining + used
  const pct   = total > 0 ? Math.round((remaining / total) * 100) : 0
  const isLow = pct < 20
  return (
    <div className={`bg-white rounded-2xl border-2 ${tok.border} p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className={`w-3.5 h-3.5 ${tok.text} shrink-0 opacity-60`} />}
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 truncate">{label}</p>
        </div>
        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${isLow ? "bg-red-100 text-red-600" : tok.badge}`}>
          {pct}% left
        </span>
      </div>

      {/* Remaining vs used */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <p className={`text-xl font-black tabular-nums ${tok.text}`}>{remaining.toLocaleString()}</p>
          <p className="text-[9px] text-slate-300 font-semibold uppercase tracking-wider">Remaining {unit}</p>
        </div>
        <div className="flex items-center gap-1 text-slate-200">
          <ArrowRight className="w-3 h-3" />
        </div>
        <div className="flex-1 text-right">
          <p className="text-xl font-black tabular-nums text-slate-400">{used.toLocaleString()}</p>
          <p className="text-[9px] text-slate-300 font-semibold uppercase tracking-wider">Used {unit}</p>
        </div>
      </div>

      {/* Bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${isLow ? "bg-red-400" : tok.bg}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────
function Sec({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export function ProcurementDashboard() {
  const [kpi, setKpi]       = useState<KPIData | null>(null)
  const [live, setLive]     = useState<{ bitters: LiveStock; ginger: LiveStock } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setRefreshing(true); setError(null)
      const [kr, lr] = await Promise.all([fetch("/api/analytics/kpis"), fetch("/api/live-stocks")])
      if (!kr.ok || !lr.ok) throw new Error("Failed to fetch data")
      const [kd, ld] = await Promise.all([kr.json(), lr.json()])
      setKpi(kd); setLive(ld); setLastRefresh(new Date())
    } catch { setError("Unable to load. Check your connection and retry.") }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 60_000)
    return () => clearInterval(iv)
  }, [fetchAll])

  return (
    <div className="min-h-screen bg-slate-50/60 -m-4 sm:-m-6 md:-m-10 p-4 sm:p-6 md:p-8 animate-fade-in-up">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                  <TrendingDown className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">Stock Overview</h1>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Procurement & Stock Office</p>
                </div>
              </div>
              {lastRefresh && (
                <p className="text-[10px] text-slate-300 mt-2 ml-11">
                  Refreshed {lastRefresh.toLocaleTimeString()} · auto-updates every 60s
                </p>
              )}
            </div>
            <button onClick={fetchAll} disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all disabled:opacity-60 shadow-sm shadow-emerald-600/20 self-start sm:self-auto">
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-red-700 font-semibold text-sm flex-1">{error}</p>
            <button onClick={fetchAll} className="text-xs font-bold text-red-600 hover:text-red-800 underline shrink-0">Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 h-48 animate-pulse">
                <div className="h-2 w-16 bg-slate-100 rounded mb-4" />
                <div className="h-12 w-32 bg-slate-100 rounded mb-2" />
                <div className="h-1.5 bg-slate-100 rounded-full mt-6" />
              </div>
            ))}
          </div>
        )}

        {!loading && !error && kpi && live && (
          <div className="space-y-6">

            {/* ── 1. Live Inventory ─────────────────────────────────────── */}
            <Sec title="Live Inventory — Cartons Available" icon={Activity}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StockCard name="Bitters" data={live.bitters} />
                <StockCard name="Ginger"  data={live.ginger}  />
              </div>
            </Sec>

            {/* ── 2. Remaining vs Used ──────────────────────────────────── */}
            <Sec title="Remaining vs Used — Raw Materials" icon={Package}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MatRow label="Alcohol"         remaining={kpi.current_alcohol_balance}    used={kpi.total_alcohol_used_litres}    unit="L"     icon={Droplet}     tok={GENERAL}  />
                <MatRow label="Preforms"        remaining={kpi.current_preform_balance}    used={kpi.total_preforms_used}          unit="bags"  icon={Package}     tok={GENERAL}  />
                <MatRow label="Caps"            remaining={kpi.caps_remaining}             used={kpi.total_caps_used}              unit="units" icon={Box}         tok={GENERAL}  />
                <MatRow label="Labels — Bitters" remaining={kpi.labels_bitters_remaining}  used={kpi.total_labels_bitters_used}    unit="units" icon={Tag}         tok={BITTERS}  />
                <MatRow label="Labels — Ginger"  remaining={kpi.labels_ginger_remaining}   used={kpi.total_labels_ginger_used}     unit="units" icon={Tag}         tok={GINGER}   />
                <MatRow label="Caramel — Bitters" remaining={kpi.caramel_bitters_remaining} used={0}                              unit=""      icon={FlaskConical} tok={BITTERS} />
                <MatRow label="Caramel — Ginger"  remaining={kpi.caramel_ginger_remaining}  used={0}                              unit=""      icon={FlaskConical} tok={GINGER}  />
              </div>
            </Sec>

          </div>
        )}

      </div>
    </div>
  )
}
