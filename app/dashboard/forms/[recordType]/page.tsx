import { createServerSupabase } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"
import RecordEntryForm from "./record-entry-form"
import { getRecordType } from "@/lib/domain/record-types"

export const dynamic = "force-dynamic"

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

    const initialDate  = date  || new Date().toISOString().split("T")[0]
    const initialShift = shift || (() => {
        const h = new Date().getHours()
        if (h < 12) return "Morning"
        if (h < 18) return "Afternoon"
        return "Night"
    })()

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
                        {new Date(initialDate + "T00:00:00").toLocaleDateString(undefined, {
                            weekday: "short", month: "short", day: "numeric",
                        })}
                    </p>
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
