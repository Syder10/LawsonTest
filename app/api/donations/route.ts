import { type NextRequest, NextResponse } from "next/server"
import { requireStockRead, requireStockWrite } from "@/lib/auth/guards"
import {
  toDonationDetail,
  validateDonation,
  type DonationInput,
  type DonationTotal,
} from "@/lib/domain/donations"
import type { DonationRow, Product } from "@/lib/db/types"

const DAY = 86_400_000

export async function POST(request: NextRequest) {
  const auth = await requireStockWrite()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase, user } = auth.ctx

  let body: Partial<DonationInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const check = validateDonation(body)
  if (!check.ok) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", errors: check.errors }, { status: 400 })
  }

  const row = {
    date: body.date!,
    shift: body.shift!,
    product: body.product!,
    cartons: body.cartons!,
    recipient: body.recipient!.trim(),
    remarks: body.remarks?.trim() || null,
    user_id: user.id,
  }

  const { data, error } = await supabase
    .from("donations")
    .insert([row])
    .select("id")
    .single()

  if (error) {
    console.error("[donations] insert error:", error.message)
    const status = error.code === "42501" ? 403 : 500
    const msg = status === 403
      ? "You do not have permission to record donations."
      : `Failed to record donation: ${error.message}`
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

  const { data, error } = await supabase
    .from("donations")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[donations] select error:", error.message)
    return NextResponse.json({ error: "Failed to load donations" }, { status: 500 })
  }

  const rows = (data ?? []) as (Omit<DonationRow, "cartons"> & { cartons: number | string })[]
  const donations = rows.map(toDonationDetail)

  // Aggregate totals
  const totalsMap = new Map<Product, { cartons: number; count: number }>()
  for (const d of donations) {
    const cur = totalsMap.get(d.product) ?? { cartons: 0, count: 0 }
    cur.cartons += d.cartons
    cur.count += 1
    totalsMap.set(d.product, cur)
  }

  const totals: DonationTotal[] = Array.from(totalsMap.entries()).map(([product, stat]) => ({
    product,
    cartons: stat.cartons,
    count: stat.count,
  }))

  return NextResponse.json({
    filters: { from, to },
    totals,
    donations,
    last_updated: new Date().toISOString(),
  })
}
