"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FORM_FIELDS, type FormFieldDef } from "@/lib/domain/form-config"
import { getRecordType } from "@/lib/domain/record-types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { AlertCircle, Lock, Minus, Plus, Sparkles, Trash2 } from "lucide-react"
import { SuccessToast, type SuccessInfo } from "./success-toast"
import { Card, Chip, Choice, Field, NumberInput, SectionTitle, TextArea, TextInput } from "@/components/primitives"

// ============================================================================
// Record entry — the screen supervisors use many times a day, on a phone, often
// one-handed on the factory floor. Everything here is built for that.
//
// ONE ERROR SYSTEM. This previously had four competing surfaces: the browser's
// own `required` validation bubbles, a per-product inline banner, a form-level
// banner at the very bottom of the page, and a toast that fired simultaneously
// with the banner. On a 20-tank extraction form the message "Tank 14 missing:
// Time" appeared below the entire page with no indication which tank. Now:
// per-field messages with aria-live, and submit scrolls to and focuses the first
// offending field. `noValidate` suppresses the native bubbles so there is exactly
// one voice.
//
// TOUCH TARGETS. The herb checkboxes and alcohol-% radios were 14px, and the tank
// picker was twenty 36px buttons. All now 44px via the Choice primitive and a
// stepper.
//
// DRAFTS cover every layout. They previously saved only formDataByProduct, so
// extraction tank data and herb data were silently lost on reload.
// ============================================================================

interface RecordEntryFormProps {
  recordType: string
  supervisorName: string
  department: string
  groupNumber: number
  initialDate: string
  initialShift: string
}

/** scope (product / herb name / "tank-3") -> field label -> message */
type Errors = Record<string, Record<string, string>>

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const fieldId = (scope: string, label: string) => `f-${slug(scope)}-${slug(label)}`

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
      return "These values leave negative stock — check received and used."
    }
  }
  return ""
}

export default function RecordEntryForm({
  recordType,
  department,
  groupNumber,
  initialDate,
  initialShift,
}: RecordEntryFormProps) {
  const router = useRouter()
  const def = getRecordType(recordType)
  const fields = useMemo(() => FORM_FIELDS[recordType] ?? [], [recordType])
  const availableProducts = def?.products ?? []
  const supportsMultiProduct = availableProducts.length > 0
  const carriedLabel = fields.find((f) => f.carried)?.label
  const isHerbs = def?.storage.kind === "stock" && def.storage.material === "herb"
  const isExtraction = recordType === "Extraction Monitoring Records"
  const isConcentrate = recordType === "Daily Records Alcohol For Concentrate"

  const shift = initialShift
  const selectedDate = initialDate

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Errors>({})
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
  const [herbDialogError, setHerbDialogError] = useState<string | null>(null)

  const [hasDraft, setHasDraft] = useState(false)

  const draftKey = `draft_${recordType}_${initialDate}_${initialShift}`

  // ── Draft restore / save ──────────────────────────────────────────────────
  // Covers EVERY layout. Previously only formDataByProduct was persisted, so a
  // supervisor who filled 20 extraction tanks and reloaded lost all of it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey)
      if (!saved) return
      const p = JSON.parse(saved)
      if (p.formDataByProduct) setFormDataByProduct(p.formDataByProduct)
      if (p.productionTypes) setProductionTypes(p.productionTypes)
      if (p.tankData) setTankData(p.tankData)
      if (p.numberOfTanks) setNumberOfTanks(p.numberOfTanks)
      if (p.herbsData) setHerbsData(p.herbsData)
      if (p.selectedHerbs) setSelectedHerbs(p.selectedHerbs)
      setHasDraft(true)
      toast.info("Draft restored", { description: "Your unsaved entries were kept." })
    } catch {
      /* a corrupt draft is not worth surfacing */
    }
  }, [draftKey])

  // Draft autosave, DEBOUNCED. This used to run on every state change, which meant a
  // JSON.stringify of the whole form plus a synchronous localStorage write on every
  // single keystroke — and localStorage writes block the main thread, so on a
  // factory-floor phone with a 20-tank extraction draft that is felt as typing lag.
  // Waiting for a pause in typing keeps the feature and stops charging for it per
  // character.
  //
  // The debounce is only safe because of the flush below: without it, leaving the page
  // within half a second of the last keystroke would lose that keystroke, and a draft
  // that quietly drops the most recent edit is worse than no draft at all.
  const pendingDraft = useRef<string | null>(null)

  const flushDraft = useCallback(() => {
    const payload = pendingDraft.current
    if (payload === null) return
    pendingDraft.current = null
    try {
      localStorage.setItem(draftKey, payload)
      setHasDraft(true)
    } catch {
      /* storage full or blocked — not worth interrupting data entry */
    }
  }, [draftKey])

  useEffect(() => {
    const empty =
      Object.keys(formDataByProduct).length === 0 &&
      Object.keys(tankData).length === 0 &&
      Object.keys(herbsData).length === 0
    if (empty) return

    pendingDraft.current = JSON.stringify({
      formDataByProduct, productionTypes, tankData, numberOfTanks, herbsData, selectedHerbs,
    })
    const id = setTimeout(flushDraft, 500)
    return () => clearTimeout(id)
  }, [formDataByProduct, productionTypes, tankData, numberOfTanks, herbsData, selectedHerbs, flushDraft])

  // Backstop for the debounce: write immediately when the page is hidden or torn
  // down. `visibilitychange` is the one that actually fires on mobile — a phone
  // switching apps or locking often never sends `beforeunload` at all.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flushDraft() }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", flushDraft)
    return () => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", flushDraft)
      flushDraft()
    }
  }, [flushDraft])

  const discardDraft = () => {
    try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
    setFormDataByProduct({})
    setProductionTypes([])
    setTankData({})
    setNumberOfTanks(1)
    setHerbsData({})
    setSelectedHerbs([])
    setErrors({})
    setFormError(null)
    setHasDraft(false)
    toast.success("Draft discarded")
  }

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

  // ── Stock ledger: the server-DERIVED carried-forward balance ────────────────
  // Supervisors never type opening; it is computed from prior shifts' movements
  // plus management baselines, and shown read-only.
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

  // ── Editing ─────────────────────────────────────────────────────────────────
  /** Clear a field's error as soon as the supervisor starts fixing it. */
  const clearError = useCallback((scope: string, label: string) => {
    setErrors((prev) => {
      if (!prev[scope]?.[label]) return prev
      const scoped = { ...prev[scope] }
      delete scoped[label]
      const next = { ...prev, [scope]: scoped }
      if (Object.keys(scoped).length === 0) delete next[scope]
      return next
    })
  }, [])

  const handleInputChange = (product: string, field: string, value: string) => {
    clearError(product, field)
    setFormDataByProduct((prev) => {
      const d = { ...(prev[product] || {}), [field]: value }
      recalc(fields, d)
      setStockErrors((se) => ({ ...se, [product]: stockError(fields, d) }))
      return { ...prev, [product]: d }
    })
  }

  const handleHerbField = (herb: string, label: string, value: string) => {
    clearError(herb, label)
    setHerbsData((prev) => {
      const d = { ...(prev[herb] || {}), [label]: value }
      recalc(fields, d)
      return { ...prev, [herb]: d }
    })
  }

  const setTankField = (idx: number, label: string, value: string) => {
    clearError(`tank-${idx}`, label)
    setTankData((prev) => ({
      ...prev,
      [idx]: { ...(prev[idx] || { sameAsFirst: false, data: {} }), data: { ...(prev[idx]?.data || {}), [label]: value } },
    }))
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

  const toggleHerb = (herb: string) => {
    setSelectedHerbs((prev) => {
      if (prev.includes(herb)) return prev.filter((h) => h !== herb)
      fetchHerbPrev(herb)
      return [...prev, herb]
    })
  }

  const handleCreateHerb = async () => {
    const name = newHerbName.trim()
    if (!name) return setHerbDialogError("Enter a herb name.")
    if (herbOptions.some((h) => h.toLowerCase() === name.toLowerCase())) return setHerbDialogError("That herb already exists.")
    try {
      const res = await fetch("/api/herbs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
      const d = await res.json()
      if (!res.ok) return setHerbDialogError(d.error || "Could not create the herb.")
      setHerbOptions((prev) => [...prev, name].sort())
      setSelectedHerbs((prev) => [...prev, name])
      fetchHerbPrev(name)
      setShowCreateHerb(false)
      setNewHerbName("")
      setHerbDialogError(null)
    } catch { setHerbDialogError("Could not create the herb.") }
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  const missingIn = (data: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const f of fields) {
      if (f.generated || f.carried) continue
      if (f.required && !data[f.label]?.trim()) out[f.label] = "Required"
    }
    return out
  }

  /** Scroll to and focus the first invalid control — the whole point of ids. */
  const focusFirstError = (errs: Errors, order: string[]) => {
    for (const scope of order) {
      const scoped = errs[scope]
      if (!scoped) continue
      const label = fields.find((f) => scoped[f.label])?.label ?? Object.keys(scoped)[0]
      const el = document.getElementById(fieldId(scope, label))
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" })
        ;(el as HTMLElement).focus({ preventScroll: true })
        return
      }
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const post = (body: Record<string, unknown>) =>
    fetch("/api/records/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setErrors({})

    // One shape for every layout: a list of scopes to validate and then post.
    type Scope = { scope: string; data: Record<string, string>; body: Record<string, unknown> }
    const base = { recordType, department, group: groupNumber, shift, date: selectedDate }
    let scopes: Scope[] = []

    if (isExtraction) {
      scopes = Array.from({ length: numberOfTanks }, (_, i) => ({
        scope: `tank-${i}`,
        data: tankData[i]?.data || {},
        body: { ...base, productType: "Bitters", formData: tankData[i]?.data || {} },
      }))
    } else if (isHerbs) {
      if (selectedHerbs.length === 0) {
        setFormError("Choose at least one herb to record.")
        return
      }
      scopes = selectedHerbs.map((herb) => ({
        scope: herb,
        data: herbsData[herb] || {},
        body: { ...base, variant: herb, formData: herbsData[herb] || {} },
      }))
    } else {
      if (supportsMultiProduct && productionTypes.length === 0) {
        setFormError(`Choose at least one product: ${availableProducts.join(" or ")}.`)
        return
      }
      const products = supportsMultiProduct ? productionTypes : ["default"]
      scopes = products.map((product) => ({
        scope: product,
        data: formDataByProduct[product] || {},
        body: {
          ...base,
          productType: product === "default" ? undefined : product,
          formData: formDataByProduct[product] || {},
        },
      }))
    }

    // Validate everything BEFORE posting anything, so a later failure can never
    // leave a half-submitted set of records behind.
    const nextErrors: Errors = {}
    for (const s of scopes) {
      const missing = missingIn(s.data)
      if (Object.keys(missing).length) nextErrors[s.scope] = missing
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      const count = Object.values(nextErrors).reduce((n, m) => n + Object.keys(m).length, 0)
      setFormError(`${count} field${count === 1 ? "" : "s"} still need${count === 1 ? "s" : ""} a value.`)
      focusFirstError(nextErrors, scopes.map((s) => s.scope))
      return
    }
    const blocked = scopes.find((s) => stockErrors[s.scope])
    if (blocked) {
      setFormError(stockErrors[blocked.scope])
      return
    }

    setIsSubmitting(true)
    setProgress({ done: 0, total: scopes.length })
    try {
      for (const [i, s] of scopes.entries()) {
        const res = await post(s.body)
        if (!res.ok) throw new Error((await res.json()).error || "Could not save the record.")
        setProgress({ done: i + 1, total: scopes.length })
      }
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      setSuccessInfo({ recordType, department, shift, date: selectedDate, count: scopes.length })
    } catch (err) {
      // ONE message. This used to raise a banner and a toast for the same event.
      setFormError(err instanceof Error ? err.message : "Could not save the record.")
    } finally {
      setIsSubmitting(false)
      setProgress(null)
    }
  }

  // ── Field renderer ──────────────────────────────────────────────────────────
  const renderControl = (
    field: FormFieldDef,
    scope: string,
    value: string,
    onChange: (v: string) => void,
    forcedDisabled = false,
  ) => {
    const disabled = forcedDisabled || !!field.generated || !!field.carried
    const id = fieldId(scope, field.label)
    const error = errors[scope]?.[field.label] ?? null

    // Radio group inside a fieldset so the choice is announced as a group.
    if (field.isAlcoholPercentage && field.options) {
      return (
        <fieldset className="space-y-1.5" aria-invalid={error ? true : undefined}>
          <legend className="block text-xs font-bold uppercase tracking-wide text-ink-secondary mb-1.5">
            {field.label}
            {field.required && <span className="text-critical ml-0.5" aria-hidden="true">*</span>}
          </legend>
          <div className="flex flex-wrap gap-2">
            {field.options.map((opt) => (
              <Choice
                key={opt}
                type="radio"
                name={`${scope}-${field.label}`}
                value={opt}
                checked={value === opt}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                label={opt}
              />
            ))}
          </div>
          {error && (
            <p role="alert" aria-live="polite" className="text-xs font-semibold text-critical-ink">{error}</p>
          )}
        </fieldset>
      )
    }

    return (
      <Field
        id={id}
        label={field.label}
        required={field.required && !field.generated && !field.carried}
        error={error}
        hint={
          field.carried
            ? "Carried forward — set by management"
            : field.generated
              ? "Calculated automatically"
              : undefined
        }
      >
        {(a11y) => {
          if (field.type === "textarea") {
            return <TextArea {...a11y} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          }
          const Ctl = field.type === "number" ? NumberInput : TextInput
          return (
            <div className="relative">
              <Ctl
                {...a11y}
                type={field.type === "number" ? undefined : field.type}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className={error ? "border-critical focus:border-critical focus:ring-critical/20" : undefined}
              />
              {field.carried && (
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
              )}
              {field.generated && value && (
                <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand" aria-hidden="true" />
              )}
            </div>
          )
        }}
      </Field>
    )
  }

  // Plain function, NOT a component. Declared here because it closes over
  // `fields` and the handlers. As `<FieldGrid />` its identity changed every
  // render, so React remounted the whole field subtree on every keystroke and
  // dropped focus after each character. Do not convert it back.
  const fieldGrid = (product: string) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map((field) => (
        <div key={field.label}>
          {renderControl(field, product, formDataByProduct[product]?.[field.label] || "", (v) =>
            handleInputChange(product, field.label, v),
          )}
        </div>
      ))}
    </div>
  )

  // ── Extraction: many tanks in one shift ─────────────────────────────────────
  const setTanks = (n: number) => {
    const next = Math.min(20, Math.max(1, n))
    setNumberOfTanks(next)
    setTankData((prev) => {
      const u = { ...prev }
      for (let i = 0; i < next; i++) if (!u[i]) u[i] = { data: {}, sameAsFirst: false }
      return u
    })
  }

  const renderExtraction = () => (
    <div className="space-y-4">
      {/* A stepper, not twenty 36px buttons. Choosing 17 tanks previously meant
          hitting a target a third of the recommended size. */}
      <Card tone="brand" padded>
        <Label htmlFor="tank-count" className="block text-xs font-bold uppercase tracking-wide text-ink-secondary mb-2">
          Number of tanks
        </Label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTanks(numberOfTanks - 1)}
            disabled={numberOfTanks <= 1}
            aria-label="One tank fewer"
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-hairline bg-surface-card text-ink-secondary disabled:opacity-40 active:scale-[0.97]"
          >
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <input
            id="tank-count"
            type="text"
            inputMode="numeric"
            value={numberOfTanks}
            onChange={(e) => setTanks(Number(e.target.value.replace(/\D/g, "")) || 1)}
            className="h-11 w-20 text-center text-base font-bold tnum rounded-xl border border-hairline bg-surface-card text-ink-primary focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setTanks(numberOfTanks + 1)}
            disabled={numberOfTanks >= 20}
            aria-label="One tank more"
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-hairline bg-surface-card text-ink-secondary disabled:opacity-40 active:scale-[0.97]"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-xs text-ink-muted ml-1">max 20</span>
        </div>
      </Card>

      {Array.from({ length: numberOfTanks }, (_, i) => i).map((idx) => {
        const data = tankData[idx]?.data || {}
        const sameAsFirst = tankData[idx]?.sameAsFirst || false
        const scope = `tank-${idx}`
        const hasErrors = !!errors[scope]
        return (
          <Card key={idx} padded className={hasErrors ? "border-critical/40" : undefined}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <SectionTitle>Tank {idx + 1}</SectionTitle>
              <div className="flex items-center gap-2">
                {hasErrors && <Chip tone="critical" icon={<AlertCircle className="w-3 h-3" />}>Incomplete</Chip>}
                {idx > 0 && (
                  <Choice
                    type="checkbox"
                    checked={sameAsFirst}
                    onChange={(e) =>
                      setTankData((prev) => ({
                        ...prev,
                        [idx]: {
                          sameAsFirst: e.target.checked,
                          data: e.target.checked && prev[0]?.data ? { ...prev[0].data } : prev[idx]?.data || {},
                        },
                      }))
                    }
                    label="Same as Tank 1"
                    className="px-2"
                  />
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map((field) => {
                const locked =
                  sameAsFirst && idx > 0 && field.label !== "Tank Number" && field.label !== "Alcohol Percentage"
                return (
                  <div key={`${idx}-${field.label}`}>
                    {renderControl(field, scope, data[field.label] || "", (v) => setTankField(idx, field.label, v), locked)}
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )

  // ── Concentrate: two strengths, side by side ────────────────────────────────
  const renderConcentrate = () => {
    const t70 = fields.filter((f) => f.label.includes("(70)"))
    const t80 = fields.filter((f) => f.label.includes("(80)"))
    const other = fields.filter((f) => !f.label.includes("(70)") && !f.label.includes("(80)"))

    // The strength stays IN each field's label. Stripping it and relying on a
    // column heading meant that on a phone — where the two columns stack — you
    // got two visually identical sets of "Number of tanks / Alcohol used / Water"
    // distinguished only by a header you had already scrolled past. A real
    // mis-entry risk on the exact device this is used on.
    const strengthPanel = (list: FormFieldDef[], title: string, tone: "brand" | "data") => (
      <Card tone={tone} padded>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>{title}</SectionTitle>
          <Chip tone={tone === "brand" ? "brand" : "neutral"}>{title.startsWith("70") ? "70%" : "80%"}</Chip>
        </div>
        <div className="space-y-4">
          {list.map((field) => (
            <div key={field.label}>
              {renderControl(field, "default", formDataByProduct.default?.[field.label] || "", (v) =>
                handleInputChange("default", field.label, v),
              )}
            </div>
          ))}
        </div>
      </Card>
    )

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {strengthPanel(t70, "70% strength", "brand")}
          {strengthPanel(t80, "80% strength", "data")}
        </div>
        {other.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{fieldGridFor(other, "default")}</div>}
      </div>
    )
  }

  const fieldGridFor = (list: FormFieldDef[], product: string) =>
    list.map((field) => (
      <div key={field.label}>
        {renderControl(field, product, formDataByProduct[product]?.[field.label] || "", (v) =>
          handleInputChange(product, field.label, v),
        )}
      </div>
    ))

  // ── Herbs: multi-select, one card each ─────────────────────────────────────
  const renderHerbs = () => (
    <div className="space-y-4">
      <Card tone="brand" padded>
        <div className="flex items-center justify-between gap-2 mb-3">
          <SectionTitle>Which herbs?</SectionTitle>
          <button
            type="button"
            onClick={() => { setShowCreateHerb(true); setHerbDialogError(null) }}
            className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-brand-solid text-brand-ink text-xs font-bold active:scale-[0.97]"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> New herb
          </button>
        </div>
        {isLoadingHerbs ? (
          <p className="text-sm text-ink-muted">Loading herbs…</p>
        ) : herbOptions.length === 0 ? (
          <p className="text-sm text-ink-muted">No herbs yet — add the first one.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {herbOptions.map((herb) => (
              <Choice
                key={herb}
                type="checkbox"
                checked={selectedHerbs.includes(herb)}
                onChange={() => toggleHerb(herb)}
                label={herb}
              />
            ))}
          </div>
        )}
      </Card>

      {selectedHerbs.map((herb) => (
        <Card key={herb} padded className={errors[herb] ? "border-critical/40" : undefined}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <SectionTitle>{herb}</SectionTitle>
            <div className="flex items-center gap-2">
              {herbsPrev[herb] != null && <Chip tone="neutral">{herbsPrev[herb]} carried forward</Chip>}
              {errors[herb] && <Chip tone="critical" icon={<AlertCircle className="w-3 h-3" />}>Incomplete</Chip>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map((field) => (
              <div key={field.label}>
                {renderControl(field, herb, herbsData[herb]?.[field.label] || "", (v) =>
                  handleHerbField(herb, field.label, v),
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Dialog open={showCreateHerb} onOpenChange={setShowCreateHerb}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add a herb</DialogTitle>
            <DialogDescription>It becomes available to everyone recording herb stock.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="herb-name" className="block text-xs font-bold uppercase tracking-wide text-ink-secondary mb-1.5">
              Herb name
            </Label>
            <Input
              id="herb-name"
              placeholder="e.g. Alligator pepper"
              value={newHerbName}
              onChange={(e) => { setNewHerbName(e.target.value); setHerbDialogError(null) }}
              onKeyDown={(e) => e.key === "Enter" && handleCreateHerb()}
              className="h-11 sm:h-10 text-base sm:text-sm rounded-xl"
              aria-invalid={herbDialogError ? true : undefined}
            />
            {herbDialogError && (
              <p role="alert" aria-live="polite" className="mt-1.5 text-xs font-semibold text-critical-ink">
                {herbDialogError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setShowCreateHerb(false); setNewHerbName(""); setHerbDialogError(null) }}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateHerb} className="bg-brand-solid text-brand-ink hover:bg-brand-solid-hover">
              Add herb
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  const carriedSummary = hasPreviousStock && !isLoadingStock && (
    <Card tone="brand" padded>
      <div className="flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-ink-primary">Carried forward</p>
          <p className="text-xs text-ink-muted mt-0.5">
            Read-only. Derived from earlier shifts and management stock counts.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {supportsMultiProduct
              ? availableProducts.map((p) =>
                  perProductPreviousStock[p] != null ? (
                    <Chip key={p} tone={p === "Bitters" ? "bitters" : "ginger"}>{p}: {perProductPreviousStock[p]}</Chip>
                  ) : null,
                )
              : <Chip tone="neutral">{previousStock}</Chip>}
          </div>
        </div>
      </div>
    </Card>
  )

  return (
    <>
      {successInfo && (
        <SuccessToast
          info={successInfo}
          onDismiss={() => { setSuccessInfo(null); router.push("/dashboard/forms") }}
          onAnother={() => { setSuccessInfo(null); router.push("/dashboard/forms") }}
        />
      )}

      {/* noValidate: the browser's own bubbles were a second, competing error
          voice that fired before our validator ever ran. */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {hasDraft && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-surface-sunken border border-hairline">
            <p className="text-xs font-medium text-ink-secondary">Unsaved entries from earlier were restored.</p>
            <button
              type="button"
              onClick={discardDraft}
              className="h-9 px-2.5 flex items-center gap-1.5 rounded-lg text-xs font-bold text-ink-muted hover:text-critical-ink hover:bg-critical-subtle transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Discard
            </button>
          </div>
        )}

        {supportsMultiProduct && !isExtraction && (
          <Card padded>
            <fieldset>
              <legend className="block text-xs font-bold uppercase tracking-wide text-ink-secondary mb-2">
                Product <span className="text-critical" aria-hidden="true">*</span>
                <span className="ml-1.5 font-medium normal-case tracking-normal text-ink-muted">select all that apply</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {availableProducts.map((p) => (
                  <Choice
                    key={p}
                    type="checkbox"
                    checked={productionTypes.includes(p)}
                    onChange={() => {
                      setFormError(null)
                      setProductionTypes((prev) => (prev.includes(p) ? prev.filter((t) => t !== p) : [...prev, p]))
                    }}
                    label={p}
                  />
                ))}
              </div>
            </fieldset>
          </Card>
        )}

        {isLoadingStock && (
          <Card padded>
            <p className="text-sm text-ink-muted">Loading the carried-forward balance…</p>
          </Card>
        )}
        {carriedSummary}

        <div className="space-y-4">
          {isExtraction ? renderExtraction()
            : isHerbs ? renderHerbs()
            : isConcentrate ? renderConcentrate()
            : supportsMultiProduct && productionTypes.length > 0 ? (
              productionTypes.map((product) => (
                <Card key={product} padded className={errors[product] ? "border-critical/40" : undefined}>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <SectionTitle>{product}</SectionTitle>
                    {errors[product] && <Chip tone="critical" icon={<AlertCircle className="w-3 h-3" />}>Incomplete</Chip>}
                  </div>
                  {stockErrors[product] && (
                    <p role="alert" className="mb-3 text-xs font-semibold text-critical-ink">{stockErrors[product]}</p>
                  )}
                  {fieldGrid(product)}
                </Card>
              ))
            ) : !supportsMultiProduct ? (
              <Card padded className={errors.default ? "border-critical/40" : undefined}>
                {stockErrors.default && (
                  <p role="alert" className="mb-3 text-xs font-semibold text-critical-ink">{stockErrors.default}</p>
                )}
                {fieldGrid("default")}
              </Card>
            ) : (
              <Card padded>
                <p className="text-sm text-ink-muted">Choose a product above to start entering figures.</p>
              </Card>
            )}
        </div>

        {/* The single form-level message, immediately above the submit button
            where the action is — not at the far bottom of a long page. */}
        {formError && (
          <div role="alert" aria-live="assertive" className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-critical-subtle border border-critical/30">
            <AlertCircle className="w-4 h-4 text-critical shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm font-semibold text-critical-ink">{formError}</p>
          </div>
        )}

        <div className="pt-3 border-t border-hairline flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="h-11 sm:h-10 px-5 text-sm font-semibold rounded-xl w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 sm:h-10 px-6 text-sm font-bold bg-brand-solid text-brand-ink hover:bg-brand-solid-hover rounded-xl w-full sm:w-auto active:scale-[0.97]"
          >
            {/* Real progress: a 20-tank extraction is 20 sequential requests, and
                a bare "Submitting…" gave no sign it was still working. */}
            {isSubmitting
              ? progress && progress.total > 1
                ? `Saving ${progress.done + 1} of ${progress.total}…`
                : "Saving…"
              : "Submit record"}
          </Button>
        </div>
      </form>
    </>
  )
}
