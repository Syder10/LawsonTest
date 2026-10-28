import { type NextRequest, NextResponse } from "next/server"
import { requireQcAccess } from "@/lib/auth/guards"
import {
  deriveOverallRecordStatus,
  evaluateQcValue,
  generateQcReference,
  getQcRecordType,
  type QcCategory,
  type QcStatus,
} from "@/lib/domain/qc"
import type { QcRecordRow, QcStandardRow } from "@/lib/db/types"

export async function POST(request: NextRequest) {
  const auth = await requireQcAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, profile, supabase } = auth.ctx

  let body: {
    recordType?: string
    testDate?: string
    testTime?: string
    dayName?: string
    batchNo?: string
    productName?: string
    supplier?: string
    origin?: string
    checkedBy?: string
    parameters?: Record<string, unknown>
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { recordType, testDate, testTime, dayName, batchNo, productName, supplier, origin, checkedBy, parameters } = body

  if (!recordType || !testDate || !testTime) {
    return NextResponse.json({ error: "recordType, testDate, and testTime are required." }, { status: 400 })
  }

  const typeDef = getQcRecordType(recordType)
  if (!typeDef) {
    return NextResponse.json({ error: `Unknown QC record type: ${recordType}` }, { status: 400 })
  }

  // Validate required fields
  for (const field of typeDef.fields) {
    if (field.required && (parameters?.[field.key] === undefined || parameters?.[field.key] === null || parameters?.[field.key] === "")) {
      return NextResponse.json({ error: `${field.label} is required.` }, { status: 400 })
    }
  }

  // Fetch active standards for this record type
  const { data: standardsData } = await supabase
    .from("qc_standards")
    .select("*")
    .eq("record_type", recordType)
    .eq("is_active", true)

  const standards = (standardsData ?? []) as QcStandardRow[]
  const standardByKey = new Map<string, QcStandardRow>()
  for (const std of standards) {
    standardByKey.set(std.parameter_key, std)
  }

  // Evaluate each field
  const evaluatedStatuses: QcStatus[] = []
  const resultRowsToInsert: {
    parameter_key: string
    parameter_label: string
    numeric_value: number | null
    text_value: string | null
    unit: string | null
    standard_id: string | null
    evaluated_status: QcStatus
    evaluation_note: string | null
  }[] = []

  for (const field of typeDef.fields) {
    const rawVal = parameters?.[field.key]
    const std = standardByKey.get(field.key)

    if (field.type === "number") {
      const num = rawVal !== undefined && rawVal !== null && rawVal !== "" ? Number(rawVal) : null
      const status = evaluateQcValue(
        num,
        std
          ? {
              lowerLimit: std.lower_limit !== null ? Number(std.lower_limit) : null,
              upperLimit: std.upper_limit !== null ? Number(std.upper_limit) : null,
              isInclusive: std.is_inclusive,
            }
          : null,
      )
      evaluatedStatuses.push(status)

      resultRowsToInsert.push({
        parameter_key: field.key,
        parameter_label: field.label,
        numeric_value: num,
        text_value: null,
        unit: field.unit ?? std?.unit ?? null,
        standard_id: std?.id ?? null,
        evaluated_status: status,
        evaluation_note: std?.expression ? `Standard: ${std.expression}` : null,
      })
    } else {
      // Qualitative field
      const str = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : null
      const status: QcStatus = str ? "not_evaluated" : field.required ? "incomplete" : "not_evaluated"
      evaluatedStatuses.push(status)

      resultRowsToInsert.push({
        parameter_key: field.key,
        parameter_label: field.label,
        numeric_value: null,
        text_value: str,
        unit: null,
        standard_id: null,
        evaluated_status: status,
        evaluation_note: null,
      })
    }
  }

  const overallStatus = deriveOverallRecordStatus(evaluatedStatuses)

  // Generate unique sequential reference: QC-YYYYMMDD-XXX
  const { count } = await supabase
    .from("qc_records")
    .select("id", { count: "exact", head: true })
    .eq("test_date", testDate)

  const recordReference = generateQcReference(testDate, (count ?? 0) + 1)
  const officerName = profile.full_name?.trim() || "QC Officer"

  // Insert header
  const { data: record, error: recordError } = await supabase
    .from("qc_records")
    .insert([
      {
        record_reference: recordReference,
        category: typeDef.category as QcCategory,
        record_type: recordType,
        test_date: testDate,
        test_time: testTime,
        day_name: dayName || null,
        batch_no: batchNo?.trim() || (parameters?.batch_no ? String(parameters.batch_no).trim() : null),
        product_name: productName?.trim() || (typeDef.category === "product" ? typeDef.label : null),
        supplier: supplier?.trim() || (parameters?.supplier ? String(parameters.supplier).trim() : null),
        origin: origin?.trim() || (parameters?.origin ? String(parameters.origin).trim() : null),
        checked_by: checkedBy?.trim() || null,
        record_status: overallStatus,
        parameters: parameters || {},
        submitted_by: officerName,
        user_id: user.id,
      },
    ])
    .select()
    .single()

  if (recordError || !record) {
    console.error("[qc] insert record error:", recordError?.message)
    return NextResponse.json({ error: `Failed to save record: ${recordError?.message}` }, { status: 500 })
  }

  // Insert results
  if (resultRowsToInsert.length > 0) {
    const resultsWithId = resultRowsToInsert.map((r) => ({
      ...r,
      qc_record_id: record.id,
    }))
    const { error: resultsError } = await supabase.from("qc_record_results").insert(resultsWithId)
    if (resultsError) {
      console.error("[qc] insert results error:", resultsError.message)
    }
  }

  return NextResponse.json({
    success: true,
    id: record.id,
    recordReference,
    status: overallStatus,
  })
}

export async function GET(request: NextRequest) {
  const auth = await requireQcAccess()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  const url = new URL(request.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const category = url.searchParams.get("category")
  const recordType = url.searchParams.get("recordType")
  const status = url.searchParams.get("status")
  const search = url.searchParams.get("search")
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200)

  let query = supabase
    .from("qc_records")
    .select("*", { count: "exact" })
    .order("test_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (from) query = query.gte("test_date", from)
  if (to) query = query.lte("test_date", to)
  if (category) query = query.eq("category", category as QcCategory)
  if (recordType) query = query.eq("record_type", recordType)
  if (status) query = query.eq("record_status", status as QcStatus)
  if (search) {
    query = query.or(
      `record_reference.ilike.%${search}%,batch_no.ilike.%${search}%,product_name.ilike.%${search}%,supplier.ilike.%${search}%`,
    )
  }

  const { data, count, error } = await query

  if (error) {
    console.error("[qc] select error:", error.message)
    return NextResponse.json({ error: "Failed to load QC records" }, { status: 500 })
  }

  const records = (data ?? []) as QcRecordRow[]

  // Status breakdown counts
  const statusCounts = {
    total: count ?? 0,
    in_range: 0,
    below_range: 0,
    above_range: 0,
    out_of_range: 0,
    standard_not_configured: 0,
    incomplete: 0,
  }

  for (const r of records) {
    const s = r.record_status as keyof typeof statusCounts
    if (statusCounts[s] !== undefined) {
      statusCounts[s] += 1
    }
  }

  return NextResponse.json({
    records,
    statusCounts,
    totalCount: count ?? 0,
  })
}
