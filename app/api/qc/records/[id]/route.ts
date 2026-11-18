import { type NextRequest, NextResponse } from "next/server"
import { requireQcAccess } from "@/lib/auth/guards"
import type { QcRecordAmendmentRow, QcRecordResultRow, QcRecordRow } from "@/lib/db/types"

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireQcAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx
  const { id } = await props.params

  const [recordRes, resultsRes, amendmentsRes] = await Promise.all([
    supabase.from("qc_records").select("*").eq("id", id).single(),
    supabase.from("qc_record_results").select("*, qc_standards(*)").eq("qc_record_id", id),
    supabase.from("qc_record_amendments").select("*").eq("qc_record_id", id).order("amended_at", { ascending: false }),
  ])

  if (recordRes.error || !recordRes.data) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 })
  }

  return NextResponse.json({
    record: recordRes.data as QcRecordRow,
    results: (resultsRes.data ?? []) as QcRecordResultRow[],
    amendments: (amendmentsRes.data ?? []) as QcRecordAmendmentRow[],
  })
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireQcAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, supabase } = auth.ctx
  const { id } = await props.params

  let body: {
    fieldName: string
    oldValue?: string
    newValue: string
    reason: string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.fieldName || !body.newValue || !body.reason?.trim()) {
    return NextResponse.json({ error: "fieldName, newValue, and a reason for amendment are required." }, { status: 400 })
  }

  // Insert amendment audit entry
  const { error: amendErr } = await supabase.from("qc_record_amendments").insert([
    {
      qc_record_id: id,
      field_name: body.fieldName,
      old_value: body.oldValue ?? null,
      new_value: body.newValue,
      reason: body.reason.trim(),
      amended_by: user.id,
    },
  ])

  if (amendErr) {
    console.error("[qc] amendment log error:", amendErr.message)
    return NextResponse.json({ error: "Failed to log amendment" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
