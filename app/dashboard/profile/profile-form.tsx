"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Chip, Field, SectionTitle, TextInput } from "@/components/primitives"

interface ProfileFormProps {
    initialData: { full_name?: string | null; department?: string | null; group_number?: number | null }
    username: string
}

// Only full_name is self-editable. Department, group and role are privileged
// columns assigned by an administrator and enforced by a DB trigger
// (0003_identity.sql) — they are shown read-only here.
export default function ProfileForm({ initialData, username }: ProfileFormProps) {
    const router = useRouter()
    const [fullName, setFullName] = useState(initialData.full_name || "")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [nameError, setNameError] = useState<string | null>(null)

    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showNew, setShowNew] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [isChangingPassword, setIsChangingPassword] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setNameError(null)
        if (!fullName.trim()) {
            setNameError("Enter your full name.")
            return
        }
        setIsSubmitting(true)
        try {
            const res = await fetch("/api/profile/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name: fullName }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Couldn’t save your profile.")
            toast.success("Profile saved")
            router.refresh()
        } catch (error) {
            // Inline, matching the password form — this used to be a toast while
            // password errors were inline, in the same card.
            setNameError(error instanceof Error ? error.message : "Couldn’t save your profile.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setPasswordError(null)

        if (newPassword.length < 6) {
            setPasswordError("Use at least 6 characters.")
            return
        }
        if (newPassword !== confirmPassword) {
            setPasswordError("Those two passwords don’t match.")
            return
        }

        setIsChangingPassword(true)
        try {
            const res = await fetch("/api/profile/update-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: newPassword }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || "Couldn’t update your password.")
            toast.success("Password updated")
            setNewPassword("")
            setConfirmPassword("")
        } catch (error) {
            setPasswordError(error instanceof Error ? error.message : "Couldn’t update your password.")
        } finally {
            setIsChangingPassword(false)
        }
    }

    return (
        <div className="space-y-8">
            {/* ── Account ── */}
            <form onSubmit={handleSubmit} className="space-y-5">
                <SectionTitle>Account</SectionTitle>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Username" hint="Your login name cannot be changed.">
                        {(a11y) => <TextInput {...a11y} value={username} disabled />}
                    </Field>

                    <Field label="Full name" required error={nameError}>
                        {(a11y) => (
                            <TextInput
                                {...a11y}
                                value={fullName}
                                onChange={(e) => { setFullName(e.target.value); setNameError(null) }}
                                placeholder="e.g. Kwame Mensah"
                                autoComplete="name"
                            />
                        )}
                    </Field>
                </div>

                <div className="rounded-xl border border-hairline bg-surface-sunken p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Lock className="w-3.5 h-3.5 text-ink-muted shrink-0" aria-hidden="true" />
                        <p className="text-sm font-semibold text-ink-primary">Assigned by an administrator</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Chip tone={initialData.department ? "brand" : "neutral"}>
                            {initialData.department || "No department"}
                        </Chip>
                        <Chip tone={initialData.group_number ? "brand" : "neutral"}>
                            {initialData.group_number ? `Group ${initialData.group_number}` : "No group"}
                        </Chip>
                    </div>
                    <p className="text-xs text-ink-muted mt-2">
                        These set your shift roster and which records you must submit. Ask your manager if either is wrong.
                    </p>
                </div>

                <div className="flex justify-end">
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="h-11 px-6 text-sm font-bold bg-brand-solid hover:bg-brand-solid-hover text-brand-ink rounded-xl w-full sm:w-auto active:scale-[0.97]"
                    >
                        {isSubmitting ? "Saving…" : "Save profile"}
                    </Button>
                </div>
            </form>

            {/* ── Password ── */}
            <form onSubmit={handlePasswordSubmit} className="space-y-5 border-t border-hairline pt-8">
                <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-full bg-brand-subtle text-brand flex items-center justify-center shrink-0">
                        <KeyRound className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                        <SectionTitle>Change password</SectionTitle>
                        <p className="text-sm text-ink-muted">At least 6 characters.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="New password" required>
                        {(a11y) => (
                            <div className="relative">
                                <TextInput
                                    {...a11y}
                                    type={showNew ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null) }}
                                    autoComplete="new-password"
                                    className="pr-12"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNew((v) => !v)}
                                    aria-label={showNew ? "Hide password" : "Show password"}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink-secondary transition-colors"
                                >
                                    {showNew ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                                </button>
                            </div>
                        )}
                    </Field>

                    <Field label="Confirm password" required error={passwordError}>
                        {(a11y) => (
                            <div className="relative">
                                <TextInput
                                    {...a11y}
                                    type={showConfirm ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null) }}
                                    autoComplete="new-password"
                                    className="pr-12"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm((v) => !v)}
                                    aria-label={showConfirm ? "Hide password" : "Show password"}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink-secondary transition-colors"
                                >
                                    {showConfirm ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                                </button>
                            </div>
                        )}
                    </Field>
                </div>

                <div className="flex justify-end">
                    <Button
                        type="submit"
                        disabled={isChangingPassword}
                        className="h-11 px-6 text-sm font-bold bg-brand-solid hover:bg-brand-solid-hover text-brand-ink rounded-xl w-full sm:w-auto active:scale-[0.97]"
                    >
                        {isChangingPassword ? "Updating…" : "Update password"}
                    </Button>
                </div>
            </form>
        </div>
    )
}
