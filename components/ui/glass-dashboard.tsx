"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import type { LucideIcon } from "lucide-react"
import { Bell, Layers, Settings2, X } from "lucide-react"
import "./glass-dashboard.css"

// ============================================================================
// Glass dashboard shell.
//
// The chrome of the "adjustable glass dashboard" design — frosted backdrop, top
// bar, side rail + bottom dock navigation, the "Adjust glass" appearance panel
// and a notifications flyout — as a reusable shell that takes its CONTENT as
// children. The original component was a personal-finance workspace with the
// data model (balance, transactions, savings goals) baked in; this keeps only
// the material and layout so a screen can bring its own figures, charts and
// business rules unchanged.
//
// Theme: always the host's. Colours come from the semantic tokens in
// app/globals.css (see glass-dashboard.css), so `.dark` on <html> is honoured
// and the shell never owns a theme switch of its own — the layout already has
// one.
//
// Glass settings are a per-viewer convenience, so they live in localStorage
// under `storageKey`; every read and write is wrapped because storage can be
// unavailable (private mode, cleared site data) and the shell must still render.
// ============================================================================

export type GlassSettings = {
  /** Backdrop blur radius, px (0–40). */
  blur: number
  /** Surface opacity (0.08–0.9). */
  opacity: number
  /** Backdrop saturation (0.5–2). */
  saturation: number
  /** Tint mixed into the surface, #rrggbb. */
  tint: string
  /** Edge-light strength (0–1). */
  edge: number
}

export const GLASS_DEFAULTS: GlassSettings = {
  blur: 22,
  opacity: 0.3,
  saturation: 1.2,
  tint: "#ffffff",
  edge: 0.6,
}

export const GLASS_PRESETS: { name: string; value: Partial<GlassSettings> }[] = [
  { name: "Clear", value: { blur: 8, opacity: 0.12, saturation: 1.1, edge: 0.8 } },
  { name: "Frosted", value: GLASS_DEFAULTS },
  { name: "Solid", value: { blur: 32, opacity: 0.86, saturation: 1, edge: 0.35 } },
]

const bounded = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

/** Clamp every setting into its legal range; anything malformed falls back to the default. */
export function normalizeGlass(v: Partial<GlassSettings> | null | undefined): GlassSettings {
  const s = v ?? {}
  return {
    blur: bounded(s.blur, 0, 40, GLASS_DEFAULTS.blur),
    opacity: bounded(s.opacity, 0.08, 0.9, GLASS_DEFAULTS.opacity),
    saturation: bounded(s.saturation, 0.5, 2, GLASS_DEFAULTS.saturation),
    edge: bounded(s.edge, 0, 1, GLASS_DEFAULTS.edge),
    tint: typeof s.tint === "string" && /^#[0-9a-f]{6}$/i.test(s.tint) ? s.tint : GLASS_DEFAULTS.tint,
  }
}

function readStoredGlass(key: string): Partial<GlassSettings> | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as Partial<GlassSettings>) : null
  } catch {
    return null
  }
}

function writeStoredGlass(key: string, value: GlassSettings | null) {
  try {
    if (value) window.localStorage.setItem(key, JSON.stringify(value))
    else window.localStorage.removeItem(key)
  } catch {
    /* storage unavailable — the setting simply does not persist */
  }
}

export type GlassTab<Id extends string = string> = {
  id: Id
  label: string
  icon: LucideIcon
}

export interface GlassWorkspaceProps<Id extends string> {
  /** Brand name in the top bar. */
  brand: string
  /** Small note beside the brand (hidden on narrow screens). */
  brandNote?: string
  /** Shown as an avatar initial; also used by the caller for a greeting. */
  userName?: string | null
  /** Optional photo behind the glass. Defaults to a token-driven gradient. */
  backgroundImage?: string
  tabs: readonly GlassTab<Id>[]
  view: Id
  onViewChange: (view: Id) => void
  /** Muted line above the title. */
  greeting?: ReactNode
  title: ReactNode
  /** Right-hand side of the heading — buttons, a period label. */
  headingAction?: ReactNode
  /**
   * Notifications flyout. `count` drives the dot on the bell; `content` is what
   * opens. Omit to hide the bell.
   */
  alerts?: { count: number; content: ReactNode }
  footerNote?: ReactNode
  /** localStorage key for the glass settings. Omit to keep them in memory only. */
  storageKey?: string
  /** Starting material, before any stored setting. */
  glass?: Partial<GlassSettings>
  children: ReactNode
  className?: string
}

export function GlassWorkspace<Id extends string>({
  brand,
  brandNote,
  userName,
  backgroundImage,
  tabs,
  view,
  onViewChange,
  greeting,
  title,
  headingAction,
  alerts,
  footerNote,
  storageKey,
  glass,
  children,
  className = "",
}: GlassWorkspaceProps<Id>) {
  const root = useRef<HTMLDivElement>(null)
  const settingsTrigger = useRef<HTMLButtonElement>(null)
  const bellTrigger = useRef<HTMLButtonElement>(null)
  const initialGlass = useRef(normalizeGlass(glass))
  const id = useId().replace(/:/g, "")

  const [material, setMaterial] = useState<GlassSettings>(() => initialGlass.current)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [backgroundFailed, setBackgroundFailed] = useState(false)

  // Stored settings are read after mount: the server cannot see localStorage, and
  // reading it in the initialiser would make the first client render disagree
  // with the server markup.
  useEffect(() => {
    if (!storageKey) return
    const stored = readStoredGlass(storageKey)
    if (stored) setMaterial(normalizeGlass({ ...initialGlass.current, ...stored }))
  }, [storageKey])

  useEffect(() => setBackgroundFailed(false), [backgroundImage])

  useEffect(() => {
    if (settingsOpen) root.current?.querySelector<HTMLButtonElement>(".gw-material button")?.focus()
  }, [settingsOpen])

  function updateGlass(patch: Partial<GlassSettings>) {
    const next = normalizeGlass({ ...material, ...patch })
    setMaterial(next)
    if (storageKey) writeStoredGlass(storageKey, next)
  }
  function resetGlass() {
    setMaterial(initialGlass.current)
    if (storageKey) writeStoredGlass(storageKey, null)
  }
  function closeSettings() {
    setSettingsOpen(false)
    settingsTrigger.current?.focus()
  }
  function closeAlerts() {
    setAlertsOpen(false)
    bellTrigger.current?.focus()
  }
  function changeView(next: Id) {
    onViewChange(next)
    setAlertsOpen(false)
  }

  function onRootKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return
    if (settingsOpen) closeSettings()
    if (alertsOpen) closeAlerts()
  }

  const presetActive = (value: Partial<GlassSettings>) =>
    (["blur", "opacity", "saturation", "edge"] as const).every(
      (k) => value[k] === undefined || Math.abs(material[k] - value[k]!) < 1e-9,
    )

  const nav = (compact: boolean) => (
    <nav className={compact ? "gw-rail gw-glass" : "gw-dock gw-glass"} aria-label={compact ? "Quick navigation" : "Dashboard views"}>
      {tabs.map((tab, i) => {
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            aria-label={compact ? tab.label : undefined}
            title={compact ? tab.label : undefined}
            aria-current={view === tab.id ? "page" : undefined}
            onClick={() => changeView(tab.id)}
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return
              e.preventDefault()
              const n = tabs.length
              const next =
                e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : n - 1)) % n
              changeView(tabs[next].id)
              ;(e.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus()
            }}
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )

  const sliders: { key: keyof Omit<GlassSettings, "tint">; label: string; min: number; max: number; step: number; shown: string }[] = [
    { key: "blur", label: "Blur", min: 0, max: 40, step: 1, shown: `${Math.round(material.blur)} px` },
    { key: "opacity", label: "Opacity", min: 0.08, max: 0.9, step: 0.01, shown: `${Math.round(material.opacity * 100)}%` },
    { key: "saturation", label: "Saturation", min: 0.5, max: 2, step: 0.05, shown: `${Math.round(material.saturation * 100)}%` },
    { key: "edge", label: "Edge light", min: 0, max: 1, step: 0.05, shown: `${Math.round(material.edge * 100)}%` },
  ]

  return (
    <div
      ref={root}
      className={`gw-root ${className}`}
      style={
        {
          "--gw-blur": `${material.blur}px`,
          "--gw-opacity": material.opacity,
          "--gw-saturation": material.saturation,
          "--gw-edge": material.edge,
          "--gw-tint": `color-mix(in srgb, var(--surface-page) 80%, ${material.tint})`,
        } as CSSProperties
      }
      onKeyDown={onRootKeyDown}
    >
      {backgroundImage && !backgroundFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- decorative, arbitrary origin, no layout shift to protect
        <img className="gw-room-image" src={backgroundImage} alt="" onError={() => setBackgroundFailed(true)} />
      ) : (
        <div className="gw-room" aria-hidden="true" />
      )}
      <div className="gw-room-shade" aria-hidden="true" />

      <div className="gw-workspace">
        <header className="gw-topbar gw-glass">
          <div className="gw-brand">
            <span className="gw-brand-icon">
              <Layers size={18} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <strong>{brand}</strong>
            {brandNote && (
              <>
                <span className="gw-brand-divider" aria-hidden="true" />
                <span className="gw-personal">{brandNote}</span>
              </>
            )}
          </div>
          <div className="gw-toolbar">
            <button
              type="button"
              className="gw-adjust"
              ref={settingsTrigger}
              aria-label="Adjust glass appearance"
              aria-expanded={settingsOpen}
              aria-controls={`${id}-material`}
              onClick={() => {
                setSettingsOpen((open) => !open)
                setAlertsOpen(false)
              }}
            >
              <Settings2 size={17} aria-hidden="true" />
              <span>Adjust glass</span>
            </button>
            {alerts && (
              <button
                type="button"
                className="gw-icon-button gw-bell"
                ref={bellTrigger}
                aria-label={alerts.count > 0 ? `Notifications, ${alerts.count} new` : "Notifications"}
                aria-expanded={alertsOpen}
                aria-controls={`${id}-alerts`}
                onClick={() => {
                  setAlertsOpen((open) => !open)
                  setSettingsOpen(false)
                }}
              >
                <Bell size={18} aria-hidden="true" />
                {alerts.count > 0 && <i aria-hidden="true" />}
              </button>
            )}
            {userName && (
              <span className="gw-avatar" title={userName} aria-hidden="true">
                {userName.trim().slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        </header>

        <div className="gw-stage">
          {nav(true)}
          <main className="gw-main gw-glass">
            <div className="gw-view-heading">
              <div>
                {greeting && <p className="gw-greeting">{greeting}</p>}
                <h1>{title}</h1>
              </div>
              {headingAction && <div className="gw-heading-action">{headingAction}</div>}
            </div>

            <div className="gw-mobile-nav">{nav(false)}</div>

            {children}

            {footerNote && (
              <footer className="gw-footer">
                <span>
                  <i aria-hidden="true" />
                  {footerNote}
                </span>
              </footer>
            )}

            <div className="gw-desktop-dock">{nav(false)}</div>
          </main>
        </div>

        {alerts && alertsOpen && (
          <aside className="gw-notifications gw-glass" id={`${id}-alerts`} aria-label="Notifications">
            <div>
              <h2>{alerts.count > 0 ? `${alerts.count} ${alerts.count === 1 ? "item needs" : "items need"} attention` : "You're all caught up."}</h2>
              <button type="button" className="gw-icon-button" aria-label="Close notifications" onClick={closeAlerts}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            {alerts.content}
          </aside>
        )}

        {settingsOpen && (
          <aside className="gw-material gw-glass" id={`${id}-material`} aria-label="Glass appearance">
            <div className="gw-material-title">
              <div>
                <Settings2 size={18} aria-hidden="true" />
                <h2>Glass appearance</h2>
              </div>
              <button type="button" className="gw-icon-button" aria-label="Close glass settings" onClick={closeSettings}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p>Adjust the material across this dashboard. Saved on this device only.</p>
            <div className="gw-material-sample" aria-hidden="true">
              <Layers size={28} strokeWidth={1.1} />
              <span>Live material preview</span>
            </div>
            <div className="gw-presets" role="group" aria-label="Glass presets">
              {GLASS_PRESETS.map((p) => (
                <button key={p.name} type="button" aria-pressed={presetActive(p.value)} onClick={() => updateGlass(p.value)}>
                  {p.name}
                </button>
              ))}
            </div>
            {sliders.map((c) => (
              <label className="gw-range" key={c.key}>
                <span>
                  {c.label}
                  <output>{c.shown}</output>
                </span>
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={material[c.key]}
                  onChange={(e) => updateGlass({ [c.key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label className="gw-tint">
              Glass tint
              <input type="color" value={material.tint} onChange={(e) => updateGlass({ tint: e.target.value })} />
            </label>
            <button className="gw-reset" type="button" onClick={resetGlass}>
              Reset appearance
            </button>
          </aside>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Panels
// ----------------------------------------------------------------------------

type PanelAccent = "brand" | "critical" | "bitters" | "ginger"

/**
 * A translucent panel inside the workspace. `title` renders an h2; `label`
 * renders a muted caption instead (for a figure tile). `accent` draws a rule at
 * the left edge — the figure itself is never coloured.
 */
export function GlassPanel({
  title,
  label,
  icon,
  actions,
  accent,
  className = "",
  as: Tag = "section",
  children,
}: {
  title?: ReactNode
  label?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  accent?: PanelAccent
  className?: string
  as?: "section" | "div" | "article"
  children: ReactNode
}) {
  const hasHead = title !== undefined || label !== undefined || icon !== undefined || actions !== undefined
  return (
    <Tag className={`gw-panel ${accent ? "gw-stat" : ""} ${className}`.trim()} data-accent={accent}>
      {hasHead && (
        <div className="gw-panel-title">
          {title !== undefined ? <h2>{title}</h2> : <span>{label}</span>}
          {(actions || icon) && <div className="gw-panel-aside">{actions ?? icon}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}
