"use client"

import { useState, useEffect } from "react"
import { Loader2, AlertCircle } from "lucide-react"
import { fmt } from "@/components/features/dashboard/manager/viz"
import { Card, CardHeader, DataTable, EmptyState, Field, Select, type Column } from "@/components/primitives"

// The stock office's History IS the stock ledger: current on-hand for every
// material, each row opening that material's full dated record on the shared
// detail page. It reuses /api/procurement/report (the same figures the Stock
// dashboard reads) so nothing is recomputed here (NFR-2); on-hand is as-of today
// and window-independent, so no date range is offered — the detail page carries
// the dated history.
interface MaterialRow {
  key: string
  label: string
  unit: string
  remaining: number
  group: "procurement" | "production"
}
interface Report {
  materials: MaterialRow[]
  last_updated: string
}

type GroupFilter = "all" | "procurement" | "production"

export function StockLedgerIndex() {
  const [data, setData] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [group, setGroup] = useState<GroupFilter>("all")

  useEffect(() => {
    let active = true
    const run = async () => {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch("/api/procurement/report")
        if (!res.ok) throw new Error()
        const json = (await res.json()) as Report
        if (active) setData(json)
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    return () => { active = false }
  }, [])

  const materials = data?.materials ?? []
  const shown = group === "all" ? materials : materials.filter((m) => m.group === group)

  const columns: Column<MaterialRow>[] = [
    { key: "label", header: "Material", primary: true, cell: (m) => <span className="font-bold text-ink-primary">{m.label}</span> },
    {
      key: "group", header: "Type", hideOnMobile: true,
      cell: (m) => <span className="text-ink-muted text-xs font-medium">{m.group === "procurement" ? "Procurement" : "Production"}</span>,
    },
    {
      key: "remaining", header: "On hand", align: "right", numeric: true,
      cell: (m) => (
        <span className="font-semibold text-ink-primary">
          {fmt(m.remaining)} <span className="text-ink-muted text-xs font-medium">{m.unit}</span>
        </span>
      ),
    },
  ]

  if (error) {
    return (
      <Card>
        <EmptyState
          icon={<AlertCircle className="w-5 h-5 text-critical" />}
          title="Couldn’t load stock"
          description="The request failed. Refresh to try again."
        />
      </Card>
    )
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-ink-muted" aria-busy="true">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading stock</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-card rounded-2xl border border-hairline p-3 flex items-center gap-2">
        <Field label="Group" className="w-full sm:w-56">
          {(a11y) => (
            <Select {...a11y} value={group} onChange={(e) => setGroup(e.target.value as GroupFilter)}>
              <option value="all">All materials</option>
              <option value="procurement">Procurement</option>
              <option value="production">Production</option>
            </Select>
          )}
        </Field>
      </div>

      <Card>
        <CardHeader title="Stock on hand" hint="tap a material for its full dated history" />
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(m) => m.key}
          rowHref={(m) => `/dashboard/procurement/stock/material/${m.key}`}
          empty={<EmptyState compact title="No materials to show" />}
        />
      </Card>
    </div>
  )
}
