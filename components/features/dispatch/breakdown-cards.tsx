"use client"

import { Card, CardHeader, DataTable, EmptyState, type Column } from "@/components/primitives"
import type { DispatchBreakdownRow } from "@/lib/domain/dispatch"

// Dispatched cartons grouped by vehicle, driver and destination (FR-16, FR-19).
// Shared by the Dispatch page and the stock dashboard so the two render the same
// breakdown rather than each keeping its own copy of the column set.

const fmt = (n: number) => n.toLocaleString()

const breakdownCols: Column<DispatchBreakdownRow>[] = [
  { key: "label", header: "Name", primary: true, cell: (r) => <span className="font-semibold text-ink-primary break-words">{r.label}</span> },
  { key: "loads", header: "Loads", align: "right", numeric: true, cell: (r) => fmt(r.loads) },
  { key: "cartons", header: "Cartons", align: "right", numeric: true, cell: (r) => <span className="font-bold text-ink-primary">{fmt(r.cartons)}</span> },
]

export function DispatchBreakdownCards({
  byVehicle,
  byDriver,
  byDestination,
}: {
  byVehicle: DispatchBreakdownRow[]
  byDriver: DispatchBreakdownRow[]
  byDestination: DispatchBreakdownRow[]
}) {
  const empty = <EmptyState compact title="No loads in this range" />
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card>
        <CardHeader title="By vehicle" />
        <DataTable columns={breakdownCols} rows={byVehicle} rowKey={(r) => r.label} empty={empty} />
      </Card>
      <Card>
        <CardHeader title="By driver" />
        <DataTable columns={breakdownCols} rows={byDriver} rowKey={(r) => r.label} empty={empty} />
      </Card>
      <Card>
        <CardHeader title="By destination" />
        <DataTable columns={breakdownCols} rows={byDestination} rowKey={(r) => r.label} empty={empty} />
      </Card>
    </div>
  )
}
