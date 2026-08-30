"use client"

import { useState, useEffect, useCallback } from "react"
import { ClipboardCheck } from "lucide-react"
import { fmt, fmt1, shortDay } from "./viz"
import type { MaterialStatus } from "./types"
import { byUrgency } from "@/lib/domain/stock-status"
import { Card, CardHeader, DataTable, StatusBadge, type Column } from "@/components/primitives"
import { ReconcileModal, ledgerTargetForKey, type ReconcileTarget } from "@/components/features/stock/reconcile-modal"

interface StockCount {
  id: string; date: string; shift: string | null; material: string
  product: string | null; variant: string | null
  counted_qty: number; computed_qty: number; variance: number
  kind: "baseline" | "reconciliation"; note: string | null; counted_by: string | null
}

// Materials keyed on operating-days-left, with a projected run-out date. Status is
// icon + label + colour, never colour alone. Sorted most-urgent first.
//
// Both tables use DataTable, so on a phone each row becomes a card of label/value
// pairs instead of forcing a wide horizontal drag — this one is 8 columns.
export function MaterialsTable({
  materials,
  redDays,
  amberDays,
  onReconciled,
}: {
  materials: MaterialStatus[]
  redDays: number
  amberDays: number
  onReconciled?: () => void
}) {
  const sorted = [...materials].sort(byUrgency)
  const [reconcile, setReconcile] = useState<ReconcileTarget | null>(null)
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<StockCount[]>([])

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/stock/reconcile?limit=8")
      if (res.ok) setCounts((await res.json()).counts ?? [])
    } catch { /* silent — the panel simply stays empty */ }
  }, [])
  useEffect(() => { loadCounts() }, [loadCounts])

  const afterReconcile = () => { loadCounts(); onReconciled?.() }

  const materialColumns: Column<MaterialStatus>[] = [
    { key: "label", header: "Material", primary: true, cell: (m) => <span className="font-bold text-ink-primary">{m.label}</span> },
    {
      key: "remaining", header: "Remaining", align: "right", numeric: true,
      cell: (m) => (
        <span className="font-semibold text-ink-primary">
          {fmt(m.remaining)} <span className="text-ink-muted text-xs font-medium">{m.unit}</span>
        </span>
      ),
    },
    { key: "used", header: "Used", align: "right", numeric: true, cell: (m) => fmt(m.usedInWindow) },
    { key: "avg", header: "Avg/op-day", align: "right", numeric: true, hideOnMobile: true, cell: (m) => (m.avgPerDay > 0 ? fmt1(m.avgPerDay) : "—") },
    {
      key: "days", header: "Days left", align: "right", numeric: true,
      cell: (m) =>
        m.operatingDaysLeft === null ? (
          <span className="text-ink-muted font-medium">no usage</span>
        ) : (
          <span
            className={`font-bold ${
              m.level === "red" ? "text-critical-ink" : m.level === "yellow" ? "text-warning-ink" : "text-ink-primary"
            }`}
          >
            {fmt1(m.operatingDaysLeft)}d
          </span>
        ),
    },
    { key: "runout", header: "Runs out", align: "right", hideOnMobile: true, cell: (m) => (m.runOutDate ? shortDay(m.runOutDate) : "—") },
    { key: "status", header: "Status", align: "right", cell: (m) => <StatusBadge level={m.level} /> },
    {
      key: "action", header: "Action", align: "right",
      cell: (m) => {
        const target = ledgerTargetForKey(m.key)
        if (!target) return <span className="text-ink-muted text-xs">—</span>
        return (
          <button
            onClick={() => {
              setReconcile({ ...target, label: m.label, unit: m.unit, currentRemaining: m.remaining })
              setOpen(true)
            }}
            className="h-9 px-2 text-xs font-bold text-brand hover:underline whitespace-nowrap"
          >
            Count
          </button>
        )
      },
    },
  ]

  const countColumns: Column<StockCount>[] = [
    {
      key: "date", header: "Date", primary: true,
      cell: (c) => (
        <span className="font-semibold text-ink-primary whitespace-nowrap">
          {shortDay(c.date)}{c.shift ? ` · ${c.shift}` : ""}
        </span>
      ),
    },
    {
      key: "material", header: "Material",
      cell: (c) => `${c.material}${c.product ? ` — ${c.product}` : ""}${c.variant ? ` (${c.variant})` : ""}`,
    },
    { key: "counted", header: "Counted", align: "right", numeric: true, cell: (c) => fmt(c.counted_qty) },
    { key: "system", header: "System", align: "right", numeric: true, cell: (c) => fmt(c.computed_qty) },
    {
      key: "variance", header: "Variance", align: "right", numeric: true,
      cell: (c) => (
        <span
          className={`font-bold ${
            c.variance === 0 ? "text-ink-muted" : c.variance > 0 ? "text-good-ink" : "text-critical-ink"
          }`}
        >
          {c.variance > 0 ? "+" : ""}{fmt(c.variance)}
        </span>
      ),
    },
    { key: "by", header: "By", hideOnMobile: true, cell: (c) => c.counted_by ?? "—" },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Materials — stock & days left"
          hint={`operating days (Mon–Sat) · critical ≤ ${redDays} · low ≤ ${amberDays}`}
          actions={
            <button
              onClick={() => { setReconcile(null); setOpen(true) }}
              className="h-9 px-2.5 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold hover:bg-brand-solid-hover transition-colors active:scale-[0.97]"
            >
              <ClipboardCheck className="w-3.5 h-3.5" aria-hidden="true" /> New count
            </button>
          }
        />
        <DataTable columns={materialColumns} rows={sorted} rowKey={(m) => m.key} />
      </Card>

      {counts.length > 0 && (
        <Card>
          <CardHeader title="Recent counts & variances" hint="counted vs the system balance" />
          <DataTable columns={countColumns} rows={counts} rowKey={(c) => c.id} />
        </Card>
      )}

      <ReconcileModal open={open} onClose={() => setOpen(false)} onDone={afterReconcile} target={reconcile} />
    </div>
  )
}
