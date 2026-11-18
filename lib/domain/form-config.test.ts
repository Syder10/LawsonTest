import { describe, it, expect } from "vitest"
import { FORM_FIELDS, type FormFieldDef } from "@/lib/domain/form-config"
import { RECORD_TYPES, getRecordType } from "@/lib/domain/record-types"

// ============================================================================
// Column sets transcribed from supabase/migrations/0004_records.sql
// and 0004_records.sql. `WRITABLE` = columns an INSERT may set;
// `DERIVED` = values the client must never send, either because the DB computes
// them (GENERATED ALWAYS) or because the server derives them on read.
// A failure here means FORM_FIELDS has drifted from the schema.
// ============================================================================
const WRITABLE_COLUMNS: Record<string, string[]> = {
  blowing_daily_records: [
    "quantity_received_bags",
    "preforms_used_bags",
    "total_produced",
    "waste_pcs",
    "bottles_given_out",
    "remarks",
  ],
  alcohol_blending_daily_records: [
    "alcohol_transferred_drums",
    "finished_products_transferred_tanks",
    "number_of_staff",
    "hourly_work",
    "remarks",
  ],
  ginger_production_records: [
    "quantity_raw_ginger_bags",
    "quantity_grinded_ginger",
    "alcohol_used_tanks",
    "finished_product_tanks",
    "remarks",
  ],
  extraction_monitoring_records: [
    "tank_number",
    "beginning_date",
    "time",
    "alcohol_percentage",
    "expected_maturity_date",
    "prepared_by",
    "remarks",
  ],
  filling_line_daily_records: [
    "bottles_wasted",
    "bottles_rejected",
    "total_production",
    "number_of_staff",
    "hourly_work",
    "remarks",
  ],
  packaging_daily_records: [
    "quantity_cartons_produced",
    "number_cartons_wasted",
    "quantity_cartons_loaded",
    "number_of_staff",
    "hourly_work",
    "remarks",
  ],
  concentrate_alcohol_records: [
    "number_tanks_70",
    "alcohol_used_70_litres",
    "water_70_litres",
    "number_tanks_80",
    "alcohol_used_80_litres",
    "water_80_litres",
    "remarks",
  ],
  stock_records: ["quantity_received", "quantity_used", "destination", "checked_by", "remarks"],
}

/** Generated/derived columns per record type, in field order. */
const DERIVED_COLUMNS: Record<string, string[]> = {
  // closing_stock_bags is derived by lib/domain/stock-ledger (no such DB column);
  // final_production is a DB GENERATED column.
  "Daily Records (Preform Usage)": ["closing_stock_bags", "final_production"],
  "Daily Usage of Alcohol And Stock Level": ["remaining_stock"],
  "Daily Records for Alcohol and Blending": [
    "alcohol_transferred_litres",
    "finished_products_transferred_litres",
  ],
  "Ginger Production": ["alcohol_used_litres", "finished_product_litres"],
  "Extraction Monitoring Records": [],
  "Filling Line Daily Records": [],
  "Caps Stock": ["remaining_stock"],
  "Labels Stock": ["remaining_stock"],
  "Packaging Daily Records": [],
  "Daily Records Alcohol For Concentrate": ["total_alcohol_used_litres"],
  // total_quantity / remaining_stock are read-side derivations of the ledger.
  "Herbs Stock": ["total_quantity", "remaining_stock"],
  "Caramel Stock": ["remaining_stock"],
}

const FIELD_TYPES = ["text", "number", "time", "date", "textarea", "select"]

/** The storage bucket a record type's columns belong to. */
function storageKey(label: string): string {
  const def = getRecordType(label)
  if (!def) throw new Error(`no record type for ${label}`)
  return def.storage.kind === "table" ? def.storage.table : "stock_records"
}

const forms = Object.entries(FORM_FIELDS)
const allFields: [string, FormFieldDef][] = forms.flatMap(([label, fields]) =>
  fields.map((f) => [label, f] as [string, FormFieldDef]),
)

describe("FORM_FIELDS registry coverage", () => {
  it("defines fields for all 12 record types and nothing else", () => {
    expect(Object.keys(FORM_FIELDS).sort()).toEqual(RECORD_TYPES.map((r) => r.label).sort())
  })

  it("has a matching record type for every form key (no orphan forms)", () => {
    for (const [label] of forms) {
      expect(getRecordType(label), `record type for form "${label}"`).toBeDefined()
    }
  })

  it("gives every form at least one field", () => {
    for (const [label, fields] of forms) {
      expect(fields.length, `field count for ${label}`).toBeGreaterThan(0)
    }
  })
})

describe("FORM_FIELDS field-level invariants", () => {
  it("gives every field a non-empty label and column", () => {
    for (const [label, f] of allFields) {
      expect(f.label.trim(), `label in ${label}`).not.toBe("")
      expect(f.column.trim(), `column of ${label}/${f.label}`).not.toBe("")
    }
  })

  it("uses a declared FieldType for every field", () => {
    for (const [label, f] of allFields) {
      expect(FIELD_TYPES, `type of ${label}/${f.label}`).toContain(f.type)
    }
  })

  it("keeps labels unique within each form (labels are the submission keys)", () => {
    for (const [label, fields] of forms) {
      const labels = fields.map((f) => f.label)
      expect(new Set(labels).size, `unique labels in ${label}`).toBe(labels.length)
    }
  })

  it("keeps columns unique within each form (two fields must never target one column)", () => {
    for (const [label, fields] of forms) {
      const columns = fields.map((f) => f.column)
      expect(new Set(columns).size, `unique columns in ${label}`).toBe(columns.length)
    }
  })

  it("uses snake_case column names (or the __carried sentinel)", () => {
    for (const [label, f] of allFields) {
      expect(f.column, `column of ${label}/${f.label}`).toMatch(/^(__carried|[a-z][a-z0-9_]*)$/)
    }
  })

  it("never writes to an envelope column that the submit path owns", () => {
    const envelopeColumns = ["date", "shift", "group_number", "department", "supervisor_name", "user_id", "product", "material", "variant", "id", "created_at", "updated_at"]
    for (const [label, f] of allFields) {
      expect(envelopeColumns, `column of ${label}/${f.label}`).not.toContain(f.column)
    }
  })
})

describe("FORM_FIELDS columns map to real schema columns", () => {
  it("maps every submittable field to a writable column of its storage table", () => {
    for (const [label, fields] of forms) {
      const writable = WRITABLE_COLUMNS[storageKey(label)]
      for (const f of fields.filter((f) => !f.generated && !f.carried)) {
        expect(writable, `${label}/${f.label} -> ${f.column}`).toContain(f.column)
      }
    }
  })

  it("marks exactly the generated/derived columns as generated on each form", () => {
    for (const [label, fields] of forms) {
      const generated = fields.filter((f) => f.generated).map((f) => f.column)
      expect(generated, `generated columns of ${label}`).toEqual(DERIVED_COLUMNS[label])
    }
  })

  it("never marks a plain writable column as generated", () => {
    for (const [label, fields] of forms) {
      const writable = WRITABLE_COLUMNS[storageKey(label)]
      for (const f of fields.filter((f) => f.generated)) {
        expect(writable, `${label}/${f.column} should not be directly writable`).not.toContain(
          f.column,
        )
      }
    }
  })

  it("maps every carried-forward field to the non-DB __carried sentinel", () => {
    const carried = allFields.filter(([, f]) => f.carried)
    // 4 stock-ledger forms + Blowing preforms + Herbs Stock = one per continuity record.
    expect(carried.length).toBe(6)
    for (const [label, f] of carried) {
      expect(f.column, `carried column of ${label}/${f.label}`).toBe("__carried")
      expect(f.type).toBe("number")
    }
  })

  it("allows at most one carried-forward field per form", () => {
    for (const [label, fields] of forms) {
      expect(fields.filter((f) => f.carried).length, `carried fields in ${label}`).toBeLessThanOrEqual(1)
    }
  })

  it("gives every stock-continuity form exactly one carried-forward field", () => {
    for (const def of RECORD_TYPES.filter((r) => r.stockContinuity)) {
      const fields = FORM_FIELDS[def.label] ?? []
      expect(fields.filter((f) => f.carried).length, `carried field in ${def.label}`).toBe(1)
    }
  })

  it("gives every form exactly one optional remarks field", () => {
    for (const [label, fields] of forms) {
      const remarks = fields.filter((f) => f.column === "remarks")
      expect(remarks.length, `remarks fields in ${label}`).toBe(1)
      expect(remarks[0].required, `remarks required in ${label}`).toBeFalsy()
    }
  })
})

describe("FORM_FIELDS required / generated / carried flags are mutually consistent", () => {
  it("never marks a generated field as required (the user cannot fill it)", () => {
    for (const [label, f] of allFields.filter(([, f]) => f.generated)) {
      expect(f.required, `${label}/${f.label} required`).toBeFalsy()
    }
  })

  it("never marks a carried field as required (the server derives it)", () => {
    for (const [label, f] of allFields.filter(([, f]) => f.carried)) {
      expect(f.required, `${label}/${f.label} required`).toBeFalsy()
    }
  })

  it("never marks a field as both generated and carried", () => {
    for (const [label, f] of allFields) {
      expect(f.generated && f.carried, `${label}/${f.label}`).toBeFalsy()
    }
  })

  it("gives every form at least one required field", () => {
    for (const [label, fields] of forms) {
      expect(fields.some((f) => f.required), `required fields in ${label}`).toBe(true)
    }
  })
})

describe("FORM_FIELDS preview wiring", () => {
  it("gives every generated field both a preview function and its previewFrom inputs", () => {
    for (const [label, f] of allFields.filter(([, f]) => f.generated)) {
      expect(typeof f.preview, `preview of ${label}/${f.label}`).toBe("function")
      expect(f.previewFrom?.length, `previewFrom of ${label}/${f.label}`).toBeGreaterThan(0)
    }
  })

  it("never attaches a preview to a non-generated field", () => {
    for (const [label, f] of allFields.filter(([, f]) => !f.generated)) {
      expect(f.preview, `preview of ${label}/${f.label}`).toBeUndefined()
      expect(f.previewFrom, `previewFrom of ${label}/${f.label}`).toBeUndefined()
    }
  })

  it("references only labels that exist on the SAME form from previewFrom", () => {
    for (const [label, fields] of forms) {
      const labels = new Set(fields.map((f) => f.label))
      for (const f of fields.filter((f) => f.previewFrom)) {
        for (const input of f.previewFrom!) {
          expect(labels, `previewFrom of ${label}/${f.label}`).toContain(input)
        }
      }
    }
  })

  it("never chains one generated field off another (previewFrom inputs are user- or server-provided)", () => {
    for (const [label, fields] of forms) {
      const generatedLabels = new Set(fields.filter((f) => f.generated).map((f) => f.label))
      for (const f of fields.filter((f) => f.previewFrom)) {
        for (const input of f.previewFrom!) {
          expect(generatedLabels.has(input), `${label}/${f.label} depends on generated ${input}`).toBe(false)
        }
      }
    }
  })

  it("returns 0 from every preview when no inputs have been entered yet", () => {
    for (const [label, f] of allFields.filter(([, f]) => f.preview)) {
      expect(f.preview!({}), `empty preview of ${label}/${f.label}`).toBe(0)
    }
  })

  it("returns a finite number from every preview for unit inputs", () => {
    for (const [label, f] of allFields.filter(([, f]) => f.preview)) {
      const v = Object.fromEntries((f.previewFrom ?? []).map((k) => [k, 1]))
      expect(Number.isFinite(f.preview!(v)), `unit preview of ${label}/${f.label}`).toBe(true)
    }
  })

  it("treats NaN inputs as 0 in every preview (the form parses raw strings with parseFloat)", () => {
    for (const [label, f] of allFields.filter(([, f]) => f.preview)) {
      const v = Object.fromEntries((f.previewFrom ?? []).map((k) => [k, Number.NaN]))
      expect(f.preview!(v), `NaN preview of ${label}/${f.label}`).toBe(0)
    }
  })

  it("ignores keys outside previewFrom", () => {
    // Inputs are read from previewFrom rather than written out, so a label change
    // (adding the entry unit, say) can't turn this into a test of nothing.
    const f = FORM_FIELDS["Caps Stock"].find((f) => f.column === "remaining_stock")!
    const [carried, received, used] = f.previewFrom!
    expect(
      f.preview!({ [carried]: 500, [received]: 120, [used]: 80, "Some Other Field": 9999 }),
    ).toBe(540)
  })
})

describe("stock-ledger preview: opening + received - used", () => {
  const remainingField = (form: string) =>
    FORM_FIELDS[form].find((f) => f.column === "remaining_stock")!

  it("computes the remaining stock level for the alcohol ledger", () => {
    // Alcohol's labels carry their unit — the floor counts 250 L DRUMS, and a bare
    // "Quantity Used" was what let a drum count be captioned "litres" downstream.
    expect(
      remainingField("Daily Usage of Alcohol And Stock Level").preview!({
        "Current Stock (Carried Forward) (DRUMS)": 500,
        "Quantity Received (DRUMS)": 120,
        "Quantity Used (DRUMS)": 80,
      }),
    ).toBe(540)
  })

  it("treats a missing received amount as 0", () => {
    const f = remainingField("Caps Stock")
    const [carried, , used] = f.previewFrom!
    expect(f.preview!({ [carried]: 500, [used]: 80 })).toBe(420)
  })

  it("can go negative when more was used than was available (over-issue is visible, not clamped)", () => {
    const f = remainingField("Caramel Stock")
    const [carried, received, used] = f.previewFrom!
    expect(f.preview!({ [carried]: 100, [received]: 0, [used]: 250 })).toBe(-150)
  })

  it("wires each ledger form's own three inputs into previewFrom", () => {
    // The three inputs must be that form's OWN labels, or the live preview silently
    // reads undefined and shows 0 — which is what a unit suffix on one form and not
    // another would cause if previewFrom were hardcoded.
    for (const form of [
      "Daily Usage of Alcohol And Stock Level",
      "Caps Stock",
      "Labels Stock",
      "Caramel Stock",
    ]) {
      const labels = FORM_FIELDS[form].map((f) => f.label)
      const inputs = remainingField(form).previewFrom!
      expect(inputs.length, `previewFrom of ${form}`).toBe(3)
      for (const i of inputs) expect(labels, `${form} previewFrom "${i}"`).toContain(i)
      expect(inputs.map((l) => l.replace(/ \([A-Z]+\)$/, "")), `previewFrom of ${form}`).toEqual([
        "Current Stock (Carried Forward)",
        "Quantity Received",
        "Quantity Used",
      ])
    }
  })

  it("defines the four stock-ledger forms with an identical COLUMN shape", () => {
    // Labels may carry a unit (alcohol says DRUMS); the columns, order and flags must
    // not drift, because that is what would corrupt or drop data.
    const shape = (form: string) =>
      FORM_FIELDS[form].map((f) => ({
        column: f.column,
        type: f.type,
        required: !!f.required,
        generated: !!f.generated,
        carried: !!f.carried,
        hasPreview: !!f.previewFrom,
      }))
    const reference = shape("Daily Usage of Alcohol And Stock Level")
    expect(shape("Caps Stock")).toEqual(reference)
    expect(shape("Labels Stock")).toEqual(reference)
    expect(shape("Caramel Stock")).toEqual(reference)
  })

  // Every ledger material is counted in a CONTAINER, and each form says which. A bare
  // "Quantity Used" is what let a drum count be stored and captioned as litres.
  it("names the entry unit in the label of every stock-ledger form", () => {
    const expected: Record<string, string> = {
      "Daily Usage of Alcohol And Stock Level": "DRUMS",
      "Caps Stock": "BOXES",
      "Labels Stock": "ROLLS",
      "Caramel Stock": "GALLONS",
    }
    for (const [form, unit] of Object.entries(expected)) {
      const labels = FORM_FIELDS[form].map((f) => f.label)
      expect(labels, form).toContain(`Quantity Used (${unit})`)
      expect(labels, form).toContain(`Quantity Received (${unit})`)
    }
  })

  it("names the entry unit on the herbs form too", () => {
    // Herbs use a bespoke per-variant UI with its own labels, so it does not inherit
    // the shared helper and has to be checked separately.
    const labels = FORM_FIELDS["Herbs Stock"].map((f) => f.label)
    expect(labels).toContain("Qty Used (SACKS)")
    expect(labels).toContain("Qty Received (SACKS)")
  })
})

describe("Blowing form previews", () => {
  const field = (column: string) =>
    FORM_FIELDS["Daily Records (Preform Usage)"].find((f) => f.column === column)!

  it("computes the closing bag balance as carried + received - used", () => {
    expect(
      field("closing_stock_bags").preview!({
        "Current Stock (Carried Forward)": 40,
        "Quantity Received (BAGS)": 10,
        "Preforms Used (BAGS)": 6,
      }),
    ).toBe(44)
  })

  it("computes final production as total produced minus waste (mirrors the DB generated column)", () => {
    expect(
      field("final_production").preview!({ "Total Produced": 9000, "WASTE (PCS)": 120 }),
    ).toBe(8880)
  })

  it("reports negative final production when waste exceeds output (no clamping)", () => {
    expect(field("final_production").preview!({ "Total Produced": 10, "WASTE (PCS)": 25 })).toBe(-15)
  })

  it("treats a missing waste figure as 0 waste", () => {
    expect(field("final_production").preview!({ "Total Produced": 9000 })).toBe(9000)
  })
})

describe("Alcohol and Blending form previews", () => {
  const field = (column: string) =>
    FORM_FIELDS["Daily Records for Alcohol and Blending"].find((f) => f.column === column)!

  it("converts drums to litres at 250 L per drum", () => {
    expect(
      field("alcohol_transferred_litres").preview!({
        "Number of Alcohol Transferred (DRUMS)": 4,
      }),
    ).toBe(1000)
  })

  it("converts finished-product tanks to litres at 900 L per tank", () => {
    expect(
      field("finished_products_transferred_litres").preview!({
        "Number of Finished Products Transferred (TANKS)": 2,
      }),
    ).toBe(1800)
  })

  it("handles fractional drums", () => {
    expect(
      field("alcohol_transferred_litres").preview!({
        "Number of Alcohol Transferred (DRUMS)": 0.5,
      }),
    ).toBe(125)
  })
})

describe("Ginger Production form previews", () => {
  const field = (column: string) =>
    FORM_FIELDS["Ginger Production"].find((f) => f.column === column)!

  it("converts alcohol tanks to litres at 300 L per tank", () => {
    expect(field("alcohol_used_litres").preview!({ "Quantity of Alcohol Used (Tanks)": 3 })).toBe(900)
  })

  it("converts finished-product tanks to litres at 1000 L per tank", () => {
    expect(
      field("finished_product_litres").preview!({
        "Quantity of Finished Product Transferred (Tanks)": 2,
      }),
    ).toBe(2000)
  })

  it("uses a different tank size from the alcohol blending form (300 vs 900 L)", () => {
    const gingerTank = field("alcohol_used_litres").preview!({
      "Quantity of Alcohol Used (Tanks)": 1,
    })
    const blendingTank = FORM_FIELDS["Daily Records for Alcohol and Blending"]
      .find((f) => f.column === "finished_products_transferred_litres")!
      .preview!({ "Number of Finished Products Transferred (TANKS)": 1 })
    expect(gingerTank).toBe(300)
    expect(blendingTank).toBe(900)
  })
})

describe("Concentrate form preview", () => {
  const field = FORM_FIELDS["Daily Records Alcohol For Concentrate"].find(
    (f) => f.column === "total_alcohol_used_litres",
  )!

  it("sums the 70% and 80% alcohol usage", () => {
    expect(
      field.preview!({ "Alcohol Used (L) (70)": 1200, "Alcohol Used (L) (80)": 800 }),
    ).toBe(2000)
  })

  it("returns the single supplied figure when only one strength was used", () => {
    expect(field.preview!({ "Alcohol Used (L) (80)": 800 })).toBe(800)
  })

  it("does NOT include the water columns in the total", () => {
    expect(field.previewFrom).toEqual(["Alcohol Used (L) (70)", "Alcohol Used (L) (80)"])
    expect(
      field.preview!({
        "Alcohol Used (L) (70)": 100,
        "Alcohol Used (L) (80)": 100,
        "Water (L) (70)": 5000,
        "Water (L) (80)": 5000,
      }),
    ).toBe(200)
  })
})

describe("Herbs Stock form previews", () => {
  const field = (column: string) => FORM_FIELDS["Herbs Stock"].find((f) => f.column === column)!

  // Labels are read from previewFrom rather than written out: herbs are counted in
  // SACKS and the labels say so, and a test that hardcodes them silently passes with
  // every input undefined the next time a unit is confirmed.
  const inputs = (column: string) => field(column).previewFrom!

  it("computes total quantity as available + received", () => {
    const [available, received] = inputs("total_quantity")
    expect(field("total_quantity").preview!({ [available]: 30, [received]: 12 })).toBe(42)
  })

  it("computes remaining quantity as available + received - used", () => {
    const [available, received, used] = inputs("remaining_stock")
    expect(field("remaining_stock").preview!({ [available]: 30, [received]: 12, [used]: 20 })).toBe(22)
  })

  it("keeps total quantity independent of the used amount", () => {
    const [available, received] = inputs("total_quantity")
    const [, , used] = inputs("remaining_stock")
    expect(inputs("total_quantity").length).toBe(2)
    expect(inputs("total_quantity")).not.toContain(used)
    expect(
      field("total_quantity").preview!({ [available]: 30, [received]: 12, [used]: 20 }),
    ).toBe(42)
  })
})

describe("Extraction Monitoring form", () => {
  const fields = FORM_FIELDS["Extraction Monitoring Records"]

  it("has no generated fields (every value is captured by hand)", () => {
    expect(fields.filter((f) => f.generated)).toEqual([])
  })

  it("offers the 70/80 alcohol strengths through the bespoke isAlcoholPercentage control", () => {
    const pct = fields.find((f) => f.column === "alcohol_percentage")!
    expect(pct.options).toEqual(["70", "80"])
    expect(pct.isAlcoholPercentage).toBe(true)
    // NOTE: the field is declared type "text" (not "select"); the options are
    // rendered by the isAlcoholPercentage branch in record-entry-form.tsx, so the
    // value reaching the DB is the string "70" / "80".
    expect(pct.type).toBe("text")
  })

  it("is the only form that declares options, and every options field is an alcohol-percentage field", () => {
    const withOptions = allFields.filter(([, f]) => f.options)
    expect(withOptions.map(([form]) => form)).toEqual(["Extraction Monitoring Records"])
    for (const [, f] of withOptions) expect(f.isAlcoholPercentage).toBe(true)
  })

  it("uses date and time field types for the maturity schedule", () => {
    expect(fields.find((f) => f.column === "beginning_date")!.type).toBe("date")
    expect(fields.find((f) => f.column === "expected_maturity_date")!.type).toBe("date")
    expect(fields.find((f) => f.column === "time")!.type).toBe("time")
  })
})
