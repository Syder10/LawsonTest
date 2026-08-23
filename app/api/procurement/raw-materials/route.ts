import { type NextRequest, NextResponse } from "next/server"
import { requireProcurement } from "@/lib/auth/guards"
import type { Product } from "@/lib/db/types"
import {
  ALL_MATERIAL_TYPES,
  GLOVES_PACKS_PER_BOX,
  HAIRNET_PACKS_PER_BOX,
  NOSEMASK_PACKS_PER_BOX,
  PPE_TYPES,
  STAMP_COILS_PER_BOX,
  STAMP_PCS_PER_BOX,
  STAMP_PCS_PER_COIL,
  TAPE_PCS_PER_BOX,
  pcsPerBox,
  type MaterialType,
} from "@/lib/domain/materials"

type Balance = { remaining_pcs: number; total_received_pcs: number; total_used_pcs: number }
const EMPTY: Balance = { remaining_pcs: 0, total_received_pcs: 0, total_used_pcs: 0 }

// GET — current material balances for the submit page. PPE balances come from the
// consumable_stock running total; tax_stamp + carton come from the DERIVED ledger
// (stock_remaining_asof) now that they no longer keep a running total.
export async function GET() {
  const auth = await requireProcurement()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx
  const today = new Date().toISOString().slice(0, 10)

  const ledgerRemain = async (material: string, product: Product | null) =>
    Number((await supabase.rpc("stock_remaining_asof", { p_material: material, p_date: today, p_product: product, p_variant: null })).data ?? 0)

  const [ppeRes, stampPcs, cartonBitPcs, cartonGinPcs] = await Promise.all([
    supabase.from("consumable_stock").select("material, product, remaining_pcs, total_received_pcs, total_used_pcs"),
    ledgerRemain("tax_stamp", null),
    ledgerRemain("carton", "Bitters"),
    ledgerRemain("carton", "Ginger"),
  ])

  if (ppeRes.error) {
    console.error("[procurement] balance read error:", ppeRes.error.message)
    return NextResponse.json({ error: "Failed to read balances" }, { status: 500 })
  }

  const find = (material: string, product: Product | null): Balance => {
    const r = (ppeRes.data ?? []).find((x) => x.material === material && x.product === product)
    return r ? { remaining_pcs: r.remaining_pcs, total_received_pcs: r.total_received_pcs, total_used_pcs: r.total_used_pcs } : EMPTY
  }

  const stampCoils = Math.floor(stampPcs / STAMP_PCS_PER_COIL)
  const boxed = (b: Balance, per: number) => ({
    ...b,
    remaining_boxes: Math.floor(b.remaining_pcs / per),
    remaining_loose: b.remaining_pcs % per,
  })
  // Derived-ledger materials expose only remaining (no running received/used totals).
  const derived = (pcs: number): Balance => ({ remaining_pcs: pcs, total_received_pcs: 0, total_used_pcs: 0 })

  return NextResponse.json({
    tax_stamp: {
      ...derived(stampPcs),
      remaining_boxes: Math.floor(stampCoils / STAMP_COILS_PER_BOX),
      remaining_full_coils: stampCoils % STAMP_COILS_PER_BOX,
      remaining_loose_pcs: stampPcs % STAMP_PCS_PER_COIL,
    },
    carton_bitters: derived(cartonBitPcs),
    carton_ginger: derived(cartonGinPcs),
    seal_tape: boxed(find("seal_tape", null), TAPE_PCS_PER_BOX),
    hair_net: boxed(find("hair_net", null), HAIRNET_PACKS_PER_BOX),
    nose_mask: boxed(find("nose_mask", null), NOSEMASK_PACKS_PER_BOX),
    gloves: boxed(find("gloves", null), GLOVES_PACKS_PER_BOX),
  })
}

// POST — record a delivery / issue. The row is inserted through the RLS-bound
// client; the DB trigger (apply_raw_material_received) updates the balance.
export async function POST(request: NextRequest) {
  const auth = await requireProcurement()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, profile, supabase } = auth.ctx

  const body = await request.json().catch(() => ({}))
  const materialType = body.material_type as MaterialType
  if (!body.date || !materialType) {
    return NextResponse.json({ error: "date and material_type required" }, { status: 400 })
  }
  if (!ALL_MATERIAL_TYPES.includes(materialType)) {
    return NextResponse.json({ error: "Invalid material_type" }, { status: 400 })
  }

  const row: Record<string, unknown> = {
    user_id: user.id,
    received_by: profile.full_name || "Procurement",
    date: body.date,
    material_type: materialType,
    remarks: body.remarks || null,
  }

  if (materialType === "tax_stamp") {
    const boxes = Number(body.stamp_boxes || 0)
    row.stamp_boxes = boxes
    row.stamp_total_coils = boxes * STAMP_COILS_PER_BOX
    row.stamp_total_pcs = boxes * STAMP_PCS_PER_BOX
  } else if (materialType === "carton_bitters" || materialType === "carton_ginger") {
    row.carton_total_pcs = Number(body.carton_total_pcs || 0)
  } else if (PPE_TYPES.includes(materialType)) {
    const boxesIn = Number(body.ppe_boxes_in || 0)
    row.ppe_boxes_in = boxesIn
    row.ppe_pcs_in = boxesIn * pcsPerBox(materialType)
    row.ppe_given_out = Number(body.ppe_given_out || 0)
    row.ppe_given_unit = body.ppe_given_unit || "Boxes"
    row.ppe_given_pcs = Number(body.ppe_given_pcs || 0)
    row.ppe_given_to = body.ppe_given_to || null
  }

  const { data, error } = await supabase.from("raw_materials_received").insert(row).select().single()
  if (error) {
    console.error("[procurement] insert error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, data })
}
