"use client"

import { useState } from "react"
import { ChevronDown, SlidersHorizontal, X } from "lucide-react"
import { DEPARTMENTS, PRODUCTS } from "@/lib/domain/record-types"
import { hasProductSplit } from "@/lib/domain/dept-metrics"
import { SHIFT_ORDER } from "@/lib/shift-config"
import { ALL_TIME } from "@/lib/domain/date-window"
import type { ManagerFilters } from "@/lib/domain/manager-filters"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export type Filters = ManagerFilters

const iso = (d: Date) => d.toISOString().slice(0, 10)
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000))

export const DEFAULT_FILTERS: Filters = {
  from: ALL_TIME,
  to: iso(new Date()),
  shift: "",
  department: "",
  product: "",
}

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: "All time", range: () => ({ from: ALL_TIME, to: iso(new Date()) }) },
  { label: "7d", range: () => ({ from: daysAgo(6), to: iso(new Date()) }) },
  { label: "30d", range: () => ({ from: daysAgo(29), to: iso(new Date()) }) },
  { label: "90d", range: () => ({ from: daysAgo(89), to: iso(new Date()) }) },
  {
    label: "This month",
    range: () => {
      const n = new Date()
      return {
        from: `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-01`,
        to: iso(n),
      }
    },
  },
]

function Select({
  value,
  onChange,
  children,
  disabled,
  title,
  label,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
  disabled?: boolean
  title?: string
  label: string
}) {
  return (
    <div className="relative" title={title}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        className="h-9 pl-3 pr-8 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {children}
      </select>
      <ChevronDown
        className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted pointer-events-none"
        aria-hidden="true"
      />
    </div>
  )
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (f: Filters) => void
}) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })

  const isActivePreset = (p: (typeof PRESETS)[number]) => {
    const r = p.range()
    return r.from === filters.from && r.to === filters.to
  }

  const activePreset = PRESETS.find((p) => isActivePreset(p))

  // Product applies in Overview and for departments with product split
  const productApplies = filters.department === "" || hasProductSplit(filters.department)

  const selectDepartment = (department: string) => {
    const stillApplies = department === "" || hasProductSplit(department)
    set({ department, ...(stillApplies ? {} : { product: "" }) })
  }

  // Active filter count for mobile collapse
  const isDateFiltered = filters.from !== ALL_TIME
  const isShiftFiltered = filters.shift !== ""
  const isProductFiltered = filters.product !== ""
  const activeCount = (isDateFiltered ? 1 : 0) + (isShiftFiltered ? 1 : 0) + (isProductFiltered ? 1 : 0)

  const clearAllFilters = () => {
    set({ from: ALL_TIME, to: iso(new Date()), shift: "", product: "" })
  }

  return (
    <div className="sticky top-16 z-20 bg-surface-page/95 backdrop-blur-md pt-2 pb-3 -mx-4 sm:-mx-6 px-4 sm:px-6 border-b border-hairline/70 shadow-xs space-y-2">
      {/* ── DEPARTMENT TABS ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        <button
          onClick={() => selectDepartment("")}
          className={`h-8 px-3 text-xs font-bold rounded-lg transition-all shrink-0 ${
            filters.department === ""
              ? "bg-brand-solid text-brand-ink shadow-xs"
              : "bg-surface-card text-ink-secondary border border-hairline hover:border-brand hover:text-ink-primary"
          }`}
        >
          Overview
        </button>
        {DEPARTMENTS.map((dept) => {
          const isSelected = filters.department === dept
          return (
            <button
              key={dept}
              onClick={() => selectDepartment(dept)}
              className={`h-8 px-3 text-xs font-bold rounded-lg transition-all shrink-0 ${
                isSelected
                  ? "bg-brand-solid text-brand-ink shadow-xs"
                  : "bg-surface-card text-ink-secondary border border-hairline hover:border-brand hover:text-ink-primary"
              }`}
            >
              {dept}
            </button>
          )
        })}
      </div>

      {/* ── DESKTOP FILTER BAR ───────────────────────────────────────────── */}
      <div className="hidden sm:flex flex-wrap items-center gap-2 bg-surface-card rounded-2xl border border-hairline p-2.5">
        <div className="flex items-center gap-1 mr-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set(p.range())}
              aria-pressed={isActivePreset(p)}
              className={`h-9 px-3 text-xs font-bold rounded-lg border transition-colors ${
                isActivePreset(p)
                  ? "bg-brand-solid text-brand-ink border-brand-solid"
                  : "bg-surface-card text-ink-secondary border-hairline hover:border-brand"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            type="date"
            value={filters.from}
            max={filters.to}
            onChange={(e) => set({ from: e.target.value })}
            aria-label="From date"
            className="h-9 min-w-0 flex-1 px-2 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none"
          />
          <span className="text-ink-muted text-xs" aria-hidden="true">→</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            max={iso(new Date())}
            onChange={(e) => set({ to: e.target.value })}
            aria-label="To date"
            className="h-9 min-w-0 flex-1 px-2 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none"
          />
        </div>

        <Select value={filters.shift} onChange={(v) => set({ shift: v })} label="Shift">
          <option value="">All shifts</option>
          {SHIFT_ORDER.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>

        <Select
          value={filters.product}
          onChange={(v) => set({ product: v })}
          disabled={!productApplies}
          label="Product"
          title={productApplies ? undefined : `${filters.department} records carry no product`}
        >
          <option value="">Both products</option>
          {PRODUCTS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>

        {(isDateFiltered || isShiftFiltered || isProductFiltered) && (
          <button
            onClick={clearAllFilters}
            className="h-9 px-3 text-xs font-semibold rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-sunken transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── MOBILE COLLAPSED FILTERS ─────────────────────────────────────── */}
      <div className="sm:hidden flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        <button
          onClick={() => setSheetOpen(true)}
          className="h-9 px-3 flex items-center gap-1.5 rounded-xl border border-hairline bg-surface-card text-xs font-bold text-ink-primary shrink-0 shadow-xs hover:border-brand active:scale-[0.98]"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-brand shrink-0" aria-hidden="true" />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-brand-solid text-brand-ink text-[10px] font-bold flex items-center justify-center shrink-0">
              {activeCount}
            </span>
          )}
        </button>

        {/* Removable chips for active filters on phones */}
        {isDateFiltered && (
          <span className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-lg bg-surface-sunken border border-hairline text-[11px] font-semibold text-ink-secondary shrink-0">
            <span>{activePreset?.label ?? `${filters.from.slice(5)} → ${filters.to.slice(5)}`}</span>
            <button
              onClick={() => set({ from: ALL_TIME, to: iso(new Date()) })}
              className="p-1 hover:text-critical-ink"
              aria-label="Remove date filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {isShiftFiltered && (
          <span className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-lg bg-surface-sunken border border-hairline text-[11px] font-semibold text-ink-secondary shrink-0">
            <span>Shift: {filters.shift}</span>
            <button
              onClick={() => set({ shift: "" })}
              className="p-1 hover:text-critical-ink"
              aria-label="Remove shift filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {isProductFiltered && (
          <span className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-lg bg-surface-sunken border border-hairline text-[11px] font-semibold text-ink-secondary shrink-0">
            <span>Product: {filters.product}</span>
            <button
              onClick={() => set({ product: "" })}
              className="p-1 hover:text-critical-ink"
              aria-label="Remove product filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )}

        {activeCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="text-[11px] font-bold text-brand hover:underline shrink-0 px-1"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── SCOPING DISCLAIMER ───────────────────────────────────────────── */}
      <p className="text-[11px] text-ink-muted leading-tight px-1">
        Note: Finished goods on hand is an all-time balance. Material remaining stock is current as of today; shift and date filters scope consumption and department metrics.
      </p>

      {/* ── MOBILE FILTERS SHEET ─────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6 space-y-4">
          <SheetHeader>
            <SheetTitle>Filter Production Data</SheetTitle>
            <SheetDescription>
              Scope production totals, shift breakdown, and material burn rates.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 pt-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">Date Presets</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => set(p.range())}
                    className={`h-9 px-3 text-xs font-bold rounded-lg border transition-colors ${
                      isActivePreset(p)
                        ? "bg-brand-solid text-brand-ink border-brand-solid"
                        : "bg-surface-card text-ink-secondary border-hairline"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">Custom Date Range</p>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.from}
                  max={filters.to}
                  onChange={(e) => set({ from: e.target.value })}
                  aria-label="From date"
                  className="h-10 min-w-0 flex-1 px-3 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none"
                />
                <span className="text-ink-muted text-xs">→</span>
                <input
                  type="date"
                  value={filters.to}
                  min={filters.from}
                  max={iso(new Date())}
                  onChange={(e) => set({ to: e.target.value })}
                  aria-label="To date"
                  className="h-10 min-w-0 flex-1 px-3 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">Shift</p>
                <select
                  value={filters.shift}
                  onChange={(e) => set({ shift: e.target.value })}
                  aria-label="Shift"
                  className="w-full h-10 px-3 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none"
                >
                  <option value="">All shifts</option>
                  {SHIFT_ORDER.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-2">Product</p>
                <select
                  value={filters.product}
                  onChange={(e) => set({ product: e.target.value })}
                  disabled={!productApplies}
                  aria-label="Product"
                  className="w-full h-10 px-3 text-xs font-semibold rounded-lg border border-hairline bg-surface-card text-ink-secondary focus:border-brand focus:outline-none disabled:opacity-50"
                >
                  <option value="">Both products</option>
                  {PRODUCTS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3 border-t border-hairline">
              <button
                onClick={clearAllFilters}
                className="h-10 px-4 text-xs font-bold text-ink-muted hover:text-ink-primary transition-colors"
              >
                Reset to Default
              </button>
              <button
                onClick={() => setSheetOpen(false)}
                className="h-10 px-5 rounded-xl bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors active:scale-[0.98]"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
