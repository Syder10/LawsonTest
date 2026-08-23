"use client"

import { useEffect, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ClipboardList, CheckCircle2, AlertTriangle, ChevronDown, Clock, CalendarClock, X } from "lucide-react"
import { toast } from "sonner"
import { DEPARTMENTS, RECORD_TYPES } from "@/lib/domain/record-types"
import {
  ON_TIME_WINDOW_LABEL,
  currentGhanaShift,
  expectedShiftForGroup,
  isWindowOpenNow,
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

const todayStr = () => currentGhanaShift(new Date()).shiftDate

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
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayStr())
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
        if (assigned) setShift(assigned)
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
  const isToday = selectedDate === todayStr()
  const isPastDate = !!selectedDate && selectedDate < todayStr()

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
    <div className="space-y-8 max-w-5xl mx-auto animate-fade-in-up">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-emerald-950">Submit Record</h2>
          <p className="text-emerald-700/80 font-medium mt-1">
            {userDept && !isManager ? `${userDept} department` : "Select a record type to fill out."}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-widest mb-4">Shift Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-emerald-900">Date <span className="text-red-500">*</span></label>
            <input
              type="date" value={selectedDate} max={todayStr()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-10 px-3 text-sm font-medium rounded-xl border border-emerald-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-emerald-900">Shift <span className="text-red-500">*</span></label>
              {!isManager && profile?.group_number && shift && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Your rotation this week</span>
              )}
            </div>
            <div className="relative">
              <select
                value={shift} onChange={(e) => setShift(e.target.value)}
                className="w-full h-10 pl-3 pr-9 text-sm font-medium rounded-xl border border-emerald-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none appearance-none transition-all"
              >
                <option value="" disabled>Select shift…</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Night">Night</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {shift && isToday && (
          <div className={`mt-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${windowOpen ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
            <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${windowOpen ? "text-emerald-500" : "text-slate-400"}`} />
            <div>
              <p className={`font-bold ${windowOpen ? "text-emerald-700" : "text-slate-700"}`}>
                {windowOpen ? "✓ On-time window is open now!" : "On-time submission window"}
              </p>
              <p className={`text-xs mt-0.5 font-medium ${windowOpen ? "text-emerald-600" : "text-slate-500"}`}>
                Submit {shift} shift records between <span className="font-black">{ON_TIME_WINDOW_LABEL[shift]}</span> to count as on-time and keep your streak.
              </p>
            </div>
          </div>
        )}

        {isPastDate && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-semibold">
            You are submitting for a previous date:{" "}
            {new Date(selectedDate + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
          </p>
        )}
      </div>

      {visibleDepartments.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-amber-800 font-semibold">No department assigned to your profile yet.</p>
          <p className="text-amber-700/70 text-sm mt-1">
            Please update your department in <Link href="/dashboard/profile" className="underline font-bold">My Profile</Link>.
          </p>
        </div>
      )}

      {/* Unsubmitted-days prompt — rostered working days still needing a record */}
      {!gapsDismissed && gaps.length > 0 && visibleDepartments.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-amber-200">
            <div className="flex items-start gap-2.5">
              <CalendarClock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-bold text-amber-900 text-sm">
                  {gaps.length} shift{gaps.length !== 1 ? "s" : ""} still need{gaps.length === 1 ? "s" : ""} a record
                </p>
                <p className="text-xs text-amber-700/80 font-medium mt-0.5">
                  These rostered shifts have no submission and weren’t logged as no-work. Fill them in, or mark them no-work.
                </p>
              </div>
            </div>
            <button onClick={() => setGapsDismissed(true)} className="text-amber-500 hover:text-amber-700 p-1 -m-1" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="divide-y divide-amber-100 max-h-72 overflow-y-auto">
            {gaps.map((g) => {
              const label = new Date(g.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
              const jump = () => { setSelectedDate(g.date); setShift(g.shift); setNoWorkChecked(false); window.scrollTo({ top: 0, behavior: "smooth" }) }
              const jumpNoWork = () => { setSelectedDate(g.date); setShift(g.shift); setNoWorkChecked(true); window.scrollTo({ top: 0, behavior: "smooth" }) }
              return (
                <div key={`${g.date}|${g.shift}`} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">{label} · <span className="text-amber-700">{g.shift}</span></p>
                    <p className="text-[11px] text-slate-500 font-medium truncate">Missing: {g.missingTypes.join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={jump} className="px-3 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors">Fill records</button>
                    <button onClick={jumpNoWork} className="px-3 h-8 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-700 text-xs font-bold transition-colors">Log no-work</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!noWorkChecked && bothSelected && visibleDepartments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {visibleDepartments.map((dept) => (
            <div key={dept.name} className="bg-white rounded-2xl sm:rounded-3xl border border-emerald-100 overflow-hidden shadow-sm flex flex-col">
              <div className="bg-emerald-50 px-4 sm:px-6 py-3 sm:py-4 border-b border-emerald-100">
                <h3 className="font-bold text-emerald-900 text-sm">{dept.name}</h3>
              </div>
              <div className="p-3 sm:p-4 flex-1 flex flex-col gap-1.5 sm:gap-2">
                {dept.records.map((record) => {
                  const isDone = submittedTypes.has(record)
                  return (
                    <Link key={record} href={formHref(record)}
                      className={`flex items-center gap-3 px-3 py-3 sm:p-3 rounded-xl sm:rounded-2xl transition-colors group active:scale-[0.98] ${isDone ? "bg-emerald-50 border border-emerald-200" : "hover:bg-emerald-50 active:bg-emerald-50"}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${isDone ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white"}`}>
                        {isDone ? <CheckCircle2 className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
                      </div>
                      <span className={`text-sm font-semibold flex-1 ${isDone ? "text-emerald-700" : "text-slate-700 group-hover:text-emerald-900"}`}>{record}</span>
                      {isDone && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Submitted</span>}
                      {loadingChecks && !isDone && <span className="w-3 h-3 rounded-full border-2 border-emerald-300 border-t-transparent animate-spin" />}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!bothSelected && visibleDepartments.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center text-slate-500 font-medium text-sm">
          Please select a date and shift above to see your record types.
        </div>
      )}

      {visibleDepartments.length > 0 && (
        <div className={`bg-white rounded-3xl border shadow-sm p-6 transition-all ${noWorkChecked ? "border-amber-300 bg-amber-50/30" : "border-emerald-100"}`}>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <div className="mt-0.5">
              <input type="checkbox" checked={noWorkChecked}
                onChange={(e) => { setNoWorkChecked(e.target.checked); if (!e.target.checked) { setNoWorkReason(""); setOtherReason("") } }}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer" />
            </div>
            <div>
              <p className="font-bold text-slate-800">No work today for this shift</p>
              <p className="text-sm text-slate-500 mt-0.5">Check this if your department did not operate during this shift.</p>
            </div>
          </label>

          {noWorkChecked && (
            <div className="mt-5 space-y-4 border-t border-amber-200 pt-5">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p className="text-sm font-semibold">Select a reason for no work:</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {NO_WORK_REASONS.map((reason) => (
                  <label key={reason} className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-semibold ${noWorkReason === reason ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"}`}>
                    <input type="radio" name="no-work-reason" value={reason} checked={noWorkReason === reason} onChange={() => setNoWorkReason(reason)} className="accent-amber-500" />
                    {reason}
                  </label>
                ))}
              </div>
              {noWorkReason === "Other" && (
                <input type="text" placeholder="Describe the reason…" value={otherReason} onChange={(e) => setOtherReason(e.target.value)}
                  className="w-full h-10 px-3 text-sm rounded-xl border border-amber-300 bg-white focus:border-amber-500 focus:outline-none transition-all" />
              )}
              <button onClick={handleNoWorkSubmit}
                disabled={isSubmittingNoWork || !noWorkReason || (noWorkReason === "Other" && !otherReason.trim()) || !shift || !selectedDate}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmittingNoWork ? "Submitting…" : "Submit No-Work Record"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
