import ExcelJS from "exceljs"

interface RecordData {
  id: string
  date: string
  supervisor_name: string
  shift: string
  group_number: number
  department: string
  record_type: string
  [key: string]: any
}

const PRIMARY_COLOR = "FF10B981" // Green
const HEADER_COLOR = "FF059669" // Dark green
const TEXT_COLOR = "FF1F2937" // Dark gray

export async function generateExcelWorkbook(recordsByType: Record<string, RecordData[]>) {
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

    const columnArray = Array.from(columns).sort()

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
    headerRow.alignment = { horizontal: "center", vertical: "center", wrapText: true }
    headerRow.height = 25

    // Add data rows
    records.forEach((record, index) => {
      const row = sheet.insertRow(index + 2, record)
      row.alignment = { horizontal: "left", vertical: "center" }

      // Alternate row colors for readability
      if (index % 2 === 0) {
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0FDF4" } }
      }
    })

    // Freeze header row
    sheet.views = [{ state: "frozen", ySplit: 1 }]
  })

  return workbook
}

export async function downloadExcel(workbook: ExcelJS.Workbook, filename = "production_records.xlsx") {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}
