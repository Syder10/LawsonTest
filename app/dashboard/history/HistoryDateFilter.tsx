"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { X } from "lucide-react"
import { SHIFT_ORDER } from "@/lib/shift-config"
import { Card, Field, Select, TextInput } from "@/components/primitives"

interface HistoryDateFilterProps {
  selectedDate: string | null
  selectedShift: string | null
  selectedType: string | null
  /** Record types the current role may see. A type filter is only shown when
      there is more than one to choose between. */
  types: { value: string; label: string }[]
}

export default function HistoryDateFilter({ selectedDate, selectedShift, selectedType, types }: HistoryDateFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParams = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  const clearAll = () => router.push(pathname)
  const showTypes = types.length > 1
  const selectedTypeLabel = types.find((t) => t.value === selectedType)?.label ?? null
  const hasFilter = !!selectedDate || !!selectedShift || !!selectedType

  return (
    <Card padded>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        {showTypes && (
          <Field label="Record type" className="flex-1">
            {(a11y) => (
              <Select {...a11y} value={selectedType || ""} onChange={(e) => updateParams("type", e.target.value || null)}>
                <option value="">All record types</option>
                {types.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            )}
          </Field>
        )}

        <Field label="Date" className="flex-1">
          {(a11y) => (
            <TextInput
              {...a11y}
              type="date"
              value={selectedDate || ""}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => updateParams("date", e.target.value || null)}
            />
          )}
        </Field>

        <Field label="Shift" className="sm:w-44">
          {(a11y) => (
            <Select {...a11y} value={selectedShift || ""} onChange={(e) => updateParams("shift", e.target.value || null)}>
              <option value="">All shifts</option>
              {SHIFT_ORDER.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          )}
        </Field>

        {hasFilter && (
          <button
            onClick={clearAll}
            className="flex items-center justify-center gap-1.5 h-11 sm:h-10 px-4 rounded-xl border border-hairline bg-surface-card hover:bg-surface-sunken text-ink-secondary text-sm font-semibold transition-colors shrink-0 active:scale-[0.97]"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {hasFilter && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selectedTypeLabel && (
            <FilterChip label={selectedTypeLabel} onRemove={() => updateParams("type", null)} />
          )}
          {selectedDate && (
            <FilterChip
              label={new Date(selectedDate + "T00:00:00Z").toLocaleDateString(undefined, {
                weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
              })}
              onRemove={() => updateParams("date", null)}
            />
          )}
          {selectedShift && (
            <FilterChip label={`${selectedShift} shift`} onRemove={() => updateParams("shift", null)} />
          )}
        </div>
      )}
    </Card>
  )
}

/**
 * An active filter, with its own remove control.
 *
 * The remove button is a 32px target rather than the 12px icon it wraps — a
 * `w-3 h-3` hit area is unhittable on a phone.
 */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-brand-subtle border border-brand/20 text-brand-subtle-ink text-xs font-semibold pl-2.5 pr-1 py-1 rounded-full">
      {label}
      <button
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="h-8 w-8 -my-1 flex items-center justify-center rounded-full hover:bg-brand/10 transition-colors"
      >
        <X className="w-3 h-3" aria-hidden="true" />
      </button>
    </span>
  )
}
