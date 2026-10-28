"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  Edit3,
  FileCheck2,
  FlaskConical,
  History,
  Loader2,
  Printer,
  ShieldAlert,
  ShieldCheck,
  User,
} from "lucide-react"
import {
  getQcRecordType,
  QC_STATUS_CONFIG,
  type QcRecordTypeDef,
  type QcStatus,
} from "@/lib/domain/qc"
import type { QcRecordAmendmentRow, QcRecordResultRow, QcRecordRow } from "@/lib/db/types"
import { Card, Chip, DataTable, EmptyState, PageHeader, type Column } from "@/components/primitives"
import { Button } from "@/components/ui/button"

export function QcDetailClient({ recordId }: { recordId: string }) {
  const router = useRouter()
  const [record, setRecord] = useState<QcRecordRow | null>(null)
  const [results, setResults] = useState<QcRecordResultRow[]>([])
  const [amendments, setAmendments] = useState<QcRecordAmendmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Amendment modal state
  const [isAmending, setIsAmending] = useState(false)
  const [amendField, setAmendField] = useState("")
  const [amendOldVal, setAmendOldVal] = useState("")
  const [amendNewVal, setAmendNewVal] = useState("")
  const [amendReason, setAmendReason] = useState("")
  const [savingAmend, setSavingAmend] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/qc/records/${recordId}`)
      if (!res.ok) throw new Error("Record not found")
      const json = await res.json()
      setRecord(json.record)
      setResults(json.results || [])
      setAmendments(json.amendments || [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [recordId])

  useEffect(() => {
    load()
  }, [load])

  const submitAmendment = async () => {
    if (!amendField || !amendNewVal.trim() || !amendReason.trim()) {
      toast.error("Please provide the field, new value, and a reason for amendment.")
      return
    }

    setSavingAmend(true)
    try {
      const res = await fetch(`/api/qc/records/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldName: amendField,
          oldValue: amendOldVal || undefined,
          newValue: amendNewVal.trim(),
          reason: amendReason.trim(),
        }),
      })

      if (!res.ok) throw new Error("Failed to save amendment")
      toast.success("Amendment logged to audit history")
      setIsAmending(false)
      setAmendNewVal("")
      setAmendReason("")
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to amend record")
    } finally {
      setSavingAmend(false)
    }
  }

  if (loading) {
    return (
      <Card padded className="py-20 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-solid" />
        <p className="text-sm font-semibold text-ink-secondary">Loading inspection record details…</p>
      </Card>
    )
  }

  if (error || !record) {
    return (
      <Card padded>
        <EmptyState
          icon={<AlertCircle className="w-6 h-6 text-critical" />}
          title="Inspection Record Not Found"
          description="The requested QC record could not be loaded or you do not have permission to view it."
          action={
            <Link
              href="/dashboard/qc/history"
              className="h-10 px-4 rounded-xl bg-brand-solid text-brand-ink text-sm font-bold inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" /> Return to QC History
            </Link>
          }
        />
      </Card>
    )
  }

  const typeDef: QcRecordTypeDef | undefined = getQcRecordType(record.record_type)
  const statusCfg = QC_STATUS_CONFIG[record.record_status as QcStatus]

  const resultColumns: Column<QcRecordResultRow>[] = [
    {
      key: "parameter",
      header: "Test Parameter",
      primary: true,
      cell: (r) => <span className="font-bold text-ink-primary">{r.parameter_label}</span>,
    },
    {
      key: "value",
      header: "Recorded Value",
      cell: (r) => (
        <span className="font-black text-ink-primary tnum text-sm">
          {r.numeric_value !== null ? `${r.numeric_value} ${r.unit || ""}` : r.text_value || "—"}
        </span>
      ),
    },
    {
      key: "standard",
      header: "Approved Standard",
      cell: (r) => (
        <span className="text-xs font-semibold text-ink-secondary">
          {r.evaluation_note || "Standard not configured"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Evaluation",
      cell: (r) => {
        const cfg = QC_STATUS_CONFIG[r.evaluated_status as QcStatus]
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
              cfg?.badgeClass || "bg-surface-sunken"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${cfg?.dotClass || "bg-ink-muted"}`} />
            {cfg?.label || r.evaluated_status}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in-up pb-16">
      <PageHeader
        title={record.record_reference}
        description={`${typeDef?.label || record.record_type} · ${record.category.toUpperCase()}`}
        backHref="/dashboard/qc/history"
        backLabel="Back to QC History"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors"
            >
              <Printer className="w-3.5 h-3.5" aria-hidden="true" /> Print
            </button>
            <button
              onClick={() => {
                setAmendField(results[0]?.parameter_label || "Result")
                setAmendOldVal(String(results[0]?.numeric_value ?? results[0]?.text_value ?? ""))
                setIsAmending(true)
              }}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card text-xs font-bold text-ink-secondary hover:border-brand transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" /> Amend Record
            </button>
          </div>
        }
      />

      {/* Primary Status Banner */}
      <div
        className={`rounded-2xl border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
          statusCfg?.badgeClass || "bg-surface-card"
        }`}
      >
        <div className="flex items-center gap-3">
          {record.record_status === "in_range" ? (
            <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0" />
          ) : (
            <ShieldAlert className="w-8 h-8 text-amber-600 shrink-0" />
          )}
          <div>
            <h2 className="text-base font-black uppercase tracking-tight">
              {statusCfg?.label || record.record_status}
            </h2>
            <p className="text-xs opacity-90 mt-0.5">
              {record.record_status === "in_range"
                ? "All evaluated measurements comply with active Quality Control standards."
                : "One or more parameters deviate from approved QC reference specifications."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <Calendar className="w-4 h-4" /> {record.test_date}
          <Clock className="w-4 h-4 ml-2" /> {record.test_time}
        </div>
      </div>

      {/* Metadata Card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-surface-card p-4 rounded-xl border border-hairline">
          <span className="text-xs font-bold text-ink-secondary">Inspector / Officer</span>
          <p className="text-sm font-bold text-ink-primary mt-1">{record.submitted_by}</p>
        </div>
        <div className="bg-surface-card p-4 rounded-xl border border-hairline">
          <span className="text-xs font-bold text-ink-secondary">Day of Week</span>
          <p className="text-sm font-bold text-ink-primary mt-1">{record.day_name || "—"}</p>
        </div>
        <div className="bg-surface-card p-4 rounded-xl border border-hairline">
          <span className="text-xs font-bold text-ink-secondary">Batch / Lot</span>
          <p className="text-sm font-bold text-ink-primary mt-1">{record.batch_no || "—"}</p>
        </div>
        <div className="bg-surface-card p-4 rounded-xl border border-hairline">
          <span className="text-xs font-bold text-ink-secondary">Origin / Supplier</span>
          <p className="text-sm font-bold text-ink-primary mt-1">
            {record.origin || record.supplier || "Lawson Internal"}
          </p>
        </div>
      </div>

      {/* Evaluated Results Table */}
      <Card padded className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <div>
            <h3 className="text-sm font-bold text-ink-primary">Parameter Evaluation Breakdown</h3>
            <p className="text-xs text-ink-secondary">
              Recorded measurements evaluated against QC Manager-controlled reference ranges.
            </p>
          </div>
          <Chip tone="neutral">{results.length} Parameters</Chip>
        </div>

        <DataTable
          columns={resultColumns}
          rows={results}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              compact
              title="No parameters evaluated"
              description="This record holds no evaluated parameter rows."
            />
          }
        />
      </Card>

      {/* Amendment Audit Trail (§9 of spec) */}
      {amendments.length > 0 && (
        <Card padded className="space-y-3">
          <div className="flex items-center gap-2 text-ink-secondary">
            <History className="w-4 h-4 text-brand-solid" />
            <h3 className="text-sm font-bold text-ink-primary">Record Amendment Audit History</h3>
          </div>
          <div className="space-y-2">
            {amendments.map((a) => (
              <div
                key={a.id}
                className="p-3 rounded-xl border border-hairline bg-surface-sunken text-xs space-y-1"
              >
                <div className="flex items-center justify-between font-bold text-ink-primary">
                  <span>Field: {a.field_name}</span>
                  <span className="text-ink-muted font-normal">{new Date(a.amended_at).toLocaleString()}</span>
                </div>
                <p className="text-ink-secondary">
                  Value changed from <code className="font-bold">{a.old_value || "empty"}</code> to{" "}
                  <code className="font-bold text-brand-solid">{a.new_value}</code>
                </p>
                <p className="text-ink-muted">Reason: {a.reason}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Amendment Modal */}
      {isAmending && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card padded className="w-full max-w-md space-y-4 bg-surface-card">
            <div>
              <h3 className="text-base font-bold text-ink-primary">Amend Inspection Record</h3>
              <p className="text-xs text-ink-secondary mt-0.5">
                Every correction is recorded to the audit log with your user ID and timestamp.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ink-secondary">Field to Correct</label>
                <select
                  value={amendField}
                  onChange={(e) => {
                    const f = e.target.value
                    setAmendField(f)
                    const found = results.find((r) => r.parameter_label === f)
                    setAmendOldVal(String(found?.numeric_value ?? found?.text_value ?? ""))
                  }}
                  className="w-full h-10 px-3 mt-1 rounded-xl border border-hairline bg-surface-sunken text-xs text-ink-primary"
                >
                  {results.map((r) => (
                    <option key={r.id} value={r.parameter_label}>
                      {r.parameter_label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-ink-secondary">Corrected / New Value</label>
                <input
                  type="text"
                  value={amendNewVal}
                  onChange={(e) => setAmendNewVal(e.target.value)}
                  placeholder="Enter corrected value"
                  className="w-full h-10 px-3 mt-1 rounded-xl border border-hairline bg-surface-sunken text-xs text-ink-primary focus:border-brand"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink-secondary">Reason for Correction *</label>
                <textarea
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  placeholder="e.g. Typo in manual entry, re-tested sample, etc."
                  rows={2}
                  className="w-full p-2.5 mt-1 rounded-xl border border-hairline bg-surface-sunken text-xs text-ink-primary focus:border-brand"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
              <Button variant="outline" size="sm" onClick={() => setIsAmending(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitAmendment} disabled={savingAmend} className="bg-brand-solid text-brand-ink">
                {savingAmend ? "Logging…" : "Save Amendment"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
