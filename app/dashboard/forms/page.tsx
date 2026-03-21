"use client"

import { useEffect, useState } from "react"
import { getSupabaseClient } from "@/lib/supabase-client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, ClipboardList, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react"
import { toast } from "sonner"

const DEPARTMENTS: { name: string; records: string[] }[] = [
  {
    name: "Blowing",
    records: ["Daily Records (Preform Usage)"],
  },
  {
    name: "Alcohol and Blending",
    records: [
      "Daily Usage of Alcohol And Stock Level",
      "Daily Records for Alcohol and Blending",
      "Ginger Production",
      "Extraction Monitoring Records",
      "Caramel Stock",
    ],
  },
  {
    name: "Filling Line",
    records: [
      "Filling Line Daily Records",
      "Caps Stock",
      "Labels Stock",
    ],
  },
  {
    name: "Packaging",
    records: ["Packaging Daily Records"],
  },
  {
    name: "Concentrate",
    records: [
      "Daily Records Alcohol For Concentrate",
      "Herbs Stock",
    ],
  },
]

const NO_WORK_REASONS = [
  "Machine Breakdown",
  "Public Holiday",
  "No Raw Materials",
  "Power Outage",
  "Scheduled Maintenance",
  "Staff Shortage",
  "Other",
]

function autoShift(): string {
  const h = new Date().getHours()
  if (h < 12) return "Morning"
  if (h < 18) return "Afternoon"
  return "Night"
}

function todayStr() {
  return new Date().toISOString().split("T")[0]
}

interface Profile {
  full_name: string | null
  department: string | null
  role: string
  group_number: number | null
}

export default function RecordSelectionPage() {
  const router = useRouter()
  const supabase = getSupabaseClient()

  const [profile, setProfile]           = useState<Profile | null>(null)
  const [userId, setUserId]             = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [shift, setShift]               = useState(autoShift())

  // Submitted record types for this date+shift
  const [submittedTypes, setSubmittedTypes] = useState<Set<string>>(new Set())
  const [loadingChecks, setLoadingChecks]   = useState(false)

  // No-work state
  const [noWorkChecked, setNoWorkChecked]   = useState(false)
  const [noWorkReason, setNoWorkReason]     = useState("")
  const [otherReason, setOtherReason]       = useState("")
  const [isSubmittingNoWork, setIsSubmittingNoWork] = useState(false)

  // Load user profile once
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from("profiles")
        .select("full_name, department, role, group_number")
        .eq("id", user.id)
        .single()
      setProfile(data as Profile)
    }
    load()
  }, [])

  // Re-check submitted records whenever date or shift changes
  useEffect(() => {
    if (!userId) return
    const check = async () => {
      setLoadingChecks(true)
      setSubmittedTypes(new Set())

      const dept = profile?.department
      const isManager = profile?.role === "manager" || profile?.role === "admin"

      // Determine which record types to check for this supervisor's dept
      const deptConfig = DEPARTMENTS.find(
        d => d.name.toLowerCase() === (dept || "").toLowerCase()
      )
      const recordTypes = isManager
        ? DEPARTMENTS.flatMap(d => d.records)
        : (deptConfig?.records ?? [])

      if (recordTypes.length === 0) {
        setLoadingChecks(false)
        return
      }

      // For each record type we need to check if the user submitted it on this date+shift
      // We map record type → table using the same mapping as the submit route
      const recordTypeToTable: Record<string, string> = {
        "Daily Records (Preform Usage)":          "blowing_daily_records",
        "Daily Usage of Alcohol And Stock Level": "alcohol_stock_level_records",
        "Daily Records for Alcohol and Blending": "alcohol_blending_daily_records",
        "Ginger Production":                      "ginger_production_records",
        "Extraction Monitoring Records":          "extraction_monitoring_records",
        "Filling Line Daily Records":             "filling_line_daily_records",
        "Packaging Daily Records":                "packaging_daily_records",
        "Daily Records Alcohol For Concentrate":  "concentrate_alcohol_records",
        "Herbs Stock":                            "herbs_stock_records",
        "Caramel Stock":                          "caramel_stock_records",
        "Caps Stock":                             "caps_stock_records",
        "Labels Stock":                           "labels_stock_records",
      }

      const checks = await Promise.all(
        recordTypes.map(async (rt) => {
          const table = recordTypeToTable[rt]
          if (!table) return { rt, submitted: false }
          const { data } = await supabase
            .from(table)
            .select("id")
            .eq("user_id", userId)
            .eq("date", selectedDate)
            .eq("shift", shift)
            .limit(1)
          return { rt, submitted: (data?.length ?? 0) > 0 }
        })
      )

      const submitted = new Set(checks.filter(c => c.submitted).map(c => c.rt))
      setSubmittedTypes(submitted)
      setLoadingChecks(false)
    }
    check()
  }, [userId, selectedDate, shift, profile])

  const isToday = selectedDate === todayStr()
  const userDept = profile?.department || null
  const isManager = profile?.role === "manager" || profile?.role === "admin"

  const visibleDepartments = isManager
    ? DEPARTMENTS
    : userDept
    ? DEPARTMENTS.filter(d => d.name.toLowerCase() === userDept.toLowerCase())
    : []

  const supervisorName = profile?.full_name ?? "Supervisor"
  const groupNumber    = profile?.group_number ?? 1

  const handleNoWorkSubmit = async () => {
    const reasonValue = noWorkReason === "Other" ? otherReason.trim() : noWorkReason
    if (!reasonValue) { toast.error("Please select a reason for no work."); return }
    if (!shift)       { toast.error("Please select a shift."); return }

    setIsSubmittingNoWork(true)
    try {
      const res = await fetch("/api/records/no-work", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date:           selectedDate,
          supervisorName,
          shift,
          group:          groupNumber,
          department:     userDept || "General",
          reason:         reasonValue,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to submit")
      toast.success("No-work record submitted successfully.")
      setNoWorkChecked(false)
      setNoWorkReason("")
      setOtherReason("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit no-work record.")
    } finally {
      setIsSubmittingNoWork(false)
    }
  }

  // Build the href for a record form — passes date+shift via query params
  const formHref = (record: string) => {
    const params = new URLSearchParams({ date: selectedDate, shift })
    return `/dashboard/forms/${encodeURIComponent(record)}?${params.toString()}`
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-fade-in-up">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-emerald-950">Submit Record</h2>
          <p className="text-emerald-700/80 font-medium mt-1">
            {userDept && !isManager ? `${userDept} department` : "Select a record type to fill out."}
          </p>
        </div>
      </div>

      {/* ── Date & Shift selector ─────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-emerald-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-widest mb-4">
          Shift Details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-emerald-900">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              max={todayStr()}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-10 px-3 text-sm font-medium rounded-xl border border-emerald-200 bg-white text-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
          </div>

          {/* Shift */}
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-emerald-900">
              Shift <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value)}
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

        {!isToday && (
          <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-semibold">
            You are submitting for a previous date: {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        )}
      </div>

      {/* ── No department warning ─────────────────────────────────────────── */}
      {visibleDepartments.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-amber-800 font-semibold">No department assigned to your profile yet.</p>
          <p className="text-amber-700/70 text-sm mt-1">
            Please update your department in{" "}
            <Link href="/dashboard/profile" className="underline font-bold">My Profile</Link>.
          </p>
        </div>
      )}

      {/* ── Record type cards ─────────────────────────────────────────────── */}
      {!noWorkChecked && shift && visibleDepartments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {visibleDepartments.map((dept) => (
            <div
              key={dept.name}
              className="bg-white rounded-2xl sm:rounded-3xl border border-emerald-100 overflow-hidden shadow-sm flex flex-col"
            >
              <div className="bg-emerald-50 px-4 sm:px-6 py-3 sm:py-4 border-b border-emerald-100">
                <h3 className="font-bold text-emerald-900 text-sm">{dept.name}</h3>
              </div>
              <div className="p-3 sm:p-4 flex-1 flex flex-col gap-1.5 sm:gap-2">
                {dept.records.map((record) => {
                  const isDone = submittedTypes.has(record)
                  return (
                    <Link
                      key={record}
                      href={formHref(record)}
                      className={`flex items-center gap-3 px-3 py-3 sm:p-3 rounded-xl sm:rounded-2xl transition-colors group active:scale-[0.98] ${
                        isDone
                          ? "bg-emerald-50 border border-emerald-200"
                          : "hover:bg-emerald-50 active:bg-emerald-50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isDone
                          ? "bg-emerald-500 text-white"
                          : "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white"
                      }`}>
                        {isDone
                          ? <CheckCircle2 className="w-4 h-4" />
                          : <ClipboardList className="w-4 h-4" />
                        }
                      </div>
                      <span className={`text-sm font-semibold flex-1 ${
                        isDone ? "text-emerald-700" : "text-slate-700 group-hover:text-emerald-900"
                      }`}>
                        {record}
                      </span>
                      {isDone && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Submitted
                        </span>
                      )}
                      {loadingChecks && !isDone && (
                        <span className="w-3 h-3 rounded-full border-2 border-emerald-300 border-t-transparent animate-spin" />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {!shift && visibleDepartments.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center text-slate-500 font-medium text-sm">
          Please select a shift above to see your record types.
        </div>
      )}

      {/* ── No Work Today section ─────────────────────────────────────────── */}
      {visibleDepartments.length > 0 && (
        <div className={`bg-white rounded-3xl border shadow-sm p-6 transition-all ${
          noWorkChecked ? "border-amber-300 bg-amber-50/30" : "border-emerald-100"
        }`}>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <div className="mt-0.5">
              <input
                type="checkbox"
                checked={noWorkChecked}
                onChange={(e) => {
                  setNoWorkChecked(e.target.checked)
                  if (!e.target.checked) { setNoWorkReason(""); setOtherReason("") }
                }}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>
            <div>
              <p className="font-bold text-slate-800">No work today for this shift</p>
              <p className="text-sm text-slate-500 mt-0.5">
                Check this if your department did not operate during this shift.
              </p>
            </div>
          </label>

          {noWorkChecked && (
            <div className="mt-5 space-y-4 border-t border-amber-200 pt-5">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <p className="text-sm font-semibold">Select a reason for no work:</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {NO_WORK_REASONS.filter(r => r !== "Other").map((reason) => (
                  <label
                    key={reason}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-semibold ${
                      noWorkReason === reason
                        ? "border-amber-500 bg-amber-50 text-amber-800"
                        : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="no-work-reason"
                      value={reason}
                      checked={noWorkReason === reason}
                      onChange={() => setNoWorkReason(reason)}
                      className="accent-amber-500"
                    />
                    {reason}
                  </label>
                ))}

                {/* Other option */}
                <label
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-semibold ${
                    noWorkReason === "Other"
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-amber-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="no-work-reason"
                    value="Other"
                    checked={noWorkReason === "Other"}
                    onChange={() => setNoWorkReason("Other")}
                    className="accent-amber-500"
                  />
                  Other
                </label>
              </div>

              {noWorkReason === "Other" && (
                <input
                  type="text"
                  placeholder="Describe the reason…"
                  value={otherReason}
                  onChange={(e) => setOtherReason(e.target.value)}
                  className="w-full h-10 px-3 text-sm rounded-xl border border-amber-300 bg-white focus:border-amber-500 focus:outline-none transition-all"
                />
              )}

              <button
                onClick={handleNoWorkSubmit}
                disabled={
                  isSubmittingNoWork ||
                  !noWorkReason ||
                  (noWorkReason === "Other" && !otherReason.trim()) ||
                  !shift
                }
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingNoWork ? "Submitting…" : "Submit No-Work Record"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
