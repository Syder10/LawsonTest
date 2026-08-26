import { NextResponse } from "next/server"
import { requireProcurement } from "@/lib/auth/guards"
import { STAMP_PCS_PER_COIL, STAMP_COILS_PER_BOX, TAPE_PCS_PER_BOX, HAIRNET_PACKS_PER_BOX, NOSEMASK_PACKS_PER_BOX, GLOVES_PACKS_PER_BOX } from "@/lib/domain/materials"
import { operatingDaysBetween } from "@/lib/domain/operating-days"
import { buildMaterialStatus, THRESHOLD_PAYLOAD, type ProcurementMaterialStatus } from "@/lib/domain/stock-status"
import type { Product } from "@/lib/db/types"

// ============================================================================
// Procurement-office analytics — everything the stock office must monitor to
// replenish, in ONE urgency-sorted view, tagged by group:
//
//   • "procurement"  — materials the office physically receives & issues:
//                       tax stamps, cartons, PPE. Logged via raw_materials_received.
//   • "production"   — raw materials consumed by production that procurement
//                       still replenishes: alcohol, preforms, caps, labels,
//                       caramel. Received/used from the production stock ledgers.
//
// "Days left" is projected over OPERATING DAYS (Mon–Sat, closed Sundays): burn
// rate = used in window ÷ operating days in window; the run-out DATE walks
// forward over operating days until the balance hits zero.
//
// The row shape, thresholds and level function come from lib/domain/stock-status,
// shared with /api/analytics/report so the two contracts cannot diverge.
// ============================================================================

const STAMPS_PER_CARTON = { Bitters: 9, Ginger: 6 } as const

function breakdown(key: string, pcs: number): string | null {
  switch (key) {
    case "tax_stamp": {
      const coils = Math.floor(pcs / STAMP_PCS_PER_COIL)
      return `${Math.floor(coils / STAMP_COILS_PER_BOX)} boxes · ${coils % STAMP_COILS_PER_BOX} coils · ${pcs % STAMP_PCS_PER_COIL} pcs`
    }
    case "seal_tape": return `${Math.floor(pcs / TAPE_PCS_PER_BOX)} boxes · ${pcs % TAPE_PCS_PER_BOX} loose`
    case "hair_net": return `${Math.floor(pcs / HAIRNET_PACKS_PER_BOX)} boxes · ${pcs % HAIRNET_PACKS_PER_BOX} packs`
    case "nose_mask": return `${Math.floor(pcs / NOSEMASK_PACKS_PER_BOX)} boxes · ${pcs % NOSEMASK_PACKS_PER_BOX} packs`
    case "gloves": return `${Math.floor(pcs / GLOVES_PACKS_PER_BOX)} boxes · ${pcs % GLOVES_PACKS_PER_BOX} packs`
    default: return null
  }
}

export async function GET(request: Request) {
  const auth = await requireProcurement()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const supabase = auth.ctx.supabase

  const url = new URL(request.url)
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get("from") || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
  const to = url.searchParams.get("to") || today
  const opDays = operatingDaysBetween(from, to)

  // Build a material row with an operating-day run-out projection.
  const build = (o: {
    key: string; label: string; unit: string
    group: "procurement" | "production"
    remaining: number; used: number; received: number
  }): ProcurementMaterialStatus => ({
    ...buildMaterialStatus({
      key: o.key,
      label: o.label,
      unit: o.unit,
      remaining: o.remaining,
      usedInWindow: o.used,
      operatingDaysInWindow: opDays,
      fromISO: today,
    }),
    group: o.group,
    receivedInWindow: Math.round(o.received),
    breakdown: breakdown(o.key, o.remaining),
  })

  const [balancesRes, liveRes, pkgRes, receiptsRes, stockRes, blowingRes] = await Promise.all([
    supabase.from("consumable_stock").select("material, product, remaining_pcs"),
    supabase.rpc("finished_goods_stock"),
    supabase.from("packaging_daily_records").select("date, product, quantity_cartons_produced").gte("date", from).lte("date", to),
    supabase.from("raw_materials_received").select("*").gte("date", from).lte("date", to).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
    supabase.from("stock_records").select("date, material, product, quantity_received, quantity_used").in("material", ["alcohol", "caps", "labels", "caramel"]).gte("date", from).lte("date", to),
    supabase.from("blowing_daily_records").select("date, quantity_received_bags, preforms_used_bags").gte("date", from).lte("date", to),
  ])

  const balances = balancesRes.data ?? []
  const receipts = receiptsRes.data ?? []
  const pkg = pkgRes.data ?? []
  const stockRows = stockRes.data ?? []
  const blowing = blowingRes.data ?? []
  const consRem = (material: string, product: string | null = null) =>
    balances.find((b) => b.material === material && b.product === product)?.remaining_pcs ?? 0

  // Current remaining for production materials (as of today) via the derived ledger.
  const rpcRemain = async (material: string, product?: Product) =>
    Number((await supabase.rpc("stock_remaining_asof", { p_material: material, p_date: today, p_product: product ?? null, p_variant: null })).data ?? 0)
  const [alcRem, capsRem, labBitRem, labGinRem, carBitRem, carGinRem, stampRem, cartonBitRem, cartonGinRem, preRes] = await Promise.all([
    rpcRemain("alcohol"), rpcRemain("caps"), rpcRemain("labels", "Bitters"), rpcRemain("labels", "Ginger"),
    rpcRemain("caramel", "Bitters"), rpcRemain("caramel", "Ginger"),
    rpcRemain("tax_stamp"), rpcRemain("carton", "Bitters"), rpcRemain("carton", "Ginger"),
    supabase.rpc("stock_remaining_asof", { p_material: "preform", p_date: today }),
  ])
  const preRem = Number(preRes.data ?? 0)

  // ── PROCUREMENT group (received/issued here) ───────────────────────────────
  const bitters = pkg.filter((p: any) => p.product === "Bitters")
  const ginger = pkg.filter((p: any) => p.product === "Ginger")
  const sumProduced = (rows: any[]) => rows.reduce((s, r) => s + (r.quantity_cartons_produced || 0), 0)
  const receivedPcs = (mt: string) =>
    receipts.filter((r: any) => r.material_type === mt).reduce((s: number, r: any) =>
      s + (mt === "tax_stamp" ? r.stamp_total_pcs || 0 : mt.startsWith("carton") ? r.carton_total_pcs || 0 : r.ppe_pcs_in || 0), 0)
  const givenOutPcs = (mt: string) =>
    receipts.filter((r: any) => r.material_type === mt).reduce((s: number, r: any) => s + (r.ppe_given_pcs || 0), 0)
  const stampsUsed = sumProduced(bitters) * STAMPS_PER_CARTON.Bitters + sumProduced(ginger) * STAMPS_PER_CARTON.Ginger

  const procurement = [
    build({ key: "tax_stamp", label: "Tax Stamps", unit: "pcs", group: "procurement", remaining: stampRem, used: stampsUsed, received: receivedPcs("tax_stamp") }),
    build({ key: "carton_bitters", label: "Cartons — Bitters", unit: "pcs", group: "procurement", remaining: cartonBitRem, used: sumProduced(bitters), received: receivedPcs("carton_bitters") }),
    build({ key: "carton_ginger", label: "Cartons — Ginger", unit: "pcs", group: "procurement", remaining: cartonGinRem, used: sumProduced(ginger), received: receivedPcs("carton_ginger") }),
    build({ key: "seal_tape", label: "Seal Tape", unit: "pcs", group: "procurement", remaining: consRem("seal_tape"), used: givenOutPcs("seal_tape"), received: receivedPcs("seal_tape") }),
    build({ key: "hair_net", label: "Hair Nets", unit: "packs", group: "procurement", remaining: consRem("hair_net"), used: givenOutPcs("hair_net"), received: receivedPcs("hair_net") }),
    build({ key: "nose_mask", label: "Nose Masks", unit: "packs", group: "procurement", remaining: consRem("nose_mask"), used: givenOutPcs("nose_mask"), received: receivedPcs("nose_mask") }),
    build({ key: "gloves", label: "Gloves", unit: "packs", group: "procurement", remaining: consRem("gloves"), used: givenOutPcs("gloves"), received: receivedPcs("gloves") }),
  ]

  // ── PRODUCTION group (procurement replenishes; usage from stock ledgers) ────
  const stockAgg = (material: string, product?: Product) => {
    const rows = stockRows.filter((r: any) => r.material === material && (product ? r.product === product : true))
    return {
      received: rows.reduce((s: number, r: any) => s + (r.quantity_received || 0), 0),
      used: rows.reduce((s: number, r: any) => s + (r.quantity_used || 0), 0),
    }
  }
  const pre = {
    received: blowing.reduce((s: number, r: any) => s + (r.quantity_received_bags || 0), 0),
    used: blowing.reduce((s: number, r: any) => s + (r.preforms_used_bags || 0), 0),
  }

  const production = [
    build({ key: "alcohol", label: "Alcohol", unit: "litres", group: "production", remaining: alcRem, ...stockAgg("alcohol") }),
    build({ key: "preforms", label: "Preforms", unit: "bags", group: "production", remaining: preRem, ...pre }),
    build({ key: "caps", label: "Caps", unit: "pcs", group: "production", remaining: capsRem, ...stockAgg("caps") }),
    build({ key: "labels_bitters", label: "Labels — Bitters", unit: "pcs", group: "production", remaining: labBitRem, ...stockAgg("labels", "Bitters") }),
    build({ key: "labels_ginger", label: "Labels — Ginger", unit: "pcs", group: "production", remaining: labGinRem, ...stockAgg("labels", "Ginger") }),
    build({ key: "caramel_bitters", label: "Caramel — Bitters", unit: "units", group: "production", remaining: carBitRem, ...stockAgg("caramel", "Bitters") }),
    build({ key: "caramel_ginger", label: "Caramel — Ginger", unit: "units", group: "production", remaining: carGinRem, ...stockAgg("caramel", "Ginger") }),
  ]

  const live = liveRes.data ?? []
  return NextResponse.json({
    filters: { from, to },
    operatingDaysInWindow: opDays,
    materials: [...procurement, ...production],
    finishedGoods: {
      bitters: live.find((l) => l.product === "Bitters")?.available ?? 0,
      ginger: live.find((l) => l.product === "Ginger")?.available ?? 0,
    },
    receipts: receipts.map((r: any) => ({
      date: r.date, material_type: r.material_type, received_by: r.received_by,
      received_pcs: r.material_type === "tax_stamp" ? r.stamp_total_pcs : r.material_type.startsWith("carton") ? r.carton_total_pcs : r.ppe_pcs_in,
      given_pcs: r.ppe_given_pcs || 0, given_to: r.ppe_given_to || null, remarks: r.remarks || null,
    })),
    thresholds: THRESHOLD_PAYLOAD,
    last_updated: new Date().toISOString(),
  })
}
