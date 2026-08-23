// ============================================================================
// Form field definitions — the single source of truth for how each form's
// fields map to database columns.
//
// This replaces the old design where field labels were mapped to columns by a
// SEPARATE global `fieldNameToColumn` object in the submit route. That map was
// keyed on label strings shared across forms, so a typo (or a label reused by
// two forms with different columns) silently dropped data. Here the column
// lives ON the field, scoped to its form — unambiguous and lossless.
//
//   generated : the DB computes this value (GENERATED column). The UI shows it
//               read-only; the submit route MUST NOT send it.
//   carried   : the carried-forward stock balance (the "opening"). It is DERIVED
//               on the server from prior shifts' movements + management baselines,
//               shown read-only, and NEVER submitted — supervisors record only
//               received + used. Its `column` is a non-DB sentinel.
//   preview   : frontend-only mirror of the DB's generated formula, so the user
//               sees the computed value live before submitting.
// ============================================================================

export type FieldType = "text" | "number" | "time" | "date" | "textarea" | "select"

export interface FormFieldDef {
  label: string
  column: string
  type: FieldType
  required?: boolean
  generated?: boolean
  /** Read-only carried-forward balance; server-derived, never submitted. */
  carried?: boolean
  options?: string[]
  isAlcoholPercentage?: boolean
  /** Inputs to the live preview of a generated value. */
  previewFrom?: string[]
  /** Live preview formula (mirrors the DB generated column). */
  preview?: (v: Record<string, number>) => number
}

const sum = (keys: string[]) => (v: Record<string, number>) =>
  keys.reduce((s, k) => s + (v[k] || 0), 0)

const remaining = (open: string, recv: string, used: string) => (v: Record<string, number>) =>
  (v[open] || 0) + (v[recv] || 0) - (v[used] || 0)

// Reusable stock-ledger fields (alcohol / caps / labels / caramel).
// The carried-forward balance is server-derived + read-only; supervisors enter
// only received + used. Remaining is a live preview of the DB-derived balance.
function stockLedgerFields(opts: { carriedLabel?: string } = {}): FormFieldDef[] {
  const carriedLabel = opts.carriedLabel ?? "Current Stock (Carried Forward)"
  return [
    { label: carriedLabel, column: "__carried", type: "number", carried: true },
    { label: "Quantity Received", column: "quantity_received", type: "number", required: true },
    { label: "Quantity Used", column: "quantity_used", type: "number", required: true },
    {
      label: "Remaining Stock Level",
      column: "remaining_stock",
      type: "number",
      generated: true,
      previewFrom: [carriedLabel, "Quantity Received", "Quantity Used"],
      preview: remaining(carriedLabel, "Quantity Received", "Quantity Used"),
    },
    { label: "Destination", column: "destination", type: "text", required: true },
    { label: "Remarks", column: "remarks", type: "text" },
  ]
}

export const FORM_FIELDS: Record<string, FormFieldDef[]> = {
  "Daily Records (Preform Usage)": [
    { label: "Current Stock (Carried Forward)", column: "__carried", type: "number", carried: true },
    { label: "Quantity Received (BAGS)", column: "quantity_received_bags", type: "number", required: true },
    { label: "Preforms Used (BAGS)", column: "preforms_used_bags", type: "number", required: true },
    {
      label: "Remaining Balance (BAGS)",
      column: "closing_stock_bags",
      type: "number",
      generated: true,
      previewFrom: ["Current Stock (Carried Forward)", "Quantity Received (BAGS)", "Preforms Used (BAGS)"],
      preview: remaining("Current Stock (Carried Forward)", "Quantity Received (BAGS)", "Preforms Used (BAGS)"),
    },
    { label: "Total Produced", column: "total_produced", type: "number", required: true },
    { label: "WASTE (PCS)", column: "waste_pcs", type: "number", required: true },
    {
      label: "Final Production",
      column: "final_production",
      type: "number",
      generated: true,
      previewFrom: ["Total Produced", "WASTE (PCS)"],
      preview: (v) => (v["Total Produced"] || 0) - (v["WASTE (PCS)"] || 0),
    },
    { label: "Bottles Given Out", column: "bottles_given_out", type: "number", required: true },
    { label: "Remarks (To be filled)", column: "remarks", type: "textarea" },
  ],

  "Daily Usage of Alcohol And Stock Level": stockLedgerFields(),

  "Daily Records for Alcohol and Blending": [
    { label: "Number of Alcohol Transferred (DRUMS)", column: "alcohol_transferred_drums", type: "number", required: true },
    {
      label: "Number of Alcohol Transferred (LITRES)",
      column: "alcohol_transferred_litres",
      type: "number",
      generated: true,
      previewFrom: ["Number of Alcohol Transferred (DRUMS)"],
      preview: (v) => (v["Number of Alcohol Transferred (DRUMS)"] || 0) * 250,
    },
    { label: "Number of Finished Products Transferred (TANKS)", column: "finished_products_transferred_tanks", type: "number", required: true },
    {
      label: "Number of Finished Products Transferred (LITRES)",
      column: "finished_products_transferred_litres",
      type: "number",
      generated: true,
      previewFrom: ["Number of Finished Products Transferred (TANKS)"],
      preview: (v) => (v["Number of Finished Products Transferred (TANKS)"] || 0) * 900,
    },
    { label: "Number of Staff Used", column: "number_of_staff", type: "number", required: true },
    { label: "Hourly Work", column: "hourly_work", type: "text" },
    { label: "Remarks", column: "remarks", type: "text" },
  ],

  "Ginger Production": [
    { label: "Quantity of Raw Ginger (BAGS)", column: "quantity_raw_ginger_bags", type: "number", required: true },
    { label: "Quantity of Grinded Ginger", column: "quantity_grinded_ginger", type: "number", required: true },
    { label: "Quantity of Alcohol Used (Tanks)", column: "alcohol_used_tanks", type: "number", required: true },
    {
      label: "Quantity of Alcohol Used (Litres)",
      column: "alcohol_used_litres",
      type: "number",
      generated: true,
      previewFrom: ["Quantity of Alcohol Used (Tanks)"],
      preview: (v) => (v["Quantity of Alcohol Used (Tanks)"] || 0) * 300,
    },
    { label: "Quantity of Finished Product Transferred (Tanks)", column: "finished_product_tanks", type: "number", required: true },
    {
      label: "Quantity of Finished Product Transferred (Litres)",
      column: "finished_product_litres",
      type: "number",
      generated: true,
      previewFrom: ["Quantity of Finished Product Transferred (Tanks)"],
      preview: (v) => (v["Quantity of Finished Product Transferred (Tanks)"] || 0) * 1000,
    },
    { label: "Remarks", column: "remarks", type: "text" },
  ],

  "Extraction Monitoring Records": [
    { label: "Beginning Date", column: "beginning_date", type: "date", required: true },
    { label: "Tank Number", column: "tank_number", type: "text", required: true },
    { label: "Time", column: "time", type: "time", required: true },
    { label: "Alcohol Percentage", column: "alcohol_percentage", type: "text", required: true, options: ["70", "80"], isAlcoholPercentage: true },
    { label: "Expected Maturity Date", column: "expected_maturity_date", type: "date", required: true },
    { label: "Prepared By", column: "prepared_by", type: "text", required: true },
    { label: "Remarks (To be filled)", column: "remarks", type: "textarea" },
  ],

  "Filling Line Daily Records": [
    { label: "Bottles Wasted", column: "bottles_wasted", type: "number", required: true },
    { label: "Bottles Rejected", column: "bottles_rejected", type: "number", required: true },
    { label: "Number of Staff Used", column: "number_of_staff", type: "number", required: true },
    { label: "Hourly Work", column: "hourly_work", type: "text" },
    { label: "Total Production", column: "total_production", type: "number", required: true },
    { label: "Remarks", column: "remarks", type: "text" },
  ],

  "Packaging Daily Records": [
    { label: "Quantity Of Cartons Produced", column: "quantity_cartons_produced", type: "number", required: true },
    { label: "Number of Cartons Wasted", column: "number_cartons_wasted", type: "number", required: true },
    { label: "Quantity Of Cartons Loaded", column: "quantity_cartons_loaded", type: "number", required: true },
    { label: "Number of Staff Used", column: "number_of_staff", type: "number", required: true },
    { label: "Hourly Work", column: "hourly_work", type: "text" },
    { label: "Remarks", column: "remarks", type: "text" },
  ],

  "Daily Records Alcohol For Concentrate": [
    { label: "Number of Tanks (70)", column: "number_tanks_70", type: "number", required: true },
    { label: "Alcohol Used (L) (70)", column: "alcohol_used_70_litres", type: "number", required: true },
    { label: "Water (L) (70)", column: "water_70_litres", type: "number", required: true },
    { label: "Number of Tanks (80)", column: "number_tanks_80", type: "number", required: true },
    { label: "Alcohol Used (L) (80)", column: "alcohol_used_80_litres", type: "number", required: true },
    { label: "Water (L) (80)", column: "water_80_litres", type: "number", required: true },
    {
      label: "Total Alcohol Used (L)",
      column: "total_alcohol_used_litres",
      type: "number",
      generated: true,
      previewFrom: ["Alcohol Used (L) (70)", "Alcohol Used (L) (80)"],
      preview: sum(["Alcohol Used (L) (70)", "Alcohol Used (L) (80)"]),
    },
    { label: "Remarks", column: "remarks", type: "text" },
  ],

  // Herbs is rendered by a bespoke multi-herb UI; these are the per-herb fields.
  "Herbs Stock": [
    { label: "Available Stock", column: "__carried", type: "number", carried: true },
    { label: "Qty Received", column: "quantity_received", type: "number", required: true },
    {
      label: "Total Qty",
      column: "total_quantity",
      type: "number",
      generated: true,
      previewFrom: ["Available Stock", "Qty Received"],
      preview: sum(["Available Stock", "Qty Received"]),
    },
    { label: "Qty Used", column: "quantity_used", type: "number", required: true },
    {
      label: "Remaining Qty",
      column: "remaining_stock",
      type: "number",
      generated: true,
      previewFrom: ["Available Stock", "Qty Received", "Qty Used"],
      preview: remaining("Available Stock", "Qty Received", "Qty Used"),
    },
    { label: "Checked By", column: "checked_by", type: "text", required: true },
    { label: "Remarks", column: "remarks", type: "text" },
  ],

  "Caramel Stock": stockLedgerFields(),
  "Caps Stock": stockLedgerFields(),
  "Labels Stock": stockLedgerFields(),
}
