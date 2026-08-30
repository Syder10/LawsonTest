"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import type { DayDetail } from "./types"
import { shortDay } from "./viz"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Card, Chip, EmptyState } from "@/components/primitives"

const HIDDEN = new Set(["id", "user_id", "created_at", "updated_at", "date", "shift", "department", "material"])
const label = (k: string) => k.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")

// Slide-over showing every record for a given day, optionally narrowed to the
// active shift/department filters.
//
// Built on the Sheet primitive: the previous hand-rolled `fixed inset-0` overlay
// had no focus trap, no Escape handler and no scroll lock, and injected its
// keyframes with an inline <style> tag on every mount.
//
// It renders every non-hidden column generically, so new department columns appear
// here without any change.
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

  return (
    <Sheet open={!!date} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto bg-surface-page p-0">
        <SheetHeader className="sticky top-0 bg-surface-card border-b border-hairline px-5 py-4 z-10">
          <SheetTitle>{date ? shortDay(date) : ""}</SheetTitle>
          <SheetDescription>
            {[shift || "All shifts", department || "All departments"].join(" · ")}
            {data && ` · ${data.totalRecords} record${data.totalRecords !== 1 ? "s" : ""}`}
          </SheetDescription>
        </SheetHeader>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-ink-muted" aria-busy="true">
              <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
              <span className="sr-only">Loading records</span>
            </div>
          )}

          {!loading && data && data.groups.length === 0 && (
            <Card>
              <EmptyState compact title="Nothing recorded on this day" />
            </Card>
          )}

          {!loading &&
            data?.groups.map((g) => (
              <Card key={g.recordType}>
                <div className="bg-surface-sunken px-4 py-2.5 border-b border-hairline flex items-center justify-between gap-3">
                  <span className="font-bold text-ink-primary text-sm truncate">{g.recordType}</span>
                  <Chip tone="neutral">
                    {g.rows.length} · {g.department}
                  </Chip>
                </div>
                <ul className="divide-y divide-hairline">
                  {g.rows.map((row, i) => {
                    const details = Object.entries(row).filter(
                      ([k, v]) => !HIDDEN.has(k) && v !== null && v !== "" && v !== undefined,
                    )
                    return (
                      <li key={i} className="p-3.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Chip tone="neutral">{String(row.shift ?? "")}</Chip>
                          {row.product != null && (
                            <Chip tone={row.product === "Bitters" ? "bitters" : "ginger"}>{String(row.product)}</Chip>
                          )}
                          {row.supervisor_name != null && (
                            <span className="text-ink-muted font-medium">{String(row.supervisor_name)}</span>
                          )}
                          {row.created_at != null && (
                            <span className="ml-auto text-ink-muted font-medium">
                              {new Date(String(row.created_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {details.map(([k, v]) => (
                            <div key={k} className="bg-surface-sunken rounded-lg px-2.5 py-1.5 min-w-0">
                              <dt className="text-xs uppercase tracking-wider text-ink-muted font-bold truncate">{label(k)}</dt>
                              <dd className="text-sm font-bold text-ink-primary tnum">{String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
