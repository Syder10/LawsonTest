"use client"

import { useState, useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import Link from "next/link"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import {
  STAMP_COILS_PER_BOX, STAMP_PCS_PER_COIL, STAMP_PCS_PER_BOX, TAPE_PCS_PER_BOX,
  PPE_TYPES, pcsPerBox, type MaterialType,
} from "@/lib/domain/materials"

const MATERIALS: { type: MaterialType; label: string; color: string; bg: string }[] = [
  { type: "tax_stamp",      label: "Tax Stamps",        color: "text-violet-700", bg: "bg-violet-50 border-violet-300"  },
  { type: "carton_bitters", label: "Cartons — Bitters", color: "text-slate-700",  bg: "bg-slate-50 border-slate-300"   },
  { type: "carton_ginger",  label: "Cartons — Ginger",  color: "text-amber-700",  bg: "bg-amber-50 border-amber-300"   },
  { type: "seal_tape",      label: "Seal Tapes",        color: "text-sky-700",    bg: "bg-sky-50 border-sky-300"       },
  { type: "hair_net",       label: "Hair Nets",         color: "text-pink-700",   bg: "bg-pink-50 border-pink-300"     },
  { type: "nose_mask",      label: "Nose Masks",        color: "text-teal-700",   bg: "bg-teal-50 border-teal-300"     },
  { type: "gloves",         label: "Gloves",            color: "text-orange-700", bg: "bg-orange-50 border-orange-300" },
]

const DEPT_GROUPS: { dept: string; groups: number[] }[] = [
  { dept: "Blowing",              groups: [1, 2, 3] },
  { dept: "Alcohol and Blending", groups: [1, 2]    },
  { dept: "Filling Line",         groups: [1, 2, 3] },
  { dept: "Packaging",            groups: [1, 2, 3] },
  { dept: "Concentrate",          groups: [1, 2, 3] },
]

const GIVEN_OUT_UNITS = ["Boxes", "Packs"]

function todayStr() { return new Date().toISOString().split("T")[0] }
function fmt(n: number) { return n.toLocaleString() }

function ppeUnit(t: MaterialType): string {
  if (t === "seal_tape") return "pcs"
  return "packs"
}

function ppeBgColor(t: MaterialType): string {
  if (t === "seal_tape") return "bg-sky-50 border-sky-200 text-sky-700"
  if (t === "hair_net")  return "bg-pink-50 border-pink-200 text-pink-700"
  if (t === "nose_mask") return "bg-teal-50 border-teal-200 text-teal-700"
  if (t === "gloves")    return "bg-orange-50 border-orange-200 text-orange-700"
  return ""
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
  }, [])

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
  const inp  = "w-full h-11 px-3 text-sm font-medium rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
  const sel  = "w-full h-11 px-3 text-sm font-medium rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:outline-none appearance-none transition-all"

  return (
    <div className="space-y-5 max-w-xl mx-auto animate-fade-in-up">

      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard"
          className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-xl font-black tracking-tight text-emerald-950">Submit Raw Materials</h2>
          <p className="text-emerald-700/70 font-medium mt-0.5 text-xs">Log incoming stock</p>
        </div>
      </div>

      {/* Success */}
      {submitted && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <p className="font-bold text-emerald-800 text-sm flex-1">Submitted — stock updated</p>
          <button onClick={() => setSubmitted(false)} className="text-xs font-bold text-emerald-600 underline shrink-0">
            Submit another
          </button>
        </div>
      )}

      {/* Date + received by */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Entry Details</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">Date *</label>
            <input type="date" value={date} max={todayStr()} onChange={e => setDate(e.target.value)} className={inp} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600">Received by</label>
            <input type="text" value={userName} readOnly
              className="w-full h-11 px-3 text-sm font-medium rounded-xl border border-slate-100 bg-slate-50 text-slate-400" />
          </div>
        </div>
      </div>

      {/* Material selector */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Material Type *</p>
        <div className="grid grid-cols-2 gap-2">
          {MATERIALS.map(m => {
            const on = material === m.type
            return (
              <button key={m.type} onClick={() => switchMaterial(m.type)}
                className={`px-4 py-3 rounded-xl border-2 text-left text-sm font-bold transition-all
                  ${on ? `${m.bg} ${m.color}` : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}>
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Quantity fields */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
        <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${meta.color}`}>{meta.label}</p>

        {/* ── TAX STAMPS — boxes only, system calculates coils + pcs ── */}
        {material === "tax_stamp" && (
          <div className="space-y-4">
            <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5 text-[10px] text-violet-700 font-semibold space-y-0.5">
              <p>1 box = {STAMP_COILS_PER_BOX} coils &nbsp;·&nbsp; 1 coil = {fmt(STAMP_PCS_PER_COIL)} pcs</p>
              <p>Bitters = 9 stamps/carton &nbsp;·&nbsp; Ginger = 6 stamps/carton</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">Boxes received *</label>
              <input type="number" min="0" placeholder="0" value={stampBoxes}
                onChange={e => setStampBoxes(e.target.value)} inputMode="numeric" className={inp} />
            </div>
            {stampBoxesN > 0 && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-violet-50 border border-violet-100 rounded-xl py-3 px-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-violet-400">Boxes</p>
                  <p className="text-xl font-black text-violet-700 tabular-nums mt-1">{stampBoxesN}</p>
                </div>
                <div className="bg-violet-50 border border-violet-100 rounded-xl py-3 px-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-violet-400">Coils</p>
                  <p className="text-xl font-black text-violet-700 tabular-nums mt-1">{fmt(stampCoils)}</p>
                </div>
                <div className="bg-violet-50 border border-violet-100 rounded-xl py-3 px-3 text-center">
                  <p className="text-[9px] font-black uppercase tracking-wider text-violet-400">Pcs</p>
                  <p className="text-xl font-black text-violet-700 tabular-nums mt-1">{fmt(stampPcs)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CARTONS — pcs only ── */}
        {(material === "carton_bitters" || material === "carton_ginger") && (
          <div className="space-y-3">
            <div className={`border rounded-xl px-4 py-2.5 text-[10px] font-semibold
              ${material === "carton_bitters" ? "bg-slate-50 border-slate-200 text-slate-500" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
              Enter total carton pieces received
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">Quantity received (pcs) *</label>
              <input type="number" min="0" placeholder="0" value={cartonPcs}
                onChange={e => setCartonPcs(e.target.value)} inputMode="numeric" className={inp} />
            </div>
            {Number(cartonPcs) > 0 && (
              <div className={`border rounded-xl px-4 py-2.5 flex items-center justify-between
                ${material === "carton_bitters" ? "bg-slate-50 border-slate-200" : "bg-amber-50 border-amber-200"}`}>
                <p className="text-xs font-bold text-slate-500">Total to add</p>
                <p className="text-lg font-black text-slate-700 tabular-nums">{fmt(Number(cartonPcs))} pcs</p>
              </div>
            )}
          </div>
        )}

        {/* ── PPE (seal tape, hair net, nose mask, gloves) — received + given out ── */}
        {PPE_TYPES.includes(material) && (
          <div className="space-y-4">
            {/* Info banner */}
            <div className={`border rounded-xl px-4 py-2.5 text-[10px] font-semibold ${ppeBgColor(material)}`}>
              {material === "seal_tape"  && `1 box = ${TAPE_PCS_PER_BOX} pcs`}
              {material === "hair_net"   && `1 box = ${pcsPerBox("hair_net")} packs`}
              {material === "nose_mask"  && `1 box = ${pcsPerBox("nose_mask")} packs`}
              {material === "gloves"     && `1 box = ${pcsPerBox("gloves")} packs`}
            </div>

            {/* Boxes received */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600">Boxes received</label>
              <input type="number" min="0" placeholder="0" value={ppeBoxesIn}
                onChange={e => setPpeBoxesIn(e.target.value)} inputMode="numeric" className={inp} />
              {ppeBoxesN > 0 && (
                <p className="text-[10px] font-semibold text-slate-400 pl-1">
                  = {fmt(ppePcsIn)} {ppeUnit(material)} received
                </p>
              )}
            </div>

            <div className="border-t border-slate-100" />

            {/* Given out */}
            <div className="space-y-3">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Given Out (optional)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">Quantity given out</label>
                  <input type="number" min="0" placeholder="0" value={ppeGivenOut}
                    onChange={e => setPpeGivenOut(e.target.value)} inputMode="numeric" className={inp} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">Unit</label>
                  <select value={ppeGivenUnit} onChange={e => setPpeGivenUnit(e.target.value)} className={sel}>
                    {GIVEN_OUT_UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">Given to (Department — Group)</label>
                <select value={ppeGivenTo} onChange={e => setPpeGivenTo(e.target.value)} className={sel}>
                  <option value="">Select recipient…</option>
                  {DEPT_GROUPS.flatMap(({ dept, groups }) =>
                    groups.map(g => (
                      <option key={`${dept}-${g}`} value={`${dept} — Group ${g}`}>
                        {dept} — Group {g}
                      </option>
                    ))
                  )}
                </select>
              </div>
              {ppeGivenOutN > 0 && ppeGivenPcs > 0 && (
                <div className={`border rounded-xl px-4 py-2.5 flex items-center justify-between ${ppeBgColor(material)}`}>
                  <p className="text-xs font-bold opacity-70">Giving out</p>
                  <p className="text-lg font-black tabular-nums">
                    {fmt(ppeGivenPcs)} {ppeUnit(material)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Remarks */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-2">
        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Remarks (optional)</label>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2}
          placeholder="Supplier, delivery note, condition…"
          className="w-full px-3 py-2.5 text-sm font-medium rounded-xl border border-slate-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all resize-none" />
      </div>

      <button onClick={handleSubmit} disabled={submitting}
        className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm tracking-wide transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed">
        {submitting ? "Saving…" : "Submit — Raw Materials Received"}
      </button>

    </div>
  )
}
