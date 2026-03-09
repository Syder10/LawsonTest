"use client"

import { useState, useEffect } from "react"
import type { FormField } from "@/constants/formConfig"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

interface RecordEntryFormProps {
    recordType: string
    supervisorName: string
    department: string
    groupNumber: number
    fields: FormField[]
    availableProducts: string[]
}

interface ExtractionTankData {
    [tankIndex: number]: {
        data: Record<string, string>
        isSameAsFirst: boolean
    }
}

const validateStockFields = (data: Record<string, string>): string => {
    const opening = Number(data["Opening Stock (BAGS)"] || data["Opening Stock Level"] || 0)
    const received = Number(data["Quantity Received"] || data["Quantity Received (BAGS)"] || 0)
    const used = Number(data["Quantity Used"] || data["Preforms Used (BAGS)"] || 0)
    const remaining = opening + received - used
    if (used > 0 && remaining < 0) {
        return `Cannot use more than available. Have ${opening}, received ${received}, trying to use ${used}`
    }
    return ""
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
    const [error, setError] = useState<string | null>(null)
    const [shift, setShift] = useState<string>("")
    const [selectedDate, setSelectedDate] = useState<string>(
        new Date().toISOString().split("T")[0]
    )

    // Multi-product support
    const supportsMultiProduct = availableProducts.length > 0
    const [productionTypes, setProductionTypes] = useState<string[]>([])
    const [formDataByProduct, setFormDataByProduct] = useState<Record<string, Record<string, string>>>({})
    const [stockErrors, setStockErrors] = useState<Record<string, string>>({})

    // Stock auto-population
    const [isLoadingStock, setIsLoadingStock] = useState(false)
    const [hasPreviousStock, setHasPreviousStock] = useState(false)
    const [previousStock, setPreviousStock] = useState<number | null>(null)
    const [perProductPreviousStock, setPerProductPreviousStock] = useState<Record<string, number | null>>({})

    // Extraction monitoring
    const [numberOfTanks, setNumberOfTanks] = useState(1)
    const [extractionTankData, setExtractionTankData] = useState<ExtractionTankData>({})

    // Herbs stock
    const [herbOptions, setHerbOptions] = useState<string[]>([])
    const [isLoadingHerbs, setIsLoadingHerbs] = useState(false)
    const [selectedHerbs, setSelectedHerbs] = useState<string[]>([])
    const [herbsData, setHerbsData] = useState<Record<string, Record<string, string>>>({})
    const [herbsPreviousStock, setHerbsPreviousStock] = useState<Record<string, number | null>>({})
    const [showCreateHerbDialog, setShowCreateHerbDialog] = useState(false)
    const [newHerbName, setNewHerbName] = useState("")

    // Load herbs
    useEffect(() => {
        const loadHerbs = async () => {
            setIsLoadingHerbs(true)
            try {
                const res = await fetch("/api/herbs")
                if (!res.ok) throw new Error()
                const data = await res.json()
                setHerbOptions(data.herbs ?? [])
            } catch {
                console.error("Failed to load herbs")
            } finally {
                setIsLoadingHerbs(false)
            }
        }
        loadHerbs()
    }, [])

    // Auto-populate previous stock
    useEffect(() => {
        const stockForms = [
            "Daily Records (Preform Usage)",
            "Daily Usage of Alcohol And Stock Level",
            "Caramel Stock",
            "Caps Stock",
            "Labels Stock",
        ]
        if (!stockForms.includes(recordType)) return

        const fetchStock = async () => {
            setIsLoadingStock(true)

            if (recordType === "Caramel Stock" || recordType === "Labels Stock") {
                try {
                    const products = ["Bitters", "Ginger"]
                    const results: Record<string, number | null> = {}
                    await Promise.all(
                        products.map(async (product) => {
                            const params = new URLSearchParams({ recordType, date: selectedDate, department, product })
                            const res = await fetch(`/api/records/previous-stock?${params}`)
                            if (!res.ok) { results[product] = null; return }
                            const data = await res.json()
                            results[product] = data.hasPrevious && data.previousStock != null ? data.previousStock : null
                        })
                    )
                    setPerProductPreviousStock(results)
                    setFormDataByProduct((prev) => {
                        const updated = { ...prev }
                        products.forEach((product) => {
                            if (results[product] != null) {
                                if (!updated[product]) updated[product] = {}
                                updated[product]["Opening Stock Level"] = String(results[product])
                                recalcFields(updated[product])
                            }
                        })
                        return updated
                    })
                    setHasPreviousStock(Object.values(results).some((v) => v != null))
                } catch { setHasPreviousStock(false) }
                finally { setIsLoadingStock(false) }
                return
            }

            try {
                const params = new URLSearchParams({ recordType, date: selectedDate, department })
                const res = await fetch(`/api/records/previous-stock?${params}`)
                if (!res.ok) { setHasPreviousStock(false); setIsLoadingStock(false); return }
                const data = await res.json()
                if (data.hasPrevious && data.previousStock != null) {
                    setPreviousStock(data.previousStock)
                    setHasPreviousStock(true)
                    const openingLabel = recordType === "Daily Records (Preform Usage)"
                        ? "Opening Stock (BAGS)"
                        : "Opening Stock Level"
                    setFormDataByProduct((prev) => {
                        const updated = { ...prev }
                        if (!updated["default"]) updated["default"] = {}
                        updated["default"][openingLabel] = String(data.previousStock)
                        recalcFields(updated["default"])
                        return updated
                    })
                } else {
                    setHasPreviousStock(false)
                }
            } catch { setHasPreviousStock(false) }
            finally { setIsLoadingStock(false) }
        }
        fetchStock()
    }, [recordType, selectedDate, department])

    const recalcFields = (data: Record<string, string>) => {
        fields.forEach((f) => {
            if (f.calculatedFrom && f.calculation && Array.isArray(f.calculatedFrom)) {
                const vals = f.calculatedFrom.reduce((acc, k) => {
                    acc[k] = parseFloat(data[k] || "0")
                    return acc
                }, {} as Record<string, number>)
                data[f.label] = String(f.calculation(vals))
            } else if (f.calculatedFrom && typeof f.calculatedFrom === "string" && f.multiplier) {
                data[f.label] = String(parseFloat(data[f.calculatedFrom] || "0") * f.multiplier)
            }
        })
    }

    const handleInputChange = (product: string | null, field: string, value: string) => {
        const key = product || "default"
        setFormDataByProduct((prev) => {
            const updated = { ...prev }
            if (!updated[key]) updated[key] = {}
            const updatedData = { ...updated[key], [field]: value }
            recalcFields(updatedData)
            const stockError = validateStockFields(updatedData)
            setStockErrors((prev) => ({ ...prev, [key]: stockError }))
            updated[key] = updatedData
            return updated
        })
    }

    const handleProductionTypeChange = (type: string) => {
        setProductionTypes((prev) =>
            prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
        )
    }

    // Extraction tank handlers
    const handleNumberOfTanksChange = (num: number) => {
        setNumberOfTanks(num)
        setExtractionTankData((prev) => {
            const updated = { ...prev }
            for (let i = 0; i < num; i++) {
                if (!updated[i]) updated[i] = { data: {}, isSameAsFirst: false }
            }
            return updated
        })
    }

    const handleExtractionTankChange = (tankIndex: number, field: string, value: string) => {
        setExtractionTankData((prev) => {
            const updated = { ...prev }
            if (!updated[tankIndex]) updated[tankIndex] = { data: {}, isSameAsFirst: false }
            updated[tankIndex] = { ...updated[tankIndex], data: { ...updated[tankIndex].data, [field]: value } }
            return updated
        })
    }

    const handleCopyFromFirst = (tankIndex: number, checked: boolean) => {
        setExtractionTankData((prev) => {
            const updated = { ...prev }
            if (!updated[tankIndex]) updated[tankIndex] = { data: {}, isSameAsFirst: false }
            updated[tankIndex] = {
                ...updated[tankIndex],
                isSameAsFirst: checked,
                data: checked && prev[0]?.data ? JSON.parse(JSON.stringify(prev[0].data)) : updated[tankIndex].data,
            }
            return updated
        })
    }

    // Herb handlers
    const fetchHerbPreviousStock = async (herb: string) => {
        try {
            const params = new URLSearchParams({ recordType: "Herbs Stock", date: selectedDate, department, herbType: herb })
            const res = await fetch(`/api/records/previous-stock?${params}`)
            const data = await res.json()
            if (data.hasPrevious && data.previousStock != null) {
                setHerbsPreviousStock((prev) => ({ ...prev, [herb]: data.previousStock }))
                setHerbsData((prev) => {
                    const updated = { ...prev }
                    if (!updated[herb]) updated[herb] = {}
                    updated[herb]["Available Stock"] = String(data.previousStock)
                    return updated
                })
            } else {
                setHerbsPreviousStock((prev) => ({ ...prev, [herb]: null }))
            }
        } catch {
            setHerbsPreviousStock((prev) => ({ ...prev, [herb]: null }))
        }
    }

    const handleHerbSelectionChange = (herb: string) => {
        setSelectedHerbs((prev) => {
            if (prev.includes(herb)) return prev.filter((h) => h !== herb)
            fetchHerbPreviousStock(herb)
            return [...prev, herb]
        })
    }

    const handleHerbFieldChange = (herb: string, fieldLabel: string, value: string) => {
        setHerbsData((prev) => {
            const herbData = { ...(prev[herb] || {}), [fieldLabel]: value }
            if (["Available Stock", "Qty Received"].includes(fieldLabel)) {
                herbData["Total Qty"] = String(
                    Number(herbData["Available Stock"] || 0) + Number(herbData["Qty Received"] || 0)
                )
            }
            if (["Available Stock", "Qty Received", "Qty Used"].includes(fieldLabel)) {
                herbData["Remaining Qty"] = String(
                    Number(herbData["Available Stock"] || 0) +
                    Number(herbData["Qty Received"] || 0) -
                    Number(herbData["Qty Used"] || 0)
                )
            }
            return { ...prev, [herb]: herbData }
        })
    }

    const handleCreateHerb = async () => {
        const trimmedName = newHerbName.trim()
        if (!trimmedName) { setError("Please enter a herb name"); return }
        if (herbOptions.map((h) => h.toLowerCase()).includes(trimmedName.toLowerCase())) {
            setError("This herb already exists"); return
        }
        try {
            const res = await fetch("/api/herbs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: trimmedName }),
            })
            const data = await res.json()
            if (!res.ok) { setError(data.error || "Failed to create herb"); return }
            setHerbOptions((prev) => [...prev, trimmedName].sort())
            setSelectedHerbs((prev) => [...prev, trimmedName])
            fetchHerbPreviousStock(trimmedName)
            setShowCreateHerbDialog(false)
            setNewHerbName("")
            setError(null)
        } catch { setError("Failed to create herb") }
    }

    // ── Field renderer ──────────────────────────────────────────────────────────
    const renderField = (field: FormField, product: string) => {
        const value = formDataByProduct[product]?.[field.label] || ""
        const isOpeningStock = field.isStockField && field.stockFieldType === "opening"
        const isLocked = isOpeningStock && (
            (recordType === "Caramel Stock" || recordType === "Labels Stock")
                ? perProductPreviousStock[product] != null
                : hasPreviousStock
        )
        const isDisabled = !!field.disabled || isLocked
        const isCalculated = field.disabled && (field.calculatedFrom || field.multiplier)

        if (field.isExtractionAlcoholPercentage && field.options) {
            return (
                <div className="flex gap-3">
                    {field.options.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name={`${product}-${field.label}`}
                                value={opt}
                                checked={value === opt}
                                onChange={(e) => handleInputChange(product, field.label, e.target.value)}
                                disabled={isDisabled}
                                className="w-4 h-4 accent-emerald-600"
                            />
                            <span className="text-sm font-medium">{opt}</span>
                        </label>
                    ))}
                </div>
            )
        }

        if (field.type === "textarea") {
            return (
                <textarea
                    className="w-full p-3 rounded-xl border border-emerald-100 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 focus:outline-none resize-none transition-all"
                    rows={3}
                    value={value}
                    onChange={(e) => handleInputChange(product, field.label, e.target.value)}
                    disabled={isDisabled}
                    placeholder=""
                />
            )
        }

        return (
            <div className="relative">
                <Input
                    type={field.type}
                    value={value}
                    onChange={(e) => handleInputChange(product, field.label, e.target.value)}
                    disabled={isDisabled}
                    required={field.required}
                    className={`w-full p-5 text-base rounded-xl transition-all ${
                        isDisabled
                            ? "bg-emerald-50/80 border-emerald-100 cursor-not-allowed"
                            : "bg-white border-emerald-100 focus:border-emerald-500 focus:ring-emerald-500/20"
                    }`}
                />
                {isLocked && value && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-600">
                        🔒 prev. shift
                    </span>
                )}
                {isCalculated && value && !isLocked && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-600">
                        ✓ auto
                    </span>
                )}
            </div>
        )
    }

    const renderExtractionField = (
        field: FormField,
        tankIndex: number,
        value: string,
        onChange: (v: string) => void,
        disabled = false
    ) => {
        if (field.isExtractionAlcoholPercentage && field.options) {
            return (
                <div className="flex gap-3">
                    {field.options.map((opt) => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name={`tank-${tankIndex}-${field.label}`}
                                value={opt}
                                checked={value === opt}
                                onChange={(e) => onChange(e.target.value)}
                                disabled={disabled}
                                className="w-4 h-4 accent-emerald-600"
                            />
                            <span className="text-sm font-medium">{opt}</span>
                        </label>
                    ))}
                </div>
            )
        }
        if (field.type === "textarea") {
            return (
                <textarea
                    className="w-full p-3 rounded-xl border border-emerald-100 bg-white focus:outline-none focus:border-emerald-500 resize-none transition-all disabled:bg-emerald-50 disabled:cursor-not-allowed"
                    rows={3}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                />
            )
        }
        return (
            <Input
                type={field.type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={`w-full p-5 text-base rounded-xl transition-all ${
                    disabled ? "bg-emerald-50 border-emerald-100 cursor-not-allowed" : "bg-white border-emerald-100 focus:border-emerald-500"
                }`}
            />
        )
    }

    // ── Special form renderers ──────────────────────────────────────────────────
    const renderExtractionMonitoringForm = () => (
        <div className="space-y-6">
            <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 space-y-3">
                <Label className="text-sm font-bold text-emerald-900">Number of Tanks for Monitoring</Label>
                <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                        <button
                            key={num}
                            type="button"
                            onClick={() => handleNumberOfTanksChange(num)}
                            className={`px-4 py-2 rounded-xl font-semibold transition-all text-sm ${
                                numberOfTanks === num
                                    ? "bg-emerald-600 text-white shadow-sm"
                                    : "bg-white border-2 border-emerald-200 text-emerald-800 hover:border-emerald-400"
                            }`}
                        >
                            {num}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-4">
                {Array.from({ length: numberOfTanks }, (_, i) => i).map((tankIndex) => {
                    const tankData = extractionTankData[tankIndex]?.data || {}
                    const isSameAsFirst = extractionTankData[tankIndex]?.isSameAsFirst || false
                    return (
                        <div key={tankIndex} className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-emerald-900">Tank {tankIndex + 1}</h3>
                                {tankIndex > 0 && (
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600">
                                        <input
                                            type="checkbox"
                                            checked={isSameAsFirst}
                                            onChange={(e) => handleCopyFromFirst(tankIndex, e.target.checked)}
                                            className="w-4 h-4 accent-emerald-600"
                                        />
                                        Same as Tank 1
                                    </label>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {fields.map((field) => (
                                    <div key={`${tankIndex}-${field.label}`} className="space-y-2">
                                        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{field.label}</Label>
                                        {renderExtractionField(
                                            field,
                                            tankIndex,
                                            tankData[field.label] || "",
                                            (val) => handleExtractionTankChange(tankIndex, field.label, val),
                                            isSameAsFirst && tankIndex > 0 && field.label !== "Tank Number" && field.label !== "Alcohol Percentage"
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )

    const renderAlcoholConcentrateForm = () => {
        const tank70 = fields.filter((f) => f.label.includes("(70)"))
        const tank80 = fields.filter((f) => f.label.includes("(80)"))
        const other = fields.filter((f) => !f.label.includes("(70)") && !f.label.includes("(80)"))
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h3 className="text-center font-bold text-emerald-800 border-b border-emerald-200 pb-2">70% (350L)</h3>
                        {tank70.map((field) => (
                            <div key={field.label} className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{field.label.replace(" (70)", "")}</Label>
                                {renderField(field, "default")}
                            </div>
                        ))}
                    </div>
                    <div className="space-y-4">
                        <h3 className="text-center font-bold text-emerald-800 border-b border-emerald-200 pb-2">80% (400L)</h3>
                        {tank80.map((field) => (
                            <div key={field.label} className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{field.label.replace(" (80)", "")}</Label>
                                {renderField(field, "default")}
                            </div>
                        ))}
                    </div>
                </div>
                {other.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-emerald-100">
                        {other.map((field) => (
                            <div key={field.label} className="space-y-2">
                                <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{field.label}</Label>
                                {renderField(field, "default")}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    const renderHerbsStockForm = () => {
        const stockFieldLabels = ["Available Stock", "Qty Received", "Total Qty", "Qty Used", "Remaining Qty", "Checked By", "Remarks"]
        return (
            <div className="space-y-6">
                <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 space-y-3">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm font-bold text-emerald-900">Select Herbs (multiple allowed)</Label>
                        <button
                            type="button"
                            onClick={() => setShowCreateHerbDialog(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors"
                        >
                            <Plus size={15} /> Create Herb
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {isLoadingHerbs ? (
                            <p className="text-sm text-emerald-700/70">Loading herbs...</p>
                        ) : (
                            herbOptions.map((herb) => (
                                <label key={herb} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={selectedHerbs.includes(herb)}
                                        onChange={() => handleHerbSelectionChange(herb)}
                                        className="w-4 h-4 accent-emerald-600"
                                    />
                                    <span className="text-sm text-slate-700 font-medium">{herb}</span>
                                </label>
                            ))
                        )}
                    </div>
                    {selectedHerbs.length > 0 && (
                        <p className="text-xs text-emerald-700/70 font-medium">Selected: {selectedHerbs.join(", ")}</p>
                    )}
                </div>

                {selectedHerbs.length > 0 && (
                    <div className="space-y-4">
                        {selectedHerbs.map((herb) => (
                            <div key={herb} className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm">
                                <p className="font-bold text-emerald-900 mb-4">{herb}</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    {stockFieldLabels.map((fieldLabel) => {
                                        const isAutoCalc = ["Total Qty", "Remaining Qty"].includes(fieldLabel)
                                        const isAvailableLocked =
                                            fieldLabel === "Available Stock" &&
                                            herbsPreviousStock[herb] != null
                                        const isDisabled = isAutoCalc || isAvailableLocked
                                        return (
                                            <div key={fieldLabel} className="space-y-1">
                                                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{fieldLabel}</Label>
                                                <div className="relative">
                                                    <input
                                                        type={["Checked By", "Remarks"].includes(fieldLabel) ? "text" : "number"}
                                                        value={herbsData[herb]?.[fieldLabel] || ""}
                                                        onChange={(e) => handleHerbFieldChange(herb, fieldLabel, e.target.value)}
                                                        disabled={isDisabled}
                                                        className="w-full px-3 py-2 text-sm rounded-xl border border-emerald-100 bg-white focus:border-emerald-500 focus:outline-none disabled:bg-emerald-50 disabled:cursor-not-allowed transition-all"
                                                        placeholder={fieldLabel}
                                                    />
                                                    {isAvailableLocked && herbsData[herb]?.[fieldLabel] && (
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-600">🔒</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <Dialog open={showCreateHerbDialog} onOpenChange={setShowCreateHerbDialog}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Create New Herb</DialogTitle>
                            <DialogDescription>
                                Add a new herb type to the system for future selections.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <Label htmlFor="herb-name" className="text-emerald-900 font-semibold">Herb Name</Label>
                            <Input
                                id="herb-name"
                                placeholder="e.g., Alligator Pepper, Ginger Root"
                                value={newHerbName}
                                onChange={(e) => setNewHerbName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCreateHerb()}
                                className="mt-2 p-5 rounded-xl border-emerald-100"
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => { setShowCreateHerbDialog(false); setNewHerbName("") }}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreateHerb} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                Create Herb
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        )
    }

    // ── Submit ──────────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!shift) { toast.error("Please select a shift before submitting."); return }
        setIsSubmitting(true)
        setError(null)

        try {
            // Extraction Monitoring
            if (recordType === "Extraction Monitoring Records") {
                for (let i = 0; i < numberOfTanks; i++) {
                    const tankData = extractionTankData[i]?.data || {}
                    const missing = fields.filter((f) => f.required && !tankData[f.label]?.trim()).map((f) => f.label)
                    if (missing.length > 0) { setError(`Tank ${i + 1} missing: ${missing.join(", ")}`); setIsSubmitting(false); return }
                    const res = await fetch("/api/records/submit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ recordType, supervisorName, department, group: groupNumber, shift, date: selectedDate, productType: "Bitters", formData: tankData }),
                    })
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to save") }
                }
                toast.success("Extraction records submitted!"); router.push("/dashboard/forms"); return
            }

            // Herbs Stock
            if (recordType === "Herbs Stock") {
                if (selectedHerbs.length === 0) { setError("Please select at least one herb type"); setIsSubmitting(false); return }
                for (const herb of selectedHerbs) {
                    const herbData = herbsData[herb] || {}
                    const requiredFields = ["Available Stock", "Qty Received", "Qty Used", "Checked By"]
                    const missing = requiredFields.filter((f) => !herbData[f]?.toString().trim())
                    if (missing.length > 0) { setError(`${herb} missing: ${missing.join(", ")}`); setIsSubmitting(false); return }
                    const res = await fetch("/api/records/submit", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ recordType, supervisorName, department, group: groupNumber, shift, date: selectedDate, formData: { "Type of Herb": herb, ...herbData } }),
                    })
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to save") }
                }
                toast.success("Herbs stock submitted!"); router.push("/dashboard/forms"); return
            }

            // Multi-product or single
            if (supportsMultiProduct && productionTypes.length === 0) {
                setError(`Please select at least one: ${availableProducts.join(", ")}`); setIsSubmitting(false); return
            }

            const productsToSubmit = supportsMultiProduct ? productionTypes : ["default"]

            for (const product of productsToSubmit) {
                if (stockErrors[product]) { setError(`${product}: ${stockErrors[product]}`); setIsSubmitting(false); return }
                const formData = formDataByProduct[product] || {}
                const missing = fields
                    .filter((f) => !f.calculatedFrom && !f.disabled && f.required && !formData[f.label]?.trim())
                    .map((f) => f.label)
                if (missing.length > 0) {
                    setError(`${product === "default" ? "Form" : product} missing: ${missing.join(", ")}`)
                    setIsSubmitting(false); return
                }
            }

            for (const product of productsToSubmit) {
                const res = await fetch("/api/records/submit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        recordType, supervisorName, department, group: groupNumber, shift, date: selectedDate,
                        productType: product === "default" ? undefined : product,
                        formData: formDataByProduct[product],
                    }),
                })
                if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to save") }
            }

            toast.success("Record submitted successfully!"); router.push("/dashboard/forms")
        } catch (err) {
            toast.error("There was a problem submitting the record.")
            setError(err instanceof Error ? err.message : "Failed to save record")
        } finally {
            setIsSubmitting(false)
        }
    }

    // ── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-emerald-100">
            <form onSubmit={handleSubmit} className="space-y-8">

                {/* Step 1: Shift */}
                <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                    <Label className="text-base font-bold text-emerald-950 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black">1</span>
                        Select Shift Type *
                    </Label>
                    <div className="flex gap-3">
                        {["Morning", "Afternoon", "Night"].map((s) => (
                            <label
                                key={s}
                                className={`flex-1 flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    shift === s
                                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm"
                                        : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"
                                }`}
                            >
                                <input type="radio" name="shift" value={s} checked={shift === s} onChange={(e) => setShift(e.target.value)} className="sr-only" />
                                <span className="font-semibold">{s}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Step 2: Date */}
                <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                    <Label className="text-base font-bold text-emerald-950 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black">2</span>
                        Select Date *
                    </Label>
                    <Input
                        type="date"
                        required
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="w-full md:w-1/2 p-6 text-base rounded-xl border-emerald-200 bg-white focus:border-emerald-500 focus:ring-emerald-500/20 font-semibold text-emerald-900 shadow-sm"
                    />
                </div>

                {/* Step 3: Product Type (if multi-product) */}
                {supportsMultiProduct && (
                    <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                        <Label className="text-base font-bold text-emerald-950 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-black">3</span>
                            Select Product Type(s) *
                        </Label>
                        <p className="text-xs text-emerald-700/70">Select what was produced today (multiple allowed):</p>
                        <div className="flex gap-4">
                            {availableProducts.map((p) => (
                                <label key={p} className={`flex-1 flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                    productionTypes.includes(p)
                                        ? "border-emerald-600 bg-emerald-50 text-emerald-900 shadow-sm"
                                        : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"
                                }`}>
                                    <input
                                        type="checkbox"
                                        checked={productionTypes.includes(p)}
                                        onChange={() => handleProductionTypeChange(p)}
                                        className="sr-only"
                                    />
                                    <span className="font-semibold">{p}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {/* Stock auto-populate notice */}
                {isLoadingStock && (
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
                        <p className="text-sm font-semibold text-blue-700">Loading previous stock data...</p>
                    </div>
                )}
                {hasPreviousStock && !isLoadingStock && (
                    <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
                        {(recordType === "Caramel Stock" || recordType === "Labels Stock") ? (
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-blue-700">Opening stock auto-populated from previous shift:</p>
                                {["Bitters", "Ginger"].map((p) =>
                                    perProductPreviousStock[p] != null ? (
                                        <p key={p} className="text-sm text-blue-600">{p}: {perProductPreviousStock[p]}</p>
                                    ) : null
                                )}
                            </div>
                        ) : (
                            <p className="text-sm font-semibold text-blue-700">
                                Opening stock auto-populated from previous shift: {previousStock}
                            </p>
                        )}
                    </div>
                )}

                <hr className="border-emerald-100" />

                {/* Dynamic form fields */}
                <div className="space-y-6">
                    <h3 className="text-lg font-bold text-emerald-950">Record Details</h3>

                    {recordType === "Extraction Monitoring Records" ? (
                        renderExtractionMonitoringForm()
                    ) : recordType === "Herbs Stock" ? (
                        renderHerbsStockForm()
                    ) : recordType === "Daily Records Alcohol For Concentrate" ? (
                        renderAlcoholConcentrateForm()
                    ) : supportsMultiProduct && productionTypes.length > 0 ? (
                        productionTypes.map((product) => (
                            <div key={product} className="bg-slate-50 p-6 rounded-2xl border border-emerald-100">
                                <h4 className="font-bold text-emerald-900 mb-4">{product} Form</h4>
                                {stockErrors[product] && (
                                    <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200">
                                        <p className="text-red-600 text-sm font-semibold">⚠️ {stockErrors[product]}</p>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {fields.map((field) => (
                                        <div key={field.label} className="space-y-2">
                                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{field.label}</Label>
                                            {renderField(field, product)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : !supportsMultiProduct ? (
                        <div>
                            {stockErrors["default"] && (
                                <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200">
                                    <p className="text-red-600 text-sm font-semibold">⚠️ {stockErrors["default"]}</p>
                                </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {fields.map((field) => (
                                    <div key={field.label} className="space-y-2">
                                        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{field.label}</Label>
                                        {renderField(field, "default")}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 italic">Select a product type above to begin.</p>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-200">
                        <p className="text-sm font-semibold text-red-700">⚠️ {error}</p>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t border-emerald-100 flex items-center justify-end gap-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.back()}
                        disabled={isSubmitting}
                        className="px-6 py-6 text-base font-semibold border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-8 py-6 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/20"
                    >
                        {isSubmitting ? "Submitting..." : "Submit Record"}
                    </Button>
                </div>
            </form>
        </div>
    )
}
