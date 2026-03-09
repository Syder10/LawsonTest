"use client"

import { useState, useEffect } from "react"
import { ArrowLeft, Plus } from "lucide-react"
import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LiveStocksDisplay } from "@/components/live-stocks-display"

interface RecordEntryScreenProps {
  department: string
  recordType: string
  supervisorName: string
  date: string
  shift: string
  group: number
  onSubmit: () => void
  onBack: () => void
}

interface Field {
  label: string
  type: "text" | "number" | "time" | "date" | "select" | "textarea"
  options?: string[]
  calculatedFrom?: string[] | string
  calculation?: (values: Record<string, number>) => number
  multiplier?: number
  isStockField?: boolean
  stockFieldType?: "opening" | "received" | "used" | "remaining"
  required?: boolean
  disabled?: boolean
  isExtractionAlcoholPercentage?: boolean
}

const PRODUCT_TYPE_FORMS: Record<string, string[]> = {
  "Daily Records for Alcohol and Blending": ["Bitters"],
  "Ginger Production": [],
  "Extraction Monitoring Records": ["Bitters"],
  "Filling Line Daily Records": ["Bitters", "Ginger"],
  "Stocks Keeping For Labels & Caps": ["Bitters", "Ginger"],
  "Packaging Daily Records": ["Bitters", "Ginger"],
  "Daily Records Alcohol For Concentrate": [],
  "Herbs Stock": [],
  "Caramel Stock": ["Bitters", "Ginger"],
  "Caps Stock": [], // No product selector - caps cover all products
  "Labels Stock": ["Bitters", "Ginger"],
}

const formFields: Record<string, Field[]> = {
  "Daily Records (Preform Usage)": [
    { label: "Opening Stock (BAGS)", type: "number", required: true, isStockField: true, stockFieldType: "opening" },
    { label: "Quantity Received (BAGS)", type: "number", required: true },
    { label: "Preforms Used (BAGS)", type: "number", required: true },
    {
      label: "Remaining Balance (BAGS)",
      type: "number",
      required: false,
      disabled: true,
      calculatedFrom: ["Opening Stock (BAGS)", "Quantity Received (BAGS)", "Preforms Used (BAGS)"],
      calculation: (values: Record<string, number>) => {
        const opening = values["Opening Stock (BAGS)"] || 0
        const received = values["Quantity Received (BAGS)"] || 0
        const used = values["Preforms Used (BAGS)"] || 0
        return opening + received - used
      },
      isStockField: true,
      stockFieldType: "remaining",
    },
    { label: "Total Produced", type: "number", required: true },
    { label: "WASTE (PCS)", type: "number", required: true },
    {
      label: "Final Production",
      type: "number",
      required: false,
      disabled: true,
      calculatedFrom: ["Total Produced", "WASTE (PCS)"],
      calculation: (values: Record<string, number>) => {
        const produced = values["Total Produced"] || 0
        const waste = values["WASTE (PCS)"] || 0
        return produced - waste
      },
    },
    { label: "Bottles Given Out", type: "number", required: true },
    { label: "Remarks (To be filled)", type: "textarea", required: false },
  ],
  "Daily Usage of Alcohol And Stock Level": [
    { label: "Opening Stock Level", type: "number", required: true, isStockField: true, stockFieldType: "opening" },
    { label: "Quantity Received", type: "number", required: true, isStockField: true, stockFieldType: "received" },
    { label: "Quantity Used", type: "number", required: true, isStockField: true, stockFieldType: "used" },
    {
      label: "Remaining Stock Level",
      type: "number",
      required: false,
      disabled: true,
      isStockField: true,
      stockFieldType: "remaining",
      calculatedFrom: ["Opening Stock Level", "Quantity Received", "Quantity Used"],
      calculation: (values: Record<string, number>) => {
        const opening = values["Opening Stock Level"] || 0
        const received = values["Quantity Received"] || 0
        const used = values["Quantity Used"] || 0
        return opening + received - used
      },
    },
    { label: "Destination", type: "text", required: true },
    { label: "Remarks", type: "text", required: false },
  ],
  "Daily Records for Alcohol and Blending": [
    { label: "Number of Alcohol Transferred (DRUMS)", type: "number", required: true },
    {
      label: "Number of Alcohol Transferred (LITRES)",
      type: "number",
      calculatedFrom: "Number of Alcohol Transferred (DRUMS)",
      multiplier: 250,
      required: true,
      disabled: true,
    },
    { label: "Number of Finished Products Transferred (TANKS)", type: "number", required: true },
    {
      label: "Number of Finished Products Transferred (LITRES)",
      type: "number",
      calculatedFrom: "Number of Finished Products Transferred (TANKS)",
      multiplier: 900,
      required: true,
      disabled: true,
    },
    { label: "Number of Staff Used", type: "number", required: true },
    { label: "Hourly Work", type: "text", required: false },
    { label: "Remarks", type: "text", required: false },
  ],
  "Ginger Production": [
    { label: "Quantity of Raw Ginger (BAGS)", type: "number", required: true },
    { label: "Quantity of Grinded Ginger", type: "number", required: true },
    { label: "Quantity of Alcohol Used (Tanks)", type: "number", required: true },
    {
      label: "Quantity of Alcohol Used (Litres)",
      type: "number",
      calculatedFrom: "Quantity of Alcohol Used (Tanks)",
      multiplier: 300,
      required: true,
      disabled: true,
    },
    { label: "Quantity of Finished Product Transferred (Tanks)", type: "number", required: true },
    {
      label: "Quantity of Finished Product Transferred (Litres)",
      type: "number",
      calculatedFrom: "Quantity of Finished Product Transferred (Tanks)",
      multiplier: 1000,
      required: true,
      disabled: true,
    },
    { label: "Remarks", type: "text", required: false },
  ],
  "Extraction Monitoring Records": [
    { label: "Beginning Date", type: "date", required: true },
    { label: "Tank Number", type: "text", required: true },
    { label: "Time", type: "time", required: true },
    {
      label: "Alcohol Percentage",
      type: "text",
      required: true,
      options: ["70", "80"],
      isExtractionAlcoholPercentage: true,
    },
    { label: "Expected Maturity Date", type: "date", required: true },
    { label: "Prepared By", type: "text", required: true },
    { label: "Remarks (To be filled)", type: "textarea", required: false },
  ],
  "Filling Line Daily Records": [
    { label: "Bottles Wasted", type: "number", required: true },
    { label: "Bottles Rejected", type: "number", required: true },
    { label: "Number of Staff Used", type: "number", required: true },
    { label: "Hourly Work", type: "text", required: false },
    { label: "Total Production", type: "number", required: true },
    { label: "Remarks", type: "text", required: false },
  ],
  "Stocks Keeping For Labels & Caps": [
    { label: "Number of Caps (BITTERS)", type: "number", required: false },
    { label: "Number of Caps (GINGER)", type: "number", required: false },
    { label: "Number of Labels (BITTERS)", type: "number", required: false },
    { label: "Number of Labels (GINGER)", type: "number", required: false },
    { label: "Number of CARTONS", type: "number", required: true },
    { label: "Number of ROLLS", type: "number", required: true },
    { label: "Machine Number", type: "text", required: true },
    { label: "Time", type: "time", required: true },
    { label: "Name of Personnel", type: "text", required: true },
    { label: "Remarks", type: "text", required: false },
  ],
  "Packaging Daily Records": [
    { label: "Quantity Of Cartons Produced", type: "number", required: true },
    { label: "Number of Cartons Wasted", type: "number", required: true },
    { label: "Quantity Of Cartons Loaded", type: "number", required: true },
    { label: "Number of Staff Used", type: "number", required: true },
    { label: "Hourly Work", type: "text", required: false },
    { label: "Remarks", type: "text", required: false },
  ],
  "Daily Records Alcohol For Concentrate": [
    { label: "Number of Tanks (70)", type: "number", required: true },
    { label: "Alcohol Used (L) (70)", type: "number", required: true },
    { label: "Water (L) (70)", type: "number", required: true },
    { label: "Number of Tanks (80)", type: "number", required: true },
    { label: "Alcohol Used (L) (80)", type: "number", required: true },
    { label: "Water (L) (80)", type: "number", required: true },
    {
      label: "Total Alcohol Used (L)",
      type: "number",
      calculatedFrom: ["Alcohol Used (L) (70)", "Alcohol Used (L) (80)"],
      calculation: (values: Record<string, number>) => {
        const alcohol70 = values["Alcohol Used (L) (70)"] || 0
        const alcohol80 = values["Alcohol Used (L) (80)"] || 0
        return alcohol70 + alcohol80
      },
      disabled: true,
      required: true,
    },
    { label: "Remarks", type: "text", required: false },
  ],
  "Herbs Stock": [],
  "Caramel Stock": [
    { label: "Opening Stock Level", type: "number", required: true, isStockField: true, stockFieldType: "opening" },
    { label: "Quantity Received", type: "number", required: true, isStockField: true, stockFieldType: "received" },
    { label: "Quantity Used", type: "number", required: true, isStockField: true, stockFieldType: "used" },
    {
      label: "Remaining Stock Level",
      type: "number",
      required: false,
      disabled: true,
      isStockField: true,
      stockFieldType: "remaining",
      calculatedFrom: ["Opening Stock Level", "Quantity Received", "Quantity Used"],
      calculation: (values: Record<string, number>) => {
        const opening = values["Opening Stock Level"] || 0
        const received = values["Quantity Received"] || 0
        const used = values["Quantity Used"] || 0
        return opening + received - used
      },
    },
    { label: "Destination", type: "text", required: true },
    { label: "Remarks", type: "text", required: false },
  ],
  "Caps Stock": [
    { label: "Opening Stock Level", type: "number", required: true, isStockField: true, stockFieldType: "opening" },
    { label: "Quantity Received", type: "number", required: true, isStockField: true, stockFieldType: "received" },
    { label: "Quantity Used", type: "number", required: true, isStockField: true, stockFieldType: "used" },
    {
      label: "Remaining Stock Level",
      type: "number",
      required: false,
      disabled: true,
      isStockField: true,
      stockFieldType: "remaining",
      calculatedFrom: ["Opening Stock Level", "Quantity Received", "Quantity Used"],
      calculation: (values: Record<string, number>) => {
        const opening = values["Opening Stock Level"] || 0
        const received = values["Quantity Received"] || 0
        const used = values["Quantity Used"] || 0
        return opening + received - used
      },
    },
    { label: "Destination", type: "text", required: true },
    { label: "Remarks", type: "text", required: false },
  ],
  "Labels Stock": [
    { label: "Opening Stock Level", type: "number", required: true, isStockField: true, stockFieldType: "opening" },
    { label: "Quantity Received", type: "number", required: true, isStockField: true, stockFieldType: "received" },
    { label: "Quantity Used", type: "number", required: true, isStockField: true, stockFieldType: "used" },
    {
      label: "Remaining Stock Level",
      type: "number",
      required: false,
      disabled: true,
      isStockField: true,
      stockFieldType: "remaining",
      calculatedFrom: ["Opening Stock Level", "Quantity Received", "Quantity Used"],
      calculation: (values: Record<string, number>) => {
        const opening = values["Opening Stock Level"] || 0
        const received = values["Quantity Received"] || 0
        const used = values["Quantity Used"] || 0
        return opening + received - used
      },
    },
    { label: "Destination", type: "text", required: true },
    { label: "Remarks", type: "text", required: false },
  ],
}

const fieldProductTypeMap: Record<string, Record<string, string[]>> = {
  "Stocks Keeping For Labels & Caps": {
    "Number of Caps (BITTERS)": ["Bitters"],
    "Number of Caps (GINGER)": ["Ginger"],
    "Number of Labels (BITTERS)": ["Bitters"],
    "Number of Labels (GINGER)": ["Ginger"],
    "Number of CARTONS": ["Bitters", "Ginger"],
    "Number of ROLLS": ["Bitters", "Ginger"],
    "Machine Number": ["Bitters", "Ginger"],
    Time: ["Bitters", "Ginger"],
    "Name of Personnel": ["Bitters", "Ginger"],
  },
}

const validateStockFields = (data: Record<string, string>, product?: string): string => {
  const fields =
    formFields[Object.keys(formFields).find((ft) => formFields[ft].some((f) => f.isStockField)) || ""] || []

  for (const field of fields) {
    if (!field.isStockField) continue

    if (field.stockFieldType === "remaining") {
      const opening = Number(data["Opening Stock (BAGS)"] || data["Opening Stock Level"] || 0)
      const received = Number(data["Quantity Received"] || data["Quantity Received (BAGS)"] || 0)
      const used = Number(data["Quantity Used"] || data["Preforms Used (BAGS)"] || 0)
      const remaining = opening + received - used

      if (remaining < 0) {
        return `Cannot use more than available stock. You have ${opening}, received ${received}, but tried to use ${used}`
      }
    }
  }
  return ""
}

interface ExtractionTankData {
  [tankIndex: number]: {
    data: Record<string, string>
    isSameAsFirst: boolean
  }
}

export default function RecordEntryScreen({
  department,
  recordType,
  supervisorName,
  date,
  shift,
  group,
  onSubmit,
  onBack,
}: RecordEntryScreenProps) {
  const fields = formFields[recordType] || []
  const availableProductTypes = PRODUCT_TYPE_FORMS[recordType] || []
  const supportsMultiProduct = availableProductTypes.length > 0

  const [productionTypes, setProductionTypes] = useState<string[]>([])
  const [formDataByProduct, setFormDataByProduct] = useState<Record<string, Record<string, string>>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stockErrors, setStockErrors] = useState<Record<string, string>>({})
  const [previousStock, setPreviousStock] = useState<number | null>(null)
  const [hasPreviousStock, setHasPreviousStock] = useState<boolean>(false)
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(false)
  // Per-product previous stock for Caramel Stock and Labels Stock
  const [perProductPreviousStock, setPerProductPreviousStock] = useState<Record<string, number | null>>({})

  const [numberOfTanks, setNumberOfTanks] = useState<number>(1)
  const [extractionTankData, setExtractionTankData] = useState<ExtractionTankData>({})
  const [selectedHerbs, setSelectedHerbs] = useState<string[]>([])
  const [herbsData, setHerbsData] = useState<Record<string, Record<string, string>>>({})
  const [herbsPreviousStock, setHerbsPreviousStock] = useState<Record<string, number | null>>({})
  const baseHerbOptions = [
    "Nyame Dua",
    "Mahogany",
    "Yellow",
    "Kraman Koti",
    "Twentini",
    "Assase Hwam",
    "Kumanii",
    "Kakapenpen",
    "Kooko Amae",
    "Otie",
    "Susumasa",
    "Ginger",
    "Tiger Nut",
  ]
  const [customHerbs, setCustomHerbs] = useState<string[]>([])
  const [customHerbName, setCustomHerbName] = useState<string>("")
  const [showCreateHerbDialog, setShowCreateHerbDialog] = useState(false)
  const [newHerbName, setNewHerbName] = useState<string>("")
  const herbOptions = [...baseHerbOptions, ...customHerbs]

  useEffect(() => {
    const loadCustomHerbs = () => {
      try {
        const stored = localStorage.getItem("customHerbsList")
        if (stored) {
          const herbs = JSON.parse(stored)
          setCustomHerbs(herbs)
          console.log("[v0] Loaded custom herbs from storage:", herbs)
        }
      } catch (err) {
        console.warn("[v0] Error loading custom herbs from storage:", err)
      }
    }

    loadCustomHerbs()
  }, [])

  useEffect(() => {
    const fetchPreviousStock = async () => {
      const stockTrackingForms = ["Daily Records (Preform Usage)", "Daily Usage of Alcohol And Stock Level", "Herbs Stock", "Caramel Stock", "Caps Stock", "Labels Stock"]
      if (!stockTrackingForms.includes(recordType)) return

      setIsLoadingStock(true)
      console.log("[v0] Fetching previous stock for recordType:", recordType)

      // ── Per-product fetch for Caramel Stock and Labels Stock ──────────────
      if (recordType === "Caramel Stock" || recordType === "Labels Stock") {
        try {
          const products = ["Bitters", "Ginger"]
          const results: Record<string, number | null> = {}

          await Promise.all(
            products.map(async (product) => {
              const params = new URLSearchParams({ recordType, date, department, product })
              const res = await fetch(`/api/records/previous-stock?${params}`)
              if (!res.ok) { results[product] = null; return }
              const data = await res.json()
              results[product] = data.hasPrevious && data.previousStock != null ? data.previousStock : null
            })
          )

          setPerProductPreviousStock(results)

          // Pre-populate opening stock for each product that has a previous record
          setFormDataByProduct((prev) => {
            const updated = { ...prev }
            products.forEach((product) => {
              if (results[product] != null) {
                if (!updated[product]) updated[product] = {}
                updated[product]["Opening Stock Level"] = String(results[product])
                // Recalculate any dependent fields
                fields.forEach((f) => {
                  if (f.calculatedFrom && f.calculation && Array.isArray(f.calculatedFrom)) {
                    const sourceValues = f.calculatedFrom.reduce((acc, srcField) => {
                      acc[srcField] = Number.parseFloat(updated[product][srcField] || "0")
                      return acc
                    }, {} as Record<string, number>)
                    updated[product][f.label] = String(f.calculation(sourceValues))
                  }
                })
              }
            })
            return updated
          })

          // Show banner if at least one product has a previous record
          setHasPreviousStock(Object.values(results).some((v) => v != null))
          setPreviousStock(null)
        } catch (err) {
          console.error("[v0] Error fetching per-product previous stock:", err)
          setHasPreviousStock(false)
        } finally {
          setIsLoadingStock(false)
        }
        return
      }

      // ── Single fetch for Caps Stock, Preforms, Alcohol ───────────────────
      try {
        const params = new URLSearchParams({ recordType, date, department })
        const response = await fetch(`/api/records/previous-stock?${params}`)

        if (!response.ok) {
          const text = await response.text()
          console.log("[v0] Failed to fetch previous stock - Status:", response.status, "Response:", text)
          setHasPreviousStock(false)
          setIsLoadingStock(false)
          return
        }

        const data = await response.json()
        console.log("[v0] Previous stock response:", data)

        if (data.hasPrevious && data.previousStock !== null && data.previousStock !== undefined) {
          setPreviousStock(data.previousStock)
          setHasPreviousStock(true)

          const openingFieldLabel =
            recordType === "Daily Records (Preform Usage)" ? "Opening Stock (BAGS)" : "Opening Stock Level"

          setFormDataByProduct((prev) => {
            const updated = { ...prev }
            if (!updated["default"]) updated["default"] = {}
            updated["default"][openingFieldLabel] = String(data.previousStock)

            fields.forEach((f) => {
              if (f.calculatedFrom && f.calculation && Array.isArray(f.calculatedFrom)) {
                const sourceValues = f.calculatedFrom.reduce(
                  (acc, srcField) => {
                    acc[srcField] = Number.parseFloat(updated["default"][srcField] || "0")
                    return acc
                  },
                  {} as Record<string, number>,
                )
                const calculatedValue = f.calculation(sourceValues)
                updated["default"][f.label] = String(calculatedValue)
              }
            })

            return updated
          })

          console.log("[v0] Auto-populated opening stock:", data.previousStock)
        } else {
          setHasPreviousStock(false)
          console.log("[v0] No previous stock found, manual input allowed")
        }
      } catch (err) {
        console.error("[v0] Error fetching previous stock:", err)
        setHasPreviousStock(false)
      } finally {
        setIsLoadingStock(false)
      }
    }

    fetchPreviousStock()
  }, [recordType, date, department])

  const handleProductionTypeChange = (type: string) => {
    setProductionTypes((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type)
      }
      return [...prev, type]
    })
  }

  const handleNumberOfTanksChange = (num: number) => {
    setNumberOfTanks(num)
    const updated: ExtractionTankData = { ...extractionTankData }
    for (let i = 0; i < num; i++) {
      if (!updated[i]) {
        updated[i] = { data: {}, isSameAsFirst: false }
      }
    }
    setExtractionTankData(updated)
  }

  const handleExtractionTankChange = (tankIndex: number, field: string, value: string) => {
    setExtractionTankData((prev) => {
      const updated = { ...prev }
      if (!updated[tankIndex]) updated[tankIndex] = { data: {}, isSameAsFirst: false }
      updated[tankIndex].data[field] = value
      return updated
    })
  }

  const handleCopFromFirst = (tankIndex: number, checked: boolean) => {
    setExtractionTankData((prev) => {
      const updated = { ...prev }
      if (!updated[tankIndex]) updated[tankIndex] = { data: {}, isSameAsFirst: false }
      updated[tankIndex].isSameAsFirst = checked

      if (checked && prev[0]?.data) {
        updated[tankIndex].data = JSON.parse(JSON.stringify(prev[0].data))
      }

      return updated
    })
  }

  const handleInputChange = (product: string | null, field: string, value: string) => {
    const key = product || "default"

    setFormDataByProduct((prev) => {
      const updated = { ...prev }
      if (!updated[key]) updated[key] = {}

      const updatedData = { ...updated[key], [field]: value }

      fields.forEach((f) => {
        if (f.calculatedFrom && f.calculation && Array.isArray(f.calculatedFrom)) {
          const sourceValues = f.calculatedFrom.reduce(
            (acc, srcField) => {
              acc[srcField] = Number.parseFloat(updatedData[srcField] || "0")
              return acc
            },
            {} as Record<string, number>,
          )

          const calculatedValue = f.calculation(sourceValues)
          updatedData[f.label] = String(calculatedValue)
        } else if (f.calculatedFrom && typeof f.calculatedFrom === "string" && f.multiplier) {
          const sourceValue = Number.parseFloat(updatedData[f.calculatedFrom] || "0")
          updatedData[f.label] = String(sourceValue * f.multiplier)
        }
      })

      const stockError = validateStockFields(updatedData, product)
      setStockErrors((prev) => ({
        ...prev,
        [key]: stockError || "",
      }))

      updated[key] = updatedData
      return updated
    })
  }

  const getFilteredFields = (selectedProducts: string[]) => {
    const productFieldMap = fieldProductTypeMap[recordType]
    if (!productFieldMap) return fields

    return fields.filter((field) => {
      const allowedProducts = productFieldMap[field.label]
      if (!allowedProducts) return true
      return selectedProducts.some((product) => allowedProducts.includes(product))
    })
  }

  const renderField = (field: Field, product: string) => {
    const value = formDataByProduct[product]?.[field.label] || ""
    const isCalculated = field.disabled && (field.calculatedFrom || field.multiplier)

    const isOpeningStockField = field.isStockField && field.stockFieldType === "opening"

    // For Caramel Stock and Labels Stock: lock per product independently
    // For all others: use the single hasPreviousStock flag
    let shouldLockField = false
    if (isOpeningStockField) {
      if (recordType === "Caramel Stock" || recordType === "Labels Stock") {
        shouldLockField = perProductPreviousStock[product] != null
      } else {
        shouldLockField = hasPreviousStock
      }
    }

    const isDisabled = field.disabled || shouldLockField

    if (field.isExtractionAlcoholPercentage && field.options) {
      return (
        <div key={field.label} className="flex gap-3">
          {field.options.map((option) => (
            <label key={option} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`${product}-${field.label}`}
                value={option}
                checked={value === option}
                onChange={(e) => handleInputChange(product, field.label, e.target.value)}
                disabled={isDisabled}
                className="w-4 h-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-foreground/80">{option}</span>
            </label>
          ))}
        </div>
      )
    }

    if (field.type === "textarea") {
      return (
        <textarea
          key={field.label}
          className="w-full p-3 rounded-lg border border-green-200 bg-white/70 backdrop-blur-sm text-slate-900 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-400/20 resize-none"
          placeholder=""
          value={value}
          onChange={(e) => handleInputChange(product, field.label, e.target.value)}
          disabled={isDisabled}
          rows={3}
        />
      )
    }

    if (field.type === "date") {
      return (
        <input
          key={field.label}
          type="date"
          className="w-full p-3 rounded-lg border border-green-200 bg-white/70 backdrop-blur-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-400/20 disabled:bg-green-50 disabled:cursor-not-allowed"
          value={value}
          onChange={(e) => handleInputChange(product, field.label, e.target.value)}
          disabled={isDisabled}
        />
      )
    }

    if (field.type === "time") {
      return (
        <input
          type="time"
          className={`w-full p-3 rounded-lg border bg-white/70 backdrop-blur-sm text-slate-900 focus:outline-none focus:ring-2 ${
            isDisabled
              ? "border-green-200 bg-green-50 cursor-not-allowed"
              : "border-green-200 focus:border-green-500 focus:ring-green-400/20"
          }`}
          value={value}
          onChange={(e) => handleInputChange(product, field.label, e.target.value)}
          disabled={isDisabled}
        />
      )
    }

    return (
      <div key={field.label} className="relative">
        <input
          type={field.type}
          className={`w-full p-3 rounded-lg border bg-white/70 backdrop-blur-sm text-slate-900 focus:outline-none focus:ring-2 ${
            isDisabled
              ? "border-green-200 bg-green-50 cursor-not-allowed"
              : "border-green-200 focus:border-green-500 focus:ring-green-400/20"
          }`}
          placeholder=""
          value={value}
          onChange={(e) => handleInputChange(product, field.label, e.target.value)}
          disabled={isDisabled}
        />
        {shouldLockField && value && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-blue-600 font-semibold text-sm">From previous shift</span>
            <span className="text-blue-600 text-lg">🔒</span>
          </div>
        )}
        {isCalculated && value && !shouldLockField && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <span className="text-green-600 font-semibold text-sm">{value}</span>
            <span className="text-green-600 text-lg">✓</span>
          </div>
        )}
      </div>
    )
  }

  const renderExtractionField = (
    field: Field,
    tankIndex: number,
    value: string,
    onChange: (val: string) => void,
    isDisabled = false,
  ) => {
    if (field.isExtractionAlcoholPercentage && field.options) {
      return (
        <div className="flex gap-3">
          {field.options.map((option) => (
            <label key={option} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name={`tank-${tankIndex}-${field.label}`}
                value={option}
                checked={value === option}
                onChange={(e) => onChange(e.target.value)}
                disabled={isDisabled}
                className="w-4 h-4 rounded border-2 border-emerald-400 text-emerald-600 focus:ring-emerald-500 focus:ring-2 cursor-pointer transition-all disabled:opacity-50"
              />
              <span className="text-sm font-semibold text-emerald-900 group-hover:text-emerald-700 transition-colors">
                {option}
              </span>
            </label>
          ))}
        </div>
      )
    }

    if (field.type === "textarea") {
      return (
        <textarea
          className="w-full p-3 rounded-lg border border-green-200 bg-white/70 backdrop-blur-sm text-slate-900 focus:outline-none focus:border-green-500 focus:ring-2 focus:ring-green-400/20 resize-none"
          placeholder=""
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
          rows={3}
        />
      )
    }

    if (field.type === "date" || field.type === "time") {
      return (
        <input
          type={field.type}
          className="w-full p-3 rounded-lg border border-green-200 bg-white/70 backdrop-blur-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-400/20 disabled:bg-green-50 disabled:cursor-not-allowed"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isDisabled}
        />
      )
    }

    return (
      <input
        type={field.type}
        className="w-full p-3 rounded-lg border border-green-200 bg-white/70 backdrop-blur-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-400/20 disabled:bg-green-50 disabled:cursor-not-allowed"
        placeholder=""
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isDisabled}
      />
    )
  }

  const fetchHerbPreviousStock = async (herb: string) => {
    try {
      const herbName = herb === "Others" ? customHerbName : herb
      if (!herbName) return

      console.log("[v0] Fetching previous stock for herb:", herbName)

      const params = new URLSearchParams({
        recordType: "Herbs Stock",
        date,
        department,
        herbType: herbName,
      })

      const response = await fetch(`/api/records/previous-stock?${params}`)
      const data = await response.json()

      if (data.hasPrevious && data.previousStock !== null && data.previousStock !== undefined) {
        console.log("[v0] Previous stock found for herb:", data.previousStock)
        setHerbsPreviousStock((prev) => ({
          ...prev,
          [herb]: data.previousStock,
        }))
        setHerbsData((prev) => {
          const updated = { ...prev }
          if (!updated[herb]) updated[herb] = {}
          updated[herb]["Available Stock"] = String(data.previousStock)
          return updated
        })
      } else {
        setHerbsPreviousStock((prev) => ({
          ...prev,
          [herb]: null,
        }))
      }
    } catch (error) {
      console.error("[v0] Error fetching herb stock:", error)
      setHerbsPreviousStock((prev) => ({
        ...prev,
        [herb]: null,
      }))
    }
  }

  const handleHerbSelectionChange = (herb: string) => {
    setSelectedHerbs((prev) => {
      if (prev.includes(herb)) {
        return prev.filter((h) => h !== herb)
      } else {
        fetchHerbPreviousStock(herb)
        return [...prev, herb]
      }
    })
  }

  const handleCreateHerb = () => {
    const trimmedName = newHerbName.trim()

    if (!trimmedName) {
      setError("Please enter a herb name")
      return
    }

    if (customHerbs.includes(trimmedName)) {
      setError("This herb already exists")
      return
    }

    if (herbOptions.includes(trimmedName)) {
      setError("This herb is already in the list")
      return
    }

    setCustomHerbs((prev) => {
      const updated = [...prev, trimmedName]
      try {
        localStorage.setItem("customHerbsList", JSON.stringify(updated))
        console.log("[v0] Saved custom herbs to storage:", updated)
      } catch (err) {
        console.warn("[v0] Error saving custom herbs to storage:", err)
      }
      return updated
    })

    setSelectedHerbs((prev) => [...prev, trimmedName])
    fetchHerbPreviousStock(trimmedName)
    setShowCreateHerbDialog(false)
    setNewHerbName("")
    setError(null)
  }

  const renderHerbsStockForm = () => {
    const stockFieldLabels = [
      "Available Stock",
      "Qty Received",
      "Total Qty",
      "Qty Used",
      "Remaining Qty",
      "Checked By",
      "Remarks",
    ]

    const handleHerbFieldChange = (herb: string, fieldLabel: string, value: string) => {
      setHerbsData((prev) => {
        const herbData = prev[herb] || {}
        const updated = { ...herbData, [fieldLabel]: value }

        if (["Available Stock", "Qty Received"].includes(fieldLabel)) {
          const available = Number(updated["Available Stock"] || 0)
          const received = Number(updated["Qty Received"] || 0)
          updated["Total Qty"] = String(available + received)
        }

        if (["Available Stock", "Qty Received", "Qty Used"].includes(fieldLabel)) {
          const available = Number(updated["Available Stock"] || 0)
          const received = Number(updated["Qty Received"] || 0)
          const used = Number(updated["Qty Used"] || 0)
          updated["Remaining Qty"] = String(available + received - used)
        }

        return { ...prev, [herb]: updated }
      })
    }

    return (
      <div className="space-y-6">
        <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-200/50 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold text-emerald-950">Select Herbs (you can select multiple)</label>
            <button
              onClick={() => setShowCreateHerbDialog(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Create Herb
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {herbOptions.map((herb) => (
              <label key={herb} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedHerbs.includes(herb)}
                  onChange={() => {
                    handleHerbSelectionChange(herb)
                    if (herb === "Others" && !selectedHerbs.includes(herb)) {
                      setCustomHerbName("")
                    }
                  }}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className="text-sm text-foreground">{herb}</span>
              </label>
            ))}
          </div>

          {selectedHerbs.includes("Others") && (
            <div className="mt-4 space-y-2">
              <label className="text-xs font-semibold text-emerald-950">Herb Name</label>
              <input
                type="text"
                value={customHerbName}
                onChange={(e) => setCustomHerbName(e.target.value)}
                placeholder="Enter the name of the herb"
                className="w-full px-3 py-2 text-sm border border-emerald-300 rounded bg-white"
              />
            </div>
          )}

          {selectedHerbs.length > 0 && (
            <div className="text-xs text-emerald-700/70 font-medium mt-2">
              Selected: {selectedHerbs.map((h) => h === "Others" && customHerbName ? customHerbName : h).join(", ")}
            </div>
          )}
        </div>

        {selectedHerbs.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-emerald-950">Herbs Stock Data</h3>
            {selectedHerbs.map((herb) => {
              const displayHerbName = herb === "Others" ? customHerbName : herb
              return (
                <div key={herb} className="bg-background/50 p-4 rounded-lg border border-primary/20">
                  <div className="mb-3 font-semibold text-sm text-foreground">{displayHerbName}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {stockFieldLabels.map((fieldLabel) => {
                      const isDisabledField = ["Total Qty", "Remaining Qty"].includes(fieldLabel)
                      const isAvailableStock = fieldLabel === "Available Stock"
                      const hasPreviousStockForHerb = herbsPreviousStock[herb] !== null && herbsPreviousStock[herb] !== undefined
                      const shouldDisable = isDisabledField || (isAvailableStock && hasPreviousStockForHerb)

                      return (
                        <div key={fieldLabel} className="space-y-1">
                          <label className="text-[10px] font-medium text-foreground/70 uppercase tracking-wide">
                            {fieldLabel}
                          </label>
                          <input
                            type={["Checked By", "Remarks"].includes(fieldLabel) ? "text" : "number"}
                            value={herbsData[herb]?.[fieldLabel] || ""}
                            onChange={(e) => handleHerbFieldChange(herb, fieldLabel, e.target.value)}
                            disabled={shouldDisable}
                            className="w-full px-2 py-1 text-sm border border-primary/30 rounded bg-background disabled:bg-muted disabled:opacity-50"
                            placeholder={fieldLabel}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <Dialog open={showCreateHerbDialog} onOpenChange={setShowCreateHerbDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Herb</DialogTitle>
              <DialogDescription>
                Enter the name of the herb to add it to your list for future selections.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="herb-name">Herb Name</Label>
                <Input
                  id="herb-name"
                  placeholder="e.g., Alligator Pepper, Ginger Root"
                  value={newHerbName}
                  onChange={(e) => setNewHerbName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateHerb()
                    }
                  }}
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={() => {
                  setShowCreateHerbDialog(false)
                  setNewHerbName("")
                }}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateHerb}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                Create Herb
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const renderAlcoholConcentrateForm = () => {
    const tank70Fields = fields.filter((f) => f.label.includes("(70)"))
    const tank80Fields = fields.filter((f) => f.label.includes("(80)"))
    const otherFields = fields.filter((f) => !f.label.includes("(70)") && !f.label.includes("(80)"))

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-center font-bold text-primary border-b border-primary/20 pb-2">70 (350L)</h3>
            {tank70Fields.map((field) => (
              <div key={field.label} className="space-y-1">
                <label className="text-xs font-medium text-foreground/70 ml-1">
                  {field.label.replace(" (70)", "")}
                </label>
                {renderField(field, "default")}
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <h3 className="text-center font-bold text-primary border-b border-primary/20 pb-2">80 (400L)</h3>
            {tank80Fields.map((field) => (
              <div key={field.label} className="space-y-1">
                <label className="text-xs font-medium text-foreground/70 ml-1">
                  {field.label.replace(" (80)", "")}
                </label>
                {renderField(field, "default")}
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-primary/10">
          {otherFields.map((field) => (
            <div key={field.label} className="space-y-1">
              <label className="text-xs font-medium text-foreground/70">{field.label}</label>
              {renderField(field, "default")}
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderExtractionMonitoringForm = () => {
    return (
      <div className="space-y-6">
        <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200/50">
          <label className="block text-sm font-bold text-emerald-900 mb-3">Number of Tanks for Monitoring</label>
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                onClick={() => handleNumberOfTanksChange(num)}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  numberOfTanks === num
                    ? "bg-emerald-600 text-white"
                    : "bg-white border-2 border-emerald-300 text-emerald-900 hover:bg-emerald-50"
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: numberOfTanks }, (_, i) => i).map((tankIndex) => {
            const tankData = extractionTankData[tankIndex]?.data || {}
            const isSameAsFirst = extractionTankData[tankIndex]?.isSameAsFirst || false

            return (
              <div key={tankIndex} className="p-6 rounded-lg bg-background/50 border border-primary/20">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground">Tank {tankIndex + 1}</h3>
                  {tankIndex > 0 && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSameAsFirst}
                        onChange={(e) => handleCopFromFirst(tankIndex, e.target.checked)}
                        className="w-4 h-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-foreground/80">Same as Tank 1</span>
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fields.map((field) => (
                    <div key={`${tankIndex}-${field.label}`} className="space-y-2">
                      <label className="text-xs font-medium text-foreground/70">{field.label}</label>
                      {renderExtractionField(
                        field,
                        tankIndex,
                        tankData[field.label] || "",
                        (value) => handleExtractionTankChange(tankIndex, field.label, value),
                        isSameAsFirst &&
                          tankIndex > 0 &&
                          field.label !== "Tank Number" &&
                          field.label !== "Alcohol Percentage",
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
  }

  const handleSubmit = async () => {
    if (recordType === "Extraction Monitoring Records") {
      setIsLoading(true)
      setError(null)

      try {
        for (let i = 0; i < numberOfTanks; i++) {
          const tankData = extractionTankData[i]?.data || {}
          const missingFields: string[] = []

          fields.forEach((field) => {
            if (!field.required) return
            if (!tankData[field.label]?.trim()) {
              missingFields.push(field.label)
            }
          })

          if (missingFields.length > 0) {
            setError(`Tank ${i + 1} missing: ${missingFields.join(", ")}`)
            setIsLoading(false)
            return
          }

          const submitData = {
            date,
            supervisorName,
            shift,
            group,
            department,
            recordType,
            productType: "Bitters",
            formData: tankData,
          }

          console.log("[v0] Submitting extraction form data:", submitData)

          const response = await fetch("/api/records/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(submitData),
          })

          const responseData = await response.json()

          if (!response.ok) {
            throw new Error(responseData.error || "Failed to save")
          }
        }

        setIsLoading(false)
        onSubmit()
      } catch (error) {
        console.error("[v0] Error:", error)
        setError(error instanceof Error ? error.message : "Failed to save record")
        setIsLoading(false)
      }
      return
    }

    if (recordType === "Herbs Stock") {
      setIsLoading(true)
      setError(null)

      try {
        if (selectedHerbs.length === 0) {
          setError("Please select at least one herb type")
          setIsLoading(false)
          return
        }

        const customHerbsToAdd: string[] = []

        for (const herb of selectedHerbs) {
          const herbData = herbsData[herb] || {}
          const requiredFields = ["Available Stock", "Qty Received", "Qty Used", "Checked By"]
          const missingFields: string[] = []

          requiredFields.forEach((field) => {
            if (!herbData[field]?.toString().trim()) {
              missingFields.push(field)
            }
          })

          if (herb === "Others" && !customHerbName.trim()) {
            setError("Please enter a custom herb name for 'Others'")
            setIsLoading(false)
            return
          }

          if (herb === "Others" && customHerbName.trim() && !customHerbs.includes(customHerbName.trim())) {
            customHerbsToAdd.push(customHerbName.trim())
          }

          if (missingFields.length > 0) {
            const displayHerbName = herb === "Others" ? customHerbName : herb
            setError(`${displayHerbName} missing: ${missingFields.join(", ")}`)
            setIsLoading(false)
            return
          }

          const displayHerbName = herb === "Others" ? customHerbName : herb
          const submitData = {
            date,
            supervisorName,
            shift,
            group,
            department,
            recordType,
            formData: {
              "Type of Herb": displayHerbName,
              ...herbData,
            },
          }

          console.log("[v0] Submitting herbs stock form data:", submitData)

          const response = await fetch("/api/records/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(submitData),
          })

          const responseData = await response.json()

          if (!response.ok) {
            throw new Error(responseData.error || "Failed to save")
          }
        }

        if (customHerbsToAdd.length > 0) {
          setCustomHerbs((prev) => {
            const updatedList = [...prev, ...customHerbsToAdd]
            console.log("[v0] Adding custom herbs to list:", customHerbsToAdd)
            return updatedList
          })
        }

        setCustomHerbName("")
        setIsLoading(false)
        onSubmit()
      } catch (error) {
        console.error("[v0] Error:", error)
        setError(error instanceof Error ? error.message : "Failed to save record")
        setIsLoading(false)
      }
      return
    }

    if (supportsMultiProduct && productionTypes.length === 0) {
      setError(`Please select at least one production type: ${availableProductTypes.join(", ")}`)
      return
    }

    const productsToSubmit = supportsMultiProduct ? productionTypes : ["default"]

    for (const product of productsToSubmit) {
      if (stockErrors[product]) {
        setError(`${product}: ${stockErrors[product]}`)
        return
      }
    }

    for (const product of productsToSubmit) {
      const formData = formDataByProduct[product] || {}
      const missingFields: string[] = []

      fields.forEach((field) => {
        if (field.calculatedFrom) return
        if (field.disabled) return

        if (recordType === "Stocks Keeping For Labels & Caps") {
          const fieldProductMap = fieldProductTypeMap[recordType]
          if (fieldProductMap && fieldProductMap[field.label]) {
            const requiredFor = fieldProductMap[field.label]
            if (!requiredFor.includes(product)) {
              return
            }
          }
        }

        if (!formData[field.label]?.trim() && field.required) {
          missingFields.push(field.label)
        }
      })

      if (missingFields.length > 0) {
        setError(`${product === "default" ? "Form" : product} missing: ${missingFields.join(", ")}`)
        return
      }
    }

    setIsLoading(true)
    setError(null)

    try {
      for (const product of productsToSubmit) {
        const submitData = {
          date,
          supervisorName,
          shift,
          group,
          department,
          recordType,
          productType: product === "default" ? null : product,
          formData: formDataByProduct[product],
        }

        console.log("[v0] Submitting form data:", submitData)

        const response = await fetch("/api/records/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submitData),
        })

        console.log("[v0] Response status:", response.status)
        const responseData = await response.json()
        console.log("[v0] Response:", responseData)

        if (!response.ok) {
          throw new Error(responseData.error || "Failed to save")
        }
      }

      setIsLoading(false)
      onSubmit()
    } catch (error) {
      console.error("[v0] Error:", error)
      setError(error instanceof Error ? error.message : "Failed to save record")
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-4xl animate-fade-in-up">
      <div className="glass-panel p-4 md:p-8 space-y-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-emerald-100">
          <button
            onClick={onBack}
            className="p-2 rounded-full glass-button hover:bg-emerald-100/50 hover:scale-110 transition-all shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-emerald-700" />
          </button>
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Lawson LLC Logo"
              width={50}
              height={50}
              className="drop-shadow-md shrink-0 rounded-md bg-white p-1"
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl md:text-2xl font-bold text-emerald-950 truncate">{recordType}</h2>
              <p className="text-sm font-medium text-emerald-700/60 truncate">{department} Department</p>
            </div>
          </div>
        </div>

        {isLoadingStock && (
          <div className="glass-panel p-4 bg-blue-50/80 border-blue-300 rounded-xl">
            <p className="text-sm font-semibold text-blue-700">Loading previous stock data...</p>
          </div>
        )}

        {hasPreviousStock && !isLoadingStock && (
          <div className="glass-panel p-4 bg-blue-50/80 border-blue-300 rounded-xl">
            {(recordType === "Caramel Stock" || recordType === "Labels Stock") ? (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-blue-700">Opening stock auto-populated from previous shift:</p>
                {["Bitters", "Ginger"].map((p) =>
                  perProductPreviousStock[p] != null ? (
                    <p key={p} className="text-sm text-blue-600">
                      {p}: {perProductPreviousStock[p]}
                    </p>
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

        {recordType === "Packaging Daily Records" && (
          <div className="glass-panel p-5 bg-gradient-to-br from-emerald-50/50 to-green-50/30 border border-emerald-200/50 rounded-xl">
            <LiveStocksDisplay />
          </div>
        )}

        {supportsMultiProduct && (
          <div className="space-y-3 p-5 rounded-xl bg-emerald-50/70 border border-emerald-200/50">
            <label className="block text-sm font-bold text-emerald-900">Production Type(s)</label>
            <p className="text-xs text-emerald-700/70 mb-3">
              Select what was produced today (you can select multiple):
            </p>
            <div className="flex gap-3 flex-wrap">
              {availableProductTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={productionTypes.includes(type)}
                    onChange={() => handleProductionTypeChange(type)}
                    disabled={isLoading}
                    className="w-5 h-5 rounded border-2 border-emerald-400 text-emerald-600 focus:ring-emerald-500 focus:ring-2 cursor-pointer transition-all disabled:opacity-50"
                  />
                  <span className="text-sm font-semibold text-emerald-900 group-hover:text-emerald-700 transition-colors">
                    {type}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-8">
          {recordType === "Extraction Monitoring Records"
            ? renderExtractionMonitoringForm()
            : supportsMultiProduct && productionTypes.length > 0
              ? productionTypes.map((product) => {
                  const filteredFields = getFilteredFields([product])
                  const key = product
                  const productStockError = stockErrors[key]

                  return (
                    <div key={product} className="p-6 rounded-lg bg-background/50 border border-primary/20">
                      <h3 className="text-lg font-semibold text-foreground mb-4">{product} Form</h3>
                      {productStockError && (
                        <div className="p-3 mb-4 rounded-lg bg-red-500/20 border border-red-500/40">
                          <p className="text-red-600 text-sm font-semibold">⚠️ {productStockError}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredFields.map((field) => (
                          <div key={field.label} className="space-y-2">
                            <label className="text-xs font-medium text-foreground/70">{field.label}</label>
                            {renderField(field, product)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              : !supportsMultiProduct && (
                  <div>
                    {stockErrors["default"] && (
                      <div className="p-3 mb-4 rounded-lg bg-red-500/20 border border-red-500/40">
                        <p className="text-red-600 text-sm font-semibold">⚠️ {stockErrors["default"]}</p>
                      </div>
                    )}
                    {recordType === "Daily Records Alcohol For Concentrate" ? (
                      renderAlcoholConcentrateForm()
                    ) : recordType === "Herbs Stock" ? (
                      renderHerbsStockForm()
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {fields.map((field) => (
                          <div key={field.label} className="space-y-2">
                            <label className="text-xs font-medium text-foreground/70">{field.label}</label>
                            {renderField(field, "default")}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
        </div>

        {error && (
          <div className="glass-panel p-4 bg-red-50/80 border-red-300 rounded-xl animate-shake">
            <p className="text-sm font-semibold text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isLoading || (supportsMultiProduct && productionTypes.length === 0)}
          className="w-full glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed py-4 rounded-xl font-bold text-lg transition-all hover:scale-[1.02]"
        >
          {isLoading ? "Saving..." : "Submit Record"}
        </button>
      </div>
    </div>
  )
}
