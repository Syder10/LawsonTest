import { MOTIF_COUNT } from "./motifs"
import { clamp, mix } from "./spring"

type Bubble = {
  x: number
  y: number
  vx: number
  vy: number
  r0: number
  r: number
  motif: number
  seed: number
  motifMix: number
  age: number
  wobbleAmp: number
  wobbleFreq: number
  wobblePhase: number
  alpha: number
}

const MAX_BUBBLES = 220
const FLOATS_PER_BUBBLE = 7 // x, y, r, motif, alpha, seed, motifMix

/**
 * Bubbles stream up out of the logo: buoyant, wobbling sideways, swelling a little
 * as they rise, and thinning out near the top of the screen. Roughly a third are
 * bare droplets with no motif, which is what keeps the plume from reading as a
 * uniform grid of tiles.
 *
 * Ported from the reference intro. Two changes: the emitter origin is set by the
 * caller (it must sit at the painted logo's centre, which the scene owns), and the
 * size scale is driven by the shared `unit` rather than raw height, so a wide
 * desktop viewport doesn't spawn bubbles the size of a fist.
 */
export class BubbleField {
  private bubbles: Bubble[] = []
  private pending = 0
  private buffer = new Float32Array(MAX_BUBBLES * FLOATS_PER_BUBBLE)
  count = 0

  /** Emitter origin, in CSS px. Set from the scene's logo centre. */
  originX = 0
  originY = 0

  private w = 0
  private h = 0
  /** Reference geometry unit; 402 on the aspect the motion was tuned against. */
  private unit = 402

  resize(w: number, h: number, unit: number, originX: number, originY: number) {
    this.w = w
    this.h = h
    this.unit = Math.max(1, unit)
    this.originX = originX
    this.originY = originY
  }

  clear() {
    this.bubbles.length = 0
    this.pending = 0
    this.count = 0
  }

  /**
   * @param elapsed seconds since the plume started, used to taper the initial burst
   */
  update(dt: number, elapsed: number, emitting: boolean) {
    if (this.h === 0) return

    if (emitting) {
      const burst = 74 * Math.exp(-elapsed / 0.55)
      const steady = 11
      this.pending += (burst + steady) * dt
      while (this.pending >= 1 && this.bubbles.length < MAX_BUBBLES) {
        this.pending -= 1
        this.bubbles.push(this.spawn())
      }
      if (this.bubbles.length >= MAX_BUBBLES) this.pending = 0
    }

    const scale = this.unit / 402

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]
      b.age += dt

      // Buoyancy, plus a touch of drag so the small ones don't outrun everything.
      b.vy -= 66 * scale * dt
      b.vy *= 1 - 0.35 * dt
      b.y += b.vy * dt

      b.wobblePhase += b.wobbleFreq * dt
      b.x += (b.vx + Math.cos(b.wobblePhase) * b.wobbleAmp) * dt

      const rise = clamp((this.originY - b.y) / (this.originY + 1), 0, 1)
      b.r = b.r0 * (1 + 0.28 * rise)

      const fadeIn = clamp(b.age / 0.18, 0, 1)
      const fadeOut = clamp(b.y / (this.h * 0.1), 0, 1)
      b.alpha = fadeIn * fadeOut

      if (b.y < -b.r * 1.5 || b.x < -b.r * 3 || b.x > this.w + b.r * 3) {
        this.bubbles.splice(i, 1)
      }
    }

    // Far bubbles first so the near ones composite on top.
    this.bubbles.sort((a, b) => a.r - b.r)
  }

  private spawn(): Bubble {
    const scale = this.unit / 402
    const speck = Math.random() < 0.34
    const r0 = speck
      ? mix(1.8, 5.0, Math.random()) * scale
      : mix(9, 34, Math.pow(Math.random(), 0.75)) * scale

    const spread = mix(-1, 1, Math.random())

    return {
      x: this.originX + spread * 10 * scale,
      y: this.originY - mix(0, 6, Math.random()) * scale,
      vx: spread * mix(6, 30, Math.random()) * scale,
      vy: -mix(95, 215, Math.random()) * scale,
      r0,
      r: r0,
      motif: Math.floor(Math.random() * MOTIF_COUNT),
      seed: Math.random() * 10,
      motifMix: speck ? 0 : 1,
      age: 0,
      wobbleAmp: mix(8, 34, Math.random()) * scale,
      wobbleFreq: mix(0.8, 2.1, Math.random()),
      wobblePhase: Math.random() * Math.PI * 2,
      alpha: 0,
    }
  }

  /**
   * Packs into instance attributes. Y is flipped into GL space here so the shader
   * never has to think about it.
   */
  pack(dpr: number, heightPx: number): Float32Array {
    let n = 0
    for (const b of this.bubbles) {
      if (b.alpha <= 0.002) continue
      const o = n * FLOATS_PER_BUBBLE
      this.buffer[o] = b.x * dpr
      this.buffer[o + 1] = heightPx - b.y * dpr
      this.buffer[o + 2] = b.r * dpr
      this.buffer[o + 3] = b.motif
      this.buffer[o + 4] = b.alpha
      this.buffer[o + 5] = b.seed
      this.buffer[o + 6] = b.motifMix
      n++
    }
    this.count = n
    return this.buffer
  }

  get length() {
    return this.bubbles.length
  }
}

export { FLOATS_PER_BUBBLE, MAX_BUBBLES }
