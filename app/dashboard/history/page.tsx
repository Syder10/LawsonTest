import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft, Calendar } from "lucide-react"

// A helper dictionary to loop over all 12 tables and fetch the user's history
const recordTables = [
    "blowing_daily_records",
    "alcohol_stock_level_records",
    "alcohol_blending_daily_records",
    "ginger_production_records",
    "extraction_monitoring_records",
    "filling_line_daily_records",
    "packaging_daily_records",
    "concentrate_alcohol_records",
    "herbs_stock_records",
    "caramel_stock_records",
    "caps_stock_records",
    "labels_stock_records"
]

export default async function HistoryPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    // In a real robust implementation, we might want to paginate this or filter by date on the server.
    // For the MVP Phase 3 SAP request, we will fetch the 50 most recent records across all tables for this user.
    let allRecords: any[] = []

    // Run queries in parallel for performance since there are 12 tables
    const fetchPromises = recordTables.map(async (table) => {
        const { data } = await supabase
            .from(table)
            .select('id, record_type, date, shift, department, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(10) // Limit per table to prevent massive overload

        if (data) {
            return data.map(record => ({ ...record, __table: table }))
        }
        return []
    })

    const results = await Promise.all(fetchPromises)
    allRecords = results.flat().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return (
        <div className="space-y-8 max-w-5xl mx-auto animate-fade-in-up">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard" className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-emerald-950">Submission History</h2>
                        <p className="text-emerald-700/80 font-medium mt-1">View your recently submitted production records.</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-emerald-100">
                <div className="bg-emerald-50 px-6 py-4 border-b border-emerald-100 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-700" />
                    <span className="font-bold text-emerald-900">Recent Activity</span>
                </div>

                {allRecords.length === 0 ? (
                    <div className="p-10 text-center text-slate-500 font-medium">
                        No records found. Submit a new form to see it appear here!
                    </div>
                ) : (
                    <div className="divide-y divide-emerald-50">
                        {allRecords.map((record) => (
                            <div key={record.id} className="p-6 hover:bg-emerald-50/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <h3 className="font-bold text-emerald-950">{record.record_type}</h3>
                                    <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
                                        <span className="bg-slate-100 px-2 py-1 rounded-md">{record.department}</span>
                                        <span>{record.shift} Shift</span>
                                        <span>•</span>
                                        <span>{new Date(record.date).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div className="text-right text-xs text-slate-400 font-medium whitespace-nowrap">
                                    Submitted: {new Date(record.created_at).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
