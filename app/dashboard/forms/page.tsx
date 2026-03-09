import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"
import RecordEntryForm from "./record-entry-form"

// Valid record types — strings only, no functions
const VALID_RECORD_TYPES = [
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
]

export const dynamic = "force-dynamic"

export default async function RecordTypePage(
    props: { params: Promise<{ recordType: string }> }
) {
    const params = await props.params
    const decodedRecordType = decodeURIComponent(params.recordType)

    if (!VALID_RECORD_TYPES.includes(decodedRecordType)) {
        notFound()
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) notFound()

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, department, group_number")
        .eq("id", user.id)
        .single()

    const supervisorName =
        profile?.full_name || user.email?.split("@")[0] || "Supervisor"
    const department = profile?.department || "General"
    const groupNumber = profile?.group_number || 1

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
                    <h2 className="text-2xl font-bold tracking-tight text-emerald-950">
                        {decodedRecordType}
                    </h2>
                    <p className="text-emerald-700/80 font-medium mt-1">
                        {department} · {supervisorName}
                    </p>
                </div>
            </div>

            {/* Pass only serializable props — NO fields or functions from server */}
            <RecordEntryForm
                recordType={decodedRecordType}
                supervisorName={supervisorName}
                department={department}
                groupNumber={groupNumber}
            />
        </div>
    )
}
