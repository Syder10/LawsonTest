import { type NextRequest, NextResponse } from "next/server"
import { requireStockRead, requireStockWrite } from "@/lib/auth/guards"
import {
  dispatchLinesToSend,
  toDispatchDetail,
  validateDispatch,
  type DispatchInput,
} from "@/lib/domain/dispatch"
import type { DispatchLineRow, Product } from "@/lib/db/types"

// ============================================================================
// Dispatch API. POST records a load (record_dispatch RPC, gated to stock write);
// GET returns the outbound log plus per-product totals and the vehicle/driver/
// destination breakdowns (FR-15, FR-16, FR-19).
//
// Reads use requireStockRead so the read-only procurement office sees the log;
// writes use requireStockWrite. The RPC re-checks can_write_stock() in SQL, so
// the guard here is defence in depth, not the boundary.
// ============================================================================

const DAY = 86_400_000

// Map an RPC error to an HTTP status. The RPC raises 42501 for a role that may
// not write, 22023 for a malformed or empty line set, and Postgres raises 23505
// when a waybill number is already recorded (FR-14, the partial unique index).
function rpcStatus(error: { code?: string; message: string }): number {
  const code = error.code ?? ""
  if (code === "42501" || error.message.includes("insufficient_privilege")) return 403
  if (code === "23505") return 409
  if (code === "22023") return 400
  return 500
}

// Aggregate rows arrive from PostgREST with numeric columns as strings.
const numAgg = <T extends { cartons: unknown; loads: unknown }>(rows: T[] | null) =>
  (rows ?? []).map((r) => ({ ...r, cartons: Number(r.cartons), loads: Number(r.loads) }))

export async function POST(request: NextRequest) {
  const auth = await requireStockWrite()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  let body: Partial<DispatchInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Same validation the form runs, re-run here because a form is not a boundary.
  const check = validateDispatch(body)
  if (!check.ok) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", errors: check.errors }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("record_dispatch", {
    p_date: body.date!,
    p_shift: body.shift!,
    p_vehicle: body.vehicleReg!,
    p_driver: body.driverName!,
    p_destination: body.destination!,
    p_lines: dispatchLinesToSend(body.lines ?? []),
    p_waybill: body.waybillNumber?.trim() || null,
    p_remarks: body.remarks?.trim() || null,
  })

  if (error) {
    console.error("[dispatch] rpc error:", error.message)
    const status = rpcStatus(error)
    const msg =
      status === 409
        ? "That waybill number is already recorded on another dispatch."
        : status === 403
          ? "You do not have permission to record a dispatch."
          : `Failed to record dispatch: ${error.message}`
    return NextResponse.json({ error: msg }, { status })
  }

  return NextResponse.json({ success: true, id: data.id })
}

export async function GET(request: NextRequest) {
  const auth = await requireStockRead()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  const url = new URL(request.url)
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get("from") || new Date(Date.now() - 29 * DAY).toISOString().slice(0, 10)
  const to = url.searchParams.get("to") || today
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500)

  // Header list, the three aggregate views and the lines are separate queries:
  // the totals and breakdowns come from RPCs so they cover the whole window (not
  // just the limited page), while the log itself is the most recent `limit` loads.
  const [listRes, totalsRes, vehicleRes, driverRes, destRes] = await Promise.all([
    supabase
      .from("dispatches")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.rpc("dispatch_totals", { p_from: from, p_to: to }),
    supabase.rpc("dispatch_breakdown", { p_from: from, p_to: to, p_dimension: "vehicle" }),
    supabase.rpc("dispatch_breakdown", { p_from: from, p_to: to, p_dimension: "driver" }),
    supabase.rpc("dispatch_breakdown", { p_from: from, p_to: to, p_dimension: "destination" }),
  ])

  if (listRes.error) {
    console.error("[dispatch] select error:", listRes.error.message)
    return NextResponse.json({ error: "Failed to load dispatches" }, { status: 500 })
  }

  const headers = listRes.data ?? []
  const ids = headers.map((d) => d.id)

  // Lines for exactly the loads on this page, grouped back onto their header.
  const linesById = new Map<string, { product: Product; cartons: number }[]>()
  if (ids.length > 0) {
    const { data: lineRows } = await supabase
      .from("dispatch_lines")
      .select("dispatch_id, product, cartons")
      .in("dispatch_id", ids)
    for (const l of (lineRows ?? []) as Pick<DispatchLineRow, "dispatch_id" | "product" | "cartons">[]) {
      const list = linesById.get(l.dispatch_id) ?? []
      list.push({ product: l.product, cartons: Number(l.cartons) })
      linesById.set(l.dispatch_id, list)
    }
  }

  const dispatches = headers.map((row) =>
    toDispatchDetail({ ...row, dispatch_lines: linesById.get(row.id) ?? [] }),
  )

  return NextResponse.json({
    filters: { from, to },
    totals: numAgg(totalsRes.data),
    byVehicle: numAgg(vehicleRes.data),
    byDriver: numAgg(driverRes.data),
    byDestination: numAgg(destRes.data),
    dispatches,
    last_updated: new Date().toISOString(),
  })
}
