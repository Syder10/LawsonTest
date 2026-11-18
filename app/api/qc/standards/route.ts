import { type NextRequest, NextResponse } from "next/server"
import { requireQcAccess, requireQcManager } from "@/lib/auth/guards"
import type { QcStandardRow } from "@/lib/db/types"

export async function GET() {
  const auth = await requireQcAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  const { data, error } = await supabase
    .from("qc_standards")
    .select("*")
    .order("record_type", { ascending: true })
    .order("parameter_label", { ascending: true })

  if (error) {
    console.error("[qc-standards] select error:", error.message)
    return NextResponse.json({ error: "Failed to load standards" }, { status: 500 })
  }

  return NextResponse.json({ standards: (data ?? []) as QcStandardRow[] })
}

export async function POST(request: NextRequest) {
  const auth = await requireQcManager()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, supabase } = auth.ctx

  let body: {
    recordType: string
    parameterKey: string
    parameterLabel: string
    unit?: string | null
    lowerLimit?: number | null
    upperLimit?: number | null
    isInclusive?: boolean
    expression?: string | null
    reason?: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.recordType || !body.parameterKey || !body.parameterLabel) {
    return NextResponse.json({ error: "recordType, parameterKey, and parameterLabel are required." }, { status: 400 })
  }

  const { data: standard, error } = await supabase
    .from("qc_standards")
    .insert([
      {
        record_type: body.recordType,
        parameter_key: body.parameterKey,
        parameter_label: body.parameterLabel,
        unit: body.unit ?? null,
        lower_limit: body.lowerLimit ?? null,
        upper_limit: body.upperLimit ?? null,
        is_inclusive: body.isInclusive ?? true,
        expression: body.expression ?? null,
        is_active: true,
        created_by: user.id,
      },
    ])
    .select()
    .single()

  if (error || !standard) {
    console.error("[qc-standards] insert error:", error?.message)
    return NextResponse.json({ error: `Failed to create standard: ${error?.message}` }, { status: 500 })
  }

  // Log change
  await supabase.from("qc_standard_changes").insert([
    {
      standard_id: standard.id,
      previous_values: null,
      new_values: standard,
      reason: body.reason?.trim() || "Initial standard creation",
      changed_by: user.id,
    },
  ])

  return NextResponse.json({ success: true, standard })
}
