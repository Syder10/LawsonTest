"use client"

import { useState, useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import {
  STAMP_COILS_PER_BOX, STAMP_PCS_PER_COIL, STAMP_PCS_PER_BOX, TAPE_PCS_PER_BOX,
  PPE_TYPES, pcsPerBox, type MaterialType,
} from "@/lib/domain/materials"
import { DEPARTMENTS } from "@/lib/domain/record-types"
import { groupsForDepartment } from "@/lib/shift-config"
import { Card, Choice, Eyebrow, Field, NumberInput, PageHeader, Select, TextArea, TextInput } from "@/components/primitives"
import { Button } from "@/components/ui/button"

// Materials no longer carry a hue each. Seven decorative colour families made the
// selected material read as a status, and the same seven had to be repeated in a
// second map for the banners; selection is now shown by the Choice primitive.
const MATERIALS: { type: MaterialType; label: string }[] = [
  { type: "tax_stamp",      label: "Tax stamps" },
  { type: "carton_bitters", label: "Cartons — Bitters" },
  { type: "carton_ginger",  label: "Cartons — Ginger" },
  { type: "seal_tape",      label: "Seal tapes" },
  { type: "hair_net",       label: "Hair nets" },
  { type: "nose_mask",      label: "Nose masks" },
  { type: "gloves",         label: "Gloves" },
]

// Derived from the roster so a recipient group that works no shift cannot be
// offered (Alcohol and Blending has two groups, not three).
const DEPT_GROUPS = DEPARTMENTS.map((dept) => ({ dept, groups: groupsForDepartment(dept) }))

const GIVEN_OUT_UNITS = ["Boxes", "Packs"]

function todayStr() { return new Date().toISOString().split("T")[0] }
function fmt(n: number) { return n.toLocaleString() }

function ppeUnit(t: MaterialType): string {
  if (t === "seal_tape") return "pcs"
  return "packs"
}

/** Small derived-figure tile: the system's arithmetic, shown before submitting. */
function Derived({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-sunken px-3 py-3 text-center">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tnum text-ink-primary">{value}</p>
    </div>
  )
}

/** Explanatory note above a quantity field — a pack/box conversion or a rate. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand-subtle px-4 py-2.5 text-xs font-semibold text-brand-subtle-ink space-y-0.5">
      {children}
    </div>
  )
}

export default function ProcurementSubmitPage() {
  const supabase = getSupabaseBrowserClient()

  const [userName,   setUserName]   = useState("")
  const [date,       setDate]       = useState(todayStr())
  const [material,   setMaterial]   = useState<MaterialType>("tax_stamp")
  const [remarks,    setRemarks]    = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)

  // Tax stamp — boxes only (system knows 1 box = 6 coils = 90,000 pcs)
  const [stampBoxes, setStampBoxes] = useState("")

  // Cartons — pcs only
  const [cartonPcs, setCartonPcs] = useState("")

  // PPE (seal tape, hair net, nose mask, gloves) — shared state
  const [ppeBoxesIn,   setPpeBoxesIn]   = useState("")
  const [ppeGivenOut,  setPpeGivenOut]  = useState("")
  const [ppeGivenUnit, setPpeGivenUnit] = useState("Boxes")
  const [ppeGivenTo,   setPpeGivenTo]   = useState("")

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).single()
      setUserName(data?.full_name || "Procurement Officer")
    }
    load()
  }, [supabase])

  const switchMaterial = (t: MaterialType) => {
    setMaterial(t)
    setStampBoxes("")
    setCartonPcs("")
    setPpeBoxesIn(""); setPpeGivenOut(""); setPpeGivenTo(""); setPpeGivenUnit("Boxes")
    setRemarks("")
  }

  // ── Live calculations ──────────────────────────────────────────────────
  const stampBoxesN = Number(stampBoxes || 0)
  const stampCoils  = stampBoxesN * STAMP_COILS_PER_BOX
  const stampPcs    = stampBoxesN * STAMP_PCS_PER_BOX

  const ppb          = pcsPerBox(material)
  const ppeBoxesN    = Number(ppeBoxesIn  || 0)
  const ppePcsIn     = ppeBoxesN * ppb
  const ppeGivenOutN = Number(ppeGivenOut || 0)
  const ppeGivenPcs  = ppeGivenUnit === "Boxes" ? ppeGivenOutN * ppb : ppeGivenOutN // "Packs" = direct pcs

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!date) { toast.error("Please select a date"); return }

    const body: Record<string, unknown> = { date, material_type: material, remarks: remarks || null }

    if (material === "tax_stamp") {
      if (stampBoxesN <= 0) { toast.error("Enter number of boxes received"); return }
      body.stamp_boxes       = stampBoxesN
      body.stamp_total_coils = stampCoils
      body.stamp_total_pcs   = stampPcs

    } else if (material === "carton_bitters" || material === "carton_ginger") {
      const p = Number(cartonPcs || 0)
      if (p <= 0) { toast.error("Enter quantity of cartons (pcs)"); return }
      body.carton_total_pcs = p

    } else if (PPE_TYPES.includes(material)) {
      if (ppeBoxesN <= 0 && ppeGivenOutN <= 0) {
        toast.error("Enter boxes received or quantity given out"); return
      }
      body.ppe_boxes_in   = ppeBoxesN
      body.ppe_pcs_in     = ppePcsIn
      body.ppe_given_out  = ppeGivenOutN
      body.ppe_given_unit = ppeGivenUnit
      body.ppe_given_pcs  = ppeGivenPcs
      body.ppe_given_to   = ppeGivenTo || null
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/procurement/raw-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      setSubmitted(true)
      setStampBoxes(""); setCartonPcs("")
      setPpeBoxesIn(""); setPpeGivenOut(""); setPpeGivenTo(""); setPpeGivenUnit("Boxes")
      setRemarks("")
      toast.success("Submitted — stock balance updated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  const meta = MATERIALS.find(m => m.type === material)!

  return (
    <div className="space-y-5 max-w-xl mx-auto animate-fade-in-up">

      <PageHeader title="Submit raw materials" description="Log incoming stock" backHref="/dashboard" />

      {/* Success */}
      {submitted && (
        <div className="flex items-center gap-3 rounded-2xl border border-good/30 bg-good-subtle px-5 py-4">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-good-ink" aria-hidden="true" />
          <p className="flex-1 text-sm font-bold text-good-ink">Submitted — stock updated</p>
          <button onClick={() => setSubmitted(false)} className="shrink-0 text-xs font-bold text-good-ink underline">
            Submit another
          </button>
        </div>
      )}

      {/* Date + received by */}
      <Card padded className="space-y-4">
        <Eyebrow>Entry details</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" required>
            {p => <TextInput {...p} type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />}
          </Field>
          <Field label="Received by" hint="From your profile.">
            {p => <TextInput {...p} type="text" value={userName} readOnly disabled />}
          </Field>
        </div>
      </Card>

      {/* Material selector — real radios: it is a single choice, and the old
          buttons exposed no pressed state to assistive tech. */}
      <Card padded className="space-y-3">
        <fieldset>
          <legend className="mb-3"><Eyebrow as="span">Material type *</Eyebrow></legend>
          <div className="grid grid-cols-2 gap-2">
            {MATERIALS.map(m => (
              <Choice
                key={m.type}
                type="radio"
                name="material"
                label={m.label}
                value={m.type}
                checked={material === m.type}
                onChange={() => switchMaterial(m.type)}
              />
            ))}
          </div>
        </fieldset>
      </Card>

      {/* Quantity fields */}
      <Card padded className="space-y-4">
        <Eyebrow>{meta.label}</Eyebrow>

        {/* ── TAX STAMPS — boxes only, system calculates coils + pcs ── */}
        {material === "tax_stamp" && (
          <div className="space-y-4">
            <Note>
              <p>1 box = {STAMP_COILS_PER_BOX} coils &nbsp;·&nbsp; 1 coil = {fmt(STAMP_PCS_PER_COIL)} pcs</p>
              <p>Bitters = 9 stamps/carton &nbsp;·&nbsp; Ginger = 6 stamps/carton</p>
            </Note>
            <Field label="Boxes received" required>
              {p => <NumberInput {...p} placeholder="0" value={stampBoxes} onChange={e => setStampBoxes(e.target.value)} />}
            </Field>
            {stampBoxesN > 0 && (
              <div className="grid grid-cols-3 gap-2">
                <Derived label="Boxes" value={fmt(stampBoxesN)} />
                <Derived label="Coils" value={fmt(stampCoils)} />
                <Derived label="Pcs" value={fmt(stampPcs)} />
              </div>
            )}
          </div>
        )}

        {/* ── CARTONS — pcs only ── */}
        {(material === "carton_bitters" || material === "carton_ginger") && (
          <div className="space-y-3">
            <Note>Enter total carton pieces received.</Note>
            <Field label="Quantity received (pcs)" required>
              {p => <NumberInput {...p} placeholder="0" value={cartonPcs} onChange={e => setCartonPcs(e.target.value)} />}
            </Field>
            {Number(cartonPcs) > 0 && (
              <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-sunken px-4 py-2.5">
                <p className="text-xs font-bold text-ink-secondary">Total to add</p>
                <p className="text-lg font-bold tnum text-ink-primary">{fmt(Number(cartonPcs))} pcs</p>
              </div>
            )}
          </div>
        )}

        {/* ── PPE (seal tape, hair net, nose mask, gloves) — received + given out ── */}
        {PPE_TYPES.includes(material) && (
          <div className="space-y-4">
            <Note>
              {material === "seal_tape"  && `1 box = ${TAPE_PCS_PER_BOX} pcs`}
              {material === "hair_net"   && `1 box = ${pcsPerBox("hair_net")} packs`}
              {material === "nose_mask"  && `1 box = ${pcsPerBox("nose_mask")} packs`}
              {material === "gloves"     && `1 box = ${pcsPerBox("gloves")} packs`}
            </Note>

            <Field
              label="Boxes received"
              hint={ppeBoxesN > 0 ? `= ${fmt(ppePcsIn)} ${ppeUnit(material)} received` : undefined}
            >
              {p => <NumberInput {...p} placeholder="0" value={ppeBoxesIn} onChange={e => setPpeBoxesIn(e.target.value)} />}
            </Field>

            <div className="border-t border-hairline" />

            {/* Given out */}
            <div className="space-y-3">
              <Eyebrow>Given out (optional)</Eyebrow>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity given out">
                  {p => <NumberInput {...p} placeholder="0" value={ppeGivenOut} onChange={e => setPpeGivenOut(e.target.value)} />}
                </Field>
                <Field label="Unit">
                  {p => (
                    <Select {...p} value={ppeGivenUnit} onChange={e => setPpeGivenUnit(e.target.value)}>
                      {GIVEN_OUT_UNITS.map(u => <option key={u}>{u}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
              <Field label="Given to (department — group)">
                {p => (
                  <Select {...p} value={ppeGivenTo} onChange={e => setPpeGivenTo(e.target.value)}>
                    <option value="">Select recipient…</option>
                    {DEPT_GROUPS.flatMap(({ dept, groups }) =>
                      groups.map(g => (
                        <option key={`${dept}-${g}`} value={`${dept} — Group ${g}`}>
                          {dept} — Group {g}
                        </option>
                      ))
                    )}
                  </Select>
                )}
              </Field>
              {ppeGivenOutN > 0 && ppeGivenPcs > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-sunken px-4 py-2.5">
                  <p className="text-xs font-bold text-ink-secondary">Giving out</p>
                  <p className="text-lg font-bold tnum text-ink-primary">
                    {fmt(ppeGivenPcs)} {ppeUnit(material)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Remarks */}
      <Card padded className="space-y-2">
        <Field label="Remarks (optional)">
          {p => (
            <TextArea
              {...p}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={2}
              placeholder="Supplier, delivery note, condition…"
            />
          )}
        </Field>
      </Card>

      <Button onClick={handleSubmit} disabled={submitting} className="w-full h-14 text-sm font-bold">
        {submitting ? "Saving…" : "Submit — raw materials received"}
      </Button>

    </div>
  )
}
