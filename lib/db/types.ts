// Hand-written database types matching supabase/migrations.
// (When the Supabase CLI is wired up, `supabase gen types typescript` can
// regenerate this file; until then it is maintained by hand alongside the
// migrations.)
//
// NOTE: row definitions are `type` aliases (object literals), NOT interfaces.
// supabase-js's GenericTable constraint requires `Row extends Record<string,
// unknown>`, which interfaces do not satisfy (no implicit index signature) —
// using them makes every query row resolve to `never`.

export type Shift = "Morning" | "Afternoon" | "Night"
export type UserRole = "admin" | "manager" | "supervisor" | "procurement"
export type Product = "Bitters" | "Ginger"

// Envelope columns shared by every record row.
type RecordEnvelope = {
  id: string
  date: string
  shift: Shift
  group_number: number | null
  department: string
  supervisor_name: string | null
  remarks: string | null
  user_id: string | null
  created_at: string
  updated_at: string
}

export type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  department: string | null
  group_number: number | null
  created_at: string
  updated_at: string
}

export type BlowingRow = RecordEnvelope & {
  quantity_received_bags: number
  preforms_used_bags: number
  total_produced: number
  waste_pcs: number
  final_production: number // generated
  bottles_given_out: number
}

export type AlcoholBlendingRow = RecordEnvelope & {
  product: Product | null
  alcohol_transferred_drums: number
  alcohol_transferred_litres: number // generated
  finished_products_transferred_tanks: number
  finished_products_transferred_litres: number // generated
  number_of_staff: number | null
  hourly_work: string | null
}

export type GingerProductionRow = RecordEnvelope & {
  quantity_raw_ginger_bags: number
  quantity_grinded_ginger: number
  alcohol_used_tanks: number
  alcohol_used_litres: number // generated
  finished_product_tanks: number
  finished_product_litres: number // generated
}

export type ExtractionRow = RecordEnvelope & {
  product: Product | null
  tank_number: string | null
  beginning_date: string | null
  time: string | null
  alcohol_percentage: string | null
  expected_maturity_date: string | null
  prepared_by: string | null
}

export type FillingLineRow = RecordEnvelope & {
  product: Product | null
  bottles_wasted: number
  bottles_rejected: number
  total_production: number
  number_of_staff: number | null
  hourly_work: string | null
}

export type PackagingRow = RecordEnvelope & {
  product: Product
  quantity_cartons_produced: number
  number_cartons_wasted: number
  quantity_cartons_loaded: number
  number_of_staff: number | null
  hourly_work: string | null
}

export type ConcentrateAlcoholRow = RecordEnvelope & {
  number_tanks_70: number
  alcohol_used_70_litres: number
  water_70_litres: number
  number_tanks_80: number
  alcohol_used_80_litres: number
  water_80_litres: number
  total_alcohol_used_litres: number // generated
}

// Stock ledger movements. Balances (opening/remaining) are NOT stored — they are
// derived on read via the stock_opening / stock_remaining_asof RPCs. Supervisors
// record only quantity_received / quantity_used.
export type StockRow = RecordEnvelope & {
  material: string
  product: Product | null
  variant: string | null
  quantity_received: number
  quantity_used: number
  destination: string | null
  checked_by: string | null
}

// Management baseline / reconciliation anchor. `variance` (generated) =
// counted_qty − computed_qty (the ledger's snapshot at the count point).
export type StockCountRow = {
  id: string
  date: string
  shift: Shift | null
  material: string
  product: Product | null
  variant: string | null
  counted_qty: number
  computed_qty: number
  variance: number // generated
  kind: "baseline" | "reconciliation"
  note: string | null
  counted_by: string | null
  user_id: string | null
  created_at: string
}

export type NoWorkRow = {
  id: string
  date: string
  shift: Shift
  group_number: number | null
  department: string
  supervisor_name: string | null
  reason: string
  user_id: string | null
  created_at: string
}

export type ConsumableStockRow = {
  id: string
  material: string
  product: Product | null
  remaining_pcs: number
  total_received_pcs: number
  total_used_pcs: number
  last_updated_at: string
}

export type RawMaterialReceivedRow = {
  id: string
  user_id: string | null
  received_by: string | null
  date: string
  material_type:
    | "tax_stamp"
    | "carton_bitters"
    | "carton_ginger"
    | "seal_tape"
    | "hair_net"
    | "nose_mask"
    | "gloves"
  stamp_boxes: number
  stamp_total_coils: number
  stamp_total_pcs: number
  carton_total_pcs: number
  ppe_boxes_in: number
  ppe_pcs_in: number
  ppe_given_out: number
  ppe_given_unit: string
  ppe_given_pcs: number
  ppe_given_to: string | null
  remarks: string | null
  created_at: string
}

export type SupervisorStreakRow = {
  user_id: string
  current_streak: number
  longest_streak: number
  last_shift_date: string | null
  last_shift_type: Shift | null
  updated_at: string
}

export type SupervisorBadgeRow = {
  id: string
  user_id: string
  badge_type: string
  earned_at: string
}

export type DepartmentRow = {
  name: string
  code: string
  num_groups: number
  display_order: number
}

export type HerbTypeRow = {
  name: string
  created_at: string
}

export type StockMaterialRow = {
  code: string
  name: string
  unit: string
  tracks_product: boolean
  is_herb: boolean
  display_order: number
}

export type ConsumableMaterialRow = {
  code: string
  name: string
  unit: string
  pcs_per_box: number | null
  pcs_per_coil: number | null
  has_product: boolean
  has_given_out: boolean
  display_order: number
}

/**
 * Singleton settings row (0006). `id` is always true — the table has a CHECK that
 * enforces it, so the app reads and writes the one row rather than a collection.
 */
export type AppSettingsRow = {
  id: boolean
  cartons_per_shift_bitters: number
  cartons_per_shift_ginger: number
  shifts_per_day: number
  waste_allowance_pct: number
  alcohol_drums_per_day: number
  // Conversions (0007). Every number that feeds a calculation; the unit WORDS stay in
  // code because entry-form labels — which key submissions — are built from them.
  bottles_per_carton: number
  bottle_litres: number
  caps_per_bottle: number
  labels_per_bottle: number
  stamps_per_bottle: number
  preforms_per_bottle: number
  drum_litres: number
  gallon_litres: number
  tank_litres: number
  rambo_litres: number
  caps_pcs_per_box: number
  label_pcs_per_roll: number
  preform_pcs_per_bag: number
  stamp_pcs_per_coil: number
  stamp_coils_per_box: number
  tape_pcs_per_box: number
  hairnet_packs_per_box: number
  nosemask_packs_per_box: number
  gloves_packs_per_box: number
  updated_at: string
  updated_by: string | null
}

/** One ingredient of one product's per-carton recipe (0007). */
export type ProductRecipeRow = {
  product: Product
  ingredient: string
  label: string
  litres_per_carton: number
  display_order: number
}

export type PackagingBomRow = {
  product: Product
  stamps_per_carton: number
  cartons_per_carton: number
}

// Helper to describe a table for the generic supabase-js Database type.
// Relationships is required by supabase-js's GenericTable constraint; we don't
// use embedded-resource typing here, so it's an empty tuple.
type T<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" }
  public: {
    Tables: {
      profiles: T<ProfileRow>
      departments: T<DepartmentRow>
      herb_types: T<HerbTypeRow>
      stock_materials: T<StockMaterialRow>
      consumable_materials: T<ConsumableMaterialRow>
      packaging_bom: T<PackagingBomRow>
      app_settings: T<AppSettingsRow>
      product_recipes: T<ProductRecipeRow>
      blowing_daily_records: T<BlowingRow>
      alcohol_blending_daily_records: T<AlcoholBlendingRow>
      ginger_production_records: T<GingerProductionRow>
      extraction_monitoring_records: T<ExtractionRow>
      filling_line_daily_records: T<FillingLineRow>
      packaging_daily_records: T<PackagingRow>
      concentrate_alcohol_records: T<ConcentrateAlcoholRow>
      stock_records: T<StockRow>
      stock_counts: T<StockCountRow>
      no_work_records: T<NoWorkRow>
      consumable_stock: T<ConsumableStockRow>
      raw_materials_received: T<RawMaterialReceivedRow>
      supervisor_streaks: T<SupervisorStreakRow>
      supervisor_badges: T<SupervisorBadgeRow>
    }
    Views: Record<string, never>
    Functions: {
      // Balance carried INTO (p_date, p_shift) — the opening for that shift.
      stock_opening: {
        Args: {
          p_material: string
          p_date: string
          p_shift: Shift
          p_product?: Product | null
          p_variant?: string | null
        }
        Returns: number
      }
      // Current remaining as of end of p_date.
      stock_remaining_asof: {
        Args: {
          p_material: string
          p_date: string
          p_product?: Product | null
          p_variant?: string | null
        }
        Returns: number
      }
      // Per-shift ledger rows with running opening/remaining.
      stock_ledger: {
        Args: {
          p_material: string
          p_from: string
          p_to: string
          p_product?: Product | null
          p_variant?: string | null
        }
        Returns: {
          date: string
          shift: Shift
          received: number
          used: number
          opening: number
          remaining: number
        }[]
      }
      // Record a baseline/reconciliation count; returns the inserted row.
      record_stock_count: {
        Args: {
          p_material: string
          p_date: string
          p_counted: number
          p_shift?: Shift | null
          p_product?: Product | null
          p_variant?: string | null
          p_kind?: "baseline" | "reconciliation"
          p_note?: string | null
        }
        Returns: StockCountRow
      }
      finished_goods_stock: {
        Args: Record<string, never>
        Returns: { product: Product; available: number; total_produced: number; total_loaded: number }[]
      }
      // Replaces the recipes for the products in the payload, in ONE transaction, so
      // the deferred carton-fills check judges the final state rather than a half-
      // applied edit. Admin only (checked inside, since SECURITY DEFINER skips RLS).
      save_recipes: {
        Args: { payload: ProductRecipeRow[] }
        Returns: ProductRecipeRow[]
      }
    }
    Enums: {
      shift_type: Shift
      user_role: UserRole
      product_type: Product
    }
  }
}
