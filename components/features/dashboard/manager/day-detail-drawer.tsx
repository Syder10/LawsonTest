"use client"

import { useEffect, useState } from "react"
import { X, Loader2 } from "lucide-react"
import type { DayDetail } from "./types"
import { shortDay } from "./viz"

const HIDDEN = new Set(["id", "user_id", "created_at", "updated_at", "date", "shift", "department", "material"])
const label = (k: string) => k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")

// Slide-over showing every record for a given day (optionally narrowed to the
// active shift/department filters). Fetches /api/analytics/day-detail on open.
export function DayDetailDrawer({
  date,
  shift,
  department,
  onClose,
}: {
  date: string | null
  shift: string
  department: string
  onClose: () => void
}) {
  const [data, setData] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!date) return
    setData(null)
    setLoading(true)
    const p = new URLSearchParams({ date })
    if (shift) p.set("shift", shift)
    if (department) p.set("department", department)
    fetch(`/api/analytics/day-detail?${p}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [date, shift, department])

  if (!date) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-50 h-full overflow-y-auto shadow-2xl animate-[slidein_.25s_ease]">
        <style>{`@keyframes slidein{from{transform:translateX(24px);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>

        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-black text-slate-900">{shortDay(date)}</h2>
            <p className="text-xs font-semibold text-slate-400">
              {[shift || "All shifts", department || "All departments"].join(" · ")}
              {data && ` · ${data.totalRecords} record${data.totalRecords !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
          )}
          {!loading && data && data.groups.length === 0 && (
            <div className="text-center py-16 text-sm font-semibold text-slate-400">No records submitted for this day.</div>
          )}
          {!loading && data?.groups.map((g) => (
            <div key={g.recordType} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <span className="font-black text-slate-800 text-sm">{g.recordType}</span>
                <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">
                  {g.rows.length} · {g.department}
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {g.rows.map((row, i) => {
                  const details = Object.entries(row).filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== "" && v !== undefined)
                  return (
                    <div key={i} className="p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-bold">{String(row.shift ?? "")}</span>
                        {row.product != null && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-bold">{String(row.product)}</span>}
                        {row.supervisor_name != null && <span className="text-slate-400 font-semibold">{String(row.supervisor_name)}</span>}
                        {row.created_at != null && <span className="ml-auto text-slate-300 font-medium">{new Date(String(row.created_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {details.map(([k, v]) => (
                          <div key={k} className="bg-slate-50/70 rounded-lg px-2.5 py-1.5">
                            <p className="text-[9px] uppercase tracking-wider text-slate-400 font-black">{label(k)}</p>
                            <p className="text-sm font-bold text-slate-800 tabular-nums">{String(v)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
