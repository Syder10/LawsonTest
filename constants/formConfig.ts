export interface FormField {
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

export const PRODUCT_TYPE_FORMS: Record<string, string[]> = {
    "Daily Records for Alcohol and Blending": ["Bitters"],
    "Ginger Production": [],
    "Extraction Monitoring Records": ["Bitters"],
    "Filling Line Daily Records": ["Bitters", "Ginger"],
    "Packaging Daily Records": ["Bitters", "Ginger"],
    "Daily Records Alcohol For Concentrate": [],
    "Herbs Stock": [],
    "Caramel Stock": ["Bitters", "Ginger"],
    "Caps Stock": [],
    "Labels Stock": ["Bitters", "Ginger"],
}

export const FORM_FIELDS: Record<string, FormField[]> = {
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
