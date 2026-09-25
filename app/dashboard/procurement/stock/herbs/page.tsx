import { redirect } from "next/navigation"
import { requireStockRead } from "@/lib/auth/guards"
import { ledgerUnitFor } from "@/lib/domain/materials"
import { fmt } from "@/components/features/dashboard/manager/viz"
import { Card, CardHeader, DataTable, EmptyState, PageHeader, type Column } from "@/components/primitives"

// The herbs hub, reached from the manager materials table's aggregated "Herbs" row.
// The overview shows herbs as ONE line across every variant; this splits that line
// back into its herb_types, each row opening that variant's own dated ledger,
// filed records and counts on the shared material detail page.
//
// On-hand is as-of today for every balance in the app, so no date window is offered
// here; the per-variant detail page carries the range. Nothing is recomputed: the
// number is stock_remaining_asof per variant, the same RPC the ledger reads (NFR-2).
export const dynamic = "force-dynamic"

const iso = (d: Date) => d.toISOString().slice(0, 10)
// PostgREST returns numeric as a string, so coerce before it reaches the UI.
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0)

interface HerbRow {
  variant: string
  remaining: number
}

export default async function HerbsHubPage() {
  const auth = await requireStockRead()
  if (!auth.ok) redirect("/dashboard")
  const supabase = auth.ctx.supabase
  const today = iso(new Date())

  const { data: types } = await supabase
    .from("herb_types")
    .select("name")
    .order("name", { ascending: true })
  const names = (types ?? []).map((t) => t.name)

  // One RPC per herb type (the list is a handful of herbs). Each is the on-hand
  // balance as-of today for that variant, window-independent like every balance.
  const rows: HerbRow[] = await Promise.all(
    names.map(async (variant) => {
      const { data } = await supabase.rpc("stock_remaining_asof", {
        p_material: "herb",
        p_date: today,
        p_product: null,
        p_variant: variant,
      })
      return { variant, remaining: num(data) }
    }),
  )

  // The unit comes from the ledger-unit registry ("sacks"), not a literal here.
  const unit = ledgerUnitFor("herb")?.unit ?? "sacks"

  const columns: Column<HerbRow>[] = [
    {
      key: "variant", header: "Herb type", primary: true,
      cell: (r) => <span className="font-bold text-ink-primary">{r.variant}</span>,
    },
    {
      key: "remaining", header: "On hand", align: "right", numeric: true,
      cell: (r) => (
        <span className="font-semibold text-ink-primary">
          {fmt(r.remaining)} <span className="text-ink-muted text-xs font-medium">{unit}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5 max-w-5xl mx-auto animate-fade-in-up">
      <PageHeader
        title="Herbs"
        description="On-hand per herb type · tap one for its full dated history"
        backHref="/dashboard/procurement/stock"
        backLabel="Stock levels"
      />

      <Card>
        <CardHeader title="Herb types" hint={`${names.length} tracked`} />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.variant}
          rowHref={(r) => `/dashboard/procurement/stock/material/herb:${encodeURIComponent(r.variant)}`}
          empty={
            <EmptyState
              compact
              title="No herb types yet"
              description="Herb types added in the app will appear here with their on-hand stock."
            />
          }
        />
      </Card>
    </div>
  )
}
