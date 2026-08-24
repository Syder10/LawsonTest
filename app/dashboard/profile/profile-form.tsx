"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { KeyRound, Eye, EyeOff, Lock } from "lucide-react"

interface ProfileFormProps {
    initialData: { full_name?: string | null; department?: string | null; group_number?: number | null }
    username: string
}

export default function ProfileForm({ initialData, username }: ProfileFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    // Only full_name is self-editable. Department, group and role are privileged
    // columns assigned by an administrator and enforced by a DB trigger
    // (0012_profile_privilege_guard.sql) — they are shown read-only here.
    const [formData, setFormData] = useState({
        full_name: initialData.full_name || "",
    })

    // Password change state
    const [passwordData, setPasswordData] = useState({
        newPassword: "",
        confirmPassword: "",
    })
    const [isChangingPassword, setIsChangingPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [passwordError, setPasswordError] = useState("")

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setPasswordData((prev) => ({ ...prev, [name]: value }))
        setPasswordError("")
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            const response = await fetch("/api/profile/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ full_name: formData.full_name }),
            })

            const data = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(data.error || "Failed to update profile")

            toast.success("Profile updated successfully!")
            router.refresh()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "There was a problem updating your profile.")
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (passwordData.newPassword.length < 6) {
            setPasswordError("Password must be at least 6 characters.")
            return
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordError("Passwords do not match.")
            return
        }

        setIsChangingPassword(true)
        try {
            const response = await fetch("/api/profile/update-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: passwordData.newPassword }),
            })

            const data = await response.json()
            if (!response.ok) throw new Error(data.error || "Failed to update password")

            toast.success("Password updated successfully!")
            setPasswordData({ newPassword: "", confirmPassword: "" })
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "There was a problem updating your password."
            toast.error(msg)
            console.error(error)
        } finally {
            setIsChangingPassword(false)
        }
    }

    return (
        <div className="space-y-10">
            {/* ── Profile Info ── */}
            <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label className="text-emerald-900 font-semibold">Account Identifier</Label>
                        <Input
                            disabled
                            value={username}
                            className="w-full px-4 py-3 text-base rounded-xl border-emerald-100 bg-emerald-50/50 text-emerald-800"
                        />
                        <p className="text-xs text-slate-500">Your login identifier cannot be changed.</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="full_name" className="text-emerald-900 font-semibold">Full Name</Label>
                        <Input
                            id="full_name"
                            name="full_name"
                            value={formData.full_name}
                            onChange={handleChange}
                            placeholder="John Doe"
                            required
                            className="w-full px-4 py-3 text-base rounded-xl border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-slate-900 font-medium"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-emerald-900 font-semibold flex items-center gap-1.5">
                            Department <Lock className="w-3 h-3 text-slate-400" />
                        </Label>
                        <Input
                            disabled
                            value={initialData.department || "Not assigned"}
                            className="w-full px-4 py-3 text-base rounded-xl border-emerald-100 bg-emerald-50/50 text-emerald-800"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-emerald-900 font-semibold flex items-center gap-1.5">
                            Group Number <Lock className="w-3 h-3 text-slate-400" />
                        </Label>
                        <Input
                            disabled
                            value={initialData.group_number ? `Group ${initialData.group_number}` : "Not assigned"}
                            className="w-full px-4 py-3 text-base rounded-xl border-emerald-100 bg-emerald-50/50 text-emerald-800"
                        />
                    </div>
                </div>

                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                    Your department and rotation group determine your shift roster and which records you must submit, so they
                    are assigned by an administrator. Ask your manager if either is wrong or missing.
                </p>

                <div className="pt-6 border-t border-emerald-100 flex justify-end">
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-6 py-3 text-base font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all w-full sm:w-auto"
                    >
                        {isSubmitting ? "Saving Changes..." : "Save Profile"}
                    </Button>
                </div>
            </form>

            {/* ── Change Password ── */}
            <div className="border-t border-emerald-100 pt-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-emerald-950">Change Password</h3>
                        <p className="text-sm text-slate-500">Update your login password. Minimum 6 characters.</p>
                    </div>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="newPassword" className="text-emerald-900 font-semibold">New Password</Label>
                            <div className="relative">
                                <Input
                                    id="newPassword"
                                    name="newPassword"
                                    type={showNewPassword ? "text" : "password"}
                                    value={passwordData.newPassword}
                                    onChange={handlePasswordChange}
                                    placeholder="Enter new password"
                                    required
                                    minLength={6}
                                    className="w-full px-4 py-3 pr-12 text-base rounded-xl border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-slate-900 font-medium"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword((v) => !v)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors"
                                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                                >
                                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-emerald-900 font-semibold">Confirm Password</Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={passwordData.confirmPassword}
                                    onChange={handlePasswordChange}
                                    placeholder="Confirm new password"
                                    required
                                    minLength={6}
                                    className="w-full px-4 py-3 pr-12 text-base rounded-xl border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-slate-900 font-medium"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword((v) => !v)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors"
                                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                                >
                                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {passwordError && (
                        <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                            {passwordError}
                        </p>
                    )}

                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            disabled={isChangingPassword}
                            className="px-6 py-3 text-base font-bold bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white rounded-xl shadow-lg shadow-slate-800/20 transition-all w-full sm:w-auto"
                        >
                            {isChangingPassword ? "Updating Password..." : "Update Password"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}
