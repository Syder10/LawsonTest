import { describe, it, expect } from "vitest"
import {
  parseManagerFiltersFromParams,
  filtersToSearchParams,
  getDefaultManagerFilters,
  isValidDateStr,
  buildExportParams,
} from "./manager-filters"
import { ALL_TIME } from "./date-window"

describe("manager-filters domain", () => {
  describe("isValidDateStr", () => {
    it("accepts valid YYYY-MM-DD dates", () => {
      expect(isValidDateStr("2026-10-31")).toBe(true)
      expect(isValidDateStr("2024-02-29")).toBe(true)
    })

    it("rejects invalid date strings and injections", () => {
      expect(isValidDateStr("")).toBe(false)
      expect(isValidDateStr("2026/10/31")).toBe(false)
      expect(isValidDateStr("invalid")).toBe(false)
      expect(isValidDateStr("2026-10-31; DROP TABLE")).toBe(false)
      expect(isValidDateStr("9999-99-99")).toBe(false)
    })
  })

  describe("parseManagerFiltersFromParams", () => {
    it("returns defaults when params are empty", () => {
      const parsed = parseManagerFiltersFromParams(new URLSearchParams())
      const defaults = getDefaultManagerFilters()
      expect(parsed).toEqual(defaults)
    })

    it("accepts valid parameters", () => {
      const params = new URLSearchParams({
        from: "2026-10-01",
        to: "2026-10-25",
        shift: "Morning",
        department: "Packaging",
        product: "Bitters",
      })
      const parsed = parseManagerFiltersFromParams(params)
      expect(parsed).toEqual({
        from: "2026-10-01",
        to: "2026-10-25",
        shift: "Morning",
        department: "Packaging",
        product: "Bitters",
      })
    })

    it("falls back to defaults for invalid dates", () => {
      const params = new URLSearchParams({
        from: "malicious-string",
        to: "2026/02/01",
      })
      const parsed = parseManagerFiltersFromParams(params)
      const defaults = getDefaultManagerFilters()
      expect(parsed.from).toBe(defaults.from)
      expect(parsed.to).toBe(defaults.to)
    })

    it("rejects unknown shift, department, or product", () => {
      const params = new URLSearchParams({
        shift: "Graveyard",
        department: "NonexistentDept",
        product: "Vodka",
      })
      const parsed = parseManagerFiltersFromParams(params)
      expect(parsed.shift).toBe("")
      expect(parsed.department).toBe("")
      expect(parsed.product).toBe("")
    })

    it("clears product for departments that have no product column", () => {
      // Blowing and Concentrate have no product split
      const params = new URLSearchParams({
        department: "Blowing",
        product: "Bitters",
      })
      const parsed = parseManagerFiltersFromParams(params)
      expect(parsed.department).toBe("Blowing")
      expect(parsed.product).toBe("")
    })

    it("preserves product for departments with product split", () => {
      const params = new URLSearchParams({
        department: "Packaging",
        product: "Ginger",
      })
      const parsed = parseManagerFiltersFromParams(params)
      expect(parsed.department).toBe("Packaging")
      expect(parsed.product).toBe("Ginger")
    })

    it("accepts ALL_TIME for from date", () => {
      const params = new URLSearchParams({
        from: ALL_TIME,
      })
      const parsed = parseManagerFiltersFromParams(params)
      expect(parsed.from).toBe(ALL_TIME)
    })
  })

  describe("filtersToSearchParams", () => {
    it("serialises filters into search params omitting empty values", () => {
      const params = filtersToSearchParams({
        from: "2026-10-01",
        to: "2026-10-31",
        shift: "Morning",
        department: "Packaging",
        product: "Bitters",
      })
      expect(params.get("from")).toBe("2026-10-01")
      expect(params.get("to")).toBe("2026-10-31")
      expect(params.get("shift")).toBe("Morning")
      expect(params.get("department")).toBe("Packaging")
      expect(params.get("product")).toBe("Bitters")
    })

    it("omits from when ALL_TIME", () => {
      const params = filtersToSearchParams({
        from: ALL_TIME,
        to: "2026-10-31",
        shift: "",
        department: "",
        product: "",
      })
      expect(params.has("from")).toBe(false)
      expect(params.has("shift")).toBe(false)
    })
  })

  describe("buildExportParams", () => {
    it("generates department and month parameters when window falls in single month", () => {
      const { url, label } = buildExportParams({
        from: "2026-10-01",
        to: "2026-10-25",
        shift: "Morning",
        department: "Blowing",
        product: "",
      })
      expect(url).toBe("/api/records/export?department=Blowing&month=2026-10")
      expect(label).toBe("Export Blowing, Oct 2026")
    })

    it("omits month when window spans multiple months", () => {
      const { url, label } = buildExportParams({
        from: "2026-09-15",
        to: "2026-10-15",
        shift: "",
        department: "Packaging",
        product: "Bitters",
      })
      expect(url).toBe("/api/records/export?department=Packaging")
      expect(label).toBe("Export Packaging")
    })

    it("generates Export All, Month when in overview scope with single month window", () => {
      const { url, label } = buildExportParams({
        from: "2026-10-01",
        to: "2026-10-31",
        shift: "",
        department: "",
        product: "",
      })
      expect(url).toBe("/api/records/export?month=2026-10")
      expect(label).toBe("Export All, Oct 2026")
    })

    it("defaults to plain Export when all-time with no department", () => {
      const { url, label } = buildExportParams({
        from: ALL_TIME,
        to: "2026-10-31",
        shift: "",
        department: "",
        product: "",
      })
      expect(url).toBe("/api/records/export")
      expect(label).toBe("Export")
    })
  })
})
