"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { X } from "lucide-react"

interface HistoryDateFilterProps {
  selectedDate: string | null
  selectedShift: string | null
}

export default function HistoryDateFilter({ selectedDate, selectedShift }: HistoryDateFilterProps) {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()

  const updateParams = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const clearAll = () => {
    router.push(pathname)
  }

  const hasFilter = !!selectedDate || !!selectedShift

  return (
    <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Date picker */}
        <div className="flex-1 space-y-1">
          <label className="text-xs font-bold text-emerald-900 uppercase tracking-widest">
            Filter by Date
          </label>
          <input
            type="date"
            value={selectedDate || ""}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => updateParams("date", e.target.value || null)}
            className="w-full h-10 px-3 text-sm font-medium rounded-xl border border-emerald-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
          />
        </div>

        {/* Shift filter */}
        <div className="sm:w-44 space-y-1">
          <label className="text-xs font-bold text-emerald-900 uppercase tracking-widest">
            Filter by Shift
          </label>
          <select
            value={selectedShift || ""}
            onChange={(e) => updateParams("shift", e.target.value || null)}
            className="w-full h-10 px-3 text-sm font-medium rounded-xl border border-emerald-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none appearance-none transition-all"
          >
            <option value="">All Shifts</option>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Night">Night</option>
          </select>
        </div>

        {/* Clear button — only shows when a filter is active */}
        {hasFilter && (
          <div className="sm:self-end">
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 h-10 px-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-semibold transition-all"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Active filter badge */}
      {hasFilter && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedDate && (
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "short", month: "short", day: "numeric", year: "numeric",
              })}
              <button onClick={() => updateParams("date", null)} className="hover:text-emerald-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {selectedShift && (
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
              {selectedShift} Shift
              <button onClick={() => updateParams("shift", null)} className="hover:text-emerald-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
