"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ClipboardList, CheckCircle2, AlertTriangle, Clock, CalendarClock, X } from "lucide-react"
import { toast } from "sonner"
import { DEPARTMENTS, RECORD_TYPES } from "@/lib/domain/record-types"
import { Card, Chip, Choice, Field, PageHeader, Select, TextInput } from "@/components/primitives"
import { SHIFT_ORDER } from "@/lib/shift-config"
import {
  ON_TIME_WINDOW_LABEL,
  currentGhanaShift,
  expectedShiftForGroup,
  isWindowOpenNow,
  shiftDateFor,
} from "@/lib/shift-config"

const NO_WORK_REASONS = [
  "Machine Breakdown", "Public Holiday", "No Raw Materials",
  "Power Outage", "Scheduled Maintenance", "Staff Shortage", "Other",
]

// Departments → their record type labels, derived from the shared registry
// (a record type may appear under more than one department).
const DEPARTMENT_RECORDS = DEPARTMENTS.map((name) => ({
  name,
  records: RECORD_TYPES.filter((r) => r.departments.includes(name)).map((r) => r.label),
}))

// The date a record belongs to right now for a given shift. Night shifts are
// dated by the day they STARTED, so before 06:00 this is yesterday — see the
// SHIFT-DATE CONVENTION in lib/shift-config. With no shift yet, fall back to
// whichever shift is currently running.
const shiftToday = (shift?: string) =>
  shift ? shiftDateFor(shift, new Date()) : currentGhanaShift(new Date()).shiftDate

interface Profile {
  full_name: string | null
  department: string | null
  role: string
  group_number: number | null
}

interface DayGap {
  date: string
  shift: string
  missingTypes: string[]
}

export default function RecordSelectionPage() {
  const supabase = getSupabaseBrowserClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  // Tracked separately from `profile` because "not loaded yet" and "loaded, no
  // department" must look different. Without this, `profile` starts null so
  // visibleDepartments is [] on first paint and the amber "No department assigned"
  // panel flashed on EVERY visit before the profile resolved.
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(shiftToday())
  const [shift, setShift] = useState("")
  const [submittedTypes, setSubmittedTypes] = useState<Set<string>>(new Set())
  const [loadingChecks, setLoadingChecks] = useState(false)

  const [noWorkChecked, setNoWorkChecked] = useState(false)
  const [noWorkReason, setNoWorkReason] = useState("")
  const [otherReason, setOtherReason] = useState("")
  const [isSubmittingNoWork, setIsSubmittingNoWork] = useState(false)

  const [gaps, setGaps] = useState<DayGap[]>([])
  const [gapsDismissed, setGapsDismissed] = useState(false)

  // Unsubmitted rostered working days (managers/admins don't have a rotation).
  const loadGaps = async () => {
    try {
      const res = await fetch("/api/records/gaps")
      if (res.ok) setGaps((await res.json()).gaps ?? [])
    } catch { /* silent */ }
  }
  useEffect(() => { loadGaps() }, [])

  // Load profile + pre-select the rotation-assigned shift.
  useEffect(() => {
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setUserId(user.id)
        const { data } = await supabase
          .from("profiles")
          .select("full_name, department, role, group_number")
          .eq("id", user.id)
          .single()
        const p = data as Profile
        setProfile(p)
        const isManager = p?.role === "manager" || p?.role === "admin"
        if (!isManager && p?.department && p?.group_number) {
          const assigned = expectedShiftForGroup(p.department, p.group_number, new Date())
          if (assigned) {
            setShift(assigned)
            // Re-key the date to that shift: a Night supervisor opening this at
            // 04:30 is filing for the shift that began YESTERDAY.
            setSelectedDate(shiftToday(assigned))
          }
        }
      } finally {
        setProfileLoaded(true)
      }
    })()
  }, [supabase])

  // Which record types are already submitted for this date + shift.
  useEffect(() => {
    if (!userId || !selectedDate || !shift) {
      setSubmittedTypes(new Set())
      return
    }
    ;(async () => {
      setLoadingChecks(true)
      try {
        const res = await fetch(`/api/records/status?date=${selectedDate}&shift=${shift}`)
        const data = await res.json()
        setSubmittedTypes(new Set<string>(data.submitted ?? []))
      } catch {
        setSubmittedTypes(new Set())
      } finally {
        setLoadingChecks(false)
      }
    })()
  }, [userId, selectedDate, shift])

  const isManager = profile?.role === "manager" || profile?.role === "admin"
  const userDept = profile?.department || null
  const bothSelected = !!selectedDate && !!shift
  // Latest date submittable for the selected shift (Night rolls back before 06:00).
  const maxDate = shiftToday(shift)
  const isToday = selectedDate === maxDate
  const isPastDate = !!selectedDate && selectedDate < maxDate

  // Keep the date in step with the shift-start convention when the shift changes,
  // but never clobber a date the supervisor deliberately backdated.
  const handleShiftChange = (next: string) => {
    const previousAuto = shiftToday(shift)
    setShift(next)
    if (selectedDate === previousAuto) setSelectedDate(shiftToday(next))
  }

  const visibleDepartments = isManager
    ? DEPARTMENT_RECORDS
    : userDept
      ? DEPARTMENT_RECORDS.filter((d) => d.name.toLowerCase() === userDept.toLowerCase())
      : []

  const supervisorName = profile?.full_name ?? "Supervisor"
  const groupNumber = profile?.group_number ?? 1
  const windowOpen = shift && isToday ? isWindowOpenNow(shift) : false

  const handleNoWorkSubmit = async () => {
    const reasonValue = noWorkReason === "Other" ? otherReason.trim() : noWorkReason
    if (!reasonValue) return toast.error("Please select a reason for no work.")
    if (!shift) return toast.error("Please select a shift.")
    if (!selectedDate) return toast.error("Please select a date.")

    setIsSubmittingNoWork(true)
    try {
      const res = await fetch("/api/records/no-work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate, supervisorName, shift, group: groupNumber,
          department: userDept || "General", reason: reasonValue,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit")
      toast.success("No-work record submitted successfully.")
      setNoWorkChecked(false)
      setNoWorkReason("")
      setOtherReason("")
      loadGaps()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit no-work record.")
    } finally {
      setIsSubmittingNoWork(false)
    }
  }

  const formHref = (record: string) =>
    `/dashboard/forms/${encodeURIComponent(record)}?${new URLSearchParams({ date: selectedDate, shift })}`

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in-up">
      <PageHeader
        backHref="/dashboard"
        title="Submit record"
        description={userDept && !isManager ? `${userDept} department` : "Choose a record type to fill in."}
      />

      <Card tone="brand" padded>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date" required>
            {(a11y) => (
              <TextInput
                {...a11y}
                type="date"
                value={selectedDate}
                max={maxDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            )}
          </Field>
          <Field
            label="Shift"
            required
            hint={!isManager && profile?.group_number && shift ? "Your rotation this week" : undefined}
          >
            {(a11y) => (
              <Select {...a11y} value={shift} onChange={(e) => handleShiftChange(e.target.value)}>
                <option value="" disabled>Choose a shift…</option>
                {SHIFT_ORDER.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {shift && isToday && (
          <div
            className={`mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm ${
              windowOpen
                ? "bg-good-subtle border-good/30 text-good-ink"
                : "bg-surface-sunken border-hairline text-ink-secondary"
            }`}
          >
            <Clock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-bold">
                {windowOpen ? "On-time window is open now" : "On-time submission window"}
              </p>
              <p className="text-xs mt-0.5">
                Submit {shift} shift records between{" "}
                <span className="font-bold">{ON_TIME_WINDOW_LABEL[shift]}</span> to count as on-time and keep your streak.
              </p>
            </div>
          </div>
        )}

        {shift === "Night" && (
          <p className="mt-3 text-xs text-brand-subtle-ink bg-brand-subtle border border-brand/20 rounded-xl px-3 py-2 font-medium">
            Night shifts are dated by the day the shift <span className="font-bold">starts</span> — one closing around
            5 am is filed under the previous day. Yours is dated{" "}
            <span className="font-bold">
              {new Date(maxDate + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
            </span>
            , so Morning, Afternoon and Night all share one date.
          </p>
        )}

        {isPastDate && (
          <p className="mt-3 text-xs text-warning-ink bg-warning-subtle border border-warning/30 rounded-xl px-3 py-2 font-medium">
            You are submitting for an earlier date:{" "}
            {new Date(selectedDate + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
          </p>
        )}
      </Card>

      {!profileLoaded && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading your record types">
          <div className="h-24 rounded-3xl border border-hairline bg-surface-sunken animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 rounded-3xl border border-hairline bg-surface-sunken animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {profileLoaded && visibleDepartments.length === 0 && (
        <div className="bg-warning-subtle border border-warning/30 rounded-2xl p-6 text-center">
          <p className="text-warning-ink font-semibold">No department assigned to your profile yet.</p>
          <p className="text-ink-secondary text-sm mt-1">
            Departments and rotation groups are assigned by an administrator. Please ask your manager to set yours up.
          </p>
        </div>
      )}

      {/* Unsubmitted-days prompt — rostered working days still needing a record */}
      {!gapsDismissed && gaps.length > 0 && visibleDepartments.length > 0 && (
        <Card className="border-warning/30">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-warning/20 bg-warning-subtle">
            <div className="flex items-start gap-2.5">
              <CalendarClock className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-bold text-warning-ink text-sm">
                  {gaps.length} shift{gaps.length !== 1 ? "s" : ""} still need{gaps.length === 1 ? "s" : ""} a record
                </p>
                <p className="text-xs text-warning-ink/80 font-medium mt-0.5">
                  These rostered shifts have no submission and weren’t logged as no-work. Fill them in, or mark them no-work.
                </p>
              </div>
            </div>
            <button
              onClick={() => setGapsDismissed(true)}
              className="h-11 w-11 -m-2 flex items-center justify-center rounded-lg text-warning-ink/60 hover:text-warning-ink hover:bg-warning/10 transition-colors shrink-0"
              aria-label="Dismiss this reminder"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <ul className="divide-y divide-hairline">
            {gaps.map((g) => {
              const label = new Date(g.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
              const jump = (noWork: boolean) => {
                setSelectedDate(g.date)
                setShift(g.shift)
                setNoWorkChecked(noWork)
                window.scrollTo({ top: 0, behavior: "smooth" })
              }
              return (
                <li key={`${g.date}|${g.shift}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink-primary">
                      {label} · <span className="text-warning-ink">{g.shift}</span>
                    </p>
                    <p className="text-xs text-ink-muted font-medium">Missing: {g.missingTypes.join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => jump(false)}
                      className="px-3 h-11 sm:h-10 rounded-xl bg-brand-solid hover:bg-brand-solid-hover text-brand-ink text-xs font-bold transition-colors active:scale-[0.97]"
                    >
                      Fill records
                    </button>
                    <button
                      onClick={() => jump(true)}
                      className="px-3 h-11 sm:h-10 rounded-xl border border-hairline bg-surface-card hover:bg-surface-sunken text-ink-secondary text-xs font-bold transition-colors active:scale-[0.97]"
                    >
                      Log no-work
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {!noWorkChecked && bothSelected && visibleDepartments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleDepartments.map((dept) => (
            <Card key={dept.name} tone="brand" className="flex flex-col">
              <div className="bg-brand-subtle px-4 py-3 border-b border-brand/15">
                <h3 className="font-bold text-brand-subtle-ink text-sm">{dept.name}</h3>
              </div>
              <ul className="p-3 flex-1 flex flex-col gap-1.5">
                {dept.records.map((record) => {
                  const isDone = submittedTypes.has(record)
                  return (
                    <li key={record}>
                      <Link
                        href={formHref(record)}
                        className={`flex items-center gap-3 px-3 min-h-14 rounded-xl transition-colors group active:scale-[0.98] ${
                          isDone ? "bg-good-subtle border border-good/25" : "hover:bg-brand-subtle"
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            isDone ? "bg-good text-white" : "bg-brand-subtle text-brand group-hover:bg-brand group-hover:text-brand-ink"
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <ClipboardList className="w-4 h-4" aria-hidden="true" />}
                        </span>
                        <span className={`text-sm font-semibold flex-1 ${isDone ? "text-good-ink" : "text-ink-secondary group-hover:text-ink-primary"}`}>
                          {record}
                        </span>
                        {isDone && <Chip tone="good">Submitted</Chip>}
                        {loadingChecks && !isDone && (
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-brand/40 border-t-transparent animate-spin" aria-hidden="true" />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {!bothSelected && visibleDepartments.length > 0 && (
        <Card padded>
          <p className="text-center text-sm text-ink-muted font-medium">
            Choose a date and shift above to see your record types.
          </p>
        </Card>
      )}

      {visibleDepartments.length > 0 && (
        <Card tone={noWorkChecked ? "brand" : "data"} padded className={noWorkChecked ? "border-warning/40" : undefined}>
          <Choice
            type="checkbox"
            checked={noWorkChecked}
            onChange={(e) => {
              setNoWorkChecked(e.target.checked)
              if (!e.target.checked) { setNoWorkReason(""); setOtherReason("") }
            }}
            label="No work on this shift"
            className="w-full"
          />
          <p className="text-xs text-ink-muted mt-2 ml-1">
            Use this if your department did not operate during this shift. It still counts toward your streak.
          </p>

          {noWorkChecked && (
            <div className="mt-4 space-y-4 border-t border-hairline pt-4">
              <fieldset>
                <legend className="flex items-center gap-2 text-sm font-semibold text-warning-ink mb-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Why was there no work?
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {NO_WORK_REASONS.map((reason) => (
                    <Choice
                      key={reason}
                      type="radio"
                      name="no-work-reason"
                      value={reason}
                      checked={noWorkReason === reason}
                      onChange={() => setNoWorkReason(reason)}
                      label={reason}
                    />
                  ))}
                </div>
              </fieldset>

              {noWorkReason === "Other" && (
                <Field label="Describe the reason" required>
                  {(a11y) => (
                    <TextInput {...a11y} value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="What happened?" />
                  )}
                </Field>
              )}

              <button
                onClick={handleNoWorkSubmit}
                disabled={isSubmittingNoWork || !noWorkReason || (noWorkReason === "Other" && !otherReason.trim()) || !shift || !selectedDate}
                className="w-full sm:w-auto h-11 sm:h-10 px-6 rounded-xl bg-brand-solid hover:bg-brand-solid-hover text-brand-ink font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
              >
                {isSubmittingNoWork ? "Saving…" : "Submit no-work record"}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
