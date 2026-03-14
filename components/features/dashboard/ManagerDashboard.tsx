import { LiveStocksDisplay } from "@/components/live-stocks-display"
import { ManagerAnalytics } from "@/components/features/dashboard/ManagerAnalytics"
import { Download } from "lucide-react"

export function ManagerDashboard({ userId }: { userId: string }) {
    return (
        <div className="space-y-10 animate-fade-in-up">
            <div className="space-y-3 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-emerald-950">Welcome, Manager!</h2>
                    <p className="text-lg text-emerald-700/80 font-medium">Here is your manager overview.</p>
                </div>
                <a
                    href={`/api/records/export`}
                    className="inline-flex items-center gap-2 bg-emerald-950 hover:bg-emerald-900 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors shadow-sm"
                >
                    <Download className="w-5 h-5" />
                    <span>Download All System Records</span>
                </a>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main content area */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-emerald-100">
                        <h3 className="text-xl font-bold text-emerald-950 mb-4">Live Inventory</h3>
                        <LiveStocksDisplay />
                    </div>
                </div>

                {/* Sidebar analytics */}
                <div className="space-y-6">
                    <ManagerAnalytics />
                </div>
            </div>
        </div>
    )
}
