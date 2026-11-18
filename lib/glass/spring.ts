/**
 * Interruptible spring. Sub-stepped at a fixed 1/240s so a dropped frame or a
 * background tab can't blow it up, and so grabbing mid-flight keeps the existing
 * velocity instead of restarting the animation.
 *
 * Ported unchanged from the reference intro at ~/Desktop/wabi-intro. The stiffness
 * and damping pairs the splash uses (210/26 for position, 150/21 for the grab) are
 * the reference's tuned values and are set by the caller, not here.
 */
export class Spring {
  value: number
  velocity = 0
  target: number

  constructor(
    value: number,
    private stiffness = 170,
    private damping = 24,
  ) {
    this.value = value
    this.target = value
  }

  set(value: number) {
    this.value = value
    this.target = value
    this.velocity = 0
  }

  step(dt: number) {
    const h = 1 / 240
    let remaining = Math.min(dt, 0.1)
    while (remaining > 0) {
      const step = Math.min(h, remaining)
      const accel = -this.stiffness * (this.value - this.target) - this.damping * this.velocity
      this.velocity += accel * step
      this.value += this.velocity * step
      remaining -= step
    }
  }

  get settled() {
    return Math.abs(this.value - this.target) < 1e-3 && Math.abs(this.velocity) < 1e-3
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Smooth 0..1 ramp, used for the crossfades that aren't spring-driven. */
export const ease = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}
