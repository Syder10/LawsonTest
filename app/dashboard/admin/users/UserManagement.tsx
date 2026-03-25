"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Plus, Pencil, KeyRound, Trash2, X, Check, Eye, EyeOff, Search } from "lucide-react"
import { toast } from "sonner"

interface UserProfile {
    id:           string
    email:        string
    full_name:    string | null
    role:         string
    department:   string | null
    group_number: number | null
    supervisor_id: string | null
    created_at:   string
}

const DEPARTMENTS = ["Blowing", "Alcohol and Blending", "Filling Line", "Packaging", "Concentrate"]
const ROLES       = ["supervisor", "manager", "admin", "procurement"]
const ROLE_LABELS: Record<string, string> = {
    supervisor:   "Supervisor",
    manager:      "Manager",
    admin:        "Administrator",
    procurement:  "Stock Office",
}
const ROLE_COLORS: Record<string, string> = {
    supervisor:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    manager:     "bg-slate-100 text-slate-700 border-slate-200",
    admin:       "bg-zinc-800 text-zinc-100 border-zinc-700",
    procurement: "bg-blue-50 text-blue-700 border-blue-200",
}

export default function UserManagement({ initialUsers }: { initialUsers: UserProfile[] }) {
    const [users, setUsers]           = useState<UserProfile[]>(initialUsers)
    const [search, setSearch]         = useState("")
    const [showCreate, setShowCreate] = useState(false)
    const [editId, setEditId]         = useState<string | null>(null)
    const [resetId, setResetId]       = useState<string | null>(null)
    const [deleteId, setDeleteId]     = useState<string | null>(null)

    // Create form state
    const [newUser, setNewUser] = useState({
        username: "", password: "", full_name: "", role: "supervisor", department: "", group_number: "",
    })
    const [showNewPass, setShowNewPass] = useState(false)
    const [creating, setCreating]       = useState(false)

    // Edit form state
    const [editData, setEditData] = useState<Partial<UserProfile>>({})
    const [saving, setSaving]     = useState(false)

    // Reset password state
    const [tempPass, setTempPass]   = useState("")
    const [showTempPass, setShowTempPass] = useState(false)
    const [resetting, setResetting] = useState(false)

    const [deleting, setDeleting] = useState(false)

    const filtered = users.filter(u =>
        (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        (u.department || "").toLowerCase().includes(search.toLowerCase())
    )

    // ── Create user ────────────────────────────────────────────────────────────
    const handleCreate = async () => {
        if (!newUser.username || !newUser.password || !newUser.role) {
            toast.error("Username, password and role are required.")
            return
        }
        setCreating(true)
        try {
            const res  = await fetch("/api/admin/users", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(newUser),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            toast.success(`User "${newUser.username}" created.`)
            setShowCreate(false)
            setNewUser({ username: "", password: "", full_name: "", role: "supervisor", department: "", group_number: "" })
            // Reload list
            const r2 = await fetch("/api/admin/users")
            const d2 = await r2.json()
            setUsers(d2.users || [])
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to create user.")
        } finally {
            setCreating(false)
        }
    }

    // ── Edit user ──────────────────────────────────────────────────────────────
    const startEdit = (u: UserProfile) => {
        setEditId(u.id)
        setEditData({ role: u.role, department: u.department || "", full_name: u.full_name || "", group_number: u.group_number || undefined })
    }

    const handleSave = async () => {
        if (!editId) return
        setSaving(true)
        try {
            const res  = await fetch(`/api/admin/users/${editId}`, {
                method:  "PATCH",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify(editData),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            toast.success("User updated.")
            setUsers(prev => prev.map(u => u.id === editId ? { ...u, ...editData } as UserProfile : u))
            setEditId(null)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to update user.")
        } finally {
            setSaving(false)
        }
    }

    // ── Reset password ─────────────────────────────────────────────────────────
    const handleReset = async () => {
        if (!resetId || !tempPass) { toast.error("Enter a temporary password."); return }
        setResetting(true)
        try {
            const res  = await fetch(`/api/admin/users/${resetId}`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ tempPassword: tempPass }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            toast.success("Password reset. Share the temporary password with the user.")
            setResetId(null)
            setTempPass("")
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to reset password.")
        } finally {
            setResetting(false)
        }
    }

    // ── Delete user ────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteId) return
        setDeleting(true)
        try {
            const res  = await fetch(`/api/admin/users/${deleteId}`, { method: "DELETE" })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            toast.success("User deleted.")
            setUsers(prev => prev.filter(u => u.id !== deleteId))
            setDeleteId(null)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Failed to delete user.")
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto animate-fade-in-up">

            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/dashboard" className="p-2 bg-white rounded-full border border-zinc-200 hover:bg-zinc-50 transition-colors text-zinc-600">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">User Management</h2>
                    <p className="text-zinc-500 font-medium mt-0.5 text-sm">{users.length} account{users.length !== 1 ? "s" : ""} total</p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 active:bg-black text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">New User</span>
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                    type="text"
                    placeholder="Search by name, email or department…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none transition-all"
                />
            </div>

            {/* User list */}
            <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
                {filtered.length === 0 ? (
                    <div className="p-12 text-center text-zinc-400 font-medium">No users found.</div>
                ) : (
                    <div className="divide-y divide-zinc-50">
                        {filtered.map(u => (
                            <div key={u.id} className="p-4 sm:p-5 hover:bg-zinc-50/50 transition-colors">
                                {editId === u.id ? (
                                    /* ── Inline edit row ── */
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Full Name</label>
                                                <input
                                                    value={editData.full_name || ""}
                                                    onChange={e => setEditData(p => ({ ...p, full_name: e.target.value }))}
                                                    className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Role</label>
                                                <select
                                                    value={editData.role || "supervisor"}
                                                    onChange={e => setEditData(p => ({ ...p, role: e.target.value }))}
                                                    className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none"
                                                >
                                                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Department</label>
                                                <select
                                                    value={editData.department || ""}
                                                    onChange={e => setEditData(p => ({ ...p, department: e.target.value }))}
                                                    className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none"
                                                >
                                                    <option value="">— None —</option>
                                                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Group</label>
                                                <select
                                                    value={editData.group_number || ""}
                                                    onChange={e => setEditData(p => ({ ...p, group_number: e.target.value ? Number(e.target.value) : undefined }))}
                                                    className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none"
                                                >
                                                    <option value="">— None —</option>
                                                    <option value="1">Group 1</option>
                                                    <option value="2">Group 2</option>
                                                    <option value="3">Group 3</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 pt-1">
                                            <button onClick={handleSave} disabled={saving}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 text-white text-xs font-bold rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-all">
                                                <Check className="w-3.5 h-3.5" />
                                                {saving ? "Saving…" : "Save"}
                                            </button>
                                            <button onClick={() => setEditId(null)}
                                                className="flex items-center gap-1.5 px-4 py-2 bg-zinc-100 text-zinc-600 text-xs font-bold rounded-xl hover:bg-zinc-200 transition-all">
                                                <X className="w-3.5 h-3.5" />
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    /* ── Display row ── */
                                    <div className="flex items-center gap-3 sm:gap-4">
                                        <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 text-sm font-bold text-zinc-600">
                                            {(u.full_name || u.email)[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-zinc-900 text-sm">{u.full_name || "—"}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.role] || ROLE_COLORS.supervisor}`}>
                                                    {ROLE_LABELS[u.role] || u.role}
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-400 mt-0.5 truncate">{u.email}</p>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {u.department && (
                                                    <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-full">
                                                        {u.department}
                                                    </span>
                                                )}
                                                {u.group_number && (
                                                    <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded-full">
                                                        Group {u.group_number}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => startEdit(u)} title="Edit"
                                                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => { setResetId(u.id); setTempPass("") }} title="Reset password"
                                                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-all">
                                                <KeyRound className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setDeleteId(u.id)} title="Delete"
                                                className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Create user modal ─────────────────────────────────────────────── */}
            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-zinc-900">Create New User</h3>
                            <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-all">
                                <X className="w-4 h-4 text-zinc-500" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            {[
                                { label: "Username", key: "username", type: "text",  placeholder: "e.g. john" },
                                { label: "Full Name", key: "full_name", type: "text", placeholder: "e.g. John Mensah" },
                            ].map(({ label, key, type, placeholder }) => (
                                <div key={key} className="space-y-1">
                                    <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">{label}</label>
                                    <input
                                        type={type}
                                        placeholder={placeholder}
                                        value={(newUser as Record<string,string>)[key]}
                                        onChange={e => setNewUser(p => ({ ...p, [key]: e.target.value }))}
                                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none transition-all"
                                    />
                                </div>
                            ))}

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Password</label>
                                <div className="relative">
                                    <input
                                        type={showNewPass ? "text" : "password"}
                                        placeholder="Min 6 characters"
                                        value={newUser.password}
                                        onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                                        className="w-full px-3 py-2.5 pr-10 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none transition-all"
                                    />
                                    <button type="button" onClick={() => setShowNewPass(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                                        {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Role</label>
                                    <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none">
                                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Group</label>
                                    <select value={newUser.group_number} onChange={e => setNewUser(p => ({ ...p, group_number: e.target.value }))}
                                        className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none">
                                        <option value="">—</option>
                                        <option value="1">Group 1</option>
                                        <option value="2">Group 2</option>
                                        <option value="3">Group 3</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Department</label>
                                <select value={newUser.department} onChange={e => setNewUser(p => ({ ...p, department: e.target.value }))}
                                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none">
                                    <option value="">— None —</option>
                                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setShowCreate(false)}
                                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-all">
                                Cancel
                            </button>
                            <button onClick={handleCreate} disabled={creating}
                                className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all">
                                {creating ? "Creating…" : "Create User"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reset password modal ──────────────────────────────────────────── */}
            {resetId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-zinc-900">Reset Password</h3>
                            <button onClick={() => setResetId(null)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-all">
                                <X className="w-4 h-4 text-zinc-500" />
                            </button>
                        </div>
                        <p className="text-sm text-zinc-500">
                            Set a temporary password for <strong className="text-zinc-700">{users.find(u => u.id === resetId)?.full_name || "this user"}</strong>. 
                            Ask them to change it after logging in.
                        </p>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Temporary Password</label>
                            <div className="relative">
                                <input
                                    type={showTempPass ? "text" : "password"}
                                    placeholder="Min 6 characters"
                                    value={tempPass}
                                    onChange={e => setTempPass(e.target.value)}
                                    className="w-full px-3 py-2.5 pr-10 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none"
                                />
                                <button type="button" onClick={() => setShowTempPass(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                                    {showTempPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setResetId(null)}
                                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-all">
                                Cancel
                            </button>
                            <button onClick={handleReset} disabled={resetting || !tempPass}
                                className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all">
                                {resetting ? "Resetting…" : "Reset Password"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete confirm modal ──────────────────────────────────────────── */}
            {deleteId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5">
                        <h3 className="text-lg font-bold text-zinc-900">Delete User?</h3>
                        <p className="text-sm text-zinc-500">
                            This will permanently delete <strong className="text-zinc-700">{users.find(u => u.id === deleteId)?.full_name || "this user"}</strong> and all their login access. 
                            Their submitted records will remain.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteId(null)}
                                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-all">
                                Cancel
                            </button>
                            <button onClick={handleDelete} disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-all">
                                {deleting ? "Deleting…" : "Yes, Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
