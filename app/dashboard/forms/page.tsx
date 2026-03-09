import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft, ClipboardList } from "lucide-react"

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

export default async function RecordSelectionPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    // Fetch the user's profile to get their department
    const { data: profile } = await supabase
        .from("profiles")
        .select("department, role")
        .eq("id", user.id)
        .single()

    const userDepartment = profile?.department || null
    const userRole = profile?.role || "supervisor"

    // Managers/admins see all departments; supervisors only see their own
    const visibleDepartments =
        userRole === "manager" || userRole === "admin"
            ? DEPARTMENTS
            : userDepartment
            ? DEPARTMENTS.filter(
                  (d) => d.name.toLowerCase() === userDepartment.toLowerCase()
              )
            : DEPARTMENTS // fallback: show all if no department set

    return (
        <div className="space-y-8 max-w-5xl mx-auto animate-fade-in-up">
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard"
                    className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-emerald-950">
                        Select Record Type
                    </h2>
                    <p className="text-emerald-700/80 font-medium mt-1">
                        {userDepartment && userRole !== "manager" && userRole !== "admin"
                            ? `Showing records for: ${userDepartment}`
                            : "Choose the specific record you wish to submit."}
                    </p>
                </div>
            </div>

            {visibleDepartments.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
                    <p className="text-amber-800 font-semibold">
                        No department assigned to your profile yet.
                    </p>
                    <p className="text-amber-700/70 text-sm mt-1">
                        Please update your department in{" "}
                        <Link href="/dashboard/profile" className="underline font-bold">
                            My Profile
                        </Link>
                        .
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleDepartments.map((dept) => (
                    <div
                        key={dept.name}
                        className="bg-white rounded-3xl border border-emerald-100 overflow-hidden shadow-sm flex flex-col h-full"
                    >
                        <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100">
                            <h3 className="font-bold text-emerald-900">{dept.name}</h3>
                        </div>
                        <div className="p-4 flex-1 flex flex-col gap-2">
                            {dept.records.map((record) => (
                                <Link
                                    key={record}
                                    href={`/dashboard/forms/${encodeURIComponent(record)}`}
                                    className="flex items-center gap-3 p-3 rounded-2xl hover:bg-emerald-50 transition-colors group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                        <ClipboardList className="w-4 h-4" />
                                    </div>
                                    <span className="text-sm font-semibold text-slate-700 group-hover:text-emerald-900">
                                        {record}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
