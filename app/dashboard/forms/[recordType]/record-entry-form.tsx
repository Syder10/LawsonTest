"use client"

import { useState, useEffect } from "react"
import { FORM_FIELDS, type FormFieldDef } from "@/lib/domain/form-config"
import { getRecordType } from "@/lib/domain/record-types"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { SuccessToast, type SuccessInfo } from "./success-toast"

interface RecordEntryFormProps {
  recordType: string
  supervisorName: string
  department: string
  groupNumber: number
  initialDate: string
  initialShift: string
}

// Recompute every generated field's live preview from its inputs.
function recalc(fields: FormFieldDef[], data: Record<string, string>) {
  for (const f of fields) {
    if (f.generated && f.preview && f.previewFrom) {
      const nums = Object.fromEntries(f.previewFrom.map((k) => [k, parseFloat(data[k] || "0")]))
      data[f.label] = String(f.preview(nums))
    }
  }
}

// Any generated remaining/closing value going negative is invalid.
function stockError(fields: FormFieldDef[], data: Record<string, string>): string {
  for (const f of fields) {
    if (f.generated && /(remaining|closing)/.test(f.column) && parseFloat(data[f.label] || "0") < 0) {
      return "Values result in negative stock — check your inputs."
    }
  }
  return ""
}

export default function RecordEntryForm({
  recordType,
  supervisorName,
  department,
  groupNumber,
  initialDate,
  initialShift,
}: RecordEntryFormProps) {
  const router = useRouter()
  const def = getRecordType(recordType)
  const fields = FORM_FIELDS[recordType] ?? []
  const availableProducts = def?.products ?? []
  const supportsMultiProduct = availableProducts.length > 0
  const carriedLabel = fields.find((f) => f.carried)?.label
  const isHerbs = def?.storage.kind === "stock" && def.storage.material === "herb"
  const isExtraction = recordType === "Extraction Monitoring Records"
  const isConcentrate = recordType === "Daily Records Alcohol For Concentrate"

  const shift = initialShift
  const selectedDate = initialDate

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null)

  const [productionTypes, setProductionTypes] = useState<string[]>([])
  const [formDataByProduct, setFormDataByProduct] = useState<Record<string, Record<string, string>>>({})
  const [stockErrors, setStockErrors] = useState<Record<string, string>>({})

  const [isLoadingStock, setIsLoadingStock] = useState(false)
  const [hasPreviousStock, setHasPreviousStock] = useState(false)
  const [previousStock, setPreviousStock] = useState<number | null>(null)
  const [perProductPreviousStock, setPerProductPreviousStock] = useState<Record<string, number | null>>({})

  const [numberOfTanks, setNumberOfTanks] = useState(1)
  const [tankData, setTankData] = useState<Record<number, { data: Record<string, string>; sameAsFirst: boolean }>>({})

  const [herbOptions, setHerbOptions] = useState<string[]>([])
  const [isLoadingHerbs, setIsLoadingHerbs] = useState(false)
  const [selectedHerbs, setSelectedHerbs] = useState<string[]>([])
  const [herbsData, setHerbsData] = useState<Record<string, Record<string, string>>>({})
  const [herbsPrev, setHerbsPrev] = useState<Record<string, number | null>>({})
  const [showCreateHerb, setShowCreateHerb] = useState(false)
  const [newHerbName, setNewHerbName] = useState("")

  const draftKey = `draft_${recordType}_${initialDate}_${initialShift}`

  // ── Draft restore / save ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.formDataByProduct) setFormDataByProduct(parsed.formDataByProduct)
        if (parsed.productionTypes) setProductionTypes(parsed.productionTypes)
        toast.info("Draft restored from your previous session.")
      }
    } catch { /* ignore */ }
  }, [draftKey])

  useEffect(() => {
    if (Object.keys(formDataByProduct).length === 0) return
    try {
      localStorage.setItem(draftKey, JSON.stringify({ formDataByProduct, productionTypes }))
    } catch { /* ignore */ }
  }, [formDataByProduct, productionTypes, draftKey])

  // ── Load herb options ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHerbs) return
    ;(async () => {
      setIsLoadingHerbs(true)
      try {
        const res = await fetch("/api/herbs")
        if (res.ok) setHerbOptions((await res.json()).herbs ?? [])
      } catch { /* silent */ }
      finally { setIsLoadingHerbs(false) }
    })()
  }, [isHerbs])

  // ── Stock ledger: fetch the server-DERIVED carried-forward balance ─────────
  // Supervisors never type opening; it is computed from prior shifts' movements
  // + management baselines and shown read-only.
  useEffect(() => {
    if (!def?.stockContinuity || isHerbs || !carriedLabel) return
    ;(async () => {
      setIsLoadingStock(true)
      try {
        if (supportsMultiProduct) {
          const results: Record<string, number | null> = {}
          await Promise.all(
            availableProducts.map(async (product) => {
              const p = new URLSearchParams({ recordType, date: selectedDate, shift, product })
              const res = await fetch(`/api/records/previous-stock?${p}`)
              const d = res.ok ? await res.json() : {}
              results[product] = d.carriedForward ?? d.previousStock ?? 0
            }),
          )
          setPerProductPreviousStock(results)
          setFormDataByProduct((prev) => {
            const updated = { ...prev }
            for (const product of availableProducts) {
              updated[product] = { ...(updated[product] || {}), [carriedLabel]: String(results[product] ?? 0) }
              recalc(fields, updated[product])
            }
            return updated
          })
          setHasPreviousStock(true)
        } else {
          const p = new URLSearchParams({ recordType, date: selectedDate, shift })
          const res = await fetch(`/api/records/previous-stock?${p}`)
          const d = res.ok ? await res.json() : {}
          const carried = d.carriedForward ?? d.previousStock ?? 0
          setPreviousStock(carried)
          setHasPreviousStock(true)
          setFormDataByProduct((prev) => {
            const updated = { ...prev }
            updated.default = { ...(updated.default || {}), [carriedLabel]: String(carried) }
            recalc(fields, updated.default)
            return updated
          })
        }
      } catch { setHasPreviousStock(false) }
      finally { setIsLoadingStock(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, selectedDate, shift])

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleInputChange = (product: string, field: string, value: string) => {
    setFormDataByProduct((prev) => {
      const d = { ...(prev[product] || {}), [field]: value }
      recalc(fields, d)
      setStockErrors((se) => ({ ...se, [product]: stockError(fields, d) }))
      return { ...prev, [product]: d }
    })
  }

  const fetchHerbPrev = async (herb: string) => {
    try {
      const p = new URLSearchParams({ recordType: "Herbs Stock", date: selectedDate, shift, herbType: herb })
      const res = await fetch(`/api/records/previous-stock?${p}`)
      const d = await res.json()
      const carried = d.carriedForward ?? d.previousStock ?? 0
      setHerbsPrev((prev) => ({ ...prev, [herb]: carried }))
      setHerbsData((prev) => ({ ...prev, [herb]: { ...(prev[herb] || {}), "Available Stock": String(carried) } }))
    } catch { setHerbsPrev((prev) => ({ ...prev, [herb]: null })) }
  }

  const handleHerbField = (herb: string, label: string, value: string) => {
    setHerbsData((prev) => {
      const d = { ...(prev[herb] || {}), [label]: value }
      recalc(fields, d)
      return { ...prev, [herb]: d }
    })
  }

  const handleCreateHerb = async () => {
    const name = newHerbName.trim()
    if (!name) return setError("Please enter a herb name")
    if (herbOptions.some((h) => h.toLowerCase() === name.toLowerCase())) return setError("This herb already exists")
    try {
      const res = await fetch("/api/herbs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
      const d = await res.json()
      if (!res.ok) return setError(d.error || "Failed to create herb")
      setHerbOptions((prev) => [...prev, name].sort())
      setSelectedHerbs((prev) => [...prev, name])
      fetchHerbPrev(name)
      setShowCreateHerb(false)
      setNewHerbName("")
      setError(null)
    } catch { setError("Failed to create herb") }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const post = (body: Record<string, unknown>) =>
    fetch("/api/records/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  const goToSuccess = (count: number) => {
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    setSuccessInfo({ recordType, department, shift, date: selectedDate, count })
    setIsSubmitting(false)
  }

  const requiredMissing = (data: Record<string, string>) =>
    fields.filter((f) => f.required && !f.generated && !data[f.label]?.trim()).map((f) => f.label)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    const base = { recordType, department, group: groupNumber, shift, date: selectedDate }

    try {
      if (isExtraction) {
        for (let i = 0; i < numberOfTanks; i++) {
          const data = tankData[i]?.data || {}
          const missing = requiredMissing(data)
          if (missing.length) { setError(`Tank ${i + 1} missing: ${missing.join(", ")}`); setIsSubmitting(false); return }
          const res = await post({ ...base, productType: "Bitters", formData: data })
          if (!res.ok) throw new Error((await res.json()).error || "Failed to save")
        }
        return goToSuccess(numberOfTanks)
      }

      if (isHerbs) {
        if (selectedHerbs.length === 0) { setError("Please select at least one herb"); setIsSubmitting(false); return }
        for (const herb of selectedHerbs) {
          const data = herbsData[herb] || {}
          const missing = requiredMissing(data)
          if (missing.length) { setError(`${herb} missing: ${missing.join(", ")}`); setIsSubmitting(false); return }
          const res = await post({ ...base, variant: herb, formData: data })
          if (!res.ok) throw new Error((await res.json()).error || "Failed to save")
        }
        return goToSuccess(selectedHerbs.length)
      }

      if (supportsMultiProduct && productionTypes.length === 0) {
        setError(`Please select at least one: ${availableProducts.join(", ")}`); setIsSubmitting(false); return
      }
      const products = supportsMultiProduct ? productionTypes : ["default"]

      for (const product of products) {
        const data = formDataByProduct[product] || {}
        if (stockErrors[product]) { setError(`${product}: ${stockErrors[product]}`); setIsSubmitting(false); return }
        const missing = requiredMissing(data)
        if (missing.length) { setError(`${product === "default" ? "Form" : product} missing: ${missing.join(", ")}`); setIsSubmitting(false); return }
      }
      for (const product of products) {
        const res = await post({ ...base, productType: product === "default" ? undefined : product, formData: formDataByProduct[product] })
        if (!res.ok) throw new Error((await res.json()).error || "Failed to save")
      }
      goToSuccess(products.length)
    } catch (err) {
      toast.error("There was a problem submitting.")
      setError(err instanceof Error ? err.message : "Failed to save record")
      setIsSubmitting(false)
    }
  }

  // ── Field renderer ────────────────────────────────────────────────────────
  const renderField = (field: FormFieldDef, product: string) => {
    const value = formDataByProduct[product]?.[field.label] || ""
    const disabled = !!field.generated || !!field.carried

    if (field.isAlcoholPercentage && field.options) {
      return (
        <div className="flex gap-2">
          {field.options.map((opt) => (
            <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name={`${product}-${field.label}`} value={opt} checked={value === opt}
                onChange={(e) => handleInputChange(product, field.label, e.target.value)} disabled={disabled} className="w-3.5 h-3.5 accent-emerald-600" />
              <span className="text-sm font-medium">{opt}</span>
            </label>
          ))}
        </div>
      )
    }
    if (field.type === "textarea") {
      return (
        <textarea rows={3} value={value} disabled={disabled} onChange={(e) => handleInputChange(product, field.label, e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-xl border border-emerald-100 bg-white focus:border-emerald-500 focus:outline-none resize-none transition-all disabled:bg-emerald-50 disabled:cursor-not-allowed" />
      )
    }
    return (
      <div className="relative">
        <Input type={field.type} value={value} required={field.required} disabled={disabled}
          onChange={(e) => handleInputChange(product, field.label, e.target.value)}
          className={`w-full px-3 py-2 text-sm rounded-xl transition-all h-10 ${disabled ? "bg-emerald-50/80 border-emerald-100 cursor-not-allowed" : "bg-white border-emerald-100 focus:border-emerald-500 focus:ring-emerald-500/20"}`} />
        {field.carried && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-600 whitespace-nowrap">🔒 carried</span>}
        {field.generated && value && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600">✓ auto</span>}
      </div>
    )
  }

  const FieldGrid = ({ product }: { product: string }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map((field) => (
        <div key={field.label} className="space-y-1">
          <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label}</Label>
          {renderField(field, product)}
        </div>
      ))}
    </div>
  )

  // ── Special layouts ─────────────────────────────────────────────────────────
  const renderExtraction = () => (
    <div className="space-y-5">
      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 space-y-3">
        <Label className="text-sm font-bold text-emerald-900">Number of Tanks</Label>
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
            <button key={num} type="button"
              onClick={() => { setNumberOfTanks(num); setTankData((prev) => { const u = { ...prev }; for (let i = 0; i < num; i++) if (!u[i]) u[i] = { data: {}, sameAsFirst: false }; return u }) }}
              className={`w-9 h-9 rounded-lg font-semibold text-sm transition-all ${numberOfTanks === num ? "bg-emerald-600 text-white shadow-sm" : "bg-white border-2 border-emerald-200 text-emerald-800 hover:border-emerald-400"}`}>
              {num}
            </button>
          ))}
        </div>
      </div>
      {Array.from({ length: numberOfTanks }, (_, i) => i).map((idx) => {
        const data = tankData[idx]?.data || {}
        const sameAsFirst = tankData[idx]?.sameAsFirst || false
        return (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-emerald-900 text-sm">Tank {idx + 1}</h3>
              {idx > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-500">
                  <input type="checkbox" checked={sameAsFirst} className="w-3.5 h-3.5 accent-emerald-600"
                    onChange={(e) => setTankData((prev) => ({ ...prev, [idx]: { sameAsFirst: e.target.checked, data: e.target.checked && prev[0]?.data ? JSON.parse(JSON.stringify(prev[0].data)) : prev[idx]?.data || {} } }))} />
                  Same as Tank 1
                </label>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fields.map((field) => {
                const locked = sameAsFirst && idx > 0 && field.label !== "Tank Number" && field.label !== "Alcohol Percentage"
                const val = data[field.label] || ""
                const set = (v: string) => setTankData((prev) => ({ ...prev, [idx]: { ...(prev[idx] || { sameAsFirst: false, data: {} }), data: { ...(prev[idx]?.data || {}), [field.label]: v } } }))
                return (
                  <div key={`${idx}-${field.label}`} className="space-y-1">
                    <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label}</Label>
                    {field.isAlcoholPercentage && field.options ? (
                      <div className="flex gap-2">
                        {field.options.map((opt) => (
                          <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name={`tank-${idx}-${field.label}`} value={opt} checked={val === opt} disabled={locked} onChange={(e) => set(e.target.value)} className="w-3.5 h-3.5 accent-emerald-600" />
                            <span className="text-sm font-medium">{opt}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <Input type={field.type} value={val} disabled={locked} onChange={(e) => set(e.target.value)}
                        className={`w-full px-3 py-2 text-sm rounded-xl h-10 transition-all ${locked ? "bg-emerald-50 border-emerald-100 cursor-not-allowed" : "bg-white border-emerald-100 focus:border-emerald-500"}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderConcentrate = () => {
    const t70 = fields.filter((f) => f.label.includes("(70)"))
    const t80 = fields.filter((f) => f.label.includes("(80)"))
    const other = fields.filter((f) => !f.label.includes("(70)") && !f.label.includes("(80)"))
    const col = (list: FormFieldDef[], title: string) => (
      <div className="space-y-3">
        <h3 className="text-center font-bold text-emerald-800 text-sm border-b border-emerald-200 pb-2">{title}</h3>
        {list.map((field) => (
          <div key={field.label} className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label.replace(/ \((70|80)\)/, "")}</Label>
            {renderField(field, "default")}
          </div>
        ))}
      </div>
    )
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">{col(t70, "70% (350L)")}{col(t80, "80% (400L)")}</div>
        {other.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-emerald-100">
            {other.map((field) => (
              <div key={field.label} className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label}</Label>
                {renderField(field, "default")}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderHerbs = () => (
    <div className="space-y-5">
      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm font-bold text-emerald-900">Select Herbs</Label>
          <button type="button" onClick={() => setShowCreateHerb(true)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors">
            <Plus size={13} /> Create Herb
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {isLoadingHerbs ? <p className="text-xs text-emerald-700/70">Loading herbs...</p> : herbOptions.map((herb) => (
            <label key={herb} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={selectedHerbs.includes(herb)} className="w-3.5 h-3.5 accent-emerald-600"
                onChange={() => setSelectedHerbs((prev) => { if (prev.includes(herb)) return prev.filter((h) => h !== herb); fetchHerbPrev(herb); return [...prev, herb] })} />
              <span className="text-sm text-slate-700 font-medium">{herb}</span>
            </label>
          ))}
        </div>
      </div>
      {selectedHerbs.map((herb) => (
        <div key={herb} className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
          <p className="font-bold text-emerald-900 text-sm mb-3">{herb}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {fields.map((field) => {
              const disabled = !!field.generated || !!field.carried
              return (
                <div key={field.label} className="space-y-1">
                  <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{field.label}</Label>
                  <div className="relative">
                    <input type={field.type === "number" ? "number" : "text"} value={herbsData[herb]?.[field.label] || ""} disabled={disabled}
                      onChange={(e) => handleHerbField(herb, field.label, e.target.value)}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-emerald-100 bg-white focus:border-emerald-500 focus:outline-none disabled:bg-emerald-50 disabled:cursor-not-allowed transition-all h-9" />
                    {field.carried && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-blue-600">🔒</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <Dialog open={showCreateHerb} onOpenChange={setShowCreateHerb}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Create New Herb</DialogTitle><DialogDescription>Add a new herb type to the system.</DialogDescription></DialogHeader>
          <div className="py-3">
            <Label htmlFor="herb-name" className="text-emerald-900 font-semibold text-sm">Herb Name</Label>
            <Input id="herb-name" placeholder="e.g., Alligator Pepper" value={newHerbName} onChange={(e) => setNewHerbName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreateHerb()} className="mt-1.5 rounded-xl border-emerald-100" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCreateHerb(false); setNewHerbName("") }}>Cancel</Button>
            <Button size="sm" onClick={handleCreateHerb} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  return (
    <>
      {successInfo && (
        <SuccessToast info={successInfo} onDismiss={() => { setSuccessInfo(null); router.push("/dashboard/forms") }} onAnother={() => { setSuccessInfo(null); router.push("/dashboard/forms") }} />
      )}

      <div className="bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-emerald-100">
        <form onSubmit={handleSubmit} className="space-y-6">
          {supportsMultiProduct && !isExtraction && (
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-emerald-900">
                Product Type <span className="text-red-500">*</span>
                <span className="ml-1 text-xs font-normal text-slate-400">(select all that apply)</span>
              </Label>
              <div className="flex flex-wrap gap-2">
                {availableProducts.map((p) => (
                  <button key={p} type="button" onClick={() => setProductionTypes((prev) => prev.includes(p) ? prev.filter((t) => t !== p) : [...prev, p])}
                    className={`px-4 h-9 rounded-xl border-2 text-sm font-semibold transition-all ${productionTypes.includes(p) ? "border-emerald-600 bg-emerald-600 text-white shadow-sm" : "border-emerald-200 bg-white text-slate-600 hover:border-emerald-400"}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoadingStock && (
            <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
              <p className="text-xs font-semibold text-blue-700">Loading current stock…</p>
            </div>
          )}
          {hasPreviousStock && !isLoadingStock && (
            <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
              {supportsMultiProduct ? (
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-blue-700">Current stock carried forward (read-only — set by management):</p>
                  {availableProducts.map((p) => perProductPreviousStock[p] != null ? <p key={p} className="text-xs text-blue-600">{p}: {perProductPreviousStock[p]}</p> : null)}
                </div>
              ) : (
                <p className="text-xs font-semibold text-blue-700">Current stock carried forward (read-only — set by management): {previousStock}</p>
              )}
            </div>
          )}

          <hr className="border-emerald-100" />

          <div className="space-y-5">
            <h3 className="text-base font-bold text-emerald-950">Record Details</h3>
            {isExtraction ? renderExtraction()
              : isHerbs ? renderHerbs()
              : isConcentrate ? renderConcentrate()
              : supportsMultiProduct && productionTypes.length > 0 ? (
                productionTypes.map((product) => (
                  <div key={product} className="bg-slate-50 p-5 rounded-2xl border border-emerald-100">
                    <h4 className="font-bold text-emerald-900 text-sm mb-3">{product} Form</h4>
                    {stockErrors[product] && <div className="px-3 py-2 mb-3 rounded-xl bg-red-50 border border-red-200"><p className="text-red-600 text-xs font-semibold">⚠️ {stockErrors[product]}</p></div>}
                    <FieldGrid product={product} />
                  </div>
                ))
              ) : !supportsMultiProduct ? (
                <div>
                  {stockErrors.default && <div className="px-3 py-2 mb-3 rounded-xl bg-red-50 border border-red-200"><p className="text-red-600 text-xs font-semibold">⚠️ {stockErrors.default}</p></div>}
                  <FieldGrid product="default" />
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">Select a product type above to begin.</p>
              )}
          </div>

          {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200"><p className="text-sm font-semibold text-red-700">⚠️ {error}</p></div>}

          <div className="pt-3 border-t border-emerald-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}
              className="h-11 sm:h-10 px-5 text-sm font-semibold border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl w-full sm:w-auto">Cancel</Button>
            <Button type="submit" disabled={isSubmitting}
              className="h-11 sm:h-10 px-6 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-md shadow-emerald-600/20 w-full sm:w-auto">
              {isSubmitting ? "Submitting…" : "Submit Record"}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
