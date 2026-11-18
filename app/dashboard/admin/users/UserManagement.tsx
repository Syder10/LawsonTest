"use client"

import { useState } from "react"
import { Plus, Pencil, KeyRound, Trash2, X, Check, Eye, EyeOff, Search } from "lucide-react"
import { toast } from "sonner"
import { DEPARTMENTS } from "@/lib/domain/record-types"
import { ROLES, ROLE_LABELS, ROLE_COLORS } from "@/lib/domain/roles"
import { groupsForDepartment } from "@/lib/shift-config"
import { Card, Chip, EmptyState, Field, PageHeader, Select, TextInput } from "@/components/primitives"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CreateUserModal } from "./CreateUserModal"

interface UserProfile {
    id:           string
    email:        string
    full_name:    string | null
    role:         string
    department:   string | null
    group_number: number | null
    created_at:   string
}

export default function UserManagement({ initialUsers }: { initialUsers: UserProfile[] }) {
    const [users, setUsers]           = useState<UserProfile[]>(initialUsers)
    const [search, setSearch]         = useState("")
    const [showCreate, setShowCreate] = useState(false)
    const [editId, setEditId]         = useState<string | null>(null)
    const [resetId, setResetId]       = useState<string | null>(null)
    const [deleteId, setDeleteId]     = useState<string | null>(null)

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

    const reloadUsers = async () => {
        const r = await fetch("/api/admin/users")
        const d = await r.json()
        setUsers(d.users || [])
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
            <PageHeader
                title="User Management"
                description={`${users.length} account${users.length !== 1 ? "s" : ""} total`}
                backHref="/dashboard"
                actions={
                    <Button onClick={() => setShowCreate(true)} className="h-11">
                        <Plus className="w-4 h-4" aria-hidden="true" />
                        <span className="hidden sm:inline">New user</span>
                        <span className="sr-only sm:hidden">New user</span>
                    </Button>
                }
            />

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" aria-hidden="true" />
                <TextInput
                    type="search"
                    aria-label="Search users"
                    placeholder="Search by name, email or department…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            {/* User list */}
            <Card>
                {filtered.length === 0 ? (
                    <EmptyState
                        icon={<Search className="w-5 h-5" aria-hidden="true" />}
                        title={users.length === 0 ? "No accounts yet" : "No users match that search"}
                        description={users.length === 0 ? "Create the first account to get started." : "Try a name, an email address, or a department."}
                    />
                ) : (
                    <div className="divide-y divide-hairline">
                        {filtered.map(u => (
                            <div key={u.id} className="p-4 sm:p-5 hover:bg-surface-sunken/60 transition-colors">
                                {editId === u.id ? (
                                    /* ── Inline edit row ── */
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <Field label="Full name">
                                                {p => (
                                                    <TextInput
                                                        {...p}
                                                        value={editData.full_name || ""}
                                                        onChange={e => setEditData(prev => ({ ...prev, full_name: e.target.value }))}
                                                    />
                                                )}
                                            </Field>
                                            <Field label="Role">
                                                {p => (
                                                    <Select
                                                        {...p}
                                                        value={editData.role || "supervisor"}
                                                        onChange={e => setEditData(prev => ({ ...prev, role: e.target.value }))}
                                                    >
                                                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                                    </Select>
                                                )}
                                            </Field>
                                            <Field label="Department">
                                                {p => (
                                                    <Select
                                                        {...p}
                                                        value={editData.department || ""}
                                                        onChange={e => {
                                                            const department = e.target.value
                                                            const allowed = department ? groupsForDepartment(department) : []
                                                            setEditData(prev => ({
                                                                ...prev,
                                                                department,
                                                                group_number: prev.group_number && allowed.includes(prev.group_number) ? prev.group_number : undefined,
                                                            }))
                                                        }}
                                                    >
                                                        <option value="">— None —</option>
                                                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                                                    </Select>
                                                )}
                                            </Field>
                                            <Field label="Group" hint={editData.department ? undefined : "Pick a department first."}>
                                                {p => (
                                                    <Select
                                                        {...p}
                                                        value={editData.group_number || ""}
                                                        disabled={!editData.department}
                                                        onChange={e => setEditData(prev => ({ ...prev, group_number: e.target.value ? Number(e.target.value) : undefined }))}
                                                    >
                                                        <option value="">— None —</option>
                                                        {(editData.department ? groupsForDepartment(editData.department) : []).map(g => (
                                                            <option key={g} value={g}>Group {g}</option>
                                                        ))}
                                                    </Select>
                                                )}
                                            </Field>
                                        </div>
                                        <div className="flex items-center gap-2 pt-1">
                                            <Button onClick={handleSave} disabled={saving} className="h-11">
                                                <Check className="w-4 h-4" aria-hidden="true" />
                                                {saving ? "Saving…" : "Save"}
                                            </Button>
                                            <Button variant="secondary" onClick={() => setEditId(null)} className="h-11">
                                                <X className="w-4 h-4" aria-hidden="true" />
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    /* ── Display row ── */
                                    <div className="flex items-center gap-3 sm:gap-4">
                                        <div className="w-9 h-9 rounded-full bg-surface-sunken flex items-center justify-center shrink-0 text-sm font-bold text-ink-secondary" aria-hidden="true">
                                            {(u.full_name || u.email)[0].toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-bold text-ink-primary text-sm">{u.full_name || "—"}</span>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ROLE_COLORS[u.role] || ROLE_COLORS.supervisor}`}>
                                                    {ROLE_LABELS[u.role] || u.role}
                                                </span>
                                            </div>
                                            <p className="text-xs text-ink-muted mt-0.5 truncate">{u.email}</p>
                                            <div className="flex flex-wrap gap-2 mt-1">
                                                {u.department && <Chip>{u.department}</Chip>}
                                                {u.group_number && <Chip>Group {u.group_number}</Chip>}
                                            </div>
                                        </div>
                                        {/* 44px targets: these were 32px icon buttons sitting 4px apart. */}
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <button onClick={() => startEdit(u)} aria-label={`Edit ${u.full_name || u.email}`}
                                                className="h-11 w-11 flex items-center justify-center text-ink-muted hover:text-ink-primary hover:bg-surface-sunken rounded-xl transition-colors">
                                                <Pencil className="w-4 h-4" aria-hidden="true" />
                                            </button>
                                            <button onClick={() => { setResetId(u.id); setTempPass("") }} aria-label={`Reset password for ${u.full_name || u.email}`}
                                                className="h-11 w-11 flex items-center justify-center text-ink-muted hover:text-ink-primary hover:bg-surface-sunken rounded-xl transition-colors">
                                                <KeyRound className="w-4 h-4" aria-hidden="true" />
                                            </button>
                                            <button onClick={() => setDeleteId(u.id)} aria-label={`Delete ${u.full_name || u.email}`}
                                                className="h-11 w-11 flex items-center justify-center text-ink-muted hover:text-critical-ink hover:bg-critical-subtle rounded-xl transition-colors">
                                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* ── Create user modal ─────────────────────────────────────────────── */}
            {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={reloadUsers} />}

            {/* ── Reset password ────────────────────────────────────────────────────
                On the Dialog primitive: the two modals here were hand-rolled
                `fixed inset-0` overlays with no focus trap, no Escape and no
                scroll lock — and this one holds a password field. */}
            <Dialog open={!!resetId} onOpenChange={o => { if (!o) { setResetId(null); setTempPass("") } }}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Reset password</DialogTitle>
                        <DialogDescription>
                            Set a temporary password for{" "}
                            <strong className="text-ink-primary">{users.find(u => u.id === resetId)?.full_name || "this user"}</strong>.
                            Ask them to change it after logging in.
                        </DialogDescription>
                    </DialogHeader>

                    <Field label="Temporary password" hint="At least 6 characters.">
                        {p => (
                            <div className="relative">
                                <TextInput
                                    {...p}
                                    type={showTempPass ? "text" : "password"}
                                    autoComplete="new-password"
                                    placeholder="Min 6 characters"
                                    value={tempPass}
                                    onChange={e => setTempPass(e.target.value)}
                                    className="pr-12"
                                />
                                <button type="button" onClick={() => setShowTempPass(v => !v)}
                                    aria-label={showTempPass ? "Hide password" : "Show password"}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-sunken transition-colors">
                                    {showTempPass ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                                </button>
                            </div>
                        )}
                    </Field>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setResetId(null); setTempPass("") }} disabled={resetting}>Cancel</Button>
                        <Button onClick={handleReset} disabled={resetting || !tempPass}>
                            {resetting ? "Resetting…" : "Reset password"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete confirm ──────────────────────────────────────────────────── */}
            <Dialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete this user?</DialogTitle>
                        <DialogDescription>
                            This permanently deletes{" "}
                            <strong className="text-ink-primary">{users.find(u => u.id === deleteId)?.full_name || "this user"}</strong>{" "}
                            and their login access. Their submitted records remain.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                            {deleting ? "Deleting…" : "Yes, delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
