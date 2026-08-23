"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import type { Product, Shift } from "@/lib/db/types"

// The materials whose stock is a DERIVED ledger (reconcilable here). PPE
// (seal tape / hair nets / masks / gloves) is still a running total via
// raw_materials_received and is intentionally NOT reconciled through this screen.
export const LEDGER_MATERIALS: { code: string; name: string; unit: string; tracksProduct?: boolean; isHerb?: boolean }[] = [
  { code: "alcohol", name: "Alcohol", unit: "litres" },
  { code: "preform", name: "Preforms", unit: "bags" },
  { code: "caps", name: "Caps", unit: "pcs" },
  { code: "labels", name: "Labels", unit: "pcs", tracksProduct: true },
  { code: "caramel", name: "Caramel", unit: "units", tracksProduct: true },
  { code: "herb", name: "Herb", unit: "units", isHerb: true },
  { code: "tax_stamp", name: "Tax Stamps", unit: "pcs" },
  { code: "carton", name: "Cartons", unit: "pcs", tracksProduct: true },
]

export interface ReconcileTarget {
  material: string
  product?: Product | null
  variant?: string | null
  label: string
  unit: string
  currentRemaining?: number
}

// Map a dashboard material-row key → a ledger reconcile target, or null if the
// row isn't a derived-ledger material (PPE). Handles both dashboards' key
// conventions (manager uses cartons_*, procurement uses carton_*).
export function ledgerTargetForKey(key: string): { material: string; product?: Product } | null {
  switch (key) {
    case "alcohol": return { material: "alcohol" }
    case "preforms": return { material: "preform" }
    case "caps": return { material: "caps" }
    case "labels_bitters": return { material: "labels", product: "Bitters" }
    case "labels_ginger": return { material: "labels", product: "Ginger" }
    case "caramel_bitters": return { material: "caramel", product: "Bitters" }
    case "caramel_ginger": return { material: "caramel", product: "Ginger" }
    case "tax_stamp": return { material: "tax_stamp" }
    case "carton_bitters": case "cartons_bitters": return { material: "carton", product: "Bitters" }
    case "carton_ginger": case "cartons_ginger": return { material: "carton", product: "Ginger" }
    default: return null // PPE (seal_tape / hair_net / nose_mask / gloves)
  }
}

const SHIFTS: Shift[] = ["Morning", "Afternoon", "Night"]
const today = () => new Date().toISOString().slice(0, 10)

// Management stock count / reconciliation. When `target` is given the material is
// locked (row action); otherwise the user picks a material (generic baseline /
// new-count entry). On success the ledger re-anchors to the counted quantity and
// the counted-vs-computed variance is recorded.
export function ReconcileModal({
  open,
  onClose,
  onDone,
  target,
}: {
  open: boolean
  onClose: () => void
  onDone?: () => void
  target?: ReconcileTarget | null
}) {
  const generic = !target
  const [materialCode, setMaterialCode] = useState("alcohol")
  const [product, setProduct] = useState<Product | "">("")
  const [variant, setVariant] = useState("")
  const [counted, setCounted] = useState("")
  const [date, setDate] = useState(today())
  const [shift, setShift] = useState<Shift | "">("")
  const [kind, setKind] = useState<"baseline" | "reconciliation">("reconciliation")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ counted: number; computed: number; variance: number } | null>(null)

  const mat = LEDGER_MATERIALS.find((m) => m.code === materialCode)
  const material = target?.material ?? materialCode
  const unit = target?.unit ?? mat?.unit ?? ""
  const label = target?.label ?? mat?.name ?? material
  const needsProduct = generic ? !!mat?.tracksProduct : false
  const needsVariant = generic ? !!mat?.isHerb : false

  const reset = () => {
    setCounted(""); setNote(""); setResult(null); setShift(""); setKind("reconciliation")
    setDate(today()); setProduct(""); setVariant("")
  }
  const close = () => { reset(); onClose() }

  const submit = async () => {
    const qty = Number(counted)
    if (!Number.isFinite(qty) || qty < 0) { toast.error("Enter a valid counted quantity."); return }
    if (needsProduct && !product) { toast.error("Select a product."); return }
    if (needsVariant && !variant.trim()) { toast.error("Enter a herb variant."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/stock/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material,
          date,
          counted: qty,
          shift: shift || null,
          product: target ? target.product ?? null : (needsProduct ? product : null),
          variant: target ? target.variant ?? null : (needsVariant ? variant.trim() : null),
          kind,
          note: note.trim() || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || "Failed to record count."); setSubmitting(false); return }
      const c = d.count
      setResult({ counted: c.counted_qty, computed: c.computed_qty, variance: c.variance })
      toast.success("Stock count recorded.")
      onDone?.()
    } catch {
      toast.error("Failed to record count.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Stock count — {label}</DialogTitle>
          <DialogDescription>
            Record a physical count. The ledger re-anchors to this figure and the difference vs the
            computed balance is saved as a variance.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-2 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Counted</p>
                <p className="text-lg font-black text-slate-800 tabular-nums">{result.counted}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">System</p>
                <p className="text-lg font-black text-slate-800 tabular-nums">{result.computed}</p>
              </div>
              <div className={`rounded-xl border p-3 ${result.variance === 0 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <p className="text-[10px] uppercase font-bold text-slate-400">Variance</p>
                <p className={`text-lg font-black tabular-nums ${result.variance === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                  {result.variance > 0 ? "+" : ""}{result.variance}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 text-center">
              {result.variance === 0 ? "No discrepancy — the ledger matched." : result.variance > 0 ? "Surplus found vs the ledger." : "Shortfall vs the ledger (shrinkage/loss)."}
            </p>
            <DialogFooter>
              <Button size="sm" onClick={close} className="bg-emerald-600 hover:bg-emerald-700 text-white">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="py-1 space-y-3">
            {generic && (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-500">Material</Label>
                  <select value={materialCode} onChange={(e) => { setMaterialCode(e.target.value); setProduct(""); setVariant("") }}
                    className="mt-1 w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white focus:border-emerald-500 focus:outline-none">
                    {LEDGER_MATERIALS.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                  </select>
                </div>
                {needsProduct && (
                  <div>
                    <Label className="text-xs font-semibold text-slate-500">Product</Label>
                    <select value={product} onChange={(e) => setProduct(e.target.value as Product)}
                      className="mt-1 w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white focus:border-emerald-500 focus:outline-none">
                      <option value="">Select…</option>
                      <option value="Bitters">Bitters</option>
                      <option value="Ginger">Ginger</option>
                    </select>
                  </div>
                )}
                {needsVariant && (
                  <div>
                    <Label className="text-xs font-semibold text-slate-500">Herb variant</Label>
                    <Input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="e.g. Alligator Pepper" className="mt-1 rounded-xl border-slate-200" />
                  </div>
                )}
              </div>
            )}

            {target?.currentRemaining !== undefined && (
              <p className="text-xs font-semibold text-slate-500">
                System balance now: <span className="tabular-nums text-slate-800">{target.currentRemaining} {unit}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-500">Counted quantity ({unit})</Label>
                <Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" className="mt-1 rounded-xl border-slate-200" />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-500">As of date</Label>
                <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="mt-1 rounded-xl border-slate-200" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-500">Shift (optional)</Label>
                <select value={shift} onChange={(e) => setShift(e.target.value as Shift)}
                  className="mt-1 w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white focus:border-emerald-500 focus:outline-none">
                  <option value="">End of day</option>
                  {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-500">Type</Label>
                <select value={kind} onChange={(e) => setKind(e.target.value as "baseline" | "reconciliation")}
                  className="mt-1 w-full h-10 px-3 text-sm rounded-xl border border-slate-200 bg-white focus:border-emerald-500 focus:outline-none">
                  <option value="reconciliation">Reconciliation</option>
                  <option value="baseline">Baseline (day one)</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-500">Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason / who counted" className="mt-1 rounded-xl border-slate-200" />
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={close} disabled={submitting}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? "Saving…" : "Record count"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
