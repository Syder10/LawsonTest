"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Droplet,
  FlaskConical,
  Layers,
} from "lucide-react"
import {
  evaluateQcValue,
  QC_CATEGORIES,
  QC_RECORD_TYPES,
  QC_STATUS_CONFIG,
  type QcCategory,
  type QcRecordTypeDef,
  type QcStatus,
} from "@/lib/domain/qc"
import type { QcStandardRow } from "@/lib/db/types"
import { Card, Chip, Field, NumberInput, PageHeader, Select, TextInput } from "@/components/primitives"
import { Button } from "@/components/ui/button"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export function QcRecordForm() {
  const router = useRouter()
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const currentTimeStr = now.toTimeString().slice(0, 5)
  const currentDayName = DAY_NAMES[now.getDay()]

  const [category, setCategory] = useState<QcCategory>("water")
  const [recordTypeKey, setRecordTypeKey] = useState<string>("treated_water_ro")
  const [testDate, setTestDate] = useState(todayStr)
  const [testTime, setTestTime] = useState(currentTimeStr)
  const [dayName, setDayName] = useState(currentDayName)
  const [batchNo, setBatchNo] = useState("")
  const [supplier, setSupplier] = useState("")
  const [origin, setOrigin] = useState("")
  const [checkedBy, setCheckedBy] = useState("")

  const [formData, setFormData] = useState<Record<string, string>>({})
  const [standards, setStandards] = useState<QcStandardRow[]>([])
  const [saving, setSaving] = useState(false)

  // Fetch standards for live preview evaluation
  useEffect(() => {
    async function loadStandards() {
      try {
        const res = await fetch("/api/qc/standards")
        if (res.ok) {
          const json = await res.json()
          setStandards(json.standards || [])
        }
      } catch {
        // silently fallback
      }
    }
    loadStandards()
  }, [])

  const currentDef: QcRecordTypeDef = QC_RECORD_TYPES[recordTypeKey] || QC_RECORD_TYPES.treated_water_ro

  // When category changes, default to first record type of that category
  const handleCategoryChange = (cat: QcCategory) => {
    setCategory(cat)
    const firstType = Object.values(QC_RECORD_TYPES).find((t) => t.category === cat)
    if (firstType) {
      setRecordTypeKey(firstType.key)
      setFormData({})
    }
  }

  const handleRecordTypeChange = (typeKey: string) => {
    setRecordTypeKey(typeKey)
    setFormData({})
  }

  // Find standard for a parameter key
  const standardFor = (paramKey: string) =>
    standards.find((s) => s.record_type === recordTypeKey && s.parameter_key === paramKey && s.is_active)

  // Live evaluation for a numeric parameter
  const getParamEvaluation = (paramKey: string, valStr: string): QcStatus => {
    const std = standardFor(paramKey)
    if (!valStr || valStr.trim() === "") return "incomplete"
    const num = Number(valStr)
    return evaluateQcValue(
      num,
      std
        ? {
            lowerLimit: std.lower_limit !== null ? Number(std.lower_limit) : null,
            upperLimit: std.upper_limit !== null ? Number(std.upper_limit) : null,
            isInclusive: std.is_inclusive,
          }
        : null,
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    for (const field of currentDef.fields) {
      if (field.required && (!formData[field.key] || formData[field.key].trim() === "")) {
        toast.error(`${field.label} is required.`)
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        recordType: recordTypeKey,
        testDate,
        testTime,
        dayName,
        batchNo: batchNo.trim() || undefined,
        supplier: supplier.trim() || undefined,
        origin: origin.trim() || undefined,
        checkedBy: checkedBy.trim() || undefined,
        parameters: formData,
      }

      const res = await fetch("/api/qc/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to submit QC record")

      toast.success(`Record submitted successfully: ${json.recordReference}`)
      router.push("/dashboard/qc/history")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save record")
    } finally {
      setSaving(false)
    }
  }

  const categoryTypes = Object.values(QC_RECORD_TYPES).filter((t) => t.category === category)

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-fade-in-up pb-16">
      <PageHeader
        title="Record Quality Inspection"
        description="Enter measurements and test results for compliance evaluation against QC standards"
        backHref="/dashboard/qc"
        backLabel="Back to QC Dashboard"
      />

      {/* Category Selection Tabs */}
      <div className="bg-surface-card rounded-2xl border border-hairline p-1.5 flex gap-1">
        {QC_CATEGORIES.map((cat) => {
          const active = category === cat.key
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => handleCategoryChange(cat.key)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                active
                  ? "bg-brand-solid text-brand-ink shadow-sm"
                  : "text-ink-secondary hover:text-ink-primary hover:bg-surface-sunken"
              }`}
            >
              {cat.key === "water" && <Droplet className="w-4 h-4" />}
              {cat.key === "product" && <FlaskConical className="w-4 h-4" />}
              {cat.key === "raw_materials" && <Layers className="w-4 h-4" />}
              {cat.label}
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Record Type and Timing */}
        <Card padded className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Inspection / Record Type" required>
              {(p) => (
                <Select
                  {...p}
                  value={recordTypeKey}
                  onChange={(e) => handleRecordTypeChange(e.target.value)}
                >
                  {categoryTypes.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.subgroup ? `[${t.subgroup}] ${t.label}` : t.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="Day of Week">
              {(p) => (
                <Select {...p} value={dayName} onChange={(e) => setDayName(e.target.value)}>
                  {DAY_NAMES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Test Date" required>
              {(p) => (
                <TextInput
                  {...p}
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                />
              )}
            </Field>
            <Field label="Test Time" required>
              {(p) => (
                <TextInput
                  {...p}
                  type="time"
                  value={testTime}
                  onChange={(e) => setTestTime(e.target.value)}
                />
              )}
            </Field>
          </div>

          {/* Contextual identifiers */}
          {(currentDef.category === "product" || recordTypeKey === "raw_ethanol") && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-hairline">
              <Field label="Batch Number" required={currentDef.category === "product"}>
                {(p) => (
                  <TextInput
                    {...p}
                    placeholder="e.g. B-2026-0715"
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                  />
                )}
              </Field>

              {recordTypeKey === "raw_ethanol" && (
                <>
                  <Field label="Supplier">
                    {(p) => (
                      <TextInput
                        {...p}
                        placeholder="Supplier name"
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Country / Origin">
                    {(p) => (
                      <TextInput
                        {...p}
                        placeholder="e.g. Brazil / Local"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field label="Checked By">
                    {(p) => (
                      <TextInput
                        {...p}
                        placeholder="Officer / Inspector"
                        value={checkedBy}
                        onChange={(e) => setCheckedBy(e.target.value)}
                      />
                    )}
                  </Field>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Dynamic Measurement Fields */}
        <Card padded className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-hairline">
            <div>
              <h3 className="text-sm font-bold text-ink-primary">{currentDef.label} Measurements</h3>
              <p className="text-xs text-ink-secondary">
                Values will be automatically checked against active QC standards.
              </p>
            </div>
            <Chip tone="neutral">{currentDef.fields.length} Parameters</Chip>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {currentDef.fields.map((field) => {
              const val = formData[field.key] || ""
              const std = standardFor(field.key)
              const status = field.type === "number" ? getParamEvaluation(field.key, val) : null
              const statusCfg = status ? QC_STATUS_CONFIG[status] : null

              return (
                <div
                  key={field.key}
                  className="p-3.5 rounded-xl border border-hairline bg-surface-sunken space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-ink-primary">
                      {field.label}
                      {field.required && <span className="text-critical ml-0.5">*</span>}
                      {field.unit && (
                        <span className="text-ink-muted font-normal ml-1">({field.unit})</span>
                      )}
                    </label>

                    {std && (
                      <span className="text-[10px] font-semibold text-brand-solid bg-brand-solid/10 px-2 py-0.5 rounded-md">
                        Std: {std.expression || `${std.lower_limit ?? "—"} to ${std.upper_limit ?? "—"}`}
                      </span>
                    )}
                  </div>

                  {field.type === "number" ? (
                    <NumberInput
                      placeholder="0.00"
                      value={val}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  ) : (
                    <TextInput
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      value={val}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  )}

                  {/* Live Status Feedback */}
                  {statusCfg && val.trim() !== "" && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className={`w-2 h-2 rounded-full ${statusCfg.dotClass}`} />
                      <span className={`text-[11px] font-bold ${statusCfg.textClass}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Action Button */}
        <Button
          type="submit"
          disabled={saving}
          className="w-full h-14 text-sm font-bold bg-brand-solid text-brand-ink hover:bg-brand-solid-hover"
        >
          {saving ? "Evaluating & Submitting…" : "Submit QC Record"}
        </Button>
      </form>
    </div>
  )
}
