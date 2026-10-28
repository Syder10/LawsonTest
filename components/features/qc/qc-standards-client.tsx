"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ArrowLeft,
  CheckCircle2,
  Filter,
  FlaskConical,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react"
import {
  getQcRecordType,
  QC_RECORD_TYPES,
} from "@/lib/domain/qc"
import type { QcStandardRow } from "@/lib/db/types"
import {
  Card,
  Chip,
  DataTable,
  EmptyState,
  PageHeader,
  Select,
  StatTile,
  type Column,
} from "@/components/primitives"
import { Button } from "@/components/ui/button"

const qcTypesList = Object.values(QC_RECORD_TYPES)

export function QcStandardsClient({ isManager }: { isManager: boolean }) {
  const [standards, setStandards] = useState<QcStandardRow[]>([])
  const [filterType, setFilterType] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // New standard modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newRecordType, setNewRecordType] = useState(qcTypesList[0]?.key || "treated_water_ro")
  const [newParamKey, setNewParamKey] = useState("")
  const [newParamLabel, setNewParamLabel] = useState("")
  const [newUnit, setNewUnit] = useState("")
  const [newLower, setNewLower] = useState<string>("")
  const [newUpper, setNewUpper] = useState<string>("")
  const [newReason, setNewReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch("/api/qc/standards")
      if (!res.ok) throw new Error("Failed to load standards")
      const json = await res.json()
      setStandards(json.standards ?? [])
    } catch {
      setError(true)
      toast.error("Could not load QC standards")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = standards.filter((s) => {
    if (!filterType) return true
    return s.record_type === filterType
  })

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newParamKey || !newParamLabel) {
      toast.error("Parameter key and label are required.")
      return
    }
    if (!newReason) {
      toast.error("Reason for change/creation is mandatory.")
      return
    }

    const lowerNum = newLower.trim() !== "" ? Number(newLower) : null
    const upperNum = newUpper.trim() !== "" ? Number(newUpper) : null

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/qc/standards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: newRecordType,
          parameterKey: newParamKey.trim().toLowerCase().replace(/\s+/g, "_"),
          parameterLabel: newParamLabel.trim(),
          unit: newUnit.trim() || null,
          lowerLimit: lowerNum,
          upperLimit: upperNum,
          isInclusive: true,
          reason: newReason.trim(),
        }),
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || "Failed to create standard")
      }

      toast.success("Standard configured successfully")
      setShowAddModal(false)
      setNewParamKey("")
      setNewParamLabel("")
      setNewUnit("")
      setNewLower("")
      setNewUpper("")
      setNewReason("")
      load()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error saving standard")
    } finally {
      setIsSubmitting(false)
    }
  }

  const columns: Column<QcStandardRow>[] = [
    {
      key: "record_type",
      header: "Category & Test Type",
      cell: (s) => {
        const typeDef = getQcRecordType(s.record_type)
        return (
          <div className="flex flex-col">
            <span className="font-medium text-ink-primary">
              {typeDef?.label ?? s.record_type}
            </span>
            <span className="text-xs uppercase tracking-wider text-ink-muted">
              {typeDef?.category ?? "General"}
            </span>
          </div>
        )
      },
    },
    {
      key: "parameter_label",
      header: "Parameter",
      cell: (s) => (
        <div className="flex flex-col">
          <span className="font-semibold text-ink-primary">{s.parameter_label}</span>
          <span className="font-mono text-xs text-ink-muted">{s.parameter_key}</span>
        </div>
      ),
    },
    {
      key: "range",
      header: "Allowed Standard Range",
      cell: (s) => {
        const hasRange = s.lower_limit != null || s.upper_limit != null
        if (!hasRange) {
          return <span className="text-xs italic text-ink-muted">Qualitative / Visual</span>
        }
        return (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-base px-2.5 py-1 text-sm font-semibold text-ink-primary">
            {s.lower_limit != null && s.upper_limit != null ? (
              <span>
                {s.lower_limit} – {s.upper_limit}
              </span>
            ) : s.lower_limit != null ? (
              <span>≥ {s.lower_limit}</span>
            ) : (
              <span>≤ {s.upper_limit}</span>
            )}
            {s.unit && <span className="font-normal text-ink-muted">{s.unit}</span>}
          </div>
        )
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <Chip tone={s.is_active ? "good" : "neutral"}>
          {s.is_active ? "Active Rule" : "Inactive"}
        </Chip>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="QC Reference Standards"
          description="Active quality benchmarks and reference limits governing automatic compliance evaluation."
        />
        <div className="flex items-center gap-2">
          <Link href="/dashboard/qc">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              QC Home
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {isManager && (
            <Button
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="gap-2 bg-brand-primary text-white hover:bg-brand-secondary"
            >
              <Plus className="h-4 w-4" />
              Configure Standard
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Total Standards"
          value={standards.length}
          icon={<SlidersHorizontal className="h-4 w-4" />}
          accent="brand"
        />
        <StatTile
          label="Active Benchmarks"
          value={standards.filter((s) => s.is_active).length}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="good"
        />
        <StatTile
          label="Record Types Covered"
          value={new Set(standards.map((s) => s.record_type)).size}
          icon={<Layers className="h-4 w-4" />}
          accent="warning"
        />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-ink-muted" />
            <span className="text-sm font-medium text-ink-primary">Filter by Record Type:</span>
            <div className="w-64">
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All Record Types ({standards.length})</option>
                {qcTypesList.map((rt) => (
                  <option key={rt.key} value={rt.key}>
                    {rt.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {filterType && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterType("")}
              className="text-xs text-ink-muted hover:text-ink-primary"
            >
              Reset filter
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
          </div>
        ) : error ? (
          <EmptyState
            title="Failed to load standards"
            description="There was a problem retrieving QC reference standards."
            action={
              <Button variant="outline" size="sm" onClick={load}>
                Retry
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No standards found"
            description="No standards match the selected criteria."
          />
        ) : (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(s) => s.id}
          />
        )}
      </Card>

      {/* Modal for adding/configuring a new standard */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-border-subtle bg-surface-card p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-brand-primary" />
                <h3 className="text-lg font-bold text-ink-primary">Configure Standard Benchmark</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-elevated hover:text-ink-primary"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitNew} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink-primary">Record Type</label>
                <Select
                  value={newRecordType}
                  onChange={(e) => setNewRecordType(e.target.value)}
                >
                  {qcTypesList.map((rt) => (
                    <option key={rt.key} value={rt.key}>
                      [{rt.category.toUpperCase()}] {rt.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-primary">
                    Parameter Label <span className="text-critical">*</span>
                  </label>
                  <input
                    type="text"
                    value={newParamLabel}
                    onChange={(e) => {
                      setNewParamLabel(e.target.value)
                      if (!newParamKey) {
                        setNewParamKey(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "_"))
                      }
                    }}
                    placeholder="e.g. pH Level"
                    className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                    required
                  />
                  <p className="mt-0.5 text-xs text-ink-muted">e.g. pH at 25°C</p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-primary">
                    Parameter Key <span className="text-critical">*</span>
                  </label>
                  <input
                    type="text"
                    value={newParamKey}
                    onChange={(e) => setNewParamKey(e.target.value)}
                    placeholder="e.g. ph"
                    className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 font-mono text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                    required
                  />
                  <p className="mt-0.5 text-xs text-ink-muted">Unique machine key</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-primary">Unit</label>
                  <input
                    type="text"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="e.g. ppm, %"
                    className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-primary">Min / Lower</label>
                  <input
                    type="number"
                    step="any"
                    value={newLower}
                    onChange={(e) => setNewLower(e.target.value)}
                    placeholder="None"
                    className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-primary">Max / Upper</label>
                  <input
                    type="number"
                    step="any"
                    value={newUpper}
                    onChange={(e) => setNewUpper(e.target.value)}
                    placeholder="None"
                    className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-ink-primary">
                  Reason for Configuration / Change <span className="text-critical">*</span>
                </label>
                <textarea
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="Mandatory audit explanation for establishing or updating this standard..."
                  rows={3}
                  className="w-full rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm text-ink-primary focus:border-brand-primary focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-border-subtle pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-brand-primary text-white hover:bg-brand-secondary"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Standard"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
