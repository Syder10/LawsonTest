"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Plus, Trash2 } from "lucide-react"
import {
  COMMON_CURRENCIES,
  DEFAULT_CURRENCY,
  totalMismatchNote,
  validateInvoice,
  type InvoiceInput,
} from "@/lib/domain/invoices"
import { Card, Eyebrow, Field, NumberInput, PageHeader, Select, TextArea, TextInput } from "@/components/primitives"
import { Button } from "@/components/ui/button"

// Invoice entry. Lines are dynamic; the declared total may disagree with the line
// sum and that shows as a live note, never a block (FR-9). validateInvoice is the
// same rule the API re-runs, so the form cannot pass what the route would reject.

interface Row {
  materialType: string
  description: string
  quantity: string
  unit: string
  unitCost: string
}
const blankRow = (): Row => ({ materialType: "", description: "", quantity: "", unit: "", unitCost: "" })
const today = () => new Date().toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100
const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function InvoiceForm() {
  const router = useRouter()
  const [supplier, setSupplier] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [declaredTotal, setDeclaredTotal] = useState("")
  const [remarks, setRemarks] = useState("")
  const [rows, setRows] = useState<Row[]>(() => [blankRow()])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, blankRow()])
  const removeRow = (i: number) => setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, j) => j !== i)))

  const lineTotal = useMemo(
    () => round2(rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unitCost || 0), 0)),
    [rows],
  )
  const declaredNum = declaredTotal.trim() === "" ? null : Number(declaredTotal)
  const mismatch = Number.isFinite(declaredNum as number) ? totalMismatchNote(declaredNum, lineTotal, currency) : null

  const build = (): Partial<InvoiceInput> => ({
    supplier,
    invoiceNumber,
    invoiceDate,
    currency,
    declaredTotal: declaredTotal.trim() === "" ? null : Number(declaredTotal),
    remarks: remarks || null,
    lines: rows.map((r) => ({
      materialType: r.materialType,
      description: r.description || null,
      quantity: Number(r.quantity || 0),
      unit: r.unit,
      unitCost: Number(r.unitCost || 0),
    })),
  })

  const submit = async () => {
    const input = build()
    const check = validateInvoice(input)
    if (!check.ok) {
      setErrors(check.errors)
      toast.error("Please fix the highlighted fields.")
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to record invoice")
      toast.success("Invoice recorded")
      for (const w of (json.warnings as string[] | undefined) ?? []) toast.warning(w)
      router.push("/dashboard/procurement/invoices")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record invoice")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-xl mx-auto animate-fade-in-up">
      <PageHeader title="New invoice" description="Record a supplier document" backHref="/dashboard/procurement/invoices" />

      <Card padded className="space-y-4">
        <Eyebrow>Supplier and document</Eyebrow>
        <Field label="Supplier" required error={errors.supplier}>
          {(p) => <TextInput {...p} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Who issued the invoice" />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice number" required error={errors.invoiceNumber}>
            {(p) => <TextInput {...p} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Document number" />}
          </Field>
          <Field label="Invoice date" required error={errors.invoiceDate}>
            {(p) => <TextInput {...p} type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />}
          </Field>
        </div>
        <Field label="Currency" required error={errors.currency}>
          {(p) => (
            <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
      </Card>

      <Card padded className="space-y-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Lines</Eyebrow>
          <button type="button" onClick={addRow} className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add line
          </button>
        </div>
        {errors.lines && <p className="text-xs font-semibold text-critical-ink">{errors.lines}</p>}

        <div className="space-y-4">
          {rows.map((r, i) => (
            <div key={i} className="rounded-xl border border-hairline p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-ink-muted">Line {i + 1}</p>
                <button type="button" onClick={() => removeRow(i)} disabled={rows.length === 1} aria-label={`Remove line ${i + 1}`} className="text-ink-muted hover:text-critical-ink disabled:opacity-40 transition-colors">
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <Field label="What for" required error={errors[`line_${i}_materialType`]}>
                {(p) => <TextInput {...p} value={r.materialType} onChange={(e) => setRow(i, { materialType: e.target.value })} placeholder="e.g. tax_stamp, cartons, freight" />}
              </Field>
              <Field label="Description (optional)">
                {(p) => <TextInput {...p} value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder="Any detail" />}
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Quantity" required error={errors[`line_${i}_quantity`]}>
                  {(p) => <NumberInput {...p} value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} placeholder="0" />}
                </Field>
                <Field label="Unit" required error={errors[`line_${i}_unit`]}>
                  {(p) => <TextInput {...p} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} placeholder="pcs" />}
                </Field>
                <Field label="Unit cost" required error={errors[`line_${i}_unitCost`]}>
                  {(p) => <NumberInput {...p} value={r.unitCost} onChange={(e) => setRow(i, { unitCost: e.target.value })} placeholder="0.00" />}
                </Field>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-sunken px-3 py-2">
                <span className="text-xs font-semibold text-ink-muted">Line total</span>
                <span className="text-sm font-bold tnum text-ink-primary">{money(Number(r.quantity || 0) * Number(r.unitCost || 0), currency)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-sunken px-4 py-2.5">
          <p className="text-xs font-bold text-ink-secondary">Lines total</p>
          <p className="text-lg font-bold tnum text-ink-primary">{money(lineTotal, currency)}</p>
        </div>
      </Card>

      <Card padded className="space-y-4">
        <Eyebrow>Declared total</Eyebrow>
        <Field label={`Declared total (${currency})`} hint="Optional. What the document states, even if it differs from the lines." error={errors.declaredTotal}>
          {(p) => <NumberInput {...p} value={declaredTotal} onChange={(e) => setDeclaredTotal(e.target.value)} placeholder="0.00" />}
        </Field>
        {mismatch && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-subtle px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-warning-ink shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs font-semibold text-warning-ink">{mismatch}</p>
          </div>
        )}
      </Card>

      <Card padded className="space-y-2">
        <Field label="Remarks (optional)">
          {(p) => <TextArea {...p} value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Anything worth noting about this invoice" />}
        </Field>
      </Card>

      <Button onClick={submit} disabled={saving} className="w-full h-14 text-sm font-bold">
        {saving ? "Saving…" : "Record invoice"}
      </Button>
    </div>
  )
}
