"use client"

import { useState } from "react"
import type { FormField } from "@/constants/formConfig"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface RecordEntryFormProps {
    recordType: string
    supervisorName: string
    department: string
    groupNumber: number
    fields: FormField[]
    availableProducts: string[]
}

export default function RecordEntryForm({
    recordType,
    supervisorName,
    department,
    groupNumber,
    fields,
    availableProducts,
}: RecordEntryFormProps) {
    const router = useRouter()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [shift, setShift] = useState<string>("")
    const [selectedDate, setSelectedDate] = useState<string>(
        new Date().toISOString().split('T')[0]
    )
    const [selectedProduct, setSelectedProduct] = useState<string>(availableProducts[0] || "")

    // Basic flexible state - we can upgrade to react-hook-form later if desired, 
    // but using a simple state dict is currently robust for dynamic field mapping.
    const [formData, setFormData] = useState<Record<string, string>>({})

    const handleInputChange = (label: string, value: string) => {
        setFormData((prev) => ({ ...prev, [label]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!shift) {
            toast.error("Please select a shift before submitting.")
            return
        }

        setIsSubmitting(true)

        try {
            const response = await fetch("/api/records/submit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    recordType,
                    supervisorName,
                    department,
                    group: groupNumber,
                    shift,
                    date: selectedDate,
                    productType: availableProducts.length > 0 ? selectedProduct : undefined,
                    formData,
                }),
            })

            if (!response.ok) {
                throw new Error("Failed to submit record")
            }

            toast.success("Record submitted successfully!")
            router.push("/dashboard/forms")
        } catch (error) {
            toast.error("There was a problem submitting the record.")
            console.error(error)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-emerald-100">
            <form onSubmit={handleSubmit} className="space-y-10">

                {/* NEW REQUIREMENT: Shift Type Priority Layout */}
                <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                    <Label className="text-base font-bold text-emerald-950 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">1</span>
                        Select Shift Type *
                    </Label>
                    <div className="flex gap-4">
                        {["Morning", "Afternoon", "Night"].map((s) => (
                            <label
                                key={s}
                                className={`flex-1 flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${shift === s
                                    ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm"
                                    : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="shift"
                                    value={s}
                                    checked={shift === s}
                                    onChange={(e) => setShift(e.target.value)}
                                    className="sr-only"
                                />
                                <span className="font-semibold">{s}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* NEW REQUIREMENT: Explicit Date Selection */}
                <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                    <Label className="text-base font-bold text-emerald-950 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">2</span>
                        Select Date *
                    </Label>
                    <div className="flex gap-4">
                        <Input
                            type="date"
                            required
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full md:w-1/2 p-6 text-base rounded-xl border-emerald-200 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all font-semibold text-emerald-900 shadow-sm"
                        />
                    </div>
                </div>

                {/* Product Type Selector (If applicable) */}
                {availableProducts.length > 0 && (
                    <div className="space-y-4">
                        <Label className="text-base font-bold text-emerald-950 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">3</span>
                            Select Product Type *
                        </Label>
                        <div className="flex gap-4">
                            {availableProducts.map((p) => (
                                <label
                                    key={p}
                                    className={`flex-1 flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedProduct === p
                                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm"
                                        : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="product"
                                        value={p}
                                        checked={selectedProduct === p}
                                        onChange={(e) => setSelectedProduct(e.target.value)}
                                        className="sr-only"
                                    />
                                    <span className="font-semibold">{p}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <hr className="border-emerald-100" />

                {/* Dynamic Form Fields */}
                <div className="space-y-6">
                    <h3 className="text-lg font-bold text-emerald-950 mb-4">Record Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {fields.map((field) => (
                            <div key={field.label} className="space-y-2">
                                <Label className="text-emerald-900 font-semibold">{field.label}</Label>
                                {field.type === "textarea" ? (
                                    <textarea
                                        className="w-full p-4 rounded-xl border border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all resize-none"
                                        rows={3}
                                        placeholder="Enter details..."
                                        value={formData[field.label] || ""}
                                        onChange={(e) => handleInputChange(field.label, e.target.value)}
                                        required={field.required}
                                    />
                                ) : (
                                    <Input
                                        type={field.type}
                                        value={formData[field.label] || ""}
                                        onChange={(e) => handleInputChange(field.label, e.target.value)}
                                        required={field.required}
                                        className="w-full p-6 text-base rounded-xl border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 transition-all"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Form Actions */}
                <div className="pt-6 border-t border-emerald-100 flex items-center justify-end gap-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                        className="px-6 py-6 text-base font-semibold border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-8 py-6 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
                    >
                        {isSubmitting ? "Submitting..." : "Submit Record"}
                    </Button>
                </div>
            </form>
        </div>
    )
}
