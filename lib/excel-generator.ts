import ExcelJS from "exceljs"

interface RecordRow {
  [key: string]: unknown
}

const HEADER_COLOR = "FF059669" // Dark green
const ALT_ROW_COLOR = "FFF0FDF4" // Light green (8-digit ARGB)

// Preferred left-to-right column order; anything else falls in the middle
// alphabetically, with audit columns pushed to the end.
const COLUMN_ORDER = [
  "date", "shift", "group_number", "department", "product", "variant",
  "material", "supervisor_name",
]
const COLUMN_LAST = ["destination", "checked_by", "remarks", "created_at"]

function orderColumns(cols: string[]): string[] {
  const rank = (c: string) => {
    const front = COLUMN_ORDER.indexOf(c)
    if (front !== -1) return front
    const back = COLUMN_LAST.indexOf(c)
    if (back !== -1) return 1000 + back
    return 500
  }
  return [...cols].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

export async function generateExcelWorkbook(recordsByType: Record<string, RecordRow[]>) {
  const workbook = new ExcelJS.Workbook()

  // Add a summary sheet first
  const summarySheet = workbook.addWorksheet("Summary", { state: "visible" })
  summarySheet.columns = [
    { header: "Record Type", key: "record_type", width: 35 },
    { header: "Total Records", key: "count", width: 15 },
    { header: "Last Updated", key: "last_updated", width: 20 },
  ]

  // Style header row
  summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }
  summarySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_COLOR } }

  // Add summary data
  let rowIndex = 2
  Object.entries(recordsByType).forEach(([recordType, records]) => {
    if (records.length > 0) {
      summarySheet.insertRow(rowIndex, {
        record_type: recordType,
        count: records.length,
        last_updated: new Date().toLocaleDateString(),
      })
      rowIndex++
    }
  })

  // Create a worksheet for each record type
  Object.entries(recordsByType).forEach(([recordType, records]) => {
    if (records.length === 0) return

    // Sanitize sheet name (max 31 chars, no special chars)
    const sheetName = recordType.substring(0, 31).replace(/[/?*[\]]/g, "")
    const sheet = workbook.addWorksheet(sheetName)

    // Get all unique columns from records
    const columns = new Set<string>()
    records.forEach((record) => {
      Object.keys(record).forEach((key) => columns.add(key))
    })

    const columnArray = orderColumns(Array.from(columns))

    // Set up columns
    sheet.columns = columnArray.map((col) => ({
      header: col
        .replace(/_/g, " ")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" "),
      key: col,
      width: Math.max(15, Math.min(40, col.length + 5)),
    }))

    // Style header row
    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_COLOR } }
    headerRow.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    headerRow.height = 25

    // Add data rows
    records.forEach((record, index) => {
      const row = sheet.addRow(record)
      row.alignment = { horizontal: "left", vertical: "middle" }
      if (index % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALT_ROW_COLOR } }
      }
    })

    // Freeze header row
    sheet.views = [{ state: "frozen", ySplit: 1 }]
  })

  return workbook
}
