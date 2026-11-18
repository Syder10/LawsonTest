import { ease } from "./spring"
import { toRgb01, type Palette } from "./tokens"

/**
 * The 2D scene the lens refracts: background wash, the Lawson mark, the headline
 * and the gesture hint. Everything the glass distorts is painted here; the only
 * DOM over the canvas is the real "Get started" button, which must stay a focusable
 * element and therefore cannot be refracted.
 *
 * NO COLOUR IS HARDCODED. The painter is handed a Palette read from the token
 * layer (lib/glass/tokens.ts), so the splash follows light/dark automatically and
 * the canvas can never disagree with the rest of the app about what brand green is.
 */

/**
 * Reference geometry was authored on a 402×874 phone, where 0.46 × height equals
 * the width. Sizing everything against `unit` rather than raw width keeps every
 * fraction from the reference intro exactly as tuned on that aspect, while stopping
 * a 1440-wide desktop viewport from scaling the type and the lens to absurd sizes.
 */
export const unit = (w: number, h: number) => Math.min(w, h * 0.46)

/**
 * Shared vertical rhythm, as fractions of the viewport height.
 *
 * There is no CTA slot: the splash has no visible button — a swipe up is the way
 * in — so the hint deliberately sits INSIDE the resting lens and is refracted by it,
 * which is the whole point of painting it on the canvas rather than in the DOM.
 */
export const LAYOUT = {
  logo: 0.34,
  headline: 0.52,
  hint: 0.912,
} as const

/** The mark's centre in CSS px — also the emitter origin for the plume. */
export function logoCenter(w: number, h: number) {
  return { x: w * 0.5, y: h * LAYOUT.logo }
}

/**
 * public/logo.png is 597×521 with an alpha bounding box of rows 18…515 — but rows
 * 500–514 are completely empty and row 515 alone carries 189 stray near-#EDEDED
 * pixels (166 of them above alpha 40). Clipping to the alpha box therefore fixes
 * nothing, because the smudge IS the box's bottom edge. Only a source-rect crop
 * works: drawing 500 of the 521 rows drops the residue plus the empty rows above it.
 */
const LOGO_W = 597
const LOGO_CROP_H = 500

const HEADLINE_A = ["Lawson Limited", "Company"]
const HEADLINE_B = ["Production records,", "shift by shift."]

export type SceneState = {
  /** Logical size in CSS px. */
  w: number
  h: number
  fontFamily: string
  palette: Palette
  /** Decoded logo, or null until it resolves — the scene paints without it. */
  logo: HTMLImageElement | null
  /** 0..1 crossfade between the two headlines. */
  copy: number
  /** 0..1 brand bloom behind the mark, brightening as the plume launches. */
  bloom: number
}

/**
 * Token value → canvas rgba(). Goes through the shared parser rather than a second
 * hex reader here, so a token authored as `rgb()` doesn't silently paint black.
 */
const rgba = (color: string, a: number) => {
  const [r, g, b] = toRgb01(color, [0, 0, 0])
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`
}

export class ScenePainter {
  private weave: CanvasPattern | null = null
  private weaveKey = ""

  paint(ctx: CanvasRenderingContext2D, s: SceneState) {
    const { w, h } = s
    ctx.save()
    ctx.clearRect(0, 0, w, h)

    this.paintBackdrop(ctx, s)
    this.paintMark(ctx, s)

    // Two headlines crossfading through each other, offset so the outgoing line
    // has left before the incoming one arrives — a straight cross-dissolve reads
    // as a glitch at this size.
    const outgoing = 1 - ease(s.copy / 0.55)
    const incoming = ease((s.copy - 0.45) / 0.55)
    if (outgoing > 0.001) {
      this.paintHeadline(ctx, s, HEADLINE_A, LAYOUT.headline, outgoing, -10 * (1 - outgoing))
      this.paintHint(ctx, s, outgoing)
    }
    if (incoming > 0.001) {
      this.paintHeadline(ctx, s, HEADLINE_B, LAYOUT.headline + 0.03, incoming, 14 * (1 - incoming))
    }

    ctx.restore()
  }

  private paintBackdrop(ctx: CanvasRenderingContext2D, s: SceneState) {
    const { w, h, palette: p } = s
    ctx.fillStyle = p.page
    ctx.fillRect(0, 0, w, h)

    // A brand-tinted bloom high on the page, so the surface isn't a flat fill. The
    // lens needs a gradient to bend; a uniform colour refracts into itself and the
    // whole effect disappears.
    const bloom = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, h * 0.85)
    bloom.addColorStop(0, rgba(p.brand, p.dark ? 0.2 : 0.13))
    bloom.addColorStop(0.55, rgba(p.brand, p.dark ? 0.07 : 0.05))
    bloom.addColorStop(1, rgba(p.brand, 0))
    ctx.fillStyle = bloom
    ctx.fillRect(0, 0, w, h)

    // A cooler pool low down, echoing the Bitters series colour, to give the
    // resting lens something with a hue shift across it.
    const pool = ctx.createRadialGradient(w * 0.5, h * 1.02, 0, w * 0.5, h * 1.02, h * 0.6)
    pool.addColorStop(0, rgba(p.bitters, p.dark ? 0.22 : 0.12))
    pool.addColorStop(1, rgba(p.bitters, 0))
    ctx.fillStyle = pool
    ctx.fillRect(0, 0, w, h)

    const key = `${p.dark ? "d" : "l"}:${p.brand}`
    if (key !== this.weaveKey) {
      this.weave = this.buildWeave(ctx, s)
      this.weaveKey = key
    }
    if (this.weave) {
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.fillStyle = this.weave
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
    }
  }

  /** A 3px woven tile. Barely there, but it gives the lens something to bite on. */
  private buildWeave(ctx: CanvasRenderingContext2D, s: SceneState): CanvasPattern | null {
    const tile = document.createElement("canvas")
    tile.width = 3
    tile.height = 3
    const t = tile.getContext("2d")
    if (!t) return null
    t.clearRect(0, 0, 3, 3)
    t.fillStyle = rgba(s.palette.brandSolid, s.palette.dark ? 0.16 : 0.055)
    t.fillRect(0, 0, 1, 1)
    t.fillRect(2, 1, 1, 1)
    t.fillStyle = `rgba(255,255,255,${s.palette.dark ? 0.045 : 0.1})`
    t.fillRect(1, 2, 1, 1)
    return ctx.createPattern(tile, "repeat")
  }

  /**
   * The mark, drawn INTO the scene so the lens refracts it — that is the moment the
   * effect is for. A soft brand halo sits behind it and brightens as the plume
   * launches, which is what makes the bubbles look like they come from the logo
   * rather than from a point in front of it.
   */
  private paintMark(ctx: CanvasRenderingContext2D, s: SceneState) {
    const { w, h, palette: p } = s
    const u = unit(w, h)
    const { x: cx, y: cy } = logoCenter(w, h)
    const halo = u * 0.42
    const glow = ease(s.bloom)

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, halo)
    g.addColorStop(0, rgba(p.brand, (p.dark ? 0.3 : 0.18) + glow * 0.22))
    g.addColorStop(0.6, rgba(p.brand, (p.dark ? 0.1 : 0.06) + glow * 0.08))
    g.addColorStop(1, rgba(p.brand, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, halo, 0, Math.PI * 2)
    ctx.fill()

    if (!s.logo) return

    // Swells very slightly as the plume launches. 6% — enough to feel alive on a
    // logo this size, not enough to read as a bounce.
    const width = Math.min(u * 0.34, h * 0.2) * (1 + glow * 0.06)
    const height = width * (LOGO_CROP_H / LOGO_W)
    ctx.save()
    ctx.globalAlpha = 1
    ctx.drawImage(
      s.logo,
      0, 0, LOGO_W, LOGO_CROP_H,
      cx - width / 2, cy - height / 2, width, height,
    )
    ctx.restore()
  }

  /** ctx.letterSpacing isn't in every lib.dom yet, and Safari ignores it. */
  private setTracking(ctx: CanvasRenderingContext2D, px: number) {
    const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
    if ("letterSpacing" in c) c.letterSpacing = `${px.toFixed(2)}px`
  }

  private paintHeadline(
    ctx: CanvasRenderingContext2D,
    s: SceneState,
    lines: string[],
    centerFrac: number,
    alpha: number,
    dy: number,
  ) {
    const { w, h } = s
    const u = unit(w, h)
    const size = u * 0.0755
    const lh = size * 1.3
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.fillStyle = s.palette.inkPrimary
    ctx.font = `600 ${size.toFixed(2)}px ${s.fontFamily}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    this.setTracking(ctx, -size * 0.013)
    const top = h * centerFrac - ((lines.length - 1) * lh) / 2 + dy
    lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * lh))
    this.setTracking(ctx, 0)
    ctx.restore()
  }

  private paintHint(ctx: CanvasRenderingContext2D, s: SceneState, alpha: number) {
    const { w, h } = s
    const u = unit(w, h)
    ctx.save()
    ctx.globalAlpha = alpha * 0.95
    ctx.fillStyle = s.palette.inkMuted
    ctx.font = `500 ${(u * 0.0295).toFixed(2)}px ${s.fontFamily}`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    this.setTracking(ctx, u * 0.0006)
    // One instruction, true in every mode: the swipe works with reduced motion too
    // (it is an input, not an animation — only the lens is held still).
    ctx.fillText("Swipe up to enter", w / 2, h * LAYOUT.hint)
    this.setTracking(ctx, 0)
    ctx.restore()
  }
}

