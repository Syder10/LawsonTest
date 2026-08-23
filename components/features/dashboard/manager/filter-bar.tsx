"use client"

import { ChevronDown } from "lucide-react"
import { DEPARTMENTS } from "@/lib/domain/record-types"

export interface Filters {
  from: string
  to: string
  shift: string
  department: string
  product: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))

export const DEFAULT_FILTERS: Filters = { from: daysAgo(29), to: iso(new Date()), shift: "", department: "", product: "" }

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: "7d", range: () => ({ from: daysAgo(6), to: iso(new Date()) }) },
  { label: "30d", range: () => ({ from: daysAgo(29), to: iso(new Date()) }) },
  { label: "90d", range: () => ({ from: daysAgo(89), to: iso(new Date()) }) },
  { label: "This month", range: () => { const n = new Date(); return { from: `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-01`, to: iso(n) } } },
]

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 pl-3 pr-8 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:outline-none appearance-none">
        {children}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
    </div>
  )
}

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const isActivePreset = (p: (typeof PRESETS)[number]) => {
    const r = p.range()
    return r.from === filters.from && r.to === filters.to
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 mr-1">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => set(p.range())}
            className={`h-9 px-3 text-xs font-bold rounded-lg border transition-colors ${isActivePreset(p) ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400"}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input type="date" value={filters.from} max={filters.to} onChange={(e) => set({ from: e.target.value })}
          className="h-9 px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:outline-none" />
        <span className="text-slate-400 text-xs">→</span>
        <input type="date" value={filters.to} min={filters.from} max={iso(new Date())} onChange={(e) => set({ to: e.target.value })}
          className="h-9 px-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:outline-none" />
      </div>

      <Select value={filters.shift} onChange={(v) => set({ shift: v })}>
        <option value="">All shifts</option>
        <option value="Morning">Morning</option>
        <option value="Afternoon">Afternoon</option>
        <option value="Night">Night</option>
      </Select>

      <Select value={filters.department} onChange={(v) => set({ department: v })}>
        <option value="">All departments</option>
        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
      </Select>

      <Select value={filters.product} onChange={(v) => set({ product: v })}>
        <option value="">Both products</option>
        <option value="Bitters">Bitters</option>
        <option value="Ginger">Ginger</option>
      </Select>

      {(filters.shift || filters.department || filters.product) && (
        <button onClick={() => set({ shift: "", department: "", product: "" })}
          className="h-9 px-3 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors">
          Clear
        </button>
      )}
    </div>
  )
}
