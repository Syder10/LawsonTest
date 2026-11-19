import { describe, it, expect } from "vitest"
import {
  ROLES,
  ROLE_COLORS,
  ROLE_LABELS,
  isActiveNav,
  isKnownRole,
  navFor,
  roleLabel,
  canReadStock,
  canWriteStock,
  activeNavHref,
  sideNavFor,
  STOCK_READ_ROLES,
  STOCK_WRITE_ROLES,
  canSeeHerbs,
  HERB_DEPARTMENT,
} from "@/lib/domain/roles"
import { getRecordType } from "@/lib/domain/record-types"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

describe("navFor", () => {
  it("gives every role a navigation list", () => {
    for (const r of ROLES) expect(navFor(r).length).toBeGreaterThan(0)
  })

  it("caps every role at five items so a bottom tab bar stays thumb-reachable", () => {
    for (const r of ROLES) expect(navFor(r).length).toBeLessThanOrEqual(5)
  })

  it("gives EVERY role a route to its own profile", () => {
    // The bug this fixes: only supervisors had links anywhere, so managers, admins
    // and procurement could not reach their own profile — not even to change their
    // password.
    for (const r of ROLES) {
      expect(navFor(r).map((i) => i.key), `${r} cannot reach profile`).toContain("profile")
    }
  })

  it("only offers History to the roles that file something", () => {
    // Supervisors file production records; procurement's history IS its receipts
    // log. Managers and admins file nothing, so History is not their work — they
    // read the analytics dashboard instead.
    expect(navFor("supervisor").map((i) => i.key)).toContain("history")
    expect(navFor("procurement").map((i) => i.key)).toContain("history")
    expect(navFor("manager").map((i) => i.key)).not.toContain("history")
    expect(navFor("admin").map((i) => i.key)).not.toContain("history")
  })

  it("only offers Submit to supervisors", () => {
    // Procurement receives raw materials (its own form), and managers and admins
    // submit no records at all — a Submit tab for them led to a form that would
    // reject them.
    expect(navFor("supervisor").map((i) => i.key)).toContain("submit")
    for (const r of ROLES) {
      if (r !== "supervisor") expect(navFor(r).map((i) => i.key), r).not.toContain("submit")
    }
  })

  it("always starts at home", () => {
    for (const r of ROLES) expect(navFor(r)[0].key).toBe("home")
  })

  it("routes each role to the work it actually does", () => {
    expect(navFor("supervisor").map((i) => i.key)).toContain("submit")
    expect(navFor("stock").map((i) => i.key)).toContain("receive")
    expect(navFor("procurement").map((i) => i.key)).not.toContain("receive")
    expect(navFor("admin").map((i) => i.key)).toContain("users")
    expect(navFor("manager").map((i) => i.key)).toContain("stock")
  })

  it("does not offer stock to supervisors or users to anyone but admins", () => {
    expect(navFor("supervisor").map((i) => i.key)).not.toContain("stock")
    for (const r of ROLES) {
      if (r !== "admin") expect(navFor(r).map((i) => i.key)).not.toContain("users")
    }
  })

  it("has no duplicate destinations", () => {
    for (const r of ROLES) {
      const hrefs = navFor(r).map((i) => i.href)
      expect(new Set(hrefs).size).toBe(hrefs.length)
    }
  })

  it("falls back to the supervisor list for an unrecognised role", () => {
    expect(navFor("nonsense")).toEqual(navFor("supervisor"))
  })
})

describe("operational access", () => {
  it("only lets Stock Officer enter stock records", () => {
    for (const role of ROLES) expect(canWriteStock(role), role).toBe(role === "stock")
  })
  it("keeps manager dashboards viewable and admin focused on system management", () => {
    expect(canReadStock("manager")).toBe(true)
    expect(canReadStock("admin")).toBe(false)
    expect(navFor("admin").map((item) => item.key)).toEqual(["home", "users", "settings", "profile"])
  })
})

describe("isActiveNav", () => {
  // Supervisor: the longest list, and the one with a nested route (/dashboard/forms
  // /[recordType]) to test the parent-stays-active rule against.
  const nav = navFor("supervisor")

  it("marks the exact route active", () => {
    expect(isActiveNav("/dashboard/history", "/dashboard/history", nav)).toBe(true)
  })

  it("does NOT light up Home on every page", () => {
    // "/dashboard" prefixes every route, so a naive startsWith would always match.
    expect(isActiveNav("/dashboard", "/dashboard/history", nav)).toBe(false)
    expect(isActiveNav("/dashboard", "/dashboard", nav)).toBe(true)
  })

  it("keeps the parent active on a nested route", () => {
    expect(isActiveNav("/dashboard/forms", "/dashboard/forms/Caps%20Stock", nav)).toBe(true)
  })

  it("prefers the longest match when routes nest", () => {
    const procurement = navFor("procurement")
    const path = "/dashboard/stock"
    expect(isActiveNav("/dashboard/stock", path, procurement)).toBe(true)
    expect(isActiveNav("/dashboard", path, procurement)).toBe(false)
  })

  it("marks nothing active on a route the role has no tab for", () => {
    // A manager can open /dashboard/forms by URL, but has no tab for it.
    // Home must NOT light up as a consolation prize: it would say "you are on the home screen" when you aren't.
    const manager = navFor("manager")
    expect(manager.some((i) => isActiveNav(i.href, "/dashboard/forms", manager))).toBe(false)
  })

  it("handles all manager navigation routes and extra prefixes correctly", () => {
    const manager = navFor("manager")
    expect(manager.map((i) => i.key)).toEqual(["home", "production", "stock", "reports", "profile"])

    // Exact matches
    expect(isActiveNav("/dashboard", "/dashboard", manager)).toBe(true)
    expect(isActiveNav("/dashboard/production", "/dashboard/production", manager)).toBe(true)
    expect(isActiveNav("/dashboard/stock", "/dashboard/stock", manager)).toBe(true)
    expect(isActiveNav("/dashboard/reports", "/dashboard/reports", manager)).toBe(true)
    expect(isActiveNav("/dashboard/profile", "/dashboard/profile", manager)).toBe(true)

    // Stock sub-routes
    expect(isActiveNav("/dashboard/stock", "/dashboard/stock/herbs", manager)).toBe(true)

    // Reports extra prefixes: Monthly Stock Report and History
    expect(isActiveNav("/dashboard/reports", "/dashboard/stock/monthly-report", manager)).toBe(true)
    expect(isActiveNav("/dashboard/stock", "/dashboard/stock/monthly-report", manager)).toBe(false)
    expect(isActiveNav("/dashboard/reports", "/dashboard/history", manager)).toBe(true)

    // Off-tab routes light up nothing
    expect(manager.some((i) => isActiveNav(i.href, "/dashboard/forms", manager))).toBe(false)
    expect(manager.some((i) => isActiveNav(i.href, "/dashboard/admin/users", manager))).toBe(false)
  })

  it("confirms navigation for other roles remains unchanged", () => {
    expect(navFor("supervisor").map((i) => i.key)).toEqual(["home", "submit", "history", "profile"])
    expect(navFor("procurement").map((i) => i.key)).toEqual(["home", "stock", "history", "profile"])
    expect(navFor("stock").map((i) => i.key)).toEqual(["home", "receive", "stock", "history", "profile"])
    expect(navFor("admin").map((i) => i.key)).toEqual(["home", "users", "settings", "profile"])
    expect(navFor("qc_officer").map((i) => i.key)).toEqual(["home", "qc", "profile"])
    expect(navFor("qc_manager").map((i) => i.key)).toEqual(["home", "qc", "profile"])

    // For stock role, /dashboard/stock/monthly-report lights up stock tab
    const stock = navFor("stock")
    expect(isActiveNav("/dashboard/stock", "/dashboard/stock/monthly-report", stock)).toBe(true)

    // For supervisor, /dashboard/history lights up history tab
    const supervisor = navFor("supervisor")
    expect(isActiveNav("/dashboard/history", "/dashboard/history", supervisor)).toBe(true)
  })

  it("lights Home only on Home itself", () => {
    for (const role of ["supervisor", "manager", "admin", "procurement"]) {
      const items = navFor(role)
      expect(isActiveNav("/dashboard", "/dashboard", items), role).toBe(true)
      expect(isActiveNav("/dashboard", "/dashboard/profile", items), role).toBe(false)
    }
  })

  it("marks nothing active on an unrelated route", () => {
    expect(nav.some((i) => isActiveNav(i.href, "/login", nav))).toBe(false)
  })
})

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

describe("ROLES", () => {
  it("lists the application roles in privilege order", () => {
    expect(ROLES).toEqual(["supervisor", "manager", "admin", "procurement", "stock", "qc_officer", "qc_manager"])
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
      procurement: "Procurement",
      stock: "Stock Officer",
      qc_officer: "QC Officer",
      qc_manager: "QC Manager",
    })
  })

  it("labels the new split roles distinctly: 'Procurement' (read-only) vs 'Stock Officer' (writes)", () => {
    expect(ROLE_LABELS.procurement).toBe("Procurement")
    expect(ROLE_LABELS.stock).toBe("Stock Officer")
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

  it("gives each role a palette — stock and procurement share one by design", () => {
    // stock and procurement sit at the same rung deliberately: neither outranks the
    // other, they do different jobs. Distinguishing them by weight would imply a
    // privilege ordering that does not exist, and the label already tells them apart.
    const palettes = ROLES.map((r) => ROLE_COLORS[r])
    expect(new Set(palettes).size).toBe(4)
  })
})

describe("roleLabel", () => {
  it("returns the label for each known role", () => {
    expect(ROLES.map(roleLabel)).toEqual([
      "Supervisor",
      "Manager",
      "Administrator",
      "Procurement",
      "Stock Officer",
      "QC Officer",
      "QC Manager",
    ])
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

describe("sideNavFor", () => {
  const OFFICE_ROLES = ["stock", "procurement", "manager", "qc_manager"] as const

  it("gives the four office roles a sidebar and every other role none", () => {
    for (const role of OFFICE_ROLES) expect(sideNavFor(role), role).not.toBeNull()
    for (const role of ROLES.filter((r) => !(OFFICE_ROLES as readonly string[]).includes(r))) expect(sideNavFor(role), role).toBeNull()
    expect(sideNavFor("nonsense")).toBeNull()
  })

  const itemsFor = (role: string) => (sideNavFor(role) ?? []).flatMap((s) => s.items)
  const pageFile = (href: string) => join(process.cwd(), "app", ...href.split("/").filter(Boolean), "page.tsx")

  // Which roles a page admits, read from the guard the page itself calls. Role lists
  // come from the same constants the guards use, so this cannot drift from them.
  function admits(href: string, role: string): boolean {
    const src = readFileSync(pageFile(href), "utf8")
    if (src.includes("requireStockWrite(")) return (STOCK_WRITE_ROLES as string[]).includes(role)
    if (src.includes("requireStockRead(")) return (STOCK_READ_ROLES as string[]).includes(role)
    if (src.includes("requireManager(")) return role === "manager"
    if (src.includes("requireQcAccess(")) return ["qc_officer", "qc_manager", "admin"].includes(role)
    const listed = /requireRole\(\[([^\]]*)\]\)/.exec(src)
    if (listed) return [...listed[1].matchAll(/"([a-z_]+)"/g)].some((m) => m[1] === role)
    const named = [...src.matchAll(/role === "([a-z_]+)"/g)].map((m) => m[1])
    return named.length === 0 || named.includes(role)
  }

  for (const role of OFFICE_ROLES) {
    describe(role, () => {
      const items = itemsFor(role)

      it("lists each destination once", () => {
        expect(new Set(items.map((i) => i.key)).size).toBe(items.length)
        expect(new Set(items.map((i) => i.href)).size).toBe(items.length)
      })

      it("only links to pages that exist and that this role may open", () => {
        for (const { href } of items) {
          expect(existsSync(pageFile(href)), href).toBe(true)
          expect(admits(href, role), `${role} → ${href}`).toBe(true)
        }
      })

      it("covers every bottom tab, so desktop loses nothing", () => {
        const hrefs = new Set(items.map((i) => i.href))
        for (const tab of navFor(role)) {
          const owned = items.some((i) => i.href === tab.href || (i.extraPrefixes ?? []).includes(tab.href))
          expect(hrefs.has(tab.href) || owned, tab.href).toBe(true)
        }
      })
    })
  }

  it("shows herbs to the manager only (herb stock is confidential)", () => {
    for (const role of OFFICE_ROLES) {
      expect(itemsFor(role).some((i) => i.key === "herbs"), role).toBe(canSeeHerbs(role))
    }
    expect(canSeeHerbs("manager")).toBe(true)
    for (const role of ROLES.filter((r) => r !== "manager")) expect(canSeeHerbs(role), role).toBe(false)
  })

  it("shows the procurement report to the procurement department only", () => {
    for (const role of OFFICE_ROLES) {
      expect(itemsFor(role).some((i) => i.key === "procurement-report"), role).toBe(role === "procurement")
    }
  })

  it("names the same herb department as the database and the record registry", () => {
    expect(getRecordType("Herbs Stock")?.departments).toEqual([HERB_DEPARTMENT])
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/0015_herbs_confidential.sql"), "utf8")
    expect(migration).toContain(`p.department = '${HERB_DEPARTMENT}'`)
  })

  it("keeps Receive & issue to the stock role, the only one that may record it", () => {
    for (const role of OFFICE_ROLES) {
      expect(itemsFor(role).some((i) => i.key === "receive"), role).toBe(role === "stock")
    }
  })

  it("lights the most specific item, and Home only on Home", () => {
    const stock = itemsFor("stock")
    expect(activeNavHref("/dashboard", stock)).toBe("/dashboard")
    expect(activeNavHref("/dashboard/stock", stock)).toBe("/dashboard/stock")
    expect(activeNavHref("/dashboard/stock/herbs", itemsFor("manager"))).toBe("/dashboard/stock/herbs")
    expect(activeNavHref("/dashboard/stock/material/alcohol", stock)).toBe("/dashboard/stock")
    expect(activeNavHref("/dashboard/stock/dispatch/new", stock)).toBe("/dashboard/stock/dispatch")
    expect(activeNavHref("/dashboard/qc", stock)).toBeNull()
    const manager = itemsFor("manager")
    expect(activeNavHref("/dashboard/reports/matrix", manager)).toBe("/dashboard/reports/matrix")
    expect(activeNavHref("/dashboard/reports", manager)).toBe("/dashboard/reports")
    const qc = itemsFor("qc_manager")
    expect(activeNavHref("/dashboard/qc/new", qc)).toBe("/dashboard/qc/new")
    expect(activeNavHref("/dashboard/qc/0b6f-uuid", qc)).toBe("/dashboard/qc/history")
  })
})
