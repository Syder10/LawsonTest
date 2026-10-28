"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { PRODUCTS } from "@/lib/domain/record-types"
import { SHIFT_ORDER, shiftDateFor } from "@/lib/shift-config"
import { validateDonation, type DonationInput } from "@/lib/domain/donations"
import type { Product, Shift } from "@/lib/db/types"
import { Card, Eyebrow, Field, NumberInput, PageHeader, Select, TextArea, TextInput } from "@/components/primitives"
import { Button } from "@/components/ui/button"

export function DonationForm() {
  const router = useRouter()
  const [shift, setShift] = useState<Shift>("Morning")
  const [date, setDate] = useState(() => shiftDateFor("Morning"))
  const [product, setProduct] = useState<Product>("Bitters")
  const [cartons, setCartons] = useState<string>("")
  const [recipient, setRecipient] = useState<string>("")
  const [remarks, setRemarks] = useState<string>("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const build = (): Partial<DonationInput> => ({
    date,
    shift,
    product,
    cartons: Number(cartons),
    recipient: recipient.trim(),
    remarks: remarks.trim() || null,
  })

  const submit = async () => {
    const input = build()
    const check = validateDonation(input)

    if (!check.ok) {
      setErrors(check.errors)
      toast.error("Please fix the highlighted fields.")
      return
    }

    setErrors({})
    setSaving(true)
    try {
      const res = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to record donation")
      toast.success("Donation recorded")
      router.push("/dashboard/stock/donations")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record donation")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5 max-w-xl mx-auto animate-fade-in-up">
      <PageHeader
        title="Record product donation"
        description="Log promotional cartons, CSR donations, or management samples"
        backHref="/dashboard/stock/donations"
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
        <Eyebrow>Product & Quantity</Eyebrow>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Product" required error={errors.product}>
            {(p) => (
              <Select
                {...p}
                value={product}
                onChange={(e) => setProduct(e.target.value as Product)}
              >
                {PRODUCTS.map((prod) => (
                  <option key={prod} value={prod}>{prod}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Cartons" required error={errors.cartons}>
            {(p) => (
              <NumberInput
                {...p}
                placeholder="0"
                value={cartons}
                onChange={(e) => setCartons(e.target.value)}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card padded className="space-y-4">
        <Eyebrow>Beneficiary / Purpose</Eyebrow>
        <Field label="Recipient or Event" required hint="e.g. Festival Sponsorship, Di Asa, Media Samples, VIP" error={errors.recipient}>
          {(p) => (
            <TextInput
              {...p}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="e.g. Odwira Festival Committee / TV3 Di Asa"
            />
          )}
        </Field>

        <Field label="Remarks (optional)">
          {(p) => (
            <TextArea
              {...p}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Management approval ref, special delivery notes, etc."
            />
          )}
        </Field>
      </Card>

      <Button onClick={submit} disabled={saving} className="w-full h-14 text-sm font-bold">
        {saving ? "Saving…" : "Record donation"}
      </Button>
    </div>
  )
}
