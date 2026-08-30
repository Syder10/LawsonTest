"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { DEPARTMENTS } from "@/lib/domain/record-types"
import { ROLES, ROLE_LABELS } from "@/lib/domain/roles"
import { groupsForDepartment } from "@/lib/shift-config"
import { Field, Select, TextInput } from "@/components/primitives"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const BLANK = { username: "", password: "", full_name: "", role: "supervisor", department: "", group_number: "" }

// Self-contained "create user" modal. Owns its own form state; calls onCreated
// after a successful create so the parent can refresh its list.
//
// The parent mounts this conditionally, so the Dialog is simply always open — it
// exists to bring the focus trap, Escape handling and scroll lock the previous
// hand-rolled `fixed inset-0` overlay had none of.
export function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(BLANK)
  const [showPass, setShowPass] = useState(false)
  const [creating, setCreating] = useState(false)

  const set = (key: keyof typeof BLANK) => (e: { target: { value: string } }) =>
    setForm((p) => ({ ...p, [key]: e.target.value }))

  // Group options follow the department: Alcohol and Blending rosters two groups,
  // and a supervisor parked on a group the rotation doesn't cover has no shift, so
  // no on-time window and no streak. Changing department drops a group that the
  // new one doesn't have.
  const groupOptions = form.department ? groupsForDepartment(form.department) : []
  const setDepartment = (e: { target: { value: string } }) => {
    const department = e.target.value
    const allowed = department ? groupsForDepartment(department).map(String) : []
    setForm((p) => ({ ...p, department, group_number: allowed.includes(p.group_number) ? p.group_number : "" }))
  }

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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new user</DialogTitle>
          <DialogDescription>
            The account can sign in immediately. Role, department and group decide which records they
            are asked for, so set them now — a supervisor cannot change their own.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Username" required>
            {(p) => <TextInput {...p} placeholder="e.g. john" autoComplete="off" value={form.username} onChange={set("username")} />}
          </Field>
          <Field label="Full name">
            {(p) => <TextInput {...p} placeholder="e.g. John Mensah" autoComplete="off" value={form.full_name} onChange={set("full_name")} />}
          </Field>

          <Field label="Password" required hint="At least 6 characters.">
            {(p) => (
              <div className="relative">
                <TextInput
                  {...p}
                  type={showPass ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={set("password")}
                  className="pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-sunken transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              {(p) => (
                <Select {...p} value={form.role} onChange={set("role")}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Group" hint={form.department ? undefined : "Pick a department first."}>
              {(p) => (
                <Select {...p} value={form.group_number} onChange={set("group_number")} disabled={!form.department}>
                  <option value="">—</option>
                  {groupOptions.map((g) => <option key={g} value={g}>Group {g}</option>)}
                </Select>
              )}
            </Field>
          </div>

          <Field label="Department">
            {(p) => (
              <Select {...p} value={form.department} onChange={setDepartment}>
                <option value="">— None —</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
            )}
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button onClick={submit} disabled={creating}>{creating ? "Creating…" : "Create user"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
