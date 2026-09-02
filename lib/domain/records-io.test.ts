import { describe, it, expect } from "vitest"
import { FORM_FIELDS } from "@/lib/domain/form-config"
import { RECORD_TYPES } from "@/lib/domain/record-types"
import {
  buildRecordRow,
  missingRequiredFields,
  type RecordEnvelopeInput,
} from "@/lib/domain/records-io"

function env(overrides: Partial<RecordEnvelopeInput> = {}): RecordEnvelopeInput {
  return {
    date: "2026-08-24",
    shift: "Morning",
    group_number: 2,
    department: "Packaging",
    supervisor_name: "Ama Mensah",
    user_id: "11111111-2222-3333-4444-555555555555",
    ...overrides,
  }
}

/** Unwrap a successful build, failing loudly (with the error) otherwise. */
function built(result: ReturnType<typeof buildRecordRow>) {
  if (!result.ok) throw new Error(`expected ok build, got error: ${result.error}`)
  return result.built
}

describe("buildRecordRow - unknown record type", () => {
  it("fails with a message naming the unknown record type", () => {
    expect(buildRecordRow("Daily Records (Nonexistent)", env(), {})).toEqual({
      ok: false,
      error: "Unknown record type: Daily Records (Nonexistent)",
    })
  })

  it("fails for an empty record type", () => {
    const result = buildRecordRow("", env(), {})
    expect(result.ok).toBe(false)
  })
})

describe("buildRecordRow - envelope columns", () => {
  it("always writes date, shift, group_number, department, supervisor_name and user_id", () => {
    const row = built(buildRecordRow("Ginger Production", env({ department: "Alcohol and Blending" }), {})).row
    expect(row).toEqual({
      date: "2026-08-24",
      shift: "Morning",
      group_number: 2,
      department: "Alcohol and Blending",
      supervisor_name: "Ama Mensah",
      user_id: "11111111-2222-3333-4444-555555555555",
    })
  })

  it("preserves explicit nulls for group_number and supervisor_name (does not drop the keys)", () => {
    const row = built(
      buildRecordRow("Ginger Production", env({ group_number: null, supervisor_name: null }), {}),
    ).row
    expect(row.group_number).toBeNull()
    expect(row.supervisor_name).toBeNull()
    expect(Object.keys(row)).toContain("group_number")
    expect(Object.keys(row)).toContain("supervisor_name")
  })

  it("passes the Night shift through unchanged", () => {
    const row = built(buildRecordRow("Ginger Production", env({ shift: "Night" }), {})).row
    expect(row.shift).toBe("Night")
  })
})

describe("buildRecordRow - product handling", () => {
  it("writes product for a per-product record type", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Ginger" }), {}),
    ).row
    expect(row.product).toBe("Ginger")
  })

  it("omits product entirely for a single-form record type even when one is supplied", () => {
    const row = built(
      buildRecordRow("Ginger Production", env({ product: "Bitters" }), {}),
    ).row
    expect("product" in row).toBe(false)
  })

  it("rejects a per-product record type given no product", () => {
    // A NULL product would either fail the NOT NULL constraint
    // (packaging_daily_records) or be silently stored and made invisible to
    // per-product analytics. Rejected with a readable message instead.
    const result = buildRecordRow("Packaging Daily Records", env({ product: null }), {})
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/must be filed for a product/)
  })

  it("rejects a per-product record type given an empty product", () => {
    const result = buildRecordRow("Filling Line Daily Records", env({ product: "" as never }), {})
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/must be filed for a product/)
  })

  it("rejects a product that is not valid for the record type", () => {
    // The Bitters-only alcohol blending record must not accept Ginger.
    const result = buildRecordRow(
      "Daily Records for Alcohol and Blending",
      env({ product: "Ginger" }),
      {},
    )
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toMatch(/is not a valid product/)
  })

  it("writes only Bitters-side products for the Bitters-only alcohol blending record", () => {
    const row = built(
      buildRecordRow("Daily Records for Alcohol and Blending", env({ product: "Bitters" }), {}),
    ).row
    expect(row.product).toBe("Bitters")
  })
})

describe("buildRecordRow - target resolution", () => {
  it("targets the production table for a table-backed record type", () => {
    expect(built(buildRecordRow("Filling Line Daily Records", env({ product: "Bitters" }), {})).target).toEqual({
      kind: "table",
      table: "filling_line_daily_records",
    })
  })

  it("targets the consolidated stock ledger for a stock-backed record type", () => {
    expect(built(buildRecordRow("Caps Stock", env({ department: "Filling Line" }), {})).target).toEqual({
      kind: "stock",
      material: "caps",
    })
  })

  it("resolves a target for every record type in the registry", () => {
    for (const def of RECORD_TYPES) {
      const result = buildRecordRow(def.label, env({ product: "Bitters", variant: "Cloves" }), {})
      expect(result.ok, `build ${def.label}`).toBe(true)
      const target = built(result).target
      expect(target.kind, `target kind for ${def.label}`).toBe(def.storage.kind)
    }
  })
})

describe("buildRecordRow - stock records", () => {
  it("writes the material for a stock-backed record type", () => {
    const row = built(buildRecordRow("Caps Stock", env({ department: "Filling Line" }), {})).row
    expect(row.material).toBe("caps")
  })

  it("writes both material and product for the per-product Labels Stock record", () => {
    const row = built(
      buildRecordRow("Labels Stock", env({ department: "Filling Line", product: "Ginger" }), {}),
    ).row
    expect(row.material).toBe("labels")
    expect(row.product).toBe("Ginger")
  })

  it("rejects Herbs Stock without a herb variant", () => {
    expect(buildRecordRow("Herbs Stock", env({ department: "Concentrate" }), {})).toEqual({
      ok: false,
      error: "Herbs Stock requires a herb type.",
    })
  })

  it("rejects Herbs Stock with an empty-string variant", () => {
    const result = buildRecordRow("Herbs Stock", env({ department: "Concentrate", variant: "" }), {})
    expect(result).toEqual({ ok: false, error: "Herbs Stock requires a herb type." })
  })

  it("writes the herb variant when supplied", () => {
    const row = built(
      buildRecordRow("Herbs Stock", env({ department: "Concentrate", variant: "Cloves" }), {}),
    ).row
    expect(row).toMatchObject({ material: "herb", variant: "Cloves" })
  })

  it("does not write a variant for non-herb stock records", () => {
    const row = built(
      buildRecordRow("Caps Stock", env({ department: "Filling Line", variant: "Cloves" }), {}),
    ).row
    expect("variant" in row).toBe(false)
  })

  it("does not write a material for table-backed record types", () => {
    const row = built(buildRecordRow("Ginger Production", env(), {})).row
    expect("material" in row).toBe(false)
  })

  it("maps the full stock-ledger form to its movement columns", () => {
    // Alcohol's labels carry their unit (DRUMS) — the ledger stores the drums a
    // supervisor counted, and the litres they represent are derived for display.
    const row = built(
      buildRecordRow("Daily Usage of Alcohol And Stock Level", env({ department: "Alcohol and Blending" }), {
        "Current Stock (Carried Forward) (DRUMS)": "500",
        "Quantity Received (DRUMS)": "120",
        "Quantity Used (DRUMS)": "80",
        "Remaining Stock Level (DRUMS)": "540",
        Destination: "Blending Tank 3",
        Remarks: "steady",
      }),
    ).row
    expect(row).toMatchObject({
      material: "alcohol",
      quantity_received: 120,
      quantity_used: 80,
      destination: "Blending Tank 3",
      remarks: "steady",
    })
  })
})

describe("buildRecordRow - generated and carried fields are never written", () => {
  it("drops the carried-forward opening balance (server-derived, sentinel column)", () => {
    const row = built(
      buildRecordRow("Caps Stock", env({ department: "Filling Line" }), {
        "Current Stock (Carried Forward) (BOXES)": "500",
        "Quantity Received (BOXES)": "10",
        "Quantity Used (BOXES)": "5",
      }),
    ).row
    expect("__carried" in row).toBe(false)
    expect(row.quantity_received).toBe(10)
  })

  it("drops the DB-generated Remaining Stock Level even if the client submits it", () => {
    const row = built(
      buildRecordRow("Caps Stock", env({ department: "Filling Line" }), {
        "Remaining Stock Level": "505",
      }),
    ).row
    expect("remaining_stock" in row).toBe(false)
  })

  it("drops both generated columns on the Blowing form (closing balance and final production)", () => {
    const row = built(
      buildRecordRow("Daily Records (Preform Usage)", env({ department: "Blowing" }), {
        "Current Stock (Carried Forward)": "40",
        "Quantity Received (BAGS)": "10",
        "Preforms Used (BAGS)": "6",
        "Remaining Balance (BAGS)": "44",
        "Total Produced": "9000",
        "WASTE (PCS)": "120",
        "Final Production": "8880",
        "Bottles Given Out": "8000",
        "Remarks (To be filled)": "ok",
      }),
    ).row
    expect(row).toMatchObject({
      quantity_received_bags: 10,
      preforms_used_bags: 6,
      total_produced: 9000,
      waste_pcs: 120,
      bottles_given_out: 8000,
      remarks: "ok",
    })
    expect("closing_stock_bags" in row).toBe(false)
    expect("final_production" in row).toBe(false)
    expect("__carried" in row).toBe(false)
  })

  it("drops every generated litres column on the alcohol blending form", () => {
    const row = built(
      buildRecordRow("Daily Records for Alcohol and Blending", env({ department: "Alcohol and Blending", product: "Bitters" }), {
        "Number of Alcohol Transferred (DRUMS)": "4",
        "Number of Alcohol Transferred (LITRES)": "1000",
        "Number of Finished Products Transferred (TANKS)": "2",
        "Number of Finished Products Transferred (LITRES)": "1800",
        "Number of Staff Used": "7",
      }),
    ).row
    expect(row.alcohol_transferred_drums).toBe(4)
    expect(row.finished_products_transferred_tanks).toBe(2)
    expect("alcohol_transferred_litres" in row).toBe(false)
    expect("finished_products_transferred_litres" in row).toBe(false)
  })

  it("never writes a generated or carried column for ANY record type", () => {
    for (const def of RECORD_TYPES) {
      const fields = FORM_FIELDS[def.label] ?? []
      // Submit every label with a plausible value.
      const formData = Object.fromEntries(fields.map((f) => [f.label, "1"]))
      const row = built(
        buildRecordRow(def.label, env({ product: "Bitters", variant: "Cloves" }), formData),
      ).row
      for (const f of fields.filter((f) => f.generated || f.carried)) {
        expect(f.column in row, `${def.label}: ${f.column} must not be written`).toBe(false)
      }
    }
  })
})

describe("buildRecordRow - value coercion", () => {
  it("coerces numeric strings on number fields", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Quantity Of Cartons Produced": "1200",
        "Number of Cartons Wasted": "3.5",
      }),
    ).row
    expect(row.quantity_cartons_produced).toBe(1200)
    expect(row.number_cartons_wasted).toBe(3.5)
  })

  it("writes 0 rather than dropping it (0 is a real recorded value)", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Number of Cartons Wasted": 0,
      }),
    ).row
    expect(row.number_cartons_wasted).toBe(0)
  })

  it("writes the string \"0\" as the number 0", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Number of Cartons Wasted": "0",
      }),
    ).row
    expect(row.number_cartons_wasted).toBe(0)
  })

  it("coerces an unparseable number to null instead of NaN", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Quantity Of Cartons Produced": "twelve",
      }),
    ).row
    expect(row.quantity_cartons_produced).toBeNull()
  })

  it("coerces Infinity to null (Number.isFinite guard)", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Quantity Of Cartons Produced": "Infinity",
      }),
    ).row
    expect(row.quantity_cartons_produced).toBeNull()
  })

  it("tolerates surrounding whitespace in a numeric string", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Quantity Of Cartons Produced": "  1200  ",
      }),
    ).row
    expect(row.quantity_cartons_produced).toBe(1200)
  })

  it("coerces a boolean on a number field to 1/0 via Number()", () => {
    // NOTE: documenting current behaviour - `Number(true)` is 1, so a stray
    // boolean silently becomes a quantity instead of being rejected.
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Quantity Of Cartons Produced": true,
      }),
    ).row
    expect(row.quantity_cartons_produced).toBe(1)
  })

  it("passes text fields through untouched, without coercion or trimming", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Hourly Work": "  08:00-16:00  ",
        Remarks: "line 2 jam",
      }),
    ).row
    expect(row.hourly_work).toBe("  08:00-16:00  ")
    expect(row.remarks).toBe("line 2 jam")
  })

  it("passes date/time/select fields through as strings", () => {
    const row = built(
      buildRecordRow("Extraction Monitoring Records", env({ department: "Alcohol and Blending", product: "Bitters" }), {
        "Beginning Date": "2026-08-20",
        "Tank Number": "T-4",
        Time: "07:30",
        "Alcohol Percentage": "70",
        "Expected Maturity Date": "2026-09-20",
        "Prepared By": "Kojo",
      }),
    ).row
    expect(row).toMatchObject({
      beginning_date: "2026-08-20",
      tank_number: "T-4",
      time: "07:30",
      alcohol_percentage: "70",
      expected_maturity_date: "2026-09-20",
      prepared_by: "Kojo",
    })
  })
})

describe("buildRecordRow - blank and unmapped fields", () => {
  it("skips empty-string, null and undefined values entirely (no null columns written)", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Quantity Of Cartons Produced": "",
        "Number of Cartons Wasted": null,
        "Quantity Of Cartons Loaded": undefined,
        "Number of Staff Used": "6",
      }),
    ).row
    expect("quantity_cartons_produced" in row).toBe(false)
    expect("number_cartons_wasted" in row).toBe(false)
    expect("quantity_cartons_loaded" in row).toBe(false)
    expect(row.number_of_staff).toBe(6)
  })

  it("reports unmapped labels instead of silently dropping them", () => {
    const result = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Quantity Of Cartons Produced": "10",
        "Cartons Produced": "10",
        "Totally Made Up Field": "x",
      }),
    )
    expect(result.unmappedFields).toEqual(["Cartons Produced", "Totally Made Up Field"])
    expect(result.row.quantity_cartons_produced).toBe(10)
  })

  it("does not write unmapped labels into the row", () => {
    const row = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Cartons Produced": "10",
      }),
    ).row
    expect(Object.keys(row)).toEqual([
      "date",
      "shift",
      "group_number",
      "department",
      "supervisor_name",
      "user_id",
      "product",
    ])
  })

  it("does not report blank unmapped labels (blank values are skipped before the lookup)", () => {
    const result = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "Totally Made Up Field": "",
      }),
    )
    expect(result.unmappedFields).toEqual([])
  })

  it("catches label typos as unmapped rather than mapping by shape (case matters)", () => {
    const result = built(
      buildRecordRow("Packaging Daily Records", env({ product: "Bitters" }), {
        "quantity of cartons produced": "10",
      }),
    )
    expect(result.unmappedFields).toEqual(["quantity of cartons produced"])
  })

  it("reports an empty unmappedFields array for a clean submission", () => {
    const result = built(
      buildRecordRow("Filling Line Daily Records", env({ department: "Filling Line", product: "Bitters" }), {
        "Bottles Wasted": "5",
        "Bottles Rejected": "2",
        "Number of Staff Used": "8",
        "Hourly Work": "07:00-15:00",
        "Total Production": "9000",
        Remarks: "",
      }),
    )
    expect(result.unmappedFields).toEqual([])
    expect(result.row).toMatchObject({
      bottles_wasted: 5,
      bottles_rejected: 2,
      number_of_staff: 8,
      hourly_work: "07:00-15:00",
      total_production: 9000,
    })
  })

  it("does not mutate the caller's formData or envelope", () => {
    const formData = { "Quantity Of Cartons Produced": "10", Bogus: "x" }
    const envelope = env({ product: "Bitters" as const })
    const snapshotForm = JSON.stringify(formData)
    const snapshotEnv = JSON.stringify(envelope)
    buildRecordRow("Packaging Daily Records", envelope, formData)
    expect(JSON.stringify(formData)).toBe(snapshotForm)
    expect(JSON.stringify(envelope)).toBe(snapshotEnv)
  })
})

describe("missingRequiredFields", () => {
  it("lists every required Packaging field for an empty submission, in form order", () => {
    expect(missingRequiredFields("Packaging Daily Records", {})).toEqual([
      "Quantity Of Cartons Produced",
      "Number of Cartons Wasted",
      "Quantity Of Cartons Loaded",
      "Number of Staff Used",
    ])
  })

  it("does not require optional fields (Hourly Work, Remarks)", () => {
    const missing = missingRequiredFields("Packaging Daily Records", {})
    expect(missing).not.toContain("Hourly Work")
    expect(missing).not.toContain("Remarks")
  })

  it("returns nothing when every required field is filled", () => {
    expect(
      missingRequiredFields("Packaging Daily Records", {
        "Quantity Of Cartons Produced": "1200",
        "Number of Cartons Wasted": "3",
        "Quantity Of Cartons Loaded": "1100",
        "Number of Staff Used": "9",
      }),
    ).toEqual([])
  })

  it("accepts 0 as a filled value", () => {
    expect(
      missingRequiredFields("Packaging Daily Records", {
        "Quantity Of Cartons Produced": 0,
        "Number of Cartons Wasted": 0,
        "Quantity Of Cartons Loaded": 0,
        "Number of Staff Used": 0,
      }),
    ).toEqual([])
  })

  it("treats an empty string as missing", () => {
    expect(missingRequiredFields("Packaging Daily Records", { "Number of Staff Used": "" })).toContain(
      "Number of Staff Used",
    )
  })

  it("treats a whitespace-only string as missing", () => {
    expect(
      missingRequiredFields("Packaging Daily Records", { "Number of Staff Used": "   " }),
    ).toContain("Number of Staff Used")
  })

  it("treats null and undefined as missing", () => {
    const missing = missingRequiredFields("Packaging Daily Records", {
      "Quantity Of Cartons Produced": null,
      "Number of Cartons Wasted": undefined,
    })
    expect(missing).toContain("Quantity Of Cartons Produced")
    expect(missing).toContain("Number of Cartons Wasted")
  })

  it("treats an empty array as missing (String([]) is the empty string)", () => {
    // NOTE: documenting current behaviour of the `String(v).trim() === ""` check.
    expect(missingRequiredFields("Packaging Daily Records", { "Number of Staff Used": [] })).toContain(
      "Number of Staff Used",
    )
  })

  it("never requires a generated field, even on forms full of them", () => {
    const missing = missingRequiredFields("Daily Records (Preform Usage)", {})
    expect(missing).toEqual([
      "Quantity Received (BAGS)",
      "Preforms Used (BAGS)",
      "Total Produced",
      "WASTE (PCS)",
      "Bottles Given Out",
    ])
    expect(missing).not.toContain("Remaining Balance (BAGS)")
    expect(missing).not.toContain("Final Production")
  })

  it("never requires the carried-forward balance on a stock form", () => {
    // Caps are counted in BOXES and the labels say so; the carried-forward opening is
    // server-derived either way, so it is never "missing".
    const missing = missingRequiredFields("Caps Stock", {})
    expect(missing).toEqual(["Quantity Received (BOXES)", "Quantity Used (BOXES)", "Destination"])
    expect(missing.some((m) => m.startsWith("Current Stock"))).toBe(false)
  })

  it("requires the herb checker on the Herbs Stock form", () => {
    expect(missingRequiredFields("Herbs Stock", {})).toEqual([
      "Qty Received (SACKS)",
      "Qty Used (SACKS)",
      "Checked By",
    ])
  })

  it("ignores unmapped extra keys in the submission", () => {
    expect(
      missingRequiredFields("Caps Stock", {
        "Quantity Received (BOXES)": "1",
        "Quantity Used (BOXES)": "1",
        Destination: "Line 1",
        "Some Extra Thing": "ignored",
      }),
    ).toEqual([])
  })

  it("returns an empty list for an unknown record type instead of flagging it", () => {
    // NOTE: documenting current behaviour - validation silently passes for an
    // unrecognised record type; buildRecordRow is what rejects it.
    expect(missingRequiredFields("Daily Records (Nonexistent)", {})).toEqual([])
  })

  it("matches the required, non-generated fields of every registered form", () => {
    for (const def of RECORD_TYPES) {
      const expected = (FORM_FIELDS[def.label] ?? [])
        .filter((f) => f.required && !f.generated)
        .map((f) => f.label)
      expect(missingRequiredFields(def.label, {}), `required fields of ${def.label}`).toEqual(
        expected,
      )
    }
  })
})
