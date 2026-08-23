"use client"

import type { ReactNode } from "react"
import { fmt } from "./viz"

// Headline stat tile. A bare number is the right "form" for a single magnitude —
// no chart. Text wears text tokens; the accent is a thin left rule, not the
// number's colour.
export function StatTile({
  label,
  value,
  unit,
  sub,
  icon,
  accent = "emerald",
}: {
  label: string
  value: number | string
  unit?: string
  sub?: string
  icon?: ReactNode
  accent?: "emerald" | "amber" | "slate"
}) {
  const rule = accent === "amber" ? "bg-amber-500" : accent === "slate" ? "bg-slate-400" : "bg-emerald-500"
  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 p-4 overflow-hidden">
      <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${rule}`} />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 truncate">{label}</p>
          <p className="text-2xl font-black text-slate-900 tabular-nums mt-1 leading-none">
            {typeof value === "number" ? fmt(value) : value}
            {unit && <span className="text-sm font-bold text-slate-400 ml-1">{unit}</span>}
          </p>
          {sub && <p className="text-[11px] font-semibold text-slate-400 mt-1.5">{sub}</p>}
        </div>
        {icon && <div className="text-slate-300 shrink-0">{icon}</div>}
      </div>
    </div>
  )
}
