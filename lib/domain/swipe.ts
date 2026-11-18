/**
 * The swipe-up-to-enter rule, in one place.
 *
 * Both splashes offer it — the glass one (where the lens follows your finger) and
 * the static fallback (where nothing moves) — and a rule that lives in two files
 * drifts. It is also the kind of thing that can only be judged by feel, so the
 * thresholds are named and tested rather than buried in a pointer handler.
 *
 * Values are the reference intro's: commit once the gesture has travelled 22% of
 * the viewport upward, OR was released as a flick faster than 700 px/s. The flick
 * is what makes a short, decisive swipe work — without it, a fast gesture that
 * covers little distance feels ignored.
 */

/** Fraction of the viewport height a slow drag must cover to commit. */
export const SWIPE_TRAVEL_FRACTION = 0.22

/** Upward pointer speed, px/s, that commits regardless of distance. */
export const SWIPE_FLING_VELOCITY = 700

/**
 * @param travelled  px the pointer moved UP (startY − endY, so up is positive)
 * @param velocity   px/s, negative upward (the pointer's own velocity, not a spring's)
 * @param height     viewport height in px
 */
export function isSwipeUpCommit(travelled: number, velocity: number, height: number): boolean {
  if (!Number.isFinite(travelled) || !Number.isFinite(velocity) || height <= 0) return false
  return travelled > height * SWIPE_TRAVEL_FRACTION || velocity < -SWIPE_FLING_VELOCITY
}

/**
 * Low-pass for pointer velocity. A single jittery sample between two `pointermove`
 * events can read as a flick; smoothing across samples keeps a genuine flick and
 * drops the noise.
 */
export function trackVelocity(previous: number, dy: number, dtSeconds: number): number {
  if (dtSeconds <= 0) return previous
  const sample = dy / dtSeconds
  return previous + (sample - previous) * 0.6
}
