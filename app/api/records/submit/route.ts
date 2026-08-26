import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"
import { getRecordType, departmentAllows } from "@/lib/domain/record-types"
import { buildRecordRow, missingRequiredFields } from "@/lib/domain/records-io"
import type { Product, Shift } from "@/lib/db/types"

// Submit a single production/stock record.
//
// vs the old route:
//   • uses the RLS-bound session client (NOT the service-role key) — the DB
//     enforces that supervisors write only their own rows.
//   • field→column mapping comes from the colocated form config; unmapped
//     fields are reported, not silently dropped.
//   • the stored department is resolved server-side from the profile, never
//     trusted from the request body.
export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, profile, supabase } = auth.ctx

  let body: {
    date?: string
    shift?: Shift
    group?: number | null
    recordType?: string
    productType?: Product | null
    variant?: string | null
    department?: string
    formData?: Record<string, unknown>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { date, shift, group, recordType, productType, variant, formData } = body

  if (!date || !shift || !recordType) {
    return NextResponse.json({ error: "date, shift and recordType are required." }, { status: 400 })
  }

  const def = getRecordType(recordType)
  if (!def) return NextResponse.json({ error: "Invalid record type" }, { status: 400 })

  const isStaff = profile.role === "manager" || profile.role === "admin"

  // ── Department authorisation (supervisors) ───────────────────────────────
  // Resolve the department to store from the PROFILE, never the request body.
  let storedDepartment: string
  if (isStaff) {
    // Staff may file on behalf of any of the record type's departments.
    storedDepartment =
      body.department && def.departments.includes(body.department)
        ? body.department
        : def.departments[0]
  } else {
    if (!profile.department) {
      return NextResponse.json(
        { error: "Your profile has no department assigned. Please contact your manager." },
        { status: 403 },
      )
    }
    if (!departmentAllows(profile.department, recordType)) {
      return NextResponse.json(
        { error: `Your department (${profile.department}) is not authorised to submit "${recordType}".` },
        { status: 403 },
      )
    }
    storedDepartment = profile.department
  }

  // ── Validate required fields ──────────────────────────────────────────────
  const missing = missingRequiredFields(recordType, formData ?? {})
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 })
  }

  // ── Build the row ─────────────────────────────────────────────────────────
  const result = buildRecordRow(
    recordType,
    {
      date,
      shift,
      group_number: group ?? null,
      department: storedDepartment,
      supervisor_name: profile.full_name,
      user_id: user.id,
      product: def.products.length > 0 ? (productType ?? null) : null,
      variant: variant ?? (formData?.["Type of Herb"] as string | undefined) ?? null,
    },
    formData ?? {},
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  const { target, row, unmappedFields } = result.built
  if (unmappedFields.length > 0) {
    console.warn("[submit] Unmapped fields ignored:", unmappedFields)
  }

  // ── Hard block: usage may not drive the derived balance negative ──────────
  // Opening is server-derived (supervisors don't enter it), so validate the
  // ledger here rather than trusting the client. Carried-forward comes from the
  // same stock_opening RPC the form displays.
  if (def.stockContinuity) {
    const material = def.storage.kind === "stock" ? def.storage.material : "preform"
    const received = Number(target.kind === "stock" ? row.quantity_received : row.quantity_received_bags) || 0
    const used = Number(target.kind === "stock" ? row.quantity_used : row.preforms_used_bags) || 0
    const { data: opening, error: openErr } = await supabase.rpc("stock_opening", {
      p_material: material,
      p_date: date,
      p_shift: shift,
      p_product: (row.product as Product | undefined) ?? null,
      p_variant: (row.variant as string | undefined) ?? null,
    })
    if (openErr) {
      console.error("[submit] stock_opening error:", openErr.message)
      return NextResponse.json({ error: "Failed to validate stock balance" }, { status: 500 })
    }
    const carried = Number(opening ?? 0)
    if (carried + received - used < 0) {
      return NextResponse.json(
        {
          error: `Quantity used (${used}) exceeds available stock. Carried forward ${carried} + received ${received} = ${carried + received}; remaining cannot go negative.`,
        },
        { status: 400 },
      )
    }
  }

  // ── Insert through the RLS-bound client ──────────────────────────────────
  const table = target.kind === "table" ? target.table : "stock_records"
  const { data, error } = await supabase.from(table).insert(row).select().single()

  if (error) {
    // 23505 = unique_violation, i.e. the one-record-per-shift indexes added in
    // 0004_records.sql. Report it as a 409 with a readable
    // message rather than leaking a raw Postgres error as a 500.
    if (error.code === "23505") {
      const scope = [row.product, row.variant].filter(Boolean).join(" · ")
      return NextResponse.json(
        {
          error:
            `"${recordType}" has already been submitted for ${date} (${shift} shift)` +
            (scope ? ` — ${scope}` : "") +
            `. Duplicates are blocked because they would double-count stock movements. ` +
            `If the earlier entry is wrong, ask your manager to correct it.`,
        },
        { status: 409 },
      )
    }
    console.error("[submit] insert error:", error.message)
    return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}
