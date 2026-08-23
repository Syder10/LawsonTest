import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Product } from "@/lib/db/types"
import { getRecordType } from "@/lib/domain/record-types"

// ============================================================================
// Attach DERIVED opening/remaining balances to stock/preform record rows.
//
// Stock balances are no longer stored columns — they are computed on read by
// the stock_ledger RPC (chained movements + management baselines). Display
// surfaces (history, day-detail, export) fetch the raw movement rows (which
// still carry received/used, destination, remarks, …) and then call this helper
// to merge the running opening/remaining onto each row by matching its
// (date, shift) within the row's product/variant scope.
//
// Non-stock record types are returned unchanged.
// ============================================================================

type Row = Record<string, any>

export async function enrichWithBalances(
  supabase: SupabaseClient<Database>,
  recordType: string,
  rows: Row[],
): Promise<Row[]> {
  if (rows.length === 0) return rows
  const def = getRecordType(recordType)
  if (!def || !def.stockContinuity) return rows
  const material = def.storage.kind === "stock" ? def.storage.material : "preform"
  const isPreform = material === "preform"

  // Group rows by product/variant so each ledger call is correctly scoped.
  const groups = new Map<string, Row[]>()
  for (const r of rows) {
    const key = `${r.product ?? ""}|${r.variant ?? ""}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  }

  for (const [key, groupRows] of groups) {
    const [product, variant] = key.split("|")
    const dates = groupRows.map((r) => r.date).sort()
    const { data: ledger } = await supabase.rpc("stock_ledger", {
      p_material: material,
      p_from: dates[0],
      p_to: dates[dates.length - 1],
      p_product: (product || null) as Product | null,
      p_variant: variant || null,
    })
    const bal = new Map<string, { opening: number; remaining: number }>()
    for (const l of ledger ?? []) bal.set(`${l.date}|${l.shift}`, { opening: l.opening, remaining: l.remaining })

    for (const r of groupRows) {
      const b = bal.get(`${r.date}|${r.shift}`)
      if (!b) continue
      // Use the column names each table historically exposed, so the display
      // labels read naturally ("Opening Stock" / "Remaining Stock", or the bags
      // variants for preforms).
      if (isPreform) {
        r.opening_stock_bags = b.opening
        r.closing_stock_bags = b.remaining
      } else {
        r.opening_stock = b.opening
        r.remaining_stock = b.remaining
      }
    }
  }
  return rows
}
