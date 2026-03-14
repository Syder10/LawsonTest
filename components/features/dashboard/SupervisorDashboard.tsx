import Link from 'next/link'
import { FileText, UserCircle, Download } from 'lucide-react'

export function SupervisorDashboard({ userId }: { userId: string }) {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return (
        <div className="space-y-10 animate-fade-in-up">
            <div className="space-y-3 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-emerald-950">Welcome, Supervisor!</h2>
                    <p className="text-lg text-emerald-700/80 font-medium mt-3">What would you like to do today?</p>
                </div>
                <a
                    href={`/api/records/export?userId=${userId}&month=${currentMonth}`}
                    className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-colors shadow-sm"
                >
                    <Download className="w-5 h-5" />
                    <span>Export Monthly Data</span>
                </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Link href="/dashboard/forms" className="group">
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-emerald-100 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 h-full flex flex-col items-start gap-4 cursor-pointer">
                        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                            <FileText className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-emerald-950">Submit Record</h3>
                            <p className="text-slate-500 mt-2 text-sm leading-relaxed">Select a department and fill out a new production record form for your current shift.</p>
                        </div>
                    </div>
                </Link>

                <Link href="/dashboard/history" className="group">
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-emerald-100 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 h-full flex flex-col items-start gap-4 cursor-pointer">
                        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-emerald-950">Submission History</h3>
                            <p className="text-slate-500 mt-2 text-sm leading-relaxed">View all production records that you have securely submitted.</p>
                        </div>
                    </div>
                </Link>

                <Link href="/dashboard/profile" className="group">
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-emerald-100 hover:shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 h-full flex flex-col items-start gap-4 cursor-pointer">
                        <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                            <UserCircle className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-emerald-950">My Profile</h3>
                            <p className="text-slate-500 mt-2 text-sm leading-relaxed">Manage your login credentials, update your group number, and view your data.</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    )
}
