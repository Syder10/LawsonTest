"use client"

import { useState } from "react"
import { X, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { DEPARTMENTS } from "@/lib/domain/record-types"
import { ROLES, ROLE_LABELS } from "@/lib/domain/roles"

const BLANK = { username: "", password: "", full_name: "", role: "supervisor", department: "", group_number: "" }

// Self-contained "create user" modal. Owns its own form state; calls onCreated
// after a successful create so the parent can refresh its list.
export function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(BLANK)
  const [showPass, setShowPass] = useState(false)
  const [creating, setCreating] = useState(false)

  const submit = async () => {
    if (!form.username || !form.password || !form.role) {
      toast.error("Username, password and role are required.")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`User "${form.username}" created.`)
      onCreated()
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create user.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">Create New User</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-all"><X className="w-4 h-4 text-zinc-500" /></button>
        </div>

        <div className="space-y-3">
          {([{ label: "Username", key: "username", placeholder: "e.g. john" }, { label: "Full Name", key: "full_name", placeholder: "e.g. John Mensah" }] as const).map(({ label, key, placeholder }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">{label}</label>
              <input type="text" placeholder={placeholder} value={form[key]} onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none transition-all" />
            </div>
          ))}

          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Password</label>
            <div className="relative">
              <input type={showPass ? "text" : "password"} placeholder="Min 6 characters" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full px-3 py-2.5 pr-10 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none transition-all" />
              <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Role</label>
              <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-600 uppercase tracking-wide">Group</label>
              <select value={form.group_number} onChange={(e) => setForm((p) => ({ ...p, group_number: e.target.value }))}
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
            <select value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-zinc-200 bg-white focus:border-zinc-400 focus:outline-none">
              <option value="">— None —</option>
              {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-all">Cancel</button>
          <button onClick={submit} disabled={creating} className="flex-1 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all">
            {creating ? "Creating…" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  )
}
