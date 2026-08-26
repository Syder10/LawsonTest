"use client"

import { useState, useEffect, useCallback } from "react"
import { ClipboardCheck } from "lucide-react"
import { STATUS, fmt, fmt1, shortDay } from "./viz"
import type { MaterialStatus } from "./types"
import { byUrgency } from "@/lib/domain/stock-status"
import { StatusBadge } from "@/components/primitives"
import { ReconcileModal, ledgerTargetForKey, type ReconcileTarget } from "@/components/features/stock/reconcile-modal"

interface StockCount {
  id: string; date: string; shift: string | null; material: string
  product: string | null; variant: string | null
  counted_qty: number; computed_qty: number; variance: number
  kind: "baseline" | "reconciliation"; note: string | null; counted_by: string | null
}

// Materials keyed on operating-days-left, with a projected run-out date. Status
// is icon + label + colour (never colour alone). Sorted most-urgent first.
// Management can record a baseline/reconciliation count per ledger material; the
// resulting variances surface in the panel below.
export function MaterialsTable({ materials, redDays, amberDays, onReconciled }: { materials: MaterialStatus[]; redDays: number; amberDays: number; onReconciled?: () => void }) {
  const sorted = [...materials].sort(byUrgency)
  const [reconcile, setReconcile] = useState<ReconcileTarget | null>(null)
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<StockCount[]>([])

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/stock/reconcile?limit=8")
      if (res.ok) setCounts((await res.json()).counts ?? [])
    } catch { /* silent */ }
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

  const afterReconcile = () => { loadCounts(); onReconciled?.() }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-900">Materials — stock & days left</h3>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-semibold text-slate-400 hidden sm:inline">operating days (Mon–Sat) · critical ≤ {redDays} · low ≤ {amberDays}</span>
            <button onClick={() => { setReconcile(null); setOpen(true) }} className="h-8 px-2.5 flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-700 transition-colors"><ClipboardCheck className="w-3.5 h-3.5" /> New count</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50">
                <th className="text-left px-4 py-2">Material</th>
                <th className="text-right px-3 py-2">Remaining</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Used (range)</th>
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
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-700">
                    {fmt(m.remaining)} <span className="text-slate-400 text-xs font-medium">{m.unit}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt(m.usedInWindow)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{m.avgPerDay > 0 ? fmt1(m.avgPerDay) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums font-black ${m.level === "red" ? STATUS.red.text : m.level === "yellow" ? STATUS.yellow.text : "text-slate-700"}`}>
                    {m.operatingDaysLeft === null ? <span className="text-slate-300 font-medium">no usage</span> : `${fmt1(m.operatingDaysLeft)}d`}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">{m.runOutDate ? shortDay(m.runOutDate) : "—"}</td>
                  <td className="px-4 py-2.5 text-right"><StatusBadge level={m.level} /></td>
                  <td className="px-4 py-2.5 text-right">
                    {target ? (
                      <button onClick={() => { setReconcile({ ...target, label: m.label, unit: m.unit, currentRemaining: m.remaining }); setOpen(true) }}
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

      {/* Recent counts & variances */}
      {counts.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900">Recent counts & variances</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-3 py-2">Material</th>
                  <th className="text-right px-3 py-2">Counted</th>
                  <th className="text-right px-3 py-2">System</th>
                  <th className="text-right px-3 py-2">Variance</th>
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
                    <td className="px-4 py-2 text-slate-400 text-xs">{c.counted_by ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ReconcileModal open={open} onClose={() => setOpen(false)} onDone={afterReconcile} target={reconcile} />
    </div>
  )
}
