/**
 * The splash is painted on a canvas, so it cannot use Tailwind classes or inherit
 * the token layer the rest of the app is built on. This module is the bridge: it
 * reads the RESOLVED values of the semantic custom properties from a real element,
 * so the canvas and the DOM can never disagree about what "brand" means, and a
 * theme flip needs no second palette.
 *
 * Nothing here hardcodes a hex except the fallbacks, which only apply if the
 * stylesheet has not loaded (in which case nothing else on the page is styled
 * either) — they are the light-mode token values from app/globals.css.
 */

export type Palette = {
  page: string
  card: string
  sunken: string
  hairline: string
  inkPrimary: string
  inkSecondary: string
  inkMuted: string
  brand: string
  brandSolid: string
  brandSubtle: string
  brandSubtleInk: string
  bitters: string
  ginger: string
  /** True when the dark token set is active. Some canvas work needs to know. */
  dark: boolean
}

const FALLBACK: Palette = {
  page: "#f4f6f5",
  card: "#ffffff",
  sunken: "#edf1ef",
  hairline: "#e3e9e6",
  inkPrimary: "#0b1512",
  inkSecondary: "#47534e",
  inkMuted: "#6d7a75",
  brand: "#059669",
  brandSolid: "#047857",
  brandSubtle: "#ecfdf5",
  brandSubtleInk: "#065f46",
  bitters: "#0d9488",
  ginger: "#ea580c",
  dark: false,
}

const PROPS: Array<[keyof Palette, string]> = [
  ["page", "--surface-page"],
  ["card", "--surface-card"],
  ["sunken", "--surface-sunken"],
  ["hairline", "--line-hairline"],
  ["inkPrimary", "--ink-primary"],
  ["inkSecondary", "--ink-secondary"],
  ["inkMuted", "--ink-muted"],
  ["brand", "--brand"],
  ["brandSolid", "--brand-solid"],
  ["brandSubtle", "--brand-subtle"],
  ["brandSubtleInk", "--brand-subtle-ink"],
  ["bitters", "--series-bitters"],
  ["ginger", "--series-ginger"],
]

/** Reads the active token values. Call again after the theme class changes. */
export function readPalette(el: Element): Palette {
  if (typeof window === "undefined") return FALLBACK
  const cs = getComputedStyle(el)
  const out = { ...FALLBACK }
  for (const [key, prop] of PROPS) {
    const v = cs.getPropertyValue(prop).trim()
    if (v) (out[key] as string) = v
  }
  out.dark = document.documentElement.classList.contains("dark")
  return out
}

/**
 * Identity of a palette, for the scene's repaint hash. Comparing the object by
 * reference would repaint every frame; comparing field by field at the call site
 * would be repeated in two places.
 */
export function paletteKey(p: Palette): string {
  return `${p.dark ? "d" : "l"}:${p.page}:${p.inkPrimary}:${p.brand}:${p.bitters}:${p.ginger}`
}

/**
 * Parses a token value to RGB triplet in 0..1, for the shader uniforms.
 *
 * Handles the three forms the token layer can produce: #rgb, #rrggbb and
 * rgb()/rgba(). `oklch()` would need a full colour-space conversion, so it falls
 * back rather than guessing — the tokens are authored as hex today, and a wrong
 * colour is worse than a neutral one.
 */
export function toRgb01(color: string, fallback: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const c = color.trim()
  if (c.startsWith("#")) {
    const hex = c.slice(1)
    const full = hex.length === 3 ? hex.split("").map((ch) => ch + ch).join("") : hex
    if (full.length < 6) return fallback
    const n = Number.parseInt(full.slice(0, 6), 16)
    if (Number.isNaN(n)) return fallback
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }
  const m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255]
  return fallback
}
