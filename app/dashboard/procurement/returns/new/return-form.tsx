"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PRODUCTS } from "@/lib/domain/record-types"
import { SHIFT_ORDER, shiftDateFor } from "@/lib/shift-config"
import { DISPATCH_BRANCHES } from "@/lib/domain/dispatch"
import { validateProductReturn, type ProductReturnInput } from "@/lib/domain/product-returns"
import type { Product, Shift } from "@/lib/db/types"
import { Card, Eyebrow, Field, NumberInput, PageHeader, Select, TextArea, TextInput } from "@/components/primitives"
import { Button } from "@/components/ui/button"

const OTHER_VALUE = "__OTHER__"

export function ReturnForm() {
  const router = useRouter()
  const [shift, setShift] = useState<Shift>("Morning")
  const [date, setDate] = useState(() => shiftDateFor("Morning"))
  const [branchSelection, setBranchSelection] = useState<string>("")
  const [customSource, setCustomSource] = useState<string>("")
  const [vehicleReg, setVehicleReg] = useState("")
  const [driverName, setDriverName] = useState("")
  const [remarks, setRemarks] = useState("")
  const [cartons, setCartons] = useState<Record<Product, string>>(
    () => Object.fromEntries(PRODUCTS.map((p) => [p, ""])) as Record<Product, string>,
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const resolvedSource = branchSelection === OTHER_VALUE ? customSource.trim() : branchSelection

  const build = (): Partial<ProductReturnInput> => ({
    date,
    shift,
    returnedFrom: resolvedSource || null,
    vehicleReg: vehicleReg.trim() || null,
    driverName: driverName.trim() || null,
    remarks: remarks.trim() || null,
    lines: PRODUCTS.map((p) => ({ product: p, cartons: Number(cartons[p] || 0) })),
  })

  const total = PRODUCTS.reduce((s, p) => s + (Number(cartons[p]) || 0), 0)

  const submit = async () => {
    const input = build()
    const check = validateProductReturn(input)
    const newErrors = { ...check.errors }

    if (branchSelection === OTHER_VALUE && !customSource.trim()) {
      newErrors.returnedFrom = "Please enter the branch or source name."
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      toast.error("Please fix the highlighted fields.")
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to record return")
      toast.success("Product return recorded")
      router.push("/dashboard/procurement/returns")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record return")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-xl mx-auto animate-fade-in-up">
      <PageHeader
        title="Record product return"
        description="Log finished goods returned to warehouse stock"
        backHref="/dashboard/procurement/returns"
      />

      <Card padded className="space-y-4">
        <Eyebrow>Shift and Date</Eyebrow>
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
          <Field label="Date" required hint="Day the shift started." error={errors.date}>
            {(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
      </Card>

      <Card padded className="space-y-4">
        <Eyebrow>Source & Vehicle</Eyebrow>
        <Field label="Branch / Source" required error={errors.returnedFrom}>
          {(p) => (
            <Select
              {...p}
              value={branchSelection}
              onChange={(e) => {
                setBranchSelection(e.target.value)
                if (errors.returnedFrom) {
                  setErrors((prev) => {
                    const copy = { ...prev }
                    delete copy.returnedFrom
                    return copy
                  })
                }
              }}
            >
              <option value="">Select branch or source...</option>
              {DISPATCH_BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
              <option value={OTHER_VALUE}>Other (enter text below)...</option>
            </Select>
          )}
        </Field>

        {branchSelection === OTHER_VALUE && (
          <Field label="Specify other source / location" required error={errors.returnedFrom}>
            {(p) => (
              <TextInput
                {...p}
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                placeholder="e.g. Kumasi Depot, Retail Partner, etc."
                autoFocus
              />
            )}
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Car / Vehicle registration" error={errors.vehicleReg}>
            {(p) => (
              <TextInput
                {...p}
                value={vehicleReg}
                onChange={(e) => setVehicleReg(e.target.value)}
                placeholder="e.g. GT-1234-24"
              />
            )}
          </Field>
          <Field label="Driver" error={errors.driverName}>
            {(p) => (
              <TextInput
                {...p}
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Driver full name"
              />
            )}
          </Field>
        </div>
      </Card>

      <Card padded className="space-y-4">
        <Eyebrow>Cartons Returned</Eyebrow>
        {errors.lines && <p className="text-xs font-semibold text-critical-ink">{errors.lines}</p>}
        <div className="grid grid-cols-2 gap-3">
          {PRODUCTS.map((product) => (
            <Field key={product} label={`${product} (cartons)`} error={errors[`cartons_${product}`]}>
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
            <p className="text-xs font-bold text-ink-secondary">Total returned</p>
            <p className="text-lg font-bold tnum text-ink-primary">{total.toLocaleString()} cartons</p>
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
              placeholder="Reason for return, condition of goods, waybill ref, etc."
            />
          )}
        </Field>
      </Card>

      <Button onClick={submit} disabled={saving} className="w-full h-14 text-sm font-bold">
        {saving ? "Saving…" : "Record product return"}
      </Button>
    </div>
  )
}
