import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { getRecordType } from "@/lib/domain/record-types"
import type { Product, Shift } from "@/lib/db/types"

// Returns the carried-forward stock balance a supervisor opens a shift with, for
// a stock-continuity record type. In the ledger model this is DERIVED on the
// server (chained movements + management baselines), NOT a value the supervisor
// types — so the form shows it read-only.
//
//   • authenticated; reads via the SECURITY DEFINER stock_opening RPC, so
//     continuity spans supervisors without widening RLS or a service-role key.
//   • preforms live in blowing_daily_records → material 'preform'.
export async function GET(request: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  const { searchParams } = new URL(request.url)
  const recordType = searchParams.get("recordType")
  const date = searchParams.get("date")
  const shift = searchParams.get("shift") as Shift | null
  const product = searchParams.get("product") as Product | null
  const variant = searchParams.get("herbType") || searchParams.get("variant")

  if (!recordType || !date) {
    return NextResponse.json({ error: "recordType and date are required" }, { status: 400 })
  }

  const def = getRecordType(recordType)
  if (!def || !def.stockContinuity) {
    return NextResponse.json({
      hasPrevious: false,
      carriedForward: null,
      previousStock: null,
      message: "This record type does not track stock continuity.",
    })
  }

  // Map the record type to a ledger material. Blowing preforms live in their own
  // table but are keyed as material 'preform' for the balance functions.
  const material = def.storage.kind === "stock" ? def.storage.material : "preform"

  // Opening into (date, shift). If no shift is supplied, fall back to the
  // balance as of that date.
  const { data, error } = shift
    ? await supabase.rpc("stock_opening", {
        p_material: material, p_date: date, p_shift: shift,
        p_product: product ?? null, p_variant: variant ?? null,
      })
    : await supabase.rpc("stock_remaining_asof", {
        p_material: material, p_date: date, p_product: product ?? null, p_variant: variant ?? null,
      })

  if (error) {
    console.error("[previous-stock] rpc error:", error.message)
    return NextResponse.json({ error: "Failed to fetch carried-forward stock" }, { status: 500 })
  }

  const carried = data ?? 0
  return NextResponse.json({
    // Opening is always derived now, so it's always "known" (read-only in the UI).
    hasPrevious: true,
    carriedForward: carried,
    // Back-compat alias for the field name the form reads.
    previousStock: carried,
  })
}
