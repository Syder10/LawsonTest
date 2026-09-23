"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PRODUCTS } from "@/lib/domain/record-types"
import { SHIFT_ORDER, shiftDateFor } from "@/lib/shift-config"
import { validateDispatch, type DispatchInput } from "@/lib/domain/dispatch"
import type { Product, Shift } from "@/lib/db/types"
import { Card, Eyebrow, Field, NumberInput, PageHeader, Select, TextArea, TextInput } from "@/components/primitives"
import { Button } from "@/components/ui/button"

// Dispatch entry. Fields and lines are validated with the same validateDispatch
// the API re-runs, so the form cannot pass something the route would reject.
// Dated by the day the shift started (shiftDateFor), like every record here.
export function DispatchForm() {
  const router = useRouter()
  const [shift, setShift] = useState<Shift>("Morning")
  const [date, setDate] = useState(() => shiftDateFor("Morning"))
  const [vehicleReg, setVehicleReg] = useState("")
  const [driverName, setDriverName] = useState("")
  const [destination, setDestination] = useState("")
  const [waybill, setWaybill] = useState("")
  const [remarks, setRemarks] = useState("")
  const [cartons, setCartons] = useState<Record<Product, string>>(
    () => Object.fromEntries(PRODUCTS.map((p) => [p, ""])) as Record<Product, string>,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const build = (): Partial<DispatchInput> => ({
    date,
    shift,
    vehicleReg,
    driverName,
    destination,
    waybillNumber: waybill || null,
    remarks: remarks || null,
    lines: PRODUCTS.map((p) => ({ product: p, cartons: Number(cartons[p] || 0) })),
  })

  const total = PRODUCTS.reduce((s, p) => s + (Number(cartons[p]) || 0), 0)

  const submit = async () => {
    const input = build()
    const check = validateDispatch(input)
    if (!check.ok) {
      setErrors(check.errors)
      toast.error("Please fix the highlighted fields.")
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to record dispatch")
      toast.success("Dispatch recorded")
      router.push("/dashboard/procurement/dispatch")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record dispatch")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-xl mx-auto animate-fade-in-up">
      <PageHeader title="New dispatch" description="Log an outbound load" backHref="/dashboard/procurement/dispatch" />

      <Card padded className="space-y-4">
        <Eyebrow>Shift</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shift" required error={errors.shift}>
            {(p) => (
              <Select
                {...p}
                value={shift}
                onChange={(e) => {
                  const s = e.target.value as Shift
                  setShift(s)
                  setDate(shiftDateFor(s))
                }}
              >
                {SHIFT_ORDER.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date" required hint="The day the shift started." error={errors.date}>
            {(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
      </Card>

      <Card padded className="space-y-4">
        <Eyebrow>Vehicle and destination</Eyebrow>
        <Field label="Vehicle registration" required error={errors.vehicleReg}>
          {(p) => <TextInput {...p} value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} placeholder="e.g. GT-1234-24" />}
        </Field>
        <Field label="Driver name" required error={errors.driverName}>
          {(p) => <TextInput {...p} value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Full name" />}
        </Field>
        <Field label="Destination" required error={errors.destination}>
          {(p) => <TextInput {...p} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Where the load is going" />}
        </Field>
        <Field label="Waybill number" hint="Optional. Must be unique where given." error={errors.waybill}>
          {(p) => <TextInput {...p} value={waybill} onChange={(e) => setWaybill(e.target.value)} placeholder="Document number" />}
        </Field>
      </Card>

      <Card padded className="space-y-4">
        <Eyebrow>Cartons loaded</Eyebrow>
        {errors.lines && <p className="text-xs font-semibold text-critical-ink">{errors.lines}</p>}
        <div className="grid grid-cols-2 gap-3">
          {PRODUCTS.map((product) => (
            <Field key={product} label={product} error={errors[`cartons_${product}`]}>
              {(p) => (
                <NumberInput
                  {...p}
                  placeholder="0"
                  value={cartons[product]}
                  onChange={(e) => setCartons((c) => ({ ...c, [product]: e.target.value }))}
                />
              )}
            </Field>
          ))}
        </div>
        {total > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-sunken px-4 py-2.5">
            <p className="text-xs font-bold text-ink-secondary">Total cartons</p>
            <p className="text-lg font-bold tnum text-ink-primary">{total.toLocaleString()}</p>
          </div>
        )}
      </Card>

      <Card padded className="space-y-2">
        <Field label="Remarks (optional)">
          {(p) => (
            <TextArea
              {...p}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Anything worth noting about this load"
            />
          )}
        </Field>
      </Card>

      <Button onClick={submit} disabled={saving} className="w-full h-14 text-sm font-bold">
        {saving ? "Saving…" : "Record dispatch"}
      </Button>
    </div>
  )
}
