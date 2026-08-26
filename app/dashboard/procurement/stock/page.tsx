"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { RefreshCw, ArrowLeft, Loader2, AlertCircle, AlertTriangle, PackageCheck, Send, ClipboardCheck } from "lucide-react"
import { StatTile } from "@/components/features/dashboard/manager/stat-tile"
import { STATUS, fmt, fmt1, shortDay } from "@/components/features/dashboard/manager/viz"
import type { Level } from "@/components/features/dashboard/manager/types"
import { byUrgency } from "@/lib/domain/stock-status"
import { StatusBadge } from "@/components/primitives"
import { ReconcileModal, ledgerTargetForKey, type ReconcileTarget } from "@/components/features/stock/reconcile-modal"

interface MaterialRow {
  key: string; label: string; unit: string; group: "procurement" | "production"
  remaining: number; receivedInWindow: number; usedInWindow: number
  avgPerDay: number; operatingDaysLeft: number | null; runOutDate: string | null; level: Level; breakdown: string | null
}
interface Receipt {
  date: string; material_type: string; received_by: string | null
  received_pcs: number; given_pcs: number; given_to: string | null; remarks: string | null
}
interface Report {
  filters: { from: string; to: string }
  materials: MaterialRow[]
  finishedGoods: { bitters: number; ginger: number }
  receipts: Receipt[]
  thresholds: { redDays: number; amberDays: number }
  last_updated: string
}
interface StockCount {
  id: string; date: string; shift: string | null; material: string
  product: string | null; variant: string | null
  counted_qty: number; computed_qty: number; variance: number
  kind: "baseline" | "reconciliation"; note: string | null; counted_by: string | null; created_at: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))
const PRESETS = [
  { label: "7d", from: () => daysAgo(6) },
  { label: "30d", from: () => daysAgo(29) },
  { label: "90d", from: () => daysAgo(89) },
]
const MAT_LABEL: Record<string, string> = {
  tax_stamp: "Tax Stamps", carton_bitters: "Cartons — Bitters", carton_ginger: "Cartons — Ginger",
  seal_tape: "Seal Tape", hair_net: "Hair Nets", nose_mask: "Nose Masks", gloves: "Gloves",
}

export default function ProcurementStockPage() {
  const [from, setFrom] = useState(daysAgo(29))
  const [to, setTo] = useState(iso(new Date()))
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [counts, setCounts] = useState<StockCount[]>([])
  const [reconcile, setReconcile] = useState<ReconcileTarget | null>(null)
  const [showReconcile, setShowReconcile] = useState(false)
  const params = useRef({ from, to })
  params.current = { from, to }

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/stock/reconcile?limit=50")
      if (res.ok) setCounts((await res.json()).counts ?? [])
    } catch { /* silent */ }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const { from, to } = params.current
      const res = await fetch(`/api/procurement/report?from=${from}&to=${to}`)
      if (!res.ok) throw new Error()
      setData(await res.json())
      loadCounts()
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [loadCounts])

  useEffect(() => { load() }, [load, from, to])
  useEffect(() => {
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [load])

  const sorted = data ? [...data.materials].sort(byUrgency) : []
  const critical = sorted.filter((m) => m.level === "red").length
  const low = sorted.filter((m) => m.level === "yellow").length

  return (
    <div className="w-full bg-[#f7f7f5] min-h-screen -m-4 sm:-m-6 md:-m-10 px-4 sm:px-6 md:px-10 py-8">
      <div className="max-w-[1200px] mx-auto space-y-5">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-2 bg-white rounded-full border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"><ArrowLeft className="w-5 h-5" /></Link>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-400">Procurement Office</p>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 leading-none mt-0.5">Stock Dashboard</h1>
              {data && (
                <p className="text-[10px] font-semibold text-slate-400 mt-1 tabular-nums">
                  Updated {new Date(data.last_updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {critical > 0 && <span className="ml-1.5 text-red-600 font-bold">· {critical} material{critical > 1 ? "s" : ""} critical</span>}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setReconcile(null); setShowReconcile(true) }} className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700 transition-colors"><ClipboardCheck className="w-3.5 h-3.5" /> New count</button>
            <Link href="/dashboard/procurement/submit" className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"><Send className="w-3.5 h-3.5" /> Log receipt / issue</Link>
            <button onClick={load} disabled={loading} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-emerald-400 transition-colors disabled:opacity-60">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
            </button>
          </div>
        </header>

        {/* Date range */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 mr-1">
            {PRESETS.map((p) => {
              const active = p.from() === from && to === iso(new Date())
              return (
                <button key={p.label} onClick={() => { setFrom(p.from()); setTo(iso(new Date())) }}
                  className={`h-9 px-3 text-xs font-bold rounded-lg border transition-colors ${active ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"}`}>{p.label}</button>
              )
            })}
          </div>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:outline-none" />
          <span className="text-slate-400 text-xs">→</span>
          <input type="date" value={to} min={from} max={iso(new Date())} onChange={(e) => setTo(e.target.value)} className="h-9 px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:outline-none" />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-red-700 font-bold text-sm">Unable to load stock data.</p>
            <button onClick={load} className="mt-2 text-xs font-bold text-red-600 underline">Retry</button>
          </div>
        )}

        {loading && !data && <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="w-7 h-7 animate-spin" /></div>}

        {data && (
          <>
            {/* Finished goods + restock alert summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Bitters — Finished" value={data.finishedGoods.bitters} unit="ctn" icon={<PackageCheck className="w-5 h-5" />} accent="emerald" />
              <StatTile label="Ginger — Finished" value={data.finishedGoods.ginger} unit="ctn" icon={<PackageCheck className="w-5 h-5" />} accent="amber" />
              <StatTile label="Critical — restock now" value={critical} unit="items" icon={<AlertCircle className="w-5 h-5" />} accent={critical > 0 ? "amber" : "slate"} />
              <StatTile label="Low — reorder soon" value={low} unit="items" icon={<AlertTriangle className="w-5 h-5" />} accent="slate" />
            </div>

            {/* Materials table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">Materials — stock & days left</h3>
                <span className="text-[10px] font-semibold text-slate-400">operating days (Mon–Sat) · critical ≤ {data.thresholds.redDays} · low ≤ {data.thresholds.amberDays}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50">
                      <th className="text-left px-4 py-2">Material</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-left px-3 py-2">Breakdown</th>
                      <th className="text-right px-3 py-2">Remaining</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Received</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Used/Issued</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Avg/op-day</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Days left</th>
                      <th className="text-right px-3 py-2 whitespace-nowrap">Runs out</th>
                      <th className="text-right px-4 py-2">Status</th>
                      <th className="text-right px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sorted.map((m) => {
                      const target = ledgerTargetForKey(m.key)
                      return (
                      <tr key={m.key} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 font-bold text-slate-800">{m.label}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${m.group === "procurement" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                            {m.group === "procurement" ? "Procurement" : "Production"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs">{m.breakdown ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700">{fmt(m.remaining)} <span className="text-slate-400 text-xs font-medium">{m.unit}</span></td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600 font-semibold">{m.receivedInWindow > 0 ? `+${fmt(m.receivedInWindow)}` : "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt(m.usedInWindow)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{m.avgPerDay > 0 ? fmt1(m.avgPerDay) : "—"}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums font-black ${m.level === "red" ? STATUS.red.text : m.level === "yellow" ? STATUS.yellow.text : "text-slate-700"}`}>
                          {m.operatingDaysLeft === null ? <span className="text-slate-300 font-medium">no usage</span> : `${fmt1(m.operatingDaysLeft)}d`}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">{m.runOutDate ? shortDay(m.runOutDate) : "—"}</td>
                        <td className="px-4 py-2.5 text-right"><StatusBadge level={m.level} /></td>
                        <td className="px-4 py-2.5 text-right">
                          {target ? (
                            <button onClick={() => { setReconcile({ ...target, label: m.label, unit: m.unit, currentRemaining: m.remaining }); setShowReconcile(true) }}
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline whitespace-nowrap">Count</button>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Receipts / issuance log */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-black text-slate-900">Receipts & issuance <span className="text-slate-400 font-semibold">· {shortDay(data.filters.from)} – {shortDay(data.filters.to)}</span></h3>
              </div>
              {data.receipts.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-semibold text-slate-400">No receipts or issuance in this range.</p>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-3 py-2">Material</th>
                        <th className="text-right px-3 py-2">Received</th>
                        <th className="text-right px-3 py-2">Issued</th>
                        <th className="text-left px-3 py-2">Issued to</th>
                        <th className="text-left px-4 py-2">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.receipts.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2 font-semibold text-slate-700 whitespace-nowrap">{shortDay(r.date)}</td>
                          <td className="px-3 py-2 text-slate-600">{MAT_LABEL[r.material_type] ?? r.material_type}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-600 font-semibold">{r.received_pcs > 0 ? `+${fmt(r.received_pcs)}` : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.given_pcs > 0 ? fmt(r.given_pcs) : "—"}</td>
                          <td className="px-3 py-2 text-slate-400 text-xs">{r.given_to ?? "—"}</td>
                          <td className="px-4 py-2 text-slate-400 text-xs">{r.received_by ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Stock counts & variances */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">Stock counts & variances</h3>
                <span className="text-[10px] font-semibold text-slate-400">baselines + reconciliations · latest 50</span>
              </div>
              {counts.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-semibold text-slate-400">No counts recorded yet. Use “New count” to set a baseline or reconcile.</p>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0">
                      <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50">
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-3 py-2">Material</th>
                        <th className="text-right px-3 py-2">Counted</th>
                        <th className="text-right px-3 py-2">System</th>
                        <th className="text-right px-3 py-2">Variance</th>
                        <th className="text-left px-3 py-2">Type</th>
                        <th className="text-left px-4 py-2">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {counts.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-2 font-semibold text-slate-700 whitespace-nowrap">{shortDay(c.date)}{c.shift ? ` · ${c.shift}` : ""}</td>
                          <td className="px-3 py-2 text-slate-600">{c.material}{c.product ? ` — ${c.product}` : ""}{c.variant ? ` (${c.variant})` : ""}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">{fmt(c.counted_qty)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(c.computed_qty)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-bold ${c.variance === 0 ? "text-slate-400" : c.variance > 0 ? "text-emerald-600" : "text-red-600"}`}>{c.variance > 0 ? "+" : ""}{fmt(c.variance)}</td>
                          <td className="px-3 py-2 text-xs"><span className={`px-1.5 py-0.5 rounded font-bold ${c.kind === "baseline" ? "bg-slate-100 text-slate-500" : "bg-amber-50 text-amber-600"}`}>{c.kind}</span></td>
                          <td className="px-4 py-2 text-slate-400 text-xs">{c.counted_by ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        <ReconcileModal open={showReconcile} onClose={() => setShowReconcile(false)} onDone={load} target={reconcile} />
      </div>
    </div>
  )
}
