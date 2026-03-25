"use client"

import { useState, useEffect } from "react"
import { RefreshCw, Package, Droplet, Tag, FlaskConical, Box, AlertTriangle, Activity } from "lucide-react"

// ── Colour tokens ──────────────────────────────────────────────────────────
const BITTERS_BORDER  = "border-black"
const BITTERS_BADGE   = "bg-black text-white"
const BITTERS_TEXT    = "text-black"
const GINGER_BORDER   = "border-yellow-400"
const GINGER_BADGE    = "bg-yellow-400 text-black"
const GINGER_TEXT     = "text-yellow-600"
const GENERAL_BORDER  = "border-emerald-300"

interface KPIData {
  current_alcohol_balance:   number
  current_preform_balance:   number
  total_alcohol_used_litres: number
  total_preforms_used:       number
  total_caps_used:           number
  caps_remaining:            number
  labels_bitters_remaining:  number
  labels_ginger_remaining:   number
  caramel_bitters_remaining: number
  caramel_ginger_remaining:  number
  total_labels_bitters_used: number
  total_labels_ginger_used:  number
  live_bitters_stock:        number
  live_ginger_stock:         number
  last_updated:              string
}

interface LiveStock {
  available:        number
  quantityProduced: number
  quantityLoaded:   number
  minimumThreshold: number
}

// ── Reusable stat card ─────────────────────────────────────────────────────
function StatCard({
  label, value, unit, icon: Icon,
  borderClass = GENERAL_BORDER,
  valueClass  = "text-emerald-900",
  alert = false,
}: {
  label: string; value: number; unit?: string
  icon?: React.ElementType; borderClass?: string; valueClass?: string; alert?: boolean
}) {
  return (
    <div className={`bg-white rounded-2xl border-2 ${borderClass} p-4 space-y-2 ${alert ? "bg-red-50 border-red-400" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 leading-tight">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-slate-400 shrink-0" />}
        {alert && <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 animate-pulse" />}
      </div>
      <p className={`text-2xl font-black tabular-nums ${alert ? "text-red-700" : valueClass}`}>
        {value.toLocaleString()}
      </p>
      {unit && <p className="text-[10px] font-semibold text-slate-400">{unit}</p>}
    </div>
  )
}

// ── Live stock card ────────────────────────────────────────────────────────
function LiveCard({ name, data }: { name: "Bitters" | "Ginger"; data: LiveStock }) {
  const isBitters    = name === "Bitters"
  const threshold    = data.minimumThreshold > 0 ? data.minimumThreshold : 50
  const isLow        = data.available <= threshold
  const isEmpty      = data.available <= 0
  const borderClass  = isEmpty || isLow ? "border-red-400" : isBitters ? BITTERS_BORDER : GINGER_BORDER
  const dotColor     = isEmpty ? "bg-red-600" : isLow ? "bg-red-500 animate-pulse" : isBitters ? "bg-black" : "bg-yellow-400"

  return (
    <div className={`bg-white rounded-2xl border-2 ${borderClass} p-5 space-y-3 ${isEmpty || isLow ? "bg-red-50" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
          <span className={`text-sm font-bold ${isBitters ? BITTERS_TEXT : GINGER_TEXT}`}>{name}</span>
          {(isEmpty || isLow) && (
            <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-100 px-2 py-0.5 rounded-full animate-pulse">
              {isEmpty ? "Out of Stock" : "Low Stock"}
            </span>
          )}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isBitters ? BITTERS_BADGE : GINGER_BADGE}`}>
          {name}
        </span>
      </div>

      <p className={`text-4xl font-black tabular-nums ${isEmpty || isLow ? "text-red-700" : isBitters ? "text-black" : "text-yellow-600"}`}>
        {data.available.toLocaleString()}
        <span className="text-sm font-semibold text-slate-400 ml-1">ctns</span>
      </p>

      {data.minimumThreshold > 0 && (
        <p className="text-xs text-slate-400 font-medium">Minimum threshold: {data.minimumThreshold}</p>
      )}

      {(data.quantityProduced > 0 || data.quantityLoaded > 0) && (
        <div className="border-t border-slate-100 pt-2 space-y-1">
          {data.quantityProduced > 0 && (
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>Last produced</span>
              <span className="font-bold text-emerald-600">+{data.quantityProduced}</span>
            </div>
          )}
          {data.quantityLoaded > 0 && (
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>Last loaded out</span>
              <span className="font-bold text-slate-600">−{data.quantityLoaded}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export function ProcurementDashboard() {
  const [kpi, setKpi]           = useState<KPIData | null>(null)
  const [live, setLive]         = useState<{ bitters: LiveStock; ginger: LiveStock } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const fetchAll = async () => {
    try {
      setRefreshing(true)
      setError(null)
      const [kpiRes, liveRes] = await Promise.all([
        fetch("/api/analytics/kpis"),
        fetch("/api/live-stocks"),
      ])
      if (!kpiRes.ok || !liveRes.ok) throw new Error("Failed to fetch data")
      const [kpiData, liveData] = await Promise.all([kpiRes.json(), liveRes.json()])
      setKpi(kpiData)
      setLive(liveData)
    } catch (e) {
      setError("Unable to load stock data. Please refresh.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 60_000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="space-y-6 animate-fade-in-up">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-950">
            Stock Overview
          </h2>
          <p className="text-sm text-emerald-700/70 font-medium mt-1">
            Live inventory · remaining materials · usage
          </p>
          {kpi && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              Updated: {new Date(kpi.last_updated).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchAll}
          disabled={refreshing}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="bg-white rounded-3xl border border-emerald-100 p-16 text-center">
          <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 font-medium text-sm">Loading stock data…</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-700 font-semibold text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && kpi && live && (
        <>
          {/* ── 1. Live Inventory ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-black uppercase tracking-widest text-emerald-900">
                Live Inventory (Cartons Available)
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <LiveCard name="Bitters" data={live.bitters} />
              <LiveCard name="Ginger"  data={live.ginger}  />
            </div>
          </section>

          {/* ── 2. Remaining Materials ────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-900 mb-3">
              Remaining Raw Materials
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard
                label="Alcohol Stock"   value={kpi.current_alcohol_balance}
                unit="Remaining"        icon={Droplet}
                borderClass={GENERAL_BORDER}
              />
              <StatCard
                label="Preforms"        value={kpi.current_preform_balance}
                unit="Bags remaining"   icon={Package}
                borderClass={GENERAL_BORDER}
              />
              <StatCard
                label="Caps"            value={kpi.caps_remaining}
                unit="Units remaining"  icon={Box}
                borderClass={GENERAL_BORDER}
              />
              <StatCard
                label="Labels — Bitters" value={kpi.labels_bitters_remaining}
                unit="Units remaining"   icon={Tag}
                borderClass={BITTERS_BORDER} valueClass={BITTERS_TEXT}
              />
              <StatCard
                label="Labels — Ginger"  value={kpi.labels_ginger_remaining}
                unit="Units remaining"   icon={Tag}
                borderClass={GINGER_BORDER} valueClass={GINGER_TEXT}
              />
              <StatCard
                label="Caramel — Bitters" value={kpi.caramel_bitters_remaining}
                unit="Remaining"          icon={FlaskConical}
                borderClass={BITTERS_BORDER} valueClass={BITTERS_TEXT}
              />
              <StatCard
                label="Caramel — Ginger"  value={kpi.caramel_ginger_remaining}
                unit="Remaining"           icon={FlaskConical}
                borderClass={GINGER_BORDER} valueClass={GINGER_TEXT}
              />
            </div>
          </section>

          {/* ── 3. Quantity Used ──────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-black uppercase tracking-widest text-emerald-900 mb-3">
              Quantity Used (All Time)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard
                label="Alcohol Used"    value={kpi.total_alcohol_used_litres}
                unit="Litres"           icon={Droplet}
                borderClass={GENERAL_BORDER}
              />
              <StatCard
                label="Preforms Used"   value={kpi.total_preforms_used}
                unit="Bags"             icon={Package}
                borderClass={GENERAL_BORDER}
              />
              <StatCard
                label="Caps Used"       value={kpi.total_caps_used}
                unit="Units"            icon={Box}
                borderClass={GENERAL_BORDER}
              />
              <StatCard
                label="Labels — Bitters" value={kpi.total_labels_bitters_used}
                unit="Units"             icon={Tag}
                borderClass={BITTERS_BORDER} valueClass={BITTERS_TEXT}
              />
              <StatCard
                label="Labels — Ginger"  value={kpi.total_labels_ginger_used}
                unit="Units"             icon={Tag}
                borderClass={GINGER_BORDER} valueClass={GINGER_TEXT}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
