"use client"
import { LogOut, Download, RefreshCw, Package, Droplet, AlertCircle, TrendingUp, Box, Tag, FlaskConical } from "lucide-react"
import { useState, useEffect } from "react"
import Image from "next/image"

interface ManagerDashboardScreenProps {
  onLogout: () => void
}

interface KPIData {
  total_production_cartons: number
  bitters_cartons: number
  ginger_cartons: number
  total_alcohol_used_litres: number
  current_alcohol_balance: number
  current_preform_balance: number
  total_preforms_used: number
  alcohol_used_for_bitters_drums: number
  total_concentrate_used_litres: number
  total_spices_used_litres: number
  total_caramel_used_gallons: number
  total_water_litres: number
  alcohol_used_for_ginger_drums: number
  ginger_water_used_litres: number
  ginger_gt_juice_litres: number
  ginger_spices_used_litres: number
  ginger_caramel_used_gallons: number
  live_bitters_stock: number
  live_ginger_stock: number
  caps_remaining: number
  labels_bitters_remaining: number
  labels_ginger_remaining: number
  caramel_bitters_remaining: number
  caramel_ginger_remaining: number
  total_caps_used: number
  total_labels_bitters_used: number
  total_labels_ginger_used: number
  total_bottles_bitters: number
  total_bottles_ginger: number
  monthly_trend: { month: string; total: number; bitters: number; ginger: number }[]
  last_updated: string
}

function Sparkline({ data, color = "#059669", height = 40 }: { data: number[]; color?: string; height?: number }) {
  const w = 120, h = height
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 6) - 3
    return `${x},${y}`
  })
  const polyline = pts.join(" ")
  const area = `0,${h} ${polyline} ${w},${h}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg-${color.replace("#", "")})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => {
        const x = (i / (data.length - 1)) * w
        const y = h - ((v - min) / range) * (h - 6) - 3
        return <circle key={i} cx={x} cy={y} r={i === data.length - 1 ? 3 : 2} fill={color} opacity={i === data.length - 1 ? 1 : 0.5} />
      })}
    </svg>
  )
}

function ProductionLineChart({ data, filter }: { data: KPIData["monthly_trend"]; filter: "all" | "Bitters" | "Ginger" }) {
  const W = 800, H = 220, PL = 60, PR = 20, PT = 20, PB = 40
  const cW = W - PL - PR, cH = H - PT - PB
  const allSeries = data.map(d => d.total)
  const bitSeries = data.map(d => d.bitters)
  const ginSeries = data.map(d => d.ginger)
  const max = Math.max(...(filter === "all" ? allSeries : filter === "Bitters" ? bitSeries : ginSeries), 1)
  const toPath = (vals: number[], clr: string) => {
    if (vals.every(v => v === 0)) return null
    const pts = vals.map((v, i) => `${PL + (i / (vals.length - 1)) * cW},${PT + cH - (v / max) * cH}`)
    return <polyline key={clr} points={pts.join(" ")} fill="none" stroke={clr} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  }
  const toDots = (vals: number[], clr: string) =>
    vals.map((v, i) => (
      <circle key={`${clr}-${i}`} cx={PL + (i / (vals.length - 1)) * cW} cy={PT + cH - (v / max) * cH} r={3.5} fill={clr} />
    ))
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 320 }}>
        {Array.from({ length: 5 }, (_, i) => {
          const y = PT + (i / 4) * cH
          return (
            <g key={i}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#d1fae5" strokeWidth="1" strokeDasharray="4,4" />
              <text x={PL - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#6b7280">{Math.round(max - (i / 4) * max).toLocaleString()}</text>
            </g>
          )
        })}
        {data.map((d, i) => (
          <text key={i} x={PL + (i / (data.length - 1)) * cW} y={H - 6} textAnchor="middle" fontSize="10" fill="#6b7280">{d.month}</text>
        ))}
        {filter === "all" ? <>{toPath(allSeries, "#059669")}{toPath(bitSeries, "#1e3a2f")}{toPath(ginSeries, "#d97706")}</> : filter === "Bitters" ? toPath(bitSeries, "#1e3a2f") : toPath(ginSeries, "#d97706")}
        {filter === "all" ? <>{toDots(allSeries, "#059669")}{toDots(bitSeries, "#1e3a2f")}{toDots(ginSeries, "#d97706")}</> : filter === "Bitters" ? toDots(bitSeries, "#1e3a2f") : toDots(ginSeries, "#d97706")}
        {filter === "all" && (
          <g>
            <rect x={PL} y={PT - 14} width={10} height={10} rx={2} fill="#059669" /><text x={PL + 13} y={PT - 5} fontSize="10" fill="#374151">Total</text>
            <rect x={PL + 50} y={PT - 14} width={10} height={10} rx={2} fill="#1e3a2f" /><text x={PL + 63} y={PT - 5} fontSize="10" fill="#374151">Bitters</text>
            <rect x={PL + 115} y={PT - 14} width={10} height={10} rx={2} fill="#d97706" /><text x={PL + 128} y={PT - 5} fontSize="10" fill="#374151">Ginger</text>
          </g>
        )}
      </svg>
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, sparkData, sparkColor, highlight = false }: {
  label: string; value: string | number; sub?: string; icon?: any
  sparkData?: number[]; sparkColor?: string; highlight?: boolean
}) {
  return (
    <div className={`glass-panel p-5 space-y-2 hover:scale-[1.02] transition-all ${highlight ? "ring-2 ring-emerald-400/40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] md:text-xs text-emerald-700/70 font-bold uppercase tracking-widest leading-tight">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
      </div>
      <p className="text-2xl md:text-3xl font-black text-emerald-950 tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {sub && <p className="text-[10px] text-emerald-600/60 font-semibold">{sub}</p>}
      {sparkData && sparkData.length > 1 && <div className="pt-1"><Sparkline data={sparkData} color={sparkColor || "#059669"} /></div>}
    </div>
  )
}

function SectionHeader({ label, badge, badgeColor = "bg-emerald-950 text-white" }: { label: string; badge?: string | number; badgeColor?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm md:text-base font-black text-emerald-950 uppercase tracking-widest">{label}</h2>
      {badge != null && <span className={`text-xs font-bold px-3 py-1 rounded-full ${badgeColor}`}>{typeof badge === "number" ? badge.toLocaleString() : badge} ctns</span>}
    </div>
  )
}

export default function ManagerDashboardScreen({ onLogout }: ManagerDashboardScreenProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [kpiData, setKpiData] = useState<KPIData | null>(null)
  const [isLoadingKPIs, setIsLoadingKPIs] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [filterType, setFilterType] = useState<"all" | "month">("all")
  const [productFilter, setProductFilter] = useState<"all" | "Bitters" | "Ginger">("all")

  const fetchKPIs = async (year?: number, month?: number, type?: string) => {
    try {
      setIsRefreshing(true)
      setError(null)
      const queryParams = new URLSearchParams()
      if (type === "month" && year && month) {
        queryParams.append("year", year.toString())
        queryParams.append("month", month.toString())
      }
      const response = await fetch(`/api/analytics/kpis?${queryParams.toString()}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to fetch KPIs")
      if (data.error) throw new Error(data.error)
      setKpiData(data)
      setIsLoadingKPIs(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unknown error occurred")
      setIsLoadingKPIs(false)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchKPIs(undefined, undefined, "all")
    const interval = setInterval(() => fetchKPIs(undefined, undefined, "all"), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const handleFilterChange = (type: "all" | "month") => {
    setFilterType(type)
    if (type === "all") fetchKPIs(undefined, undefined, "all")
    else fetchKPIs(selectedYear, selectedMonth, type)
  }

  const handleExcelExport = async () => {
    setIsExporting(true)
    try {
      const response = await fetch("/api/records/export")
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `production_records_${new Date().toISOString().split("T")[0]}.csv`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch { alert("Failed to export file") } finally { setIsExporting(false) }
  }

  const d = kpiData
  const bottlesBitters = d?.total_bottles_bitters || 0
  const bottlesGinger = d?.total_bottles_ginger || 0
  const totalBottles = bottlesBitters + bottlesGinger
  const trendBitters = d?.monthly_trend.map(m => m.bitters) || []
  const trendGinger = d?.monthly_trend.map(m => m.ginger) || []
  const trendTotal = d?.monthly_trend.map(m => m.total) || []

  return (
    <div className="w-full min-h-screen bg-mesh p-3 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="glass-panel p-4 md:p-6 animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="Lawson LLC" width={64} height={64} className="drop-shadow-xl rounded-lg bg-white p-1.5 shrink-0" />
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-emerald-950 tracking-tight">Manager Dashboard</h1>
                <p className="text-xs font-bold text-emerald-700/50 uppercase tracking-[0.2em] mt-0.5">Lawson Limited Company</p>
                {d && <p className="text-[10px] text-emerald-600/50 mt-1">Updated: {new Date(d.last_updated).toLocaleString()}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto min-w-0 md:min-w-[360px]">
              <div className="flex gap-2">
                {(["all", "month"] as const).map(t => (
                  <button key={t} onClick={() => handleFilterChange(t)}
                    className={`flex-1 glass-button py-2 px-4 rounded-lg text-sm font-bold ${filterType === t ? "bg-primary/20 border-primary text-primary" : "border-primary/30 text-primary"}`}>
                    {t === "all" ? "All Time" : "Monthly"}
                  </button>
                ))}
                <button onClick={() => fetchKPIs(filterType === "all" ? undefined : selectedYear, filterType === "all" ? undefined : selectedMonth, filterType)} disabled={isRefreshing} className="glass-button py-2 px-3 rounded-lg border-primary/30 disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 text-primary ${isRefreshing ? "animate-spin" : ""}`} />
                </button>
                <button onClick={onLogout} className="glass-button py-2 px-3 rounded-lg border-primary/30">
                  <LogOut className="w-4 h-4 text-primary" />
                </button>
              </div>
              {filterType === "month" && (
                <div className="flex gap-2">
                  <select value={selectedMonth} onChange={e => { setSelectedMonth(+e.target.value); fetchKPIs(selectedYear, +e.target.value, "month") }} className="flex-1 glass-button py-2 px-3 rounded-lg text-sm text-primary border-primary/30 bg-white/10">
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2024, i).toLocaleString("default", { month: "long" })}</option>)}
                  </select>
                  <select value={selectedYear} onChange={e => { setSelectedYear(+e.target.value); fetchKPIs(+e.target.value, selectedMonth, "month") }} className="flex-1 glass-button py-2 px-3 rounded-lg text-sm text-primary border-primary/30 bg-white/10">
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
              {/* Product filter */}
              <div className="flex gap-2">
                {(["all", "Bitters", "Ginger"] as const).map(p => (
                  <button key={p} onClick={() => setProductFilter(p)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                      productFilter === p
                        ? p === "Bitters" ? "bg-emerald-950 text-white border-emerald-950"
                          : p === "Ginger" ? "bg-amber-400 text-emerald-950 border-amber-400"
                          : "bg-primary/20 border-primary text-primary"
                        : "glass-button border-primary/30 text-primary"
                    }`}>
                    {p === "all" ? "All Products" : p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {isLoadingKPIs ? (
          <div className="glass-panel p-16 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full mx-auto mb-4" />
            <p className="text-emerald-700/60 font-semibold">Loading analytics...</p>
          </div>
        ) : error ? (
          <div className="glass-panel p-12 text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
            <h3 className="text-lg font-bold text-emerald-950">Failed to Load Analytics</h3>
            <p className="text-sm text-emerald-700/60">{error}</p>
            <button onClick={() => fetchKPIs()} className="glass-button-primary py-2 px-6 rounded-lg font-semibold">Retry</button>
          </div>
        ) : d ? (
          <div className="space-y-6">

            {/* ROW 1 — AVAILABLE STOCK */}
            <div className="glass-panel p-5 md:p-6">
              <SectionHeader label="Available Stock" />
              <div className={`grid gap-4 ${productFilter === "all" ? "grid-cols-2" : "grid-cols-1 max-w-xs"}`}>
                {(productFilter === "all" || productFilter === "Bitters") && (
                  <StatCard label="Available — Bitters" value={d.live_bitters_stock} sub="Cartons in stock" icon={Package} highlight sparkData={trendBitters} sparkColor="#1e3a2f" />
                )}
                {(productFilter === "all" || productFilter === "Ginger") && (
                  <StatCard label="Available — Ginger" value={d.live_ginger_stock} sub="Cartons in stock" icon={Package} sparkData={trendGinger} sparkColor="#d97706" />
                )}
              </div>
            </div>

            {/* ROW 2 — REMAINING MATERIALS */}
            <div className="glass-panel p-5 md:p-6">
              <SectionHeader label="Remaining Materials" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <StatCard label="Alcohol Stock" value={d.current_alcohol_balance} sub="Remaining" icon={Droplet} />
                <StatCard label="Caps Remaining" value={d.caps_remaining} sub="Units" icon={Box} />
                {(productFilter === "all" || productFilter === "Bitters") && <StatCard label="Labels — Bitters" value={d.labels_bitters_remaining} sub="Units" icon={Tag} />}
                {(productFilter === "all" || productFilter === "Ginger") && <StatCard label="Labels — Ginger" value={d.labels_ginger_remaining} sub="Units" icon={Tag} />}
                {(productFilter === "all" || productFilter === "Bitters") && <StatCard label="Caramel — Bitters" value={d.caramel_bitters_remaining} sub="Remaining" icon={FlaskConical} />}
                {(productFilter === "all" || productFilter === "Ginger") && <StatCard label="Caramel — Ginger" value={d.caramel_ginger_remaining} sub="Remaining" icon={FlaskConical} />}
                <StatCard label="Preforms Balance" value={d.current_preform_balance} sub="Bags Remaining" icon={Package} />
              </div>
            </div>

            {/* ROW 3 — QUANTITY USED */}
            <div className="glass-panel p-5 md:p-6">
              <SectionHeader label="Quantity Used" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard label="Alcohol Used" value={d.total_alcohol_used_litres} sub="Drums" icon={Droplet} />
                <StatCard label="Preforms Used" value={d.total_preforms_used} sub="Bags" icon={Package} />
                <StatCard label="Caps Used" value={d.total_caps_used} sub="Units" icon={Box} />
                {(productFilter === "all" || productFilter === "Bitters") && <StatCard label="Labels Used — Bitters" value={d.total_labels_bitters_used} sub="Units" icon={Tag} />}
                {(productFilter === "all" || productFilter === "Ginger") && <StatCard label="Labels Used — Ginger" value={d.total_labels_ginger_used} sub="Units" icon={Tag} />}
                {(productFilter === "all" || productFilter === "Bitters") && <StatCard label="Bottles Used — Bitters" value={bottlesBitters} sub={`${d.bitters_cartons.toLocaleString()} ctns × 12`} icon={Package} />}
                {(productFilter === "all" || productFilter === "Ginger") && <StatCard label="Bottles Used — Ginger" value={bottlesGinger} sub={`${d.ginger_cartons.toLocaleString()} ctns × 12`} icon={Package} />}
                {productFilter === "all" && <StatCard label="Total Bottles Used" value={totalBottles} sub="All products" icon={Package} highlight />}
              </div>
            </div>

            {/* ROW 4 — PRODUCTION OUTPUT + CHART */}
            <div className="glass-panel p-5 md:p-6">
              <SectionHeader label="Production Output" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {productFilter === "all" && <StatCard label="Total Production" value={d.total_production_cartons} sub="All cartons" icon={TrendingUp} sparkData={trendTotal} sparkColor="#059669" highlight />}
                {(productFilter === "all" || productFilter === "Bitters") && <StatCard label="Bitters Production" value={d.bitters_cartons} sub="Cartons" icon={Package} sparkData={trendBitters} sparkColor="#1e3a2f" />}
                {(productFilter === "all" || productFilter === "Ginger") && <StatCard label="Ginger Production" value={d.ginger_cartons} sub="Cartons" icon={Package} sparkData={trendGinger} sparkColor="#d97706" />}
              </div>
              <div className="glass-panel p-4">
                <p className="text-xs font-bold text-emerald-700/60 uppercase tracking-widest mb-3">6-Month Production Trend</p>
                {d.monthly_trend.length > 1
                  ? <ProductionLineChart data={d.monthly_trend} filter={productFilter} />
                  : <p className="text-sm text-emerald-700/40 text-center py-8">Not enough data for trend chart</p>}
              </div>
            </div>

            {/* ROW 5 — PRODUCTION INPUTS BITTERS */}
            {(productFilter === "all" || productFilter === "Bitters") && (
              <div className="border-4 border-emerald-950 rounded-xl p-5 md:p-6">
                <SectionHeader label="Production Inputs & Materials — Bitters" badge={d.bitters_cartons} badgeColor="bg-emerald-950 text-white" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <StatCard label="Alcohol for Bitters" value={d.alcohol_used_for_bitters_drums} sub="Drums" icon={Droplet} />
                  <StatCard label="Concentrate Used" value={d.total_concentrate_used_litres} sub="Litres" />
                  <StatCard label="Spices Used" value={d.total_spices_used_litres} sub="Litres" />
                  <StatCard label="Caramel Used" value={d.total_caramel_used_gallons} sub="Gallons" />
                  <StatCard label="Water Used" value={d.total_water_litres} sub="Litres" />
                  <StatCard label="Labels Used" value={d.total_labels_bitters_used} sub="Units" icon={Tag} />
                  <StatCard label="Caps Used" value={d.total_caps_used} sub="Units" icon={Box} />
                  <StatCard label="Bottles Used" value={bottlesBitters} sub={`${d.bitters_cartons.toLocaleString()} × 12`} icon={Package} />
                </div>
              </div>
            )}

            {/* ROW 6 — PRODUCTION INPUTS GINGER */}
            {(productFilter === "all" || productFilter === "Ginger") && (
              <div className="border-4 border-amber-400 rounded-xl p-5 md:p-6">
                <SectionHeader label="Production Inputs & Materials — Ginger" badge={d.ginger_cartons} badgeColor="bg-amber-400 text-emerald-950" />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  <StatCard label="Alcohol for Ginger" value={d.alcohol_used_for_ginger_drums} sub="Drums" icon={Droplet} />
                  <StatCard label="Water Used" value={d.ginger_water_used_litres} sub="Litres" />
                  <StatCard label="G/T Juice" value={d.ginger_gt_juice_litres} sub="Litres" />
                  <StatCard label="Spices Used" value={d.ginger_spices_used_litres} sub="Litres" />
                  <StatCard label="Caramel Used" value={d.ginger_caramel_used_gallons} sub="Gallons" />
                  <StatCard label="Labels Used" value={d.total_labels_ginger_used} sub="Units" icon={Tag} />
                  <StatCard label="Bottles Used" value={bottlesGinger} sub={`${d.ginger_cartons.toLocaleString()} × 12`} icon={Package} />
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="glass-panel p-12 text-center">
            <p className="text-emerald-700/60 font-semibold">No data available</p>
            <button onClick={() => fetchKPIs()} className="mt-4 glass-button-primary py-2 px-6 rounded-lg font-semibold">Load Data</button>
          </div>
        )}

        {/* Export */}
        <div className="glass-panel p-5 flex flex-col md:flex-row gap-4">
          <button onClick={handleExcelExport} disabled={isExporting} className="flex-1 glass-button-primary py-3 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Export Records as CSV"}
          </button>
        </div>

      </div>
    </div>
  )
}
