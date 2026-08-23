import { type NextRequest, NextResponse } from "next/server"
import { requireProcurement } from "@/lib/auth/guards"
import type { Product, Shift } from "@/lib/db/types"

// PostgREST serializes `numeric` as JSON strings; coerce the numeric fields so
// the client always gets real numbers (variance === 0 checks, arithmetic).
const numify = (c: Record<string, any> | null) =>
  c && { ...c, counted_qty: Number(c.counted_qty), computed_qty: Number(c.computed_qty), variance: Number(c.variance) }

// ============================================================================
// Management stock baseline + reconciliation.
//
// Supervisors record only received/used; opening/remaining are derived. This
// route is how management/procurement (a) set the day-one baseline and (b)
// correct drift after a physical count. Each count re-anchors the ledger and
// records the counted-vs-computed variance (shrinkage/surplus signal).
//
// Gated to procurement + manager + admin (requireProcurement). The actual write
// goes through the SECURITY DEFINER record_stock_count RPC, which snapshots the
// computed balance so variance is captured atomically.
// ============================================================================

// POST — record a baseline or reconciliation count.
export async function POST(request: NextRequest) {
  const auth = await requireProcurement()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  let body: {
    material?: string
    date?: string
    counted?: number
    shift?: Shift | null
    product?: Product | null
    variant?: string | null
    kind?: "baseline" | "reconciliation"
    note?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { material, date, counted } = body
  if (!material || !date || counted === undefined || counted === null) {
    return NextResponse.json({ error: "material, date and counted are required." }, { status: 400 })
  }
  if (typeof counted !== "number" || !Number.isFinite(counted) || counted < 0) {
    return NextResponse.json({ error: "counted must be a non-negative number." }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("record_stock_count", {
    p_material: material,
    p_date: date,
    p_counted: counted,
    p_shift: body.shift ?? null,
    p_product: body.product ?? null,
    p_variant: body.variant ?? null,
    p_kind: body.kind ?? "reconciliation",
    p_note: body.note ?? null,
  })

  if (error) {
    console.error("[reconcile] rpc error:", error.message)
    const status = error.message.includes("not authorized") ? 403 : 500
    return NextResponse.json({ error: `Failed to record count: ${error.message}` }, { status })
  }

  return NextResponse.json({ success: true, count: numify(data) })
}

// GET — recent counts + variances (for the reconcile log / variance panels).
export async function GET(request: NextRequest) {
  const auth = await requireProcurement()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  const { searchParams } = new URL(request.url)
  const material = searchParams.get("material")
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500)

  let q = supabase
    .from("stock_counts")
    .select("id, date, shift, material, product, variant, counted_qty, computed_qty, variance, kind, note, counted_by, created_at")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)
  if (material) q = q.eq("material", material)

  const { data, error } = await q
  if (error) {
    console.error("[reconcile] select error:", error.message)
    return NextResponse.json({ error: "Failed to load counts" }, { status: 500 })
  }

  return NextResponse.json({ counts: (data ?? []).map(numify) })
}
