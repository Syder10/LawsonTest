import Link from "next/link"
import { Users, ShieldCheck } from "lucide-react"

export function AdminDashboard() {
    return (
        <div className="space-y-6 sm:space-y-10 animate-fade-in-up">
            <div>
                <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-zinc-900">
                    Administrator Panel
                </h2>
                <p className="text-base text-zinc-500 font-medium mt-1 sm:mt-3">
                    Manage users, roles, departments and access.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-2xl">
                <Link href="/dashboard/admin/users" className="group">
                    <div className="bg-white px-5 py-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-zinc-100 hover:shadow-xl hover:shadow-zinc-500/10 active:scale-[0.98] transition-all duration-200 flex items-center gap-4 sm:flex-col sm:items-start sm:gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-zinc-50 text-zinc-600 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:bg-zinc-800 group-hover:text-white transition-colors duration-300">
                            <Users className="w-6 h-6 sm:w-7 sm:h-7" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base sm:text-xl font-bold text-zinc-900">User Management</h3>
                            <p className="text-zinc-500 mt-0.5 sm:mt-2 text-xs sm:text-sm leading-relaxed hidden sm:block">
                                Create accounts, assign roles and departments, reset passwords.
                            </p>
                            <p className="text-zinc-400 text-xs mt-0.5 sm:hidden">Create, edit and manage users</p>
                        </div>
                    </div>
                </Link>

                <div className="bg-zinc-50 px-5 py-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-zinc-100 flex items-center gap-4 sm:flex-col sm:items-start sm:gap-4 opacity-50">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-zinc-100 text-zinc-400 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base sm:text-xl font-bold text-zinc-400">Permissions</h3>
                        <p className="text-zinc-400 text-xs mt-0.5">Coming soon</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
