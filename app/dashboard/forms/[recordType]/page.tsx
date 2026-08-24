import { createServerSupabase } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"
import RecordEntryForm from "./record-entry-form"
import { getRecordType } from "@/lib/domain/record-types"
import { currentGhanaShift, expectedShiftForGroup, shiftDateFor } from "@/lib/shift-config"

export const dynamic = "force-dynamic"

const isoToday = (d: Date) => d.toISOString().split("T")[0]

export default async function RecordTypePage(
    props: {
        params: Promise<{ recordType: string }>
        searchParams: Promise<{ date?: string; shift?: string }>
    }
) {
    const { recordType: raw }    = await props.params
    const { date, shift }        = await props.searchParams
    const recordType             = decodeURIComponent(raw)

    if (!getRecordType(recordType)) notFound()

    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) notFound()

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, department, group_number")
        .eq("id", user.id)
        .single()

    const supervisorName: string = profile?.full_name ?? user.email?.split("@")[0] ?? "Supervisor"
    const department: string     = profile?.department ?? "General"
    const groupNumber: number    = profile?.group_number ?? 1

    const now = new Date()

    // Fall back to the supervisor's ROSTERED shift for this week — their shift is
    // fixed by the rotation, not by what time it happens to be. Only if we can't
    // resolve a roster do we fall back to whichever shift is currently running.
    // (Previously this guessed from `new Date().getHours()` in LOCAL time with a
    // different mapping than the rest of the app, so a Night supervisor filing at
    // 05:00 was handed "Morning".)
    const initialShift = shift
        || (profile?.department && profile?.group_number
            ? expectedShiftForGroup(profile.department, profile.group_number, now)
            : null)
        || currentGhanaShift(now).shift

    // Dated by the day the shift STARTED (see shift-config's SHIFT-DATE
    // CONVENTION). Was `new Date().toISOString()`, which dated a Night shift
    // filed at 05:00 to the following day and split one working day in two.
    const initialDate = date || shiftDateFor(initialShift, now)

    // Night records carry the start day, which can differ from the supervisor's
    // wall-clock date — say so explicitly rather than letting it look like a bug.
    const isNightRollover = initialShift === "Night" && initialDate !== isoToday(now)

    return (
        <div className="space-y-8 max-w-4xl mx-auto animate-fade-in-up">
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard/forms"
                    className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-emerald-950">{recordType}</h2>
                    <p className="text-emerald-700/80 font-medium mt-1">
                        {department} · {supervisorName} · {initialShift} Shift ·{" "}
                        {new Date(initialDate + "T00:00:00Z").toLocaleDateString(undefined, {
                            weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
                        })}
                    </p>
                    {isNightRollover && (
                        <p className="mt-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5 inline-block">
                            Dated to the day this Night shift started, so all three of that day’s shifts share one date.
                        </p>
                    )}
                </div>
            </div>

            <RecordEntryForm
                recordType={recordType}
                supervisorName={supervisorName}
                department={department}
                groupNumber={groupNumber}
                initialDate={initialDate}
                initialShift={initialShift}
            />
        </div>
    )
}
