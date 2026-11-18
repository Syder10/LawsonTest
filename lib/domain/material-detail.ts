import type { SupabaseClient } from "@supabase/supabase-js"
import type { BlowingRow, Database, RawMaterialReceivedRow, Shift, StockCountRow, StockRow } from "@/lib/db/types"
import type { StockMaterialDescriptor } from "@/lib/domain/stock-materials"

// ============================================================================
// MATERIAL DETAIL ASSEMBLER
//
// Everything the drill-down page shows for one stock material over a date
// window, from tables/RPCs that already exist — no new schema, no new HTTP route.
//
//   remaining     — on-hand now (stock_remaining_asof for ledger/derived;
//                   consumable_stock for PPE).
//   ledger        — per-shift opening/received/used/remaining (stock_ledger).
//                   Only "ledger" materials have movement rows there; derived
//                   (tax stamps, cartons) and consumable (PPE) get [].
//   sourceRecords — the filed rows behind the numbers, normalised to one shape:
//                   stock_records / blowing_daily_records for ledger materials,
//                   raw_materials_received for derived + consumable.
//   counts        — stock counts & variances (ledger + derived; [] for PPE).
//
// Row normalisation is pure and unit-tested; the supabase-calling loaders stay
// thin, matching enrichWithBalances.
// ============================================================================

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0)

export interface LedgerEntry {
  date: string
  shift: Shift
  received: number
  used: number
  opening: number
  remaining: number
}

// One filed row behind a material, whichever table stored it. `used` is null where
// the concept does not apply — a stamp/carton delivery has no "used" side; its
// consumption is derived from production, not filed here.
export interface SourceRecord {
  id: string
  date: string
  shift: Shift | null
  received: number | null
  used: number | null
  by: string | null
  destination: string | null
  remarks: string | null
}
export interface CountEntry {
  id: string
  date: string
  shift: Shift | null
  counted: number
  computed: number
  variance: number
  kind: "baseline" | "reconciliation"
  note: string | null
  by: string | null
}

export interface MaterialDetail {
  remaining: number
  ledger: LedgerEntry[]
  sourceRecords: SourceRecord[]
  counts: CountEntry[]
}

// ── Pure normalisers ──────────────────────────────────────────────────────────

export function normalizeLedger(
  r: { date: string; shift: Shift; received: number; used: number; opening: number; remaining: number },
): LedgerEntry {
  return {
    date: r.date,
    shift: r.shift,
    received: num(r.received),
    used: num(r.used),
    opening: num(r.opening),
    remaining: num(r.remaining),
  }
}

export function normalizeStockRecord(
  r: Pick<StockRow, "id" | "date" | "shift" | "quantity_received" | "quantity_used" | "destination" | "checked_by" | "remarks">,
): SourceRecord {
  return {
    id: r.id,
    date: r.date,
    shift: r.shift,
    received: num(r.quantity_received),
    used: num(r.quantity_used),
    by: r.checked_by ?? null,
    destination: r.destination ?? null,
    remarks: r.remarks ?? null,
  }
}
export function normalizeBlowingRecord(
  r: Pick<BlowingRow, "id" | "date" | "shift" | "quantity_received_bags" | "preforms_used_bags" | "supervisor_name" | "remarks">,
): SourceRecord {
  return {
    id: r.id,
    date: r.date,
    shift: r.shift,
    received: num(r.quantity_received_bags),
    used: num(r.preforms_used_bags),
    by: r.supervisor_name ?? null,
    destination: null,
    remarks: r.remarks ?? null,
  }
}

export function normalizeReceipt(
  r: Pick<RawMaterialReceivedRow, "id" | "date" | "received_by" | "stamp_total_pcs" | "carton_total_pcs" | "ppe_pcs_in" | "ppe_given_pcs" | "ppe_given_to" | "remarks">,
  d: StockMaterialDescriptor,
): SourceRecord {
  const received =
    d.material === "tax_stamp" ? num(r.stamp_total_pcs)
      : d.material === "carton" ? num(r.carton_total_pcs)
        : num(r.ppe_pcs_in)
  return {
    id: r.id,
    date: r.date,
    shift: null, // deliveries / issues carry no shift
    received,
    used: d.kind === "consumable" ? num(r.ppe_given_pcs) : null,
    by: r.received_by ?? null,
    destination: d.kind === "consumable" ? (r.ppe_given_to ?? null) : null,
    remarks: r.remarks ?? null,
  }
}

export function normalizeCount(
  r: Pick<StockCountRow, "id" | "date" | "shift" | "counted_qty" | "computed_qty" | "variance" | "kind" | "note" | "counted_by">,
): CountEntry {
  return {
    id: r.id,
    date: r.date,
    shift: r.shift,
    counted: num(r.counted_qty),
    computed: num(r.computed_qty),
    variance: num(r.variance),
    kind: r.kind,
    note: r.note ?? null,
    by: r.counted_by ?? null,
  }
}
// The raw_materials_received.material_type a derived/consumable descriptor maps to,
// or null for ledger materials (filed in stock_records / blowing, not here).
function receiptMaterialType(d: StockMaterialDescriptor): RawMaterialReceivedRow["material_type"] | null {
  if (d.material === "tax_stamp") return "tax_stamp"
  if (d.material === "carton") return d.product === "Ginger" ? "carton_ginger" : "carton_bitters"
  if (d.kind === "consumable") return d.material as RawMaterialReceivedRow["material_type"]
  return null
}

// ── Supabase loaders (thin) ─────────────────────────────────────────────────────

type Db = SupabaseClient<Database>

async function loadRemaining(supabase: Db, d: StockMaterialDescriptor, today: string): Promise<number> {
  if (d.kind === "consumable") {
    const { data } = await supabase
      .from("consumable_stock")
      .select("remaining_pcs")
      .eq("material", d.material)
      .is("product", null)
      .maybeSingle()
    return num(data?.remaining_pcs)
  }
  const { data } = await supabase.rpc("stock_remaining_asof", {
    p_material: d.material,
    p_date: today,
    p_product: d.product,
    p_variant: d.variant,
  })
  return num(data)
}

async function loadLedger(supabase: Db, d: StockMaterialDescriptor, from: string, to: string): Promise<LedgerEntry[]> {
  if (d.kind !== "ledger") return []
  const { data } = await supabase.rpc("stock_ledger", {
    p_material: d.material,
    p_from: from,
    p_to: to,
    p_product: d.product,
    p_variant: d.variant,
  })
  return (data ?? []).map(normalizeLedger)
}
async function loadSourceRecords(supabase: Db, d: StockMaterialDescriptor, from: string, to: string): Promise<SourceRecord[]> {
  if (d.kind === "ledger") {
    if (d.material === "preform") {
      const { data } = await supabase
        .from("blowing_daily_records")
        .select("id, date, shift, quantity_received_bags, preforms_used_bags, supervisor_name, remarks")
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
      return (data ?? []).map(normalizeBlowingRecord)
    }
    let q = supabase
      .from("stock_records")
      .select("id, date, shift, quantity_received, quantity_used, destination, checked_by, remarks")
      .eq("material", d.material)
      .gte("date", from)
      .lte("date", to)
    if (d.product) q = q.eq("product", d.product)
    // Herb descriptors carry a variant; no other ledger descriptor does, so this
    // narrows a herb's records to its own type and is a no-op for the rest.
    if (d.variant) q = q.eq("variant", d.variant)
    const { data } = await q.order("date", { ascending: false })
    return (data ?? []).map(normalizeStockRecord)
  }

  const mt = receiptMaterialType(d)
  if (!mt) return []
  const { data } = await supabase
    .from("raw_materials_received")
    .select("id, date, received_by, stamp_total_pcs, carton_total_pcs, ppe_pcs_in, ppe_given_pcs, ppe_given_to, remarks")
    .eq("material_type", mt)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
  return (data ?? []).map((r) => normalizeReceipt(r, d))
}

async function loadCounts(supabase: Db, d: StockMaterialDescriptor, from: string, to: string): Promise<CountEntry[]> {
  if (d.kind === "consumable") return []
  let q = supabase
    .from("stock_counts")
    .select("id, date, shift, counted_qty, computed_qty, variance, kind, note, counted_by")
    .eq("material", d.material)
    .gte("date", from)
    .lte("date", to)
  if (d.product) q = q.eq("product", d.product)
  if (d.variant) q = q.eq("variant", d.variant)
  const { data } = await q.order("date", { ascending: false })
  return (data ?? []).map(normalizeCount)
}
export async function assembleMaterialDetail(
  supabase: Db,
  d: StockMaterialDescriptor,
  from: string,
  to: string,
  today: string,
): Promise<MaterialDetail> {
  const [remaining, ledger, sourceRecords, counts] = await Promise.all([
    loadRemaining(supabase, d, today),
    loadLedger(supabase, d, from, to),
    loadSourceRecords(supabase, d, from, to),
    loadCounts(supabase, d, from, to),
  ])
  return { remaining, ledger, sourceRecords, counts }
}
