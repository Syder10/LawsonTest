"use client"

import { FileText, BarChart2, Package } from "lucide-react"
import { ActionBtn } from "@/components/features/shared/action-btn"

// Procurement home: hero + entry points. All stock detail lives on the stock
// dashboard; the receive/issue form lives at /submit.
export function ProcurementDashboard() {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-4 animate-fade-in-up max-w-lg mx-auto">
      <div className="rounded-3xl overflow-hidden shadow-lg shadow-emerald-900/10">
        <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-emerald-900 px-5 pt-8 pb-8 sm:px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-600/30 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-emerald-300" />
          </div>
          <p className="text-emerald-400/70 text-[9px] font-black uppercase tracking-[0.2em]">{greeting}</p>
          <h2 className="text-white text-2xl font-black tracking-tight mt-1">Stock Office</h2>
          <p className="text-emerald-400/60 text-xs font-medium mt-1">Procurement &amp; Raw Materials</p>
        </div>
      </div>

      <div className="space-y-2">
        <ActionBtn href="/dashboard/procurement/stock" icon={BarChart2} label="Stock Dashboard" primary />
        <ActionBtn href="/dashboard/procurement/submit" icon={FileText} label="Log Receipt / Issue Materials" />
      </div>
    </div>
  )
}
