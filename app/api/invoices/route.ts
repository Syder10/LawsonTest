import { type NextRequest, NextResponse } from "next/server"
import { requireStockRead, requireStockWrite } from "@/lib/auth/guards"
import {
  DEFAULT_CURRENCY,
  invoiceLinesToSend,
  toInvoiceDetail,
  validateInvoice,
  type InvoiceInput,
} from "@/lib/domain/invoices"
import type { InvoiceLineRow, RawMaterialReceivedRow } from "@/lib/db/types"

// ============================================================================
// Invoices API. POST records a supplier invoice with its lines (record_invoice
// RPC, gated to stock write); GET returns the invoice log with each line's
// received-against-invoiced position (FR-6 to FR-11, FR-23).
//
// FR-9 lives in lib/domain/invoices: a declared total that disagrees with the
// line sum is a warning, never a block. validateInvoice returns those warnings
// separately from errors, and they are passed straight through on POST.
// ============================================================================

const DAY = 86_400_000

// The RPC raises 42501 for a role that may not write and 22023 for an empty line
// set; Postgres raises 23505 when a supplier already has that invoice number (FR-7).
function rpcStatus(error: { code?: string; message: string }): number {
  const code = error.code ?? ""
  if (code === "42501" || error.message.includes("insufficient_privilege")) return 403
  if (code === "23505") return 409
  if (code === "22023") return 400
  return 500
}

// The receipt column that carries a received quantity depends on material type,
// which is why the mapping lives in the route rather than in toInvoiceDetail.
// Units may differ from the invoice line's declared unit (a line billed in boxes,
// a receipt counted in pcs), so this is a best-effort pcs sum: only receipts the
// receive form has linked to a line (invoice_line_id set) contribute.
function receivedPcs(r: Pick<RawMaterialReceivedRow, "material_type" | "stamp_total_pcs" | "carton_total_pcs" | "ppe_pcs_in">): number {
  if (r.material_type === "tax_stamp") return Number(r.stamp_total_pcs ?? 0)
  if (r.material_type.startsWith("carton")) return Number(r.carton_total_pcs ?? 0)
  return Number(r.ppe_pcs_in ?? 0)
}

export async function POST(request: NextRequest) {
  const auth = await requireStockWrite()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  let body: Partial<InvoiceInput>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const check = validateInvoice(body)
  if (!check.ok) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", errors: check.errors }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("record_invoice", {
    p_supplier: body.supplier!.trim(),
    p_invoice_number: body.invoiceNumber!.trim(),
    p_invoice_date: body.invoiceDate!,
    p_lines: invoiceLinesToSend(body.lines ?? []),
    p_currency: (body.currency || DEFAULT_CURRENCY).trim().toUpperCase(),
    p_declared_total: body.declaredTotal ?? null,
    p_remarks: body.remarks?.trim() || null,
  })

  if (error) {
    console.error("[invoices] rpc error:", error.message)
    const status = rpcStatus(error)
    const msg =
      status === 409
        ? "This supplier already has an invoice with that number."
        : status === 403
          ? "You do not have permission to record an invoice."
          : `Failed to record invoice: ${error.message}`
    return NextResponse.json({ error: msg }, { status })
  }

  // Warnings (the FR-9 declared-vs-lines note) travel with the success so the
  // form can surface them after the save, never as a reason to reject it.
  return NextResponse.json({ success: true, id: data.id, warnings: check.warnings })
}

export async function GET(request: NextRequest) {
  const auth = await requireStockRead()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { supabase } = auth.ctx

  const url = new URL(request.url)
  const today = new Date().toISOString().slice(0, 10)
  const from = url.searchParams.get("from") || new Date(Date.now() - 89 * DAY).toISOString().slice(0, 10)
  const to = url.searchParams.get("to") || today
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500)

  const { data: headers, error } = await supabase
    .from("invoices")
    .select("*")
    .gte("invoice_date", from)
    .lte("invoice_date", to)
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[invoices] select error:", error.message)
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 })
  }

  const invoiceIds = (headers ?? []).map((i) => i.id)

  // Lines for this page, then the receipts linked to those lines. Both are
  // separate queries rather than embedded selects, matching the rest of the app.
  const linesByInvoice = new Map<string, InvoiceLineRow[]>()
  const receivedByLine: Record<string, number> = {}
  if (invoiceIds.length > 0) {
    const { data: lineRows } = await supabase
      .from("invoice_lines")
      .select("*")
      .in("invoice_id", invoiceIds)
    const lines = (lineRows ?? []) as InvoiceLineRow[]
    for (const l of lines) {
      const list = linesByInvoice.get(l.invoice_id) ?? []
      list.push(l)
      linesByInvoice.set(l.invoice_id, list)
    }

    const lineIds = lines.map((l) => l.id)
    if (lineIds.length > 0) {
      const { data: receipts } = await supabase
        .from("raw_materials_received")
        .select("invoice_line_id, material_type, stamp_total_pcs, carton_total_pcs, ppe_pcs_in")
        .in("invoice_line_id", lineIds)
      for (const r of receipts ?? []) {
        if (!r.invoice_line_id) continue
        receivedByLine[r.invoice_line_id] = (receivedByLine[r.invoice_line_id] ?? 0) + receivedPcs(r)
      }
    }
  }

  const invoices = (headers ?? []).map((row) =>
    toInvoiceDetail({ ...row, invoice_lines: linesByInvoice.get(row.id) ?? [] }, receivedByLine),
  )

  return NextResponse.json({
    filters: { from, to },
    invoices,
    last_updated: new Date().toISOString(),
  })
}
