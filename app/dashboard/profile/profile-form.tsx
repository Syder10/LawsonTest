"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface ProfileFormProps {
    userId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialData: any
    username: string
}

export default function ProfileForm({ userId, initialData, username }: ProfileFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [formData, setFormData] = useState({
        full_name: initialData.full_name || "",
        department: initialData.department || "",
        group_number: initialData.group_number || 1,
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            const response = await fetch("/api/profile/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    ...formData,
                }),
            })

            if (!response.ok) throw new Error("Failed to update profile")

            toast.success("Profile updated successfully!")
            router.refresh()
        } catch (error) {
            toast.error("There was a problem updating your profile.")
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <Label className="text-emerald-900 font-semibold">Account Identifier</Label>
                    <Input
                        disabled
                        value={username}
                        className="w-full p-6 text-base rounded-xl border-emerald-100 bg-emerald-50/50 text-emerald-800"
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
                        className="w-full p-6 text-base rounded-xl border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-slate-900 font-medium"
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="department" className="text-emerald-900 font-semibold">Department</Label>
                    <select
                        id="department"
                        name="department"
                        value={formData.department}
                        onChange={handleChange}
                        required
                        className="w-full p-4 h-[58px] text-base rounded-xl border border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-slate-900 font-medium"
                    >
                        <option value="" disabled>Select Department</option>
                        <option value="Blowing">Blowing</option>
                        <option value="Alcohol and Blending">Alcohol and Blending</option>
                        <option value="Filling Line">Filling Line</option>
                        <option value="Packaging">Packaging</option>
                        <option value="Concentrate">Concentrate</option>
                    </select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="group_number" className="text-emerald-900 font-semibold">Group Number</Label>
                    <select
                        id="group_number"
                        name="group_number"
                        value={formData.group_number}
                        onChange={handleChange}
                        required
                        className="w-full p-4 h-[58px] text-base rounded-xl border border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all text-slate-900 font-medium"
                    >
                        <option value={1}>Group 1</option>
                        <option value={2}>Group 2</option>
                        <option value={3}>Group 3</option>
                    </select>
                </div>
            </div>

            <div className="pt-6 border-t border-emerald-100 flex justify-end">
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-6 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all w-full md:w-auto"
                >
                    {isSubmitting ? "Saving Changes..." : "Save Profile"}
                </Button>
            </div>
        </form>
    )
}
