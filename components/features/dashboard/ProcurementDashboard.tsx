"use client"

import { BarChart2, FileText, History, Package } from "lucide-react"
import { ActionBtn } from "@/components/features/shared/action-btn"
import { Eyebrow } from "@/components/primitives"

// Procurement home: hero plus entry points. All stock detail lives on the stock
// dashboard; the receive/issue form lives at /submit.
export function ProcurementDashboard() {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-4 animate-fade-in-up max-w-lg mx-auto">
      {/* The dark hero is the app's most distinctive surface. It is deliberately the
          same in both themes — it reads as a deep brand panel rather than as "light
          mode" — which is exactly what the --hero-* tokens encode, so it shares
          `.hero-panel` with the supervisor home instead of spelling out its own hex. */}
      <div className="rounded-3xl overflow-hidden shadow-lg">
        <div className="hero-panel px-5 py-8 sm:px-6 text-center">
          <span className="w-14 h-14 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-white" aria-hidden="true" />
          </span>
          <Eyebrow className="text-white/60">{greeting}</Eyebrow>
          <h2 className="text-white text-2xl font-bold tracking-tight mt-1">Stock Office</h2>
          <p className="text-white/70 text-sm font-medium mt-1">Procurement &amp; raw materials</p>
        </div>
      </div>

      <div className="space-y-2">
        <ActionBtn href="/dashboard/procurement/stock" icon={BarChart2} label="Stock levels & days of cover" primary />
        <ActionBtn href="/dashboard/procurement/submit" icon={FileText} label="Log a receipt or issue" />
        <ActionBtn href="/dashboard/history" icon={History} label="Submission history" />
      </div>
    </div>
  )
}
