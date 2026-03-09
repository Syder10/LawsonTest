import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"
import RecordEntryForm from "./record-entry-form"

// ── NO imports from formConfig here ──────────────────────────────────────────
// formConfig contains serialisable functions (calculation: ...) which Next.js
// cannot pass across the Server→Client boundary.  The client form imports it
// directly instead.  We only keep a plain string list for the notFound() guard.

const VALID_RECORD_TYPES = new Set([
    "Daily Records (Preform Usage)",
    "Daily Usage of Alcohol And Stock Level",
    "Daily Records for Alcohol and Blending",
    "Ginger Production",
    "Extraction Monitoring Records",
    "Filling Line Daily Records",
    "Packaging Daily Records",
    "Daily Records Alcohol For Concentrate",
    "Herbs Stock",
    "Caramel Stock",
    "Caps Stock",
    "Labels Stock",
])

export const dynamic = "force-dynamic"

export default async function RecordTypePage(
    props: { params: Promise<{ recordType: string }> }
) {
    const { recordType: raw } = await props.params
    const recordType = decodeURIComponent(raw)

    if (!VALID_RECORD_TYPES.has(recordType)) notFound()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) notFound()

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, department, group_number")
        .eq("id", user.id)
        .single()

    // Only plain serialisable values are passed as props
    const supervisorName: string = profile?.full_name ?? user.email?.split("@")[0] ?? "Supervisor"
    const department: string     = profile?.department ?? "General"
    const groupNumber: number    = profile?.group_number ?? 1

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
                    <p className="text-emerald-700/80 font-medium mt-1">{department} · {supervisorName}</p>
                </div>
            </div>

            {/* RecordEntryForm is "use client" and imports formConfig itself */}
            <RecordEntryForm
                recordType={recordType}
                supervisorName={supervisorName}
                department={department}
                groupNumber={groupNumber}
            />
        </div>
    )
}
