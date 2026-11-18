import { describe, expect, it } from "vitest"
import {
  REPORT_THRESHOLDS,
  cartonAttention,
  mostUrgentIndex,
  reportDaysLeft,
  reportStatus,
  splitReportSections,
  stampBoxesAndPieces,
  statusWithDays,
  suggestActions,
  urgencyForText,
  urgencySegments,
} from "./procurement-report"
import { AMBER_DAYS, RED_DAYS, levelFromDays } from "./stock-status"
import { DEFAULT_SETTINGS } from "./settings"
import { SAMPLE_MATERIALS, sampleRow } from "./procurement-report.sample"
import { documentHeaderText, formatReportDate, formatReportMonth, isIsoDate } from "./report-document"
import { DEFAULT_USAGE_WINDOW_DAYS, windowStart } from "./date-window"

describe("reportStatus", () => {
  it("is Stockout whenever nothing is left, whatever the level says", () => {
    expect(reportStatus({ remaining: 0, level: "none" })).toBe("Stockout")
    expect(reportStatus({ remaining: -3, level: "red" })).toBe("Stockout")
  })

  it("maps the system urgency level otherwise", () => {
    expect(reportStatus({ remaining: 5, level: "red" })).toBe("Critical")
    expect(reportStatus({ remaining: 5, level: "yellow" })).toBe("Monitor")
    expect(reportStatus({ remaining: 5, level: "none" })).toBe("Adequate")
  })

  it("uses the same thresholds as the dashboards, not its own copy", () => {
    expect(REPORT_THRESHOLDS).toEqual({ criticalDays: RED_DAYS, monitorDays: AMBER_DAYS })
    // At the boundaries the level function decides, and the report follows it.
    expect(reportStatus({ remaining: 1, level: levelFromDays(RED_DAYS) })).toBe("Critical")
    expect(reportStatus({ remaining: 1, level: levelFromDays(RED_DAYS + 0.1) })).toBe("Monitor")
    expect(reportStatus({ remaining: 1, level: levelFromDays(AMBER_DAYS) })).toBe("Monitor")
    expect(reportStatus({ remaining: 1, level: levelFromDays(AMBER_DAYS + 0.1) })).toBe("Adequate")
  })
})

describe("days left and status text", () => {
  it("states 0 days for a stockout and null when there is no usage", () => {
    expect(reportDaysLeft({ remaining: 0, operatingDaysLeft: 12 })).toBe(0)
    expect(reportDaysLeft({ remaining: 4, operatingDaysLeft: null })).toBeNull()
    expect(reportDaysLeft({ remaining: 4, operatingDaysLeft: 2.25 })).toBe(2.25)
  })

  it("renders days with at most one decimal and never a percentage", () => {
    expect(statusWithDays(sampleRow({ key: "c", label: "C", remaining: 9, operatingDaysLeft: 2.25, level: "red" }))).toBe(
      "Critical (2.3 days left)",
    )
    expect(statusWithDays(sampleRow({ key: "c", label: "C", remaining: 9, operatingDaysLeft: 1, level: "red" }))).toBe(
      "Critical (1 day left)",
    )
    expect(statusWithDays(sampleRow({ key: "c", label: "C", remaining: 0, operatingDaysLeft: 5 }))).toBe("Stockout (0 days left)")
    expect(statusWithDays(sampleRow({ key: "c", label: "C", remaining: 9, operatingDaysLeft: null }))).toBe(
      "Adequate (no usage recorded)",
    )
  })
})

describe("splitReportSections", () => {
  const s = splitReportSections(SAMPLE_MATERIALS)

  it("puts cartons, tax stamps and other materials in their own sections", () => {
    expect(s.cartons.map((c) => c.key)).toEqual(["carton_bitters", "carton_ginger"])
    expect(s.taxStamp?.key).toBe("tax_stamp")
  })

  it("lists production materials first, then other consumables, and leaves PPE out", () => {
    expect(s.materials.map((m) => m.key)).toEqual(["alcohol", "preforms", "caps", "labels_bitters", "seal_tape"])
  })

  it("copes with an empty response", () => {
    expect(splitReportSections([])).toEqual({ cartons: [], materials: [], taxStamp: null })
  })
})

describe("stampBoxesAndPieces", () => {
  const c = { stampPcsPerCoil: 10, stampCoilsPerBox: 3 } // sample pack sizes: 30 per box

  it("counts full boxes and the loose remainder on the configured pack sizes", () => {
    expect(stampBoxesAndPieces(95, c)).toEqual({ remainingPcs: 95, boxes: 3, pieces: 5 })
    expect(stampBoxesAndPieces(30, c)).toEqual({ remainingPcs: 30, boxes: 1, pieces: 0 })
    expect(stampBoxesAndPieces(0, c)).toEqual({ remainingPcs: 0, boxes: 0, pieces: 0 })
  })

  it("follows the settings, not a hardcoded box size", () => {
    const perBox = DEFAULT_SETTINGS.conversions.stampPcsPerCoil * DEFAULT_SETTINGS.conversions.stampCoilsPerBox
    expect(stampBoxesAndPieces(perBox * 2 + 7, DEFAULT_SETTINGS.conversions)).toMatchObject({ boxes: 2, pieces: 7 })
  })

  it("never reports a negative or fractional count, and survives a zero pack size", () => {
    expect(stampBoxesAndPieces(-5, c)).toEqual({ remainingPcs: 0, boxes: 0, pieces: 0 })
    expect(stampBoxesAndPieces(31.6, c)).toEqual({ remainingPcs: 32, boxes: 1, pieces: 2 })
    expect(stampBoxesAndPieces(12, { stampPcsPerCoil: 0, stampCoilsPerBox: 3 })).toEqual({ remainingPcs: 12, boxes: 0, pieces: 12 })
  })
})

describe("cartonAttention", () => {
  it("names the carton with the fewest days left among those needing attention", () => {
    expect(cartonAttention(splitReportSections(SAMPLE_MATERIALS).cartons)).toEqual({ label: "Cartons — Bitters", days: 3 })
  })

  it("treats a stockout as 0 days", () => {
    const rows = [
      sampleRow({ key: "carton_a", label: "A", remaining: 0, operatingDaysLeft: null }),
      sampleRow({ key: "carton_b", label: "B", remaining: 5, operatingDaysLeft: 2, level: "red" }),
    ]
    expect(cartonAttention(rows)).toEqual({ label: "A", days: 0 })
  })

  it("is hidden when every carton is adequate, or there are none", () => {
    expect(cartonAttention([sampleRow({ key: "carton_a", label: "A", operatingDaysLeft: 40 })])).toBeNull()
    expect(cartonAttention([])).toBeNull()
  })
})

describe("suggestActions", () => {
  it("orders stockouts, then criticals by days left, then monitors, then routine lines", () => {
    const texts = suggestActions(splitReportSections(SAMPLE_MATERIALS)).map((a) => a.text)
    expect(texts).toEqual([
      "Procure Alcohol immediately.",
      "Procure Preforms immediately.",
      "Procure Cartons — Bitters immediately.",
      "Monitor Caps stock and place replenishment orders in advance.",
      "Monitor Tax Stamp stock and plan replenishment in advance.",
    ])
  })

  it("adds the carton monitoring line only when no carton is urgent", () => {
    const calm = splitReportSections([
      sampleRow({ key: "carton_bitters", label: "Cartons — Bitters", group: "procurement", operatingDaysLeft: 40 }),
    ])
    expect(suggestActions(calm).map((a) => a.text)).toEqual([
      "Continue monitoring carton consumption trends to maintain adequate stock levels.",
    ])
  })

  it("asks for tax stamps immediately when they have run out", () => {
    const out = splitReportSections([sampleRow({ key: "tax_stamp", label: "Tax Stamps", group: "procurement", remaining: 0 })])
    expect(suggestActions(out).map((a) => a.text)).toEqual(["Procure Tax Stamps immediately."])
  })

  it("suggests nothing for an empty report", () => {
    expect(suggestActions(splitReportSections([]))).toEqual([])
  })

  it("gives every action a unique id", () => {
    const ids = suggestActions(splitReportSections(SAMPLE_MATERIALS)).map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("urgency of edited actions", () => {
  it("is immediate when the sentence says so", () => {
    expect(urgencyForText("Order caps IMMEDIATELY.")).toBe("immediate")
    expect(urgencyForText("Order caps next week.")).toBe("routine")
    expect(urgencyForText("Order caps next week.", "advance")).toBe("advance")
    expect(urgencyForText("Order caps next week.", "immediate")).toBe("advance")
  })

  it("underlines only the first immediate action that actually says immediately", () => {
    expect(
      mostUrgentIndex([
        { urgency: "advance", text: "Monitor caps." },
        { urgency: "immediate", text: "Procure alcohol immediately." },
        { urgency: "immediate", text: "Procure preforms immediately." },
      ]),
    ).toBe(1)
    expect(mostUrgentIndex([{ urgency: "routine", text: "Keep watching." }])).toBe(-1)
  })

  it("splits the urgency word out for emphasis, keeping every character", () => {
    expect(urgencySegments("Procure Alcohol immediately.")).toEqual([
      { text: "Procure Alcohol ", emphasis: false },
      { text: "immediately", emphasis: true },
      { text: ".", emphasis: false },
    ])
    expect(urgencySegments("No urgency here")).toEqual([{ text: "No urgency here", emphasis: false }])
    expect(urgencySegments("immediatelyish")).toEqual([{ text: "immediatelyish", emphasis: false }])
  })
})

describe("windowStart", () => {
  it("opens the 30-day usage window, inclusive of the end date, across month and year ends", () => {
    expect(DEFAULT_USAGE_WINDOW_DAYS).toBe(30)
    expect(windowStart("2026-11-30")).toBe("2026-11-01")
    expect(windowStart("2026-03-01")).toBe("2026-01-31")
    expect(windowStart("2026-01-10")).toBe("2025-12-12")
    expect(windowStart("2026-11-17", 1)).toBe("2026-11-17")
  })

  it("matches the window the report route used before it was named", () => {
    const today = new Date().toISOString().slice(0, 10)
    const before = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10)
    expect(windowStart(today)).toBe(before)
  })
})

describe("report-document helpers", () => {
  it("formats the report date as DD Month YYYY without timezone drift", () => {
    expect(formatReportDate("2026-11-07")).toBe("07 November 2026")
    expect(formatReportDate("2026-01-31")).toBe("31 January 2026")
    expect(formatReportDate("2026-02-30")).toBe("")
    expect(formatReportDate("")).toBe("")
    expect(isIsoDate("2028-02-29")).toBe(true)
  })

  it("spells the house header once", () => {
    expect(documentHeaderText("Procurement and Stock Department")).toBe("LAWSON LLC – PROCUREMENT AND STOCK DEPARTMENT")
    expect(formatReportMonth(2026, 11)).toBe("November 2026")
  })
})
