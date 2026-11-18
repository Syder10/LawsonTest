import { toRgb01, type Palette } from "./tokens"

/**
 * The bubbles that stream out of the mark each hold a small botanical motif —
 * leaf, sprig, berry, star anise, ginger root — drawn procedurally into a canvas
 * atlas. This replaces the reference intro's `icons.ts`, which held emoji app
 * icons: emoji render differently on every platform (and not at all on some
 * Android builds), and app tiles say nothing about a beverage maker.
 *
 * Everything is painted from the token palette, so the plume follows the theme and
 * the atlas can be rebuilt on a theme flip. No binary assets.
 */

export const ATLAS_COLS = 3
const CELL = 128
/** 3×3 grid, all cells used. Keep in step with MOTIFS below. */
export const MOTIF_COUNT = 9

type Draw = (ctx: CanvasRenderingContext2D, ink: string) => void

const rgba = (color: string, a: number) => {
  const [r, g, b] = toRgb01(color)
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`
}

/** Each motif is drawn in a 0..1 box; the atlas scales it into its cell. */
const MOTIFS: Array<{ from: keyof Palette; to: keyof Palette; draw: Draw }> = [
  { from: "bitters", to: "brandSolid", draw: leaf },
  { from: "brand", to: "bitters", draw: sprig },
  { from: "ginger", to: "bitters", draw: berries },
  { from: "bitters", to: "brand", draw: starAnise },
  { from: "ginger", to: "brandSolid", draw: gingerRoot },
  { from: "brandSolid", to: "bitters", draw: peppercorn },
  { from: "bitters", to: "ginger", draw: bottle },
  { from: "brand", to: "brandSolid", draw: droplet },
  { from: "ginger", to: "brand", draw: seedPod },
]

function leaf(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.moveTo(0.5, 0.1)
  ctx.bezierCurveTo(0.88, 0.34, 0.84, 0.78, 0.5, 0.92)
  ctx.bezierCurveTo(0.16, 0.78, 0.12, 0.34, 0.5, 0.1)
  ctx.fill()
  // Midrib cut back out, so the leaf reads as a leaf when the sphere magnifies it.
  ctx.globalCompositeOperation = "destination-out"
  ctx.lineWidth = 0.035
  ctx.beginPath()
  ctx.moveTo(0.5, 0.16)
  ctx.lineTo(0.5, 0.88)
  ctx.stroke()
  for (let i = 0; i < 3; i++) {
    const y = 0.34 + i * 0.17
    ctx.lineWidth = 0.022
    ctx.beginPath()
    ctx.moveTo(0.5, y)
    ctx.lineTo(0.5 + 0.2, y + 0.1)
    ctx.moveTo(0.5, y)
    ctx.lineTo(0.5 - 0.2, y + 0.1)
    ctx.stroke()
  }
  ctx.globalCompositeOperation = "source-over"
}

function sprig(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineCap = "round"
  ctx.lineWidth = 0.045
  ctx.beginPath()
  ctx.moveTo(0.5, 0.92)
  ctx.quadraticCurveTo(0.46, 0.5, 0.52, 0.12)
  ctx.stroke()
  for (let i = 0; i < 4; i++) {
    const t = 0.24 + i * 0.18
    const side = i % 2 === 0 ? 1 : -1
    const r = 0.14 - i * 0.015
    ctx.save()
    ctx.translate(0.49 + side * 0.02, t)
    ctx.rotate(side * 0.7)
    ctx.beginPath()
    ctx.ellipse(side * r, 0, r, r * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function berries(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.fillStyle = ink
  for (const [x, y, r] of [[0.36, 0.62, 0.19], [0.64, 0.6, 0.17], [0.5, 0.34, 0.15]] as const) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = ink
  ctx.lineWidth = 0.035
  ctx.beginPath()
  ctx.moveTo(0.5, 0.2)
  ctx.lineTo(0.5, 0.1)
  ctx.stroke()
}

function starAnise(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.fillStyle = ink
  ctx.save()
  ctx.translate(0.5, 0.5)
  for (let i = 0; i < 6; i++) {
    ctx.save()
    ctx.rotate((i / 6) * Math.PI * 2)
    ctx.beginPath()
    ctx.moveTo(0, 0.06)
    ctx.quadraticCurveTo(0.1, 0.24, 0, 0.42)
    ctx.quadraticCurveTo(-0.1, 0.24, 0, 0.06)
    ctx.fill()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 0.075, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function gingerRoot(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.fillStyle = ink
  for (const [x, y, rx, ry, rot] of [
    [0.42, 0.58, 0.24, 0.15, -0.5],
    [0.62, 0.44, 0.17, 0.11, 0.4],
    [0.34, 0.34, 0.12, 0.08, 0.9],
  ] as const) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function peppercorn(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.arc(0.5, 0.5, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = "destination-out"
  for (const [x, y, r] of [[0.42, 0.42, 0.06], [0.58, 0.52, 0.05], [0.47, 0.62, 0.04]] as const) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = "source-over"
}

function bottle(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.roundRect(0.44, 0.1, 0.12, 0.16, 0.03)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0.44, 0.24)
  ctx.quadraticCurveTo(0.3, 0.36, 0.3, 0.52)
  ctx.lineTo(0.3, 0.84)
  ctx.quadraticCurveTo(0.3, 0.9, 0.36, 0.9)
  ctx.lineTo(0.64, 0.9)
  ctx.quadraticCurveTo(0.7, 0.9, 0.7, 0.84)
  ctx.lineTo(0.7, 0.52)
  ctx.quadraticCurveTo(0.7, 0.36, 0.56, 0.24)
  ctx.fill()
  ctx.globalCompositeOperation = "destination-out"
  ctx.beginPath()
  ctx.roundRect(0.36, 0.58, 0.28, 0.18, 0.02)
  ctx.fill()
  ctx.globalCompositeOperation = "source-over"
}

function droplet(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.moveTo(0.5, 0.14)
  ctx.bezierCurveTo(0.78, 0.44, 0.8, 0.7, 0.5, 0.86)
  ctx.bezierCurveTo(0.2, 0.7, 0.22, 0.44, 0.5, 0.14)
  ctx.fill()
}

function seedPod(ctx: CanvasRenderingContext2D, ink: string) {
  ctx.strokeStyle = ink
  ctx.fillStyle = ink
  ctx.lineWidth = 0.05
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.moveTo(0.24, 0.36)
  ctx.quadraticCurveTo(0.5, 0.94, 0.76, 0.36)
  ctx.stroke()
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(0.34 + i * 0.16, 0.5 + (i === 1 ? 0.08 : 0), 0.075, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Builds the atlas for a palette. Each cell is a saturated two-stop tile with an
 * off-axis bloom (a flat ramp looks like a flat ramp once the sphere magnifies it)
 * and the motif knocked into it in a near-white or near-black ink, whichever the
 * theme needs.
 */
export function buildMotifAtlas(palette: Palette): HTMLCanvasElement {
  const size = ATLAS_COLS * CELL
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas

  // Black, not transparent: the bubble shader samples RGB only, and an unset
  // texel would otherwise read as whatever the previous upload left behind.
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, size, size)

  MOTIFS.forEach((motif, i) => {
    const ox = (i % ATLAS_COLS) * CELL
    const oy = Math.floor(i / ATLAS_COLS) * CELL

    const grad = ctx.createLinearGradient(ox, oy, ox + CELL, oy + CELL)
    grad.addColorStop(0, rgba(palette[motif.from] as string, 1))
    grad.addColorStop(1, rgba(palette[motif.to] as string, 1))
    ctx.fillStyle = grad
    ctx.fillRect(ox, oy, CELL, CELL)

    const bloom = ctx.createRadialGradient(
      ox + CELL * 0.3, oy + CELL * 0.25, 0,
      ox + CELL * 0.3, oy + CELL * 0.25, CELL * 0.8,
    )
    bloom.addColorStop(0, "rgba(255,255,255,0.42)")
    bloom.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = bloom
    ctx.fillRect(ox, oy, CELL, CELL)

    ctx.save()
    // Clip so a motif that overshoots its box cannot bleed into its neighbour —
    // the shader's spectral taps read past the cell edge and would smear it.
    ctx.beginPath()
    ctx.rect(ox, oy, CELL, CELL)
    ctx.clip()
    ctx.translate(ox + CELL * 0.12, oy + CELL * 0.12)
    ctx.scale(CELL * 0.76, CELL * 0.76)
    motif.draw(ctx, palette.dark ? "rgba(240,253,247,0.94)" : "rgba(6,26,20,0.86)")
    ctx.restore()
  })

  return canvas
}
