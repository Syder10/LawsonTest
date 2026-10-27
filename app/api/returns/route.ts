import { type NextRequest, NextResponse } from "next/server"
import { requireStockRead, requireStockWrite } from "@/lib/auth/guards"
import {
  productReturnLinesToSend,
  toProductReturnDetail,
  validateProductReturn,
  type ProductReturnInput,
} from "@/lib/domain/product-returns"
import type { ProductReturnRow } from "@/lib/db/types"

const DAY = 86_400_000

export async function POST(request: NextRequest) {
  const auth = await requireStockWrite()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase, profile, user } = auth.ctx

  let body: Partial<ProductReturnInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const check = validateProductReturn(body)
  if (!check.ok) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", errors: check.errors }, { status: 400 })
  }

  const lines = productReturnLinesToSend(body.lines ?? [])
  if (lines.length === 0) {
    return NextResponse.json({ error: "Enter the cartons returned for at least one product." }, { status: 400 })
  }

  const receivedBy = profile.full_name?.trim() || "Stock Officer"
  const rows = lines.map((line) => ({
    date: body.date!,
    shift: body.shift!,
    product: line.product,
    cartons: line.cartons,
    returned_from: body.returnedFrom?.trim() || null,
    driver_name: body.driverName?.trim() || null,
    vehicle_reg: body.vehicleReg?.trim() || null,
    remarks: body.remarks?.trim() || null,
    received_by: receivedBy,
    user_id: user.id,
  }))

  const { data, error } = await supabase
    .from("product_returns")
    .insert(rows)
    .select("id")

  if (error) {
    console.error("[product-returns] insert error:", error.message)
    const status = error.code === "42501" ? 403 : 500
    const msg = status === 403
      ? "You do not have permission to record product returns."
      : `Failed to record return: ${error.message}`
    return NextResponse.json({ error: msg }, { status })
  }

  return NextResponse.json({ success: true, count: data.length })
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

  const [listRes, totalsRes] = await Promise.all([
    supabase
      .from("product_returns")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.rpc("product_return_totals", { p_from: from, p_to: to }),
  ])

  if (listRes.error) {
    console.error("[product-returns] select error:", listRes.error.message)
    return NextResponse.json({ error: "Failed to load product returns" }, { status: 500 })
  }

  const rows = (listRes.data ?? []) as (Omit<ProductReturnRow, "cartons"> & { cartons: number | string })[]
  const totals = (totalsRes.data ?? []).map((t: { product: string; cartons: number | string }) => ({
    product: t.product,
    cartons: Number(t.cartons),
  }))

  return NextResponse.json({
    filters: { from, to },
    totals,
    returns: rows.map(toProductReturnDetail),
    last_updated: new Date().toISOString(),
  })
}
