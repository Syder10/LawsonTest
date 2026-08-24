import { describe, it, expect } from "vitest"
import {
  ROLES,
  ROLE_COLORS,
  ROLE_LABELS,
  isKnownRole,
  normalizeLoginMode,
  roleLabel,
  roleSatisfiesMode,
} from "@/lib/domain/roles"

describe("isKnownRole", () => {
  it("accepts every configured role", () => {
    for (const r of ROLES) expect(isKnownRole(r)).toBe(true)
  })

  it("rejects unknown, mis-cased, and empty roles", () => {
    expect(isKnownRole("Admin")).toBe(false)
    expect(isKnownRole("superuser")).toBe(false)
    expect(isKnownRole("")).toBe(false)
  })
})

describe("normalizeLoginMode", () => {
  it("passes through the three real modes", () => {
    expect(normalizeLoginMode("supervisor")).toBe("supervisor")
    expect(normalizeLoginMode("manager")).toBe("manager")
    expect(normalizeLoginMode("admin")).toBe("admin")
  })

  it("falls back to supervisor for anything else", () => {
    expect(normalizeLoginMode(null)).toBe("supervisor")
    expect(normalizeLoginMode(undefined)).toBe("supervisor")
    expect(normalizeLoginMode("")).toBe("supervisor")
    expect(normalizeLoginMode("procurement")).toBe("supervisor")
    expect(normalizeLoginMode("' OR 1=1")).toBe("supervisor")
  })
})

describe("roleSatisfiesMode", () => {
  it("lets the admin form through for admins only", () => {
    expect(roleSatisfiesMode("admin", "admin")).toBe(true)
    expect(roleSatisfiesMode("manager", "admin")).toBe(false)
    expect(roleSatisfiesMode("supervisor", "admin")).toBe(false)
    expect(roleSatisfiesMode("procurement", "admin")).toBe(false)
  })

  it("lets the manager form through for managers and admins", () => {
    expect(roleSatisfiesMode("manager", "manager")).toBe(true)
    expect(roleSatisfiesMode("admin", "manager")).toBe(true)
    expect(roleSatisfiesMode("supervisor", "manager")).toBe(false)
    expect(roleSatisfiesMode("procurement", "manager")).toBe(false)
  })

  it("treats the supervisor form as the general entry point for EVERY valid role", () => {
    // Regression guard: this used to require an exact supervisor/procurement
    // match, which signed managers and admins straight back out of the default
    // form with "This account must use its assigned access level."
    for (const r of ROLES) expect(roleSatisfiesMode(r, "supervisor")).toBe(true)
  })

  it("lets procurement in, since it has no form of its own", () => {
    expect(roleSatisfiesMode("procurement", "supervisor")).toBe(true)
  })

  it("refuses an unrecognised role on every form", () => {
    for (const mode of ["supervisor", "manager", "admin"] as const) {
      expect(roleSatisfiesMode("superuser", mode)).toBe(false)
      expect(roleSatisfiesMode("", mode)).toBe(false)
    }
  })

  it("is monotonic: admin clears every form a manager clears", () => {
    for (const mode of ["supervisor", "manager", "admin"] as const) {
      if (roleSatisfiesMode("manager", mode)) expect(roleSatisfiesMode("admin", mode)).toBe(true)
      if (roleSatisfiesMode("supervisor", mode)) expect(roleSatisfiesMode("admin", mode)).toBe(true)
    }
  })
})

describe("ROLES", () => {
  it("lists the four application roles in privilege order", () => {
    expect(ROLES).toEqual(["supervisor", "manager", "admin", "procurement"])
  })

  it("contains no duplicates", () => {
    expect(new Set(ROLES).size).toBe(ROLES.length)
  })
})

describe("ROLE_LABELS", () => {
  it("labels every role, including the two that are not a straight capitalisation", () => {
    expect(ROLE_LABELS).toEqual({
      supervisor: "Supervisor",
      manager: "Manager",
      admin: "Administrator",
      procurement: "Stock Office",
    })
  })

  it("renames procurement to the business-facing 'Stock Office'", () => {
    expect(ROLE_LABELS.procurement).toBe("Stock Office")
  })

  it("expands admin to 'Administrator'", () => {
    expect(ROLE_LABELS.admin).toBe("Administrator")
  })

  it("covers every entry in ROLES", () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role], `label for ${role}`).toBeTruthy()
    }
  })

  it("has no labels for roles outside ROLES", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLES].sort())
  })
})

describe("ROLE_COLORS", () => {
  it("styles every role in ROLES", () => {
    for (const role of ROLES) {
      expect(ROLE_COLORS[role], `colors for ${role}`).toBeTruthy()
    }
  })

  it("covers exactly the same keys as ROLE_LABELS", () => {
    expect(Object.keys(ROLE_COLORS).sort()).toEqual(Object.keys(ROLE_LABELS).sort())
  })

  it("gives each role a background, text and border utility class", () => {
    for (const role of ROLES) {
      const classes = ROLE_COLORS[role].split(" ")
      expect(classes.some((c) => c.startsWith("bg-")), `bg class for ${role}`).toBe(true)
      expect(classes.some((c) => c.startsWith("text-")), `text class for ${role}`).toBe(true)
      expect(classes.some((c) => c.startsWith("border-")), `border class for ${role}`).toBe(true)
    }
  })

  it("gives each role a distinct palette", () => {
    const palettes = ROLES.map((r) => ROLE_COLORS[r])
    expect(new Set(palettes).size).toBe(palettes.length)
  })
})

describe("roleLabel", () => {
  it("returns the label for each known role", () => {
    expect(ROLES.map(roleLabel)).toEqual(["Supervisor", "Manager", "Administrator", "Stock Office"])
  })

  it("falls back to 'Supervisor' for an unknown role", () => {
    // NOTE: the fallback silently presents an unrecognised role as the LOWEST
    // privilege label rather than something neutral like "Unknown" - safe by
    // default for display, but it also hides typos in the role column.
    expect(roleLabel("owner")).toBe("Supervisor")
  })

  it("falls back to 'Supervisor' for an empty role", () => {
    expect(roleLabel("")).toBe("Supervisor")
  })

  it("is case-sensitive and falls back for a differently cased role", () => {
    expect(roleLabel("Admin")).toBe("Supervisor")
    expect(roleLabel("admin")).toBe("Administrator")
  })

  it("falls back to Supervisor for keys that collide with Object.prototype members", () => {
    // Guarded by Object.hasOwn: a plain-object lookup would return the inherited
    // function, which survives `??` and would render as Object source text.
    expect(roleLabel("constructor")).toBe("Supervisor")
    expect(roleLabel("toString")).toBe("Supervisor")
    expect(typeof roleLabel("constructor")).toBe("string")
  })
})
