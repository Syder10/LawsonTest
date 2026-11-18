import { describe, expect, it } from "vitest"
import {
  deriveOverallRecordStatus,
  evaluateQcValue,
  generateQcReference,
  getQcRecordType,
} from "./qc"

describe("QC Status Evaluation", () => {
  it("evaluates inclusive range correctly (e.g. Raw Ethanol 95% - 96%)", () => {
    const ethanolStandard = { lowerLimit: 95.0, upperLimit: 96.0, isInclusive: true }

    expect(evaluateQcValue(95.5, ethanolStandard)).toBe("in_range")
    expect(evaluateQcValue(95.0, ethanolStandard)).toBe("in_range") // boundary included
    expect(evaluateQcValue(96.0, ethanolStandard)).toBe("in_range") // boundary included

    expect(evaluateQcValue(94.8, ethanolStandard)).toBe("below_range")
    expect(evaluateQcValue(96.2, ethanolStandard)).toBe("above_range")
  })

  it("evaluates De-Ray Bitters pH standard (4.0 - 6.0)", () => {
    const bittersPh = { lowerLimit: 4.0, upperLimit: 6.0, isInclusive: true }

    expect(evaluateQcValue(4.5, bittersPh)).toBe("in_range")
    expect(evaluateQcValue(3.9, bittersPh)).toBe("below_range")
    expect(evaluateQcValue(6.1, bittersPh)).toBe("above_range")
  })

  it("handles unconfigured standards without guessing or falsely declaring compliance", () => {
    expect(evaluateQcValue(120, null)).toBe("standard_not_configured")
    expect(evaluateQcValue(120, { lowerLimit: null, upperLimit: null, isInclusive: true })).toBe(
      "standard_not_configured",
    )
  })

  it("flags missing or NaN values as incomplete", () => {
    const std = { lowerLimit: 4.0, upperLimit: 6.0, isInclusive: true }
    expect(evaluateQcValue(null, std)).toBe("incomplete")
    expect(evaluateQcValue(undefined, std)).toBe("incomplete")
    expect(evaluateQcValue(NaN, std)).toBe("incomplete")
  })
})

describe("Record-Level Status Precedence", () => {
  it("flags the entire record if ANY parameter is out of range", () => {
    expect(deriveOverallRecordStatus(["in_range", "in_range", "above_range"])).toBe("out_of_range")
    expect(deriveOverallRecordStatus(["in_range", "below_range", "standard_not_configured"])).toBe(
      "out_of_range",
    )
  })

  it("resolves to in_range if all evaluated parameters are within limits", () => {
    expect(deriveOverallRecordStatus(["in_range", "in_range", "standard_not_configured"])).toBe(
      "in_range",
    )
  })

  it("marks as incomplete if missing required values without out-of-range failures", () => {
    expect(deriveOverallRecordStatus(["incomplete", "standard_not_configured"])).toBe("incomplete")
  })
})

describe("QC Record Types Catalogue", () => {
  it("covers all required water, product, and raw materials types", () => {
    expect(getQcRecordType("treated_water_ro")).toBeDefined()
    expect(getQcRecordType("treated_water_blending")).toBeDefined()
    expect(getQcRecordType("bitters")).toBeDefined()
    expect(getQcRecordType("ginger_liquor")).toBeDefined()
    expect(getQcRecordType("raw_ethanol")).toBeDefined()
    expect(getQcRecordType("pet_preforms")).toBeDefined()
    expect(getQcRecordType("blown_bottles")).toBeDefined()
  })

  it("formats reference strings properly", () => {
    expect(generateQcReference("2026-10-28", 1)).toBe("QC-20261028-001")
    expect(generateQcReference("2026-10-28", 42)).toBe("QC-20261028-042")
  })
})
