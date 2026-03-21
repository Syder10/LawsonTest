import Link from 'next/link'
import { FileText, UserCircle, Download, History } from 'lucide-react'

export function SupervisorDashboard({ userId }: { userId: string }) {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    return (
        <div className="space-y-6 sm:space-y-10 animate-fade-in-up">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-emerald-950">
                        Welcome, Supervisor!
                    </h2>
                    <p className="text-base sm:text-lg text-emerald-700/80 font-medium mt-1 sm:mt-3">
                        What would you like to do today?
                    </p>
                </div>
                <a
                    href={`/api/records/export?userId=${userId}&month=${currentMonth}`}
                    className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-5 py-3 rounded-xl font-semibold transition-colors shadow-sm w-full sm:w-auto text-sm"
                >
                    <Download className="w-4 h-4 shrink-0" />
                    <span>Export Monthly Data</span>
                </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Submit Record */}
                <Link href="/dashboard/forms" className="group">
                    <div className="bg-white px-5 py-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-emerald-100 hover:shadow-xl hover:shadow-emerald-500/10 active:scale-[0.98] transition-all duration-200 flex items-center gap-4 sm:flex-col sm:items-start sm:gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                            <FileText className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-xl font-bold text-emerald-950">Submit Record</h3>
                            <p className="text-slate-500 mt-0.5 sm:mt-2 text-xs sm:text-sm leading-relaxed hidden sm:block">
                                Select a department and fill out a new production record form for your current shift.
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5 sm:hidden">Fill out a new production record</p>
                        </div>
                    </div>
                </Link>

                {/* Submission History */}
                <Link href="/dashboard/history" className="group">
                    <div className="bg-white px-5 py-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-emerald-100 hover:shadow-xl hover:shadow-emerald-500/10 active:scale-[0.98] transition-all duration-200 flex items-center gap-4 sm:flex-col sm:items-start sm:gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                            <History className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-xl font-bold text-emerald-950">Submission History</h3>
                            <p className="text-slate-500 mt-0.5 sm:mt-2 text-xs sm:text-sm leading-relaxed hidden sm:block">
                                View all production records that you have securely submitted.
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5 sm:hidden">View your submitted records</p>
                        </div>
                    </div>
                </Link>

                {/* My Profile */}
                <Link href="/dashboard/profile" className="group">
                    <div className="bg-white px-5 py-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-emerald-100 hover:shadow-xl hover:shadow-emerald-500/10 active:scale-[0.98] transition-all duration-200 flex items-center gap-4 sm:flex-col sm:items-start sm:gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-emerald-50 text-emerald-600 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                            <UserCircle className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-xl font-bold text-emerald-950">My Profile</h3>
                            <p className="text-slate-500 mt-0.5 sm:mt-2 text-xs sm:text-sm leading-relaxed hidden sm:block">
                                Manage your login credentials, update your group number, and view your data.
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5 sm:hidden">Manage your account</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    )
}
