import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound } from "next/navigation"
import { FORM_FIELDS, PRODUCT_TYPE_FORMS } from "@/constants/formConfig"
import RecordEntryForm from "./record-entry-form"

export function generateStaticParams() {
    return Object.keys(FORM_FIELDS).map((recordType) => ({ recordType }))
}

export default async function RecordTypePage(
    props: { params: Promise<{ recordType: string }> }
) {
    const params = await props.params
    const decodedRecordType = decodeURIComponent(params.recordType)

    if (!FORM_FIELDS[decodedRecordType]) {
        notFound()
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) notFound()

    // Fetch real profile data
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

            <RecordEntryForm
                recordType={decodedRecordType}
                supervisorName={supervisorName}
                department={department}
                groupNumber={groupNumber}
                fields={FORM_FIELDS[decodedRecordType]}
                availableProducts={PRODUCT_TYPE_FORMS[decodedRecordType] || []}
            />
        </div>
    )
}
