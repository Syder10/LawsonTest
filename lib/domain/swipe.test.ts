import { describe, expect, it } from "vitest"
import {
  SWIPE_FLING_VELOCITY,
  SWIPE_TRAVEL_FRACTION,
  isSwipeUpCommit,
  trackVelocity,
} from "@/lib/domain/swipe"

// The splash's swipe is the one gesture in the app, and the first thing a user
// does. It can only be judged by feel — but the RULE can be pinned down, and it was
// wrong once already: the gesture used to require grabbing a lens that rests below
// the fold, so an ordinary upward swipe from mid-screen did nothing at all.

describe("isSwipeUpCommit", () => {
  const H = 800

  it("commits on a slow drag past the travel threshold", () => {
    expect(isSwipeUpCommit(H * SWIPE_TRAVEL_FRACTION + 1, 0, H)).toBe(true)
  })

  it("does not commit just short of the threshold", () => {
    expect(isSwipeUpCommit(H * SWIPE_TRAVEL_FRACTION - 1, 0, H)).toBe(false)
  })

  it("commits on a short, fast flick", () => {
    // The case a distance-only rule gets wrong: decisive but small.
    expect(isSwipeUpCommit(30, -(SWIPE_FLING_VELOCITY + 50), H)).toBe(true)
  })

  it("ignores a fast DOWNWARD flick", () => {
    expect(isSwipeUpCommit(-200, SWIPE_FLING_VELOCITY + 500, H)).toBe(false)
  })

  it("ignores a tap: no travel, no velocity", () => {
    expect(isSwipeUpCommit(0, 0, H)).toBe(false)
  })

  it("scales with the viewport, so a short screen isn't harder to swipe", () => {
    const travelled = 400 * SWIPE_TRAVEL_FRACTION + 1
    expect(isSwipeUpCommit(travelled, 0, 400)).toBe(true)
    expect(isSwipeUpCommit(travelled, 0, 1200)).toBe(false)
  })

  it("refuses to commit on a degenerate viewport or non-finite input", () => {
    expect(isSwipeUpCommit(500, 0, 0)).toBe(false)
    expect(isSwipeUpCommit(Number.NaN, 0, 800)).toBe(false)
    expect(isSwipeUpCommit(500, Number.NaN, 800)).toBe(false)
  })
})

describe("trackVelocity", () => {
  it("moves toward the newest sample without jumping to it", () => {
    const v = trackVelocity(0, -100, 0.1) // sample = -1000 px/s
    expect(v).toBeLessThan(0)
    expect(v).toBeGreaterThan(-1000)
  })

  it("converges on a sustained speed", () => {
    let v = 0
    for (let i = 0; i < 20; i++) v = trackVelocity(v, -16, 0.016)
    expect(v).toBeCloseTo(-1000, 0)
  })

  it("keeps the previous value for a zero or negative interval", () => {
    expect(trackVelocity(-450, -20, 0)).toBe(-450)
    expect(trackVelocity(-450, -20, -0.01)).toBe(-450)
  })

  it("does not let one jittery sample read as a flick on its own", () => {
    // A single 8px hop in 4ms is 2000 px/s; smoothed it must stay under the fling
    // threshold, so noise alone cannot navigate the user away.
    expect(trackVelocity(0, -8, 0.004)).toBeGreaterThan(-SWIPE_FLING_VELOCITY * 2)
  })
})
