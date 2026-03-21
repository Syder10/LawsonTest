"use client"

import { useState, useEffect } from "react"
import { FORM_FIELDS, PRODUCT_TYPE_FORMS, type FormField } from "@/constants/formConfig"
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
    initialDate:  string   // passed from the forms page via query param
    initialShift: string   // passed from the forms page via query param
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
    if (used > 0 && (opening + received - used) < 0) {
        return `Cannot use more than available. Have ${opening}, received ${received}, trying to use ${used}`
    }
    return ""
}

export default function RecordEntryForm({
    recordType,
    supervisorName,
    department,
    groupNumber,
    initialDate,
    initialShift,
}: RecordEntryFormProps) {
    const router = useRouter()

    const fields: FormField[] = FORM_FIELDS[recordType] || []
    const availableProducts: string[] = PRODUCT_TYPE_FORMS[recordType] || []
    const supportsMultiProduct = availableProducts.length > 0

    // date and shift are now set by the forms page and passed as props — not editable here
    const shift        = initialShift
    const selectedDate = initialDate

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [productionTypes, setProductionTypes] = useState<string[]>([])
    const [formDataByProduct, setFormDataByProduct] = useState<Record<string, Record<string, string>>>({})
    const [stockErrors, setStockErrors] = useState<Record<string, string>>({})

    const [isLoadingStock, setIsLoadingStock] = useState(false)
    const [hasPreviousStock, setHasPreviousStock] = useState(false)
    const [previousStock, setPreviousStock] = useState<number | null>(null)
    const [perProductPreviousStock, setPerProductPreviousStock] = useState<Record<string, number | null>>({})

    const [numberOfTanks, setNumberOfTanks] = useState(1)
    const [extractionTankData, setExtractionTankData] = useState<ExtractionTankData>({})

    const [herbOptions, setHerbOptions] = useState<string[]>([])
    const [isLoadingHerbs, setIsLoadingHerbs] = useState(false)
    const [selectedHerbs, setSelectedHerbs] = useState<string[]>([])
    const [herbsData, setHerbsData] = useState<Record<string, Record<string, string>>>({})
    const [herbsPreviousStock, setHerbsPreviousStock] = useState<Record<string, number | null>>({})
    const [showCreateHerbDialog, setShowCreateHerbDialog] = useState(false)
    const [newHerbName, setNewHerbName] = useState("")

    // ── Draft: restore from localStorage on mount ────────────────────────────
    useEffect(() => {
        const key = `draft_${recordType}_${initialDate}_${initialShift}`
        try {
            const saved = localStorage.getItem(key)
            if (saved) {
                const parsed = JSON.parse(saved)
                if (parsed.formDataByProduct) setFormDataByProduct(parsed.formDataByProduct)
                if (parsed.productionTypes)   setProductionTypes(parsed.productionTypes)
                toast.info("Draft restored from your previous session.")
            }
        } catch { /* ignore corrupt data */ }
    }, [recordType, initialDate, initialShift])

    // ── Draft: save to localStorage whenever form data changes ───────────────
    useEffect(() => {
        const key = `draft_${recordType}_${initialDate}_${initialShift}`
        if (Object.keys(formDataByProduct).length === 0) return
        try {
            localStorage.setItem(key, JSON.stringify({ formDataByProduct, productionTypes }))
        } catch { /* storage full — ignore */ }
    }, [formDataByProduct, productionTypes, recordType, initialDate, initialShift])

    useEffect(() => {
        const load = async () => {
            setIsLoadingHerbs(true)
            try {
                const res = await fetch("/api/herbs")
                if (!res.ok) throw new Error()
                const data = await res.json()
                setHerbOptions(data.herbs ?? [])
            } catch { /* silent */ }
            finally { setIsLoadingHerbs(false) }
        }
        load()
    }, [])

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
                    await Promise.all(products.map(async (product) => {
                        const p = new URLSearchParams({ recordType, date: selectedDate, department, product })
                        const res = await fetch(`/api/records/previous-stock?${p}`)
                        if (!res.ok) { results[product] = null; return }
                        const d = await res.json()
                        results[product] = d.hasPrevious && d.previousStock != null ? d.previousStock : null
                    }))
                    setPerProductPreviousStock(results)
                    setFormDataByProduct((prev) => {
                        const updated = { ...prev }
                        products.forEach((product) => {
                            if (results[product] != null) {
                                if (!updated[product]) updated[product] = {}
                                updated[product]["Opening Stock Level"] = String(results[product])
                                recalcAllFields(updated[product])
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
                const p = new URLSearchParams({ recordType, date: selectedDate, department })
                const res = await fetch(`/api/records/previous-stock?${p}`)
                if (!res.ok) { setHasPreviousStock(false); setIsLoadingStock(false); return }
                const d = await res.json()
                if (d.hasPrevious && d.previousStock != null) {
                    setPreviousStock(d.previousStock)
                    setHasPreviousStock(true)
                    const openingLabel = recordType === "Daily Records (Preform Usage)"
                        ? "Opening Stock (BAGS)" : "Opening Stock Level"
                    setFormDataByProduct((prev) => {
                        const updated = { ...prev }
                        if (!updated["default"]) updated["default"] = {}
                        updated["default"][openingLabel] = String(d.previousStock)
                        recalcAllFields(updated["default"])
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

    const recalcAllFields = (data: Record<string, string>) => {
        fields.forEach((f) => {
            if (f.calculatedFrom && f.calculation && Array.isArray(f.calculatedFrom)) {
                const vals = f.calculatedFrom.reduce((acc, k) => {
                    acc[k] = parseFloat(data[k] || "0"); return acc
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
            const d = { ...updated[key], [field]: value }
            recalcAllFields(d)
            setStockErrors((se) => ({ ...se, [key]: validateStockFields(d) }))
            updated[key] = d
            return updated
        })
    }

    const handleProductionTypeChange = (type: string) => {
        setProductionTypes((prev) =>
            prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
        )
    }

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
        setExtractionTankData((prev) => ({
            ...prev,
            [tankIndex]: {
                ...(prev[tankIndex] || { data: {}, isSameAsFirst: false }),
                data: { ...(prev[tankIndex]?.data || {}), [field]: value },
            },
        }))
    }

    const handleCopyFromFirst = (tankIndex: number, checked: boolean) => {
        setExtractionTankData((prev) => ({
            ...prev,
            [tankIndex]: {
                ...(prev[tankIndex] || { data: {}, isSameAsFirst: false }),
                isSameAsFirst: checked,
                data: checked && prev[0]?.data
                    ? JSON.parse(JSON.stringify(prev[0].data))
                    : (prev[tankIndex]?.data || {}),
            },
        }))
    }

    const fetchHerbPreviousStock = async (herb: string) => {
        try {
            const p = new URLSearchParams({ recordType: "Herbs Stock", date: selectedDate, department, herbType: herb })
            const res = await fetch(`/api/records/previous-stock?${p}`)
            const d = await res.json()
            if (d.hasPrevious && d.previousStock != null) {
                setHerbsPreviousStock((prev) => ({ ...prev, [herb]: d.previousStock }))
                setHerbsData((prev) => {
                    const updated = { ...prev }
                    if (!updated[herb]) updated[herb] = {}
                    updated[herb]["Available Stock"] = String(d.previousStock)
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
            const d = { ...(prev[herb] || {}), [fieldLabel]: value }
            if (["Available Stock", "Qty Received"].includes(fieldLabel)) {
                d["Total Qty"] = String(Number(d["Available Stock"] || 0) + Number(d["Qty Received"] || 0))
            }
            if (["Available Stock", "Qty Received", "Qty Used"].includes(fieldLabel)) {
                d["Remaining Qty"] = String(
                    Number(d["Available Stock"] || 0) + Number(d["Qty Received"] || 0) - Number(d["Qty Used"] || 0)
                )
            }
            return { ...prev, [herb]: d }
        })
    }

    const handleCreateHerb = async () => {
        const name = newHerbName.trim()
        if (!name) { setError("Please enter a herb name"); return }
        if (herbOptions.map((h) => h.toLowerCase()).includes(name.toLowerCase())) {
            setError("This herb already exists"); return
        }
        try {
            const res = await fetch("/api/herbs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
            })
            const d = await res.json()
            if (!res.ok) { setError(d.error || "Failed to create herb"); return }
            setHerbOptions((prev) => [...prev, name].sort())
            setSelectedHerbs((prev) => [...prev, name])
            fetchHerbPreviousStock(name)
            setShowCreateHerbDialog(false)
            setNewHerbName("")
            setError(null)
        } catch { setError("Failed to create herb") }
    }

    // ── Field renderers ─────────────────────────────────────────────────────────
    const renderField = (field: FormField, product: string) => {
        const value = formDataByProduct[product]?.[field.label] || ""
        const isOpeningStock = field.isStockField && field.stockFieldType === "opening"
        const isLocked = isOpeningStock && (
            (recordType === "Caramel Stock" || recordType === "Labels Stock")
                ? perProductPreviousStock[product] != null
                : hasPreviousStock
        )
        const isDisabled = !!field.disabled || isLocked
        const isAutoCalc = field.disabled && (field.calculatedFrom || field.multiplier)

        if (field.isExtractionAlcoholPercentage && field.options) {
            return (
                <div className="flex gap-2">
                    {field.options.map((opt) => (
                        <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name={`${product}-${field.label}`} value={opt}
                                checked={value === opt} onChange={(e) => handleInputChange(product, field.label, e.target.value)}
                                disabled={isDisabled} className="w-3.5 h-3.5 accent-emerald-600" />
                            <span className="text-sm font-medium">{opt}</span>
                        </label>
                    ))}
                </div>
            )
        }

        if (field.type === "textarea") {
            return (
                <textarea rows={3} value={value} disabled={isDisabled}
                    onChange={(e) => handleInputChange(product, field.label, e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-emerald-100 bg-white focus:border-emerald-500 focus:outline-none resize-none transition-all disabled:bg-emerald-50 disabled:cursor-not-allowed"
                />
            )
        }

        return (
            <div className="relative">
                <Input type={field.type} value={value} required={field.required} disabled={isDisabled}
                    onChange={(e) => handleInputChange(product, field.label, e.target.value)}
                    className={`w-full px-3 py-2 text-sm rounded-xl transition-all h-10 ${isDisabled
                        ? "bg-emerald-50/80 border-emerald-100 cursor-not-allowed"
                        : "bg-white border-emerald-100 focus:border-emerald-500 focus:ring-emerald-500/20"}`}
                />
                {isLocked && value && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-600 whitespace-nowrap">🔒 prev</span>
                )}
                {isAutoCalc && value && !isLocked && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600">✓ auto</span>
                )}
            </div>
        )
    }

    const renderExtractionField = (
        field: FormField, tankIndex: number, value: string,
        onChange: (v: string) => void, disabled = false
    ) => {
        if (field.isExtractionAlcoholPercentage && field.options) {
            return (
                <div className="flex gap-2">
                    {field.options.map((opt) => (
                        <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name={`tank-${tankIndex}-${field.label}`} value={opt}
                                checked={value === opt} onChange={(e) => onChange(e.target.value)}
                                disabled={disabled} className="w-3.5 h-3.5 accent-emerald-600" />
                            <span className="text-sm font-medium">{opt}</span>
                        </label>
                    ))}
                </div>
            )
        }
        if (field.type === "textarea") {
            return (
                <textarea rows={2} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-emerald-100 bg-white focus:outline-none resize-none disabled:bg-emerald-50 disabled:cursor-not-allowed"
                />
            )
        }
        return (
            <Input type={field.type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
                className={`w-full px-3 py-2 text-sm rounded-xl h-10 transition-all ${disabled
                    ? "bg-emerald-50 border-emerald-100 cursor-not-allowed"
                    : "bg-white border-emerald-100 focus:border-emerald-500"}`}
            />
        )
    }

    // ── Special renderers ───────────────────────────────────────────────────────
    const renderExtractionMonitoringForm = () => (
        <div className="space-y-5">
            <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 space-y-3">
                <Label className="text-sm font-bold text-emerald-900">Number of Tanks</Label>
                <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                        <button key={num} type="button" onClick={() => handleNumberOfTanksChange(num)}
                            className={`w-9 h-9 rounded-lg font-semibold text-sm transition-all ${numberOfTanks === num
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "bg-white border-2 border-emerald-200 text-emerald-800 hover:border-emerald-400"}`}>
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
                        <div key={tankIndex} className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-emerald-900 text-sm">Tank {tankIndex + 1}</h3>
                                {tankIndex > 0 && (
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-500">
                                        <input type="checkbox" checked={isSameAsFirst}
                                            onChange={(e) => handleCopyFromFirst(tankIndex, e.target.checked)}
                                            className="w-3.5 h-3.5 accent-emerald-600" />
                                        Same as Tank 1
                                    </label>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {fields.map((field) => (
                                    <div key={`${tankIndex}-${field.label}`} className="space-y-1">
                                        <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label}</Label>
                                        {renderExtractionField(
                                            field, tankIndex, tankData[field.label] || "",
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
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="space-y-3">
                        <h3 className="text-center font-bold text-emerald-800 text-sm border-b border-emerald-200 pb-2">70% (350L)</h3>
                        {tank70.map((field) => (
                            <div key={field.label} className="space-y-1">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label.replace(" (70)", "")}</Label>
                                {renderField(field, "default")}
                            </div>
                        ))}
                    </div>
                    <div className="space-y-3">
                        <h3 className="text-center font-bold text-emerald-800 text-sm border-b border-emerald-200 pb-2">80% (400L)</h3>
                        {tank80.map((field) => (
                            <div key={field.label} className="space-y-1">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label.replace(" (80)", "")}</Label>
                                {renderField(field, "default")}
                            </div>
                        ))}
                    </div>
                </div>
                {other.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-emerald-100">
                        {other.map((field) => (
                            <div key={field.label} className="space-y-1">
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label}</Label>
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
            <div className="space-y-5">
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <Label className="text-sm font-bold text-emerald-900">Select Herbs</Label>
                        <button type="button" onClick={() => setShowCreateHerbDialog(true)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors">
                            <Plus size={13} /> Create Herb
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {isLoadingHerbs ? (
                            <p className="text-xs text-emerald-700/70">Loading herbs...</p>
                        ) : herbOptions.map((herb) => (
                            <label key={herb} className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={selectedHerbs.includes(herb)}
                                    onChange={() => handleHerbSelectionChange(herb)}
                                    className="w-3.5 h-3.5 accent-emerald-600" />
                                <span className="text-sm text-slate-700 font-medium">{herb}</span>
                            </label>
                        ))}
                    </div>
                    {selectedHerbs.length > 0 && (
                        <p className="text-xs text-emerald-700/70 font-medium">Selected: {selectedHerbs.join(", ")}</p>
                    )}
                </div>
                {selectedHerbs.length > 0 && (
                    <div className="space-y-3">
                        {selectedHerbs.map((herb) => (
                            <div key={herb} className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                                <p className="font-bold text-emerald-900 text-sm mb-3">{herb}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                    {stockFieldLabels.map((fieldLabel) => {
                                        const isAutoCalc = ["Total Qty", "Remaining Qty"].includes(fieldLabel)
                                        const isLocked = fieldLabel === "Available Stock" && herbsPreviousStock[herb] != null
                                        return (
                                            <div key={fieldLabel} className="space-y-1">
                                                <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{fieldLabel}</Label>
                                                <div className="relative">
                                                    <input
                                                        type={["Checked By", "Remarks"].includes(fieldLabel) ? "text" : "number"}
                                                        value={herbsData[herb]?.[fieldLabel] || ""}
                                                        onChange={(e) => handleHerbFieldChange(herb, fieldLabel, e.target.value)}
                                                        disabled={isAutoCalc || isLocked}
                                                        placeholder=""
                                                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-emerald-100 bg-white focus:border-emerald-500 focus:outline-none disabled:bg-emerald-50 disabled:cursor-not-allowed transition-all h-9"
                                                    />
                                                    {isLocked && herbsData[herb]?.[fieldLabel] && (
                                                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-blue-600">🔒</span>
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
                    <DialogContent className="sm:max-w-[400px]">
                        <DialogHeader>
                            <DialogTitle>Create New Herb</DialogTitle>
                            <DialogDescription>Add a new herb type to the system.</DialogDescription>
                        </DialogHeader>
                        <div className="py-3">
                            <Label htmlFor="herb-name" className="text-emerald-900 font-semibold text-sm">Herb Name</Label>
                            <Input id="herb-name" placeholder="e.g., Alligator Pepper" value={newHerbName}
                                onChange={(e) => setNewHerbName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleCreateHerb()}
                                className="mt-1.5 rounded-xl border-emerald-100" />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" size="sm" onClick={() => { setShowCreateHerbDialog(false); setNewHerbName("") }}>Cancel</Button>
                            <Button size="sm" onClick={handleCreateHerb} className="bg-emerald-600 hover:bg-emerald-700 text-white">Create</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        )
    }

    // ── Submit ──────────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSubmitting(true)
        setError(null)

        try {
            if (recordType === "Extraction Monitoring Records") {
                for (let i = 0; i < numberOfTanks; i++) {
                    const tankData = extractionTankData[i]?.data || {}
                    const missing = fields.filter((f) => f.required && !tankData[f.label]?.trim()).map((f) => f.label)
                    if (missing.length > 0) { setError(`Tank ${i + 1} missing: ${missing.join(", ")}`); setIsSubmitting(false); return }
                    const res = await fetch("/api/records/submit", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ recordType, supervisorName, department, group: groupNumber, shift, date: selectedDate, productType: "Bitters", formData: tankData }),
                    })
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to save") }
                }
                toast.success("Extraction records submitted!")
                try { localStorage.removeItem(`draft_${recordType}_${initialDate}_${initialShift}`) } catch { /* ignore */ }
                router.push("/dashboard/forms"); return
            }

            if (recordType === "Herbs Stock") {
                if (selectedHerbs.length === 0) { setError("Please select at least one herb"); setIsSubmitting(false); return }
                for (const herb of selectedHerbs) {
                    const herbData = herbsData[herb] || {}
                    const missing = ["Available Stock", "Qty Received", "Qty Used", "Checked By"].filter((f) => !herbData[f]?.toString().trim())
                    if (missing.length > 0) { setError(`${herb} missing: ${missing.join(", ")}`); setIsSubmitting(false); return }
                    const res = await fetch("/api/records/submit", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ recordType, supervisorName, department, group: groupNumber, shift, date: selectedDate, formData: { "Type of Herb": herb, ...herbData } }),
                    })
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to save") }
                }
                toast.success("Herbs stock submitted!")
                try { localStorage.removeItem(`draft_${recordType}_${initialDate}_${initialShift}`) } catch { /* ignore */ }
                router.push("/dashboard/forms"); return
            }

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
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        recordType, supervisorName, department, group: groupNumber, shift, date: selectedDate,
                        productType: product === "default" ? undefined : product,
                        formData: formDataByProduct[product],
                    }),
                })
                if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed to save") }
            }

            toast.success("Record submitted successfully!")
            try { localStorage.removeItem(`draft_${recordType}_${initialDate}_${initialShift}`) } catch { /* ignore */ }
            router.push("/dashboard/forms")
        } catch (err) {
            toast.error("There was a problem submitting.")
            setError(err instanceof Error ? err.message : "Failed to save record")
        } finally {
            setIsSubmitting(false)
        }
    }

    // ── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-emerald-100">
            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Product type — compact dropdown (if multi-product) */}
                {supportsMultiProduct && (
                    <div className="space-y-1.5">
                        <Label className="text-sm font-bold text-emerald-900">
                            Product Type <span className="text-red-500">*</span>
                            <span className="ml-1 text-xs font-normal text-slate-400">(select all that apply)</span>
                        </Label>
                        <div className="flex flex-wrap gap-2">
                            {availableProducts.map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => handleProductionTypeChange(p)}
                                    className={`px-4 h-9 rounded-xl border-2 text-sm font-semibold transition-all ${
                                        productionTypes.includes(p)
                                            ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                                            : "border-emerald-200 bg-white text-slate-600 hover:border-emerald-400"
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Previous stock notices */}
                {isLoadingStock && (
                    <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                        <p className="text-xs font-semibold text-blue-700">Loading previous stock data…</p>
                    </div>
                )}
                {hasPreviousStock && !isLoadingStock && (
                    <div className="px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
                        {(recordType === "Caramel Stock" || recordType === "Labels Stock") ? (
                            <div className="space-y-0.5">
                                <p className="text-xs font-semibold text-blue-700">Opening stock auto-populated from previous shift:</p>
                                {["Bitters", "Ginger"].map((p) =>
                                    perProductPreviousStock[p] != null
                                        ? <p key={p} className="text-xs text-blue-600">{p}: {perProductPreviousStock[p]}</p>
                                        : null
                                )}
                            </div>
                        ) : (
                            <p className="text-xs font-semibold text-blue-700">
                                Opening stock auto-populated from previous shift: {previousStock}
                            </p>
                        )}
                    </div>
                )}

                <hr className="border-emerald-100" />

                {/* Dynamic form body */}
                <div className="space-y-5">
                    <h3 className="text-base font-bold text-emerald-950">Record Details</h3>

                    {recordType === "Extraction Monitoring Records" ? renderExtractionMonitoringForm()
                        : recordType === "Herbs Stock" ? renderHerbsStockForm()
                        : recordType === "Daily Records Alcohol For Concentrate" ? renderAlcoholConcentrateForm()
                        : supportsMultiProduct && productionTypes.length > 0 ? (
                            productionTypes.map((product) => (
                                <div key={product} className="bg-slate-50 p-5 rounded-2xl border border-emerald-100">
                                    <h4 className="font-bold text-emerald-900 text-sm mb-3">{product} Form</h4>
                                    {stockErrors[product] && (
                                        <div className="px-3 py-2 mb-3 rounded-xl bg-red-50 border border-red-200">
                                            <p className="text-red-600 text-xs font-semibold">⚠️ {stockErrors[product]}</p>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {fields.map((field) => (
                                            <div key={field.label} className="space-y-1">
                                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label}</Label>
                                                {renderField(field, product)}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : !supportsMultiProduct ? (
                            <div>
                                {stockErrors["default"] && (
                                    <div className="px-3 py-2 mb-3 rounded-xl bg-red-50 border border-red-200">
                                        <p className="text-red-600 text-xs font-semibold">⚠️ {stockErrors["default"]}</p>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {fields.map((field) => (
                                        <div key={field.label} className="space-y-1">
                                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{field.label}</Label>
                                            {renderField(field, "default")}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400 italic">Select a product type above to begin.</p>
                        )}
                </div>

                {error && (
                    <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
                        <p className="text-sm font-semibold text-red-700">⚠️ {error}</p>
                    </div>
                )}

                {/* Actions */}
                <div className="pt-3 border-t border-emerald-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
                    <Button
                        type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}
                        className="h-11 sm:h-10 px-5 text-sm font-semibold border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl w-full sm:w-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit" disabled={isSubmitting}
                        className="h-11 sm:h-10 px-6 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-md shadow-emerald-600/20 w-full sm:w-auto"
                    >
                        {isSubmitting ? "Submitting…" : "Submit Record"}
                    </Button>
                </div>
            </form>
        </div>
    )
}
