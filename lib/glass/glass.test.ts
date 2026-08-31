import { describe, expect, it } from "vitest"
import { BubbleField, MAX_BUBBLES } from "@/lib/glass/bubbles"
import { LAYOUT, unit } from "@/lib/glass/scene"
import {
  BLIT_FRAG, BUBBLE_FRAG, BUBBLE_VERT, LENS_FRAG, QUAD_VERT,
} from "@/lib/glass/shaders"
import { Spring, clamp, ease, mix } from "@/lib/glass/spring"
import { paletteKey, readPalette, toRgb01 } from "@/lib/glass/tokens"

// The splash is a canvas + WebGL2 effect, so most of it can only be judged by
// looking at it. These tests cover the parts that are pure arithmetic — the
// geometry rule, the palette parsing, the spring integrator and the bubble field —
// which is also where a silent mistake would be hardest to SEE: a wrong emitter
// origin or a mis-flipped y just looks like a slightly different animation.

describe("shader sources", () => {
  // These cannot be compiled here — there is no GL context and no glslangValidator
  // available — so what is checked is the structure that fails at RUNTIME with a
  // blank canvas and nothing in the console worth reading: a stray leading newline
  // before #version, and vertex outputs that don't line up with fragment inputs.
  const ALL = { QUAD_VERT, BLIT_FRAG, LENS_FRAG, BUBBLE_VERT, BUBBLE_FRAG }

  it("starts every source with the version directive on line one", () => {
    for (const [name, src] of Object.entries(ALL)) {
      expect(src.startsWith("#version 300 es"), `${name} must not be preceded by whitespace`).toBe(true)
    }
  })

  it("declares a precision qualifier in every fragment shader", () => {
    for (const [name, src] of Object.entries({ BLIT_FRAG, LENS_FRAG, BUBBLE_FRAG })) {
      expect(src, name).toContain("precision highp float;")
    }
  })

  const declarations = (src: string, keyword: "in" | "out") =>
    [...src.matchAll(new RegExp(`^\\s*${keyword}\\s+(\\w+)\\s+(\\w+);`, "gm"))]
      .map((m) => `${m[1]} ${m[2]}`)
      .sort()

  it("matches the bubble vertex outputs to the fragment inputs", () => {
    // A name or type mismatch here links "successfully" on some drivers and renders
    // nothing on others, which is the worst kind of failure to chase.
    expect(declarations(BUBBLE_FRAG, "in")).toEqual(declarations(BUBBLE_VERT, "out"))
  })

  it("matches the fullscreen vertex output to both fullscreen fragment inputs", () => {
    expect(declarations(BLIT_FRAG, "in")).toEqual(declarations(QUAD_VERT, "out"))
    expect(declarations(LENS_FRAG, "in")).toEqual(declarations(QUAD_VERT, "out"))
  })

  it("keeps the instanced attribute locations the VAO binds", () => {
    expect(BUBBLE_VERT).toContain("layout(location = 0) in vec2 aQuad")
    expect(BUBBLE_VERT).toContain("layout(location = 1) in vec4 aBubble")
    expect(BUBBLE_VERT).toContain("layout(location = 2) in vec3 aMeta")
  })

  it("declares every uniform the renderer sets", () => {
    for (const u of ["uScene", "uRes", "uPuck", "uFlat", "uThickness", "uDisperse", "uCaustic", "uPresence", "uTime"]) {
      expect(LENS_FRAG, u).toContain(`uniform`)
      expect(LENS_FRAG.includes(u), `LENS_FRAG declares ${u}`).toBe(true)
    }
    // uDroplet is the one edit to the ported shaders: the bare-droplet colour became
    // a uniform so droplets follow the theme instead of staying a fixed cream.
    for (const u of ["uAtlas", "uAtlasCols", "uTime", "uRes", "uDroplet"]) {
      expect(BUBBLE_FRAG.includes(u) || BUBBLE_VERT.includes(u), `bubble program declares ${u}`).toBe(true)
    }
    expect(BUBBLE_FRAG).toContain("uniform vec3  uDroplet;")
  })

  it("keeps the reference's tap counts and superellipse range", () => {
    // The tuned motion values from the reference: 14 spectral taps in the lens, 8 in
    // the bubbles, and a profile exponent sweeping 2.8 → 9.0.
    expect(LENS_FRAG).toContain("TAPS = 14")
    expect(BUBBLE_FRAG).toContain("TAPS = 8")
    expect(LENS_FRAG).toContain("mix(2.8, 9.0, uFlat)")
  })
})

describe("unit", () => {
  // 402×874 is the aspect the reference motion was tuned on, where 0.46h == w. If
  // this stops holding, every fraction ported from the reference silently changes.
  it("equals the width on the reference aspect", () => {
    expect(unit(402, 874)).toBeCloseTo(402, 1)
  })

  it("is height-driven on a wide viewport, so type and lens can't run away", () => {
    expect(unit(1440, 900)).toBeCloseTo(414, 0)
    expect(unit(1440, 900)).toBeLessThan(1440)
  })

  it("is width-driven on a tall narrow viewport", () => {
    expect(unit(360, 1200)).toBe(360)
  })

  it("never returns zero for a degenerate viewport", () => {
    expect(unit(1, 1)).toBeGreaterThan(0)
  })
})

describe("LAYOUT", () => {
  it("stacks logo, headline and hint in reading order", () => {
    expect(LAYOUT.logo).toBeLessThan(LAYOUT.headline)
    expect(LAYOUT.headline).toBeLessThan(LAYOUT.hint)
  })

  it("puts the hint inside the resting lens, where it is refracted", () => {
    // The puck rests at y = 1.19h with radius 0.95·unit; on the reference aspect its
    // top edge is at 1.19h − 0.95·402 = 0.752h. The hint sitting BELOW that line is
    // deliberate — it is the one piece of copy the glass distorts, which is what
    // tells you the lens is there and grabbable.
    const h = 874
    const topOfLens = (1.19 * h - 0.95 * unit(402, h)) / h
    expect(LAYOUT.hint).toBeGreaterThan(topOfLens)
  })

  it("keeps the headline clear of the lens, so it stays legible at rest", () => {
    const h = 874
    const topOfLens = (1.19 * h - 0.95 * unit(402, h)) / h
    expect(LAYOUT.headline).toBeLessThan(topOfLens)
  })
})

describe("toRgb01", () => {
  it("parses six-digit hex", () => {
    expect(toRgb01("#ffffff")).toEqual([1, 1, 1])
    expect(toRgb01("#000000")).toEqual([0, 0, 0])
  })

  it("parses three-digit hex by doubling each nibble", () => {
    expect(toRgb01("#fff")).toEqual([1, 1, 1])
    expect(toRgb01("#0f0")[1]).toBe(1)
  })

  it("parses rgb() and rgba(), which the token layer may resolve to", () => {
    expect(toRgb01("rgb(255, 0, 0)")).toEqual([1, 0, 0])
    expect(toRgb01("rgba(0, 255, 0, 0.5)")[1]).toBe(1)
  })

  it("tolerates whitespace around a value", () => {
    expect(toRgb01("  #059669  ")[1]).toBeCloseTo(150 / 255, 5)
  })

  // A wrong colour is worse than a neutral one: an unparsed oklch() must not be
  // guessed at, because the shader would happily render the garbage.
  it("falls back rather than guessing on an unsupported form", () => {
    expect(toRgb01("oklch(0.7 0.15 160)")).toEqual([1, 1, 1])
    expect(toRgb01("", [0, 0, 0])).toEqual([0, 0, 0])
    expect(toRgb01("#zz")).toEqual([1, 1, 1])
  })
})

describe("readPalette / paletteKey", () => {
  // Node has no window, which is also the pre-hydration case in the browser.
  it("returns the light token set with no window", () => {
    const p = readPalette({} as unknown as Element)
    expect(p.dark).toBe(false)
    expect(p.page).toBe("#f4f6f5")
    expect(p.brand).toBe("#059669")
  })

  it("keys differ between light and dark, so a theme flip repaints", () => {
    const light = readPalette({} as unknown as Element)
    expect(paletteKey(light)).not.toBe(paletteKey({ ...light, dark: true }))
  })

  it("keys ignore fields the scene does not paint with", () => {
    const p = readPalette({} as unknown as Element)
    expect(paletteKey({ ...p, sunken: "#123456" })).toBe(paletteKey(p))
  })
})

describe("Spring", () => {
  it("settles at its target", () => {
    const s = new Spring(0, 210, 26)
    s.target = 100
    for (let i = 0; i < 400; i++) s.step(1 / 60)
    expect(s.value).toBeCloseTo(100, 2)
    expect(s.settled).toBe(true)
  })

  it("set() teleports and kills velocity, for a resize re-seat", () => {
    const s = new Spring(0, 210, 26)
    s.target = 500
    s.step(0.1)
    expect(s.velocity).not.toBe(0)
    s.set(20)
    expect(s.value).toBe(20)
    expect(s.target).toBe(20)
    expect(s.velocity).toBe(0)
  })

  // The point of sub-stepping at 1/240: one long frame must not integrate
  // differently from several short ones, or a dropped frame changes the motion.
  it("integrates a long frame like several short ones", () => {
    const a = new Spring(0, 210, 26)
    const b = new Spring(0, 210, 26)
    a.target = 100
    b.target = 100
    a.step(0.05)
    for (let i = 0; i < 3; i++) b.step(0.05 / 3)
    expect(a.value).toBeCloseTo(b.value, 3)
  })

  it("clamps a huge dt so a backgrounded tab cannot explode it", () => {
    const s = new Spring(0, 210, 26)
    s.target = 100
    s.step(30)
    expect(Number.isFinite(s.value)).toBe(true)
    expect(Math.abs(s.value)).toBeLessThan(1000)
  })

  it("keeps velocity when the target moves mid-flight", () => {
    const s = new Spring(0, 210, 26)
    s.target = 100
    s.step(0.08)
    const v = s.velocity
    s.target = 200
    expect(s.velocity).toBe(v)
  })
})

describe("clamp / mix / ease", () => {
  it("clamps both ends", () => {
    expect(clamp(-1, 0, 1)).toBe(0)
    expect(clamp(2, 0, 1)).toBe(1)
    expect(clamp(0.4, 0, 1)).toBe(0.4)
  })

  it("mixes linearly", () => {
    expect(mix(10, 20, 0)).toBe(10)
    expect(mix(10, 20, 1)).toBe(20)
    expect(mix(10, 20, 0.5)).toBe(15)
  })

  it("eases smoothly and stays inside 0..1", () => {
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    expect(ease(0.5)).toBeCloseTo(0.5, 5)
    expect(ease(-3)).toBe(0)
    expect(ease(9)).toBe(1)
  })
})

describe("BubbleField", () => {
  const field = () => {
    const f = new BubbleField()
    // 402×874 with the emitter at the painted logo centre.
    f.resize(402, 874, 402, 201, 874 * LAYOUT.logo)
    return f
  }

  it("emits nothing until told to", () => {
    const f = field()
    f.update(1 / 60, 0, false)
    expect(f.length).toBe(0)
  })

  it("spawns from the emitter origin, not from the centre of the screen", () => {
    const f = field()
    f.update(1 / 60, 0, true)
    expect(f.length).toBeGreaterThan(0)
    const packed = f.pack(1, 874)
    // Bubbles start within a few px of the origin; y is GL space, so a bubble at
    // CSS y=297 packs to 874−297. Getting this backwards would launch the plume
    // downward off the bottom of the screen.
    const originY = 874 * LAYOUT.logo
    for (let i = 0; i < f.count; i++) {
      expect(Math.abs(packed[i * 7] - 201)).toBeLessThan(30)
      expect(Math.abs(packed[i * 7 + 1] - (874 - originY))).toBeLessThan(30)
    }
  })

  it("does nothing at all before resize, rather than dividing by a zero height", () => {
    const f = new BubbleField()
    f.update(1 / 60, 0, true)
    expect(f.length).toBe(0)
    expect(f.count).toBe(0)
  })

  it("never exceeds the instance-buffer capacity", () => {
    const f = field()
    for (let i = 0; i < 600; i++) f.update(1 / 60, 0, true)
    expect(f.length).toBeLessThanOrEqual(MAX_BUBBLES)
  })

  it("rises, and retires bubbles that leave the top", () => {
    const f = field()
    f.update(1 / 60, 0, true)
    const before = f.pack(1, 874)[1]
    for (let i = 0; i < 30; i++) f.update(1 / 60, 0.5, true)
    // GL y counts up from the bottom, so rising means the packed y grows.
    expect(f.pack(1, 874)[1]).toBeGreaterThan(before)

    for (let i = 0; i < 400; i++) f.update(1 / 60, 5, false)
    expect(f.length).toBe(0)
  })

  it("packs only visible bubbles, never more than exist", () => {
    const f = field()
    for (let i = 0; i < 10; i++) f.update(1 / 60, 0.2, true)
    const packed = f.pack(1, 874)
    expect(f.count).toBeLessThanOrEqual(f.length)
    expect(f.count).toBeGreaterThan(0)
    // Anything at or below the visibility floor is dropped rather than uploaded as
    // a fully transparent instance the GPU still has to rasterise.
    for (let i = 0; i < f.count; i++) {
      expect(packed[i * 7 + 4]).toBeGreaterThan(0.002)
      expect(packed[i * 7 + 4]).toBeLessThanOrEqual(1)
    }
  })

  it("fades a bubble in rather than popping it on", () => {
    const f = field()
    f.update(1 / 60, 0, true)
    const first = f.pack(1, 874)[4]
    for (let i = 0; i < 6; i++) f.update(1 / 60, 0.1, true)
    expect(first).toBeLessThan(0.5)
    expect(f.pack(1, 874)[4]).toBeGreaterThan(first)
  })

  it("scales bubble size with the geometry unit", () => {
    const small = new BubbleField()
    small.resize(402, 874, 402, 201, 300)
    const big = new BubbleField()
    big.resize(1440, 900, 414, 720, 300)
    for (let i = 0; i < 20; i++) {
      small.update(1 / 60, 0.3, true)
      big.update(1 / 60, 0.3, true)
    }
    const radius = (f: BubbleField) => {
      const packed = f.pack(1, 900)
      let max = 0
      for (let i = 0; i < f.count; i++) max = Math.max(max, packed[i * 7 + 2])
      return max
    }
    // The 1440-wide viewport must not spawn dramatically bigger bubbles: its unit is
    // height-driven and only ~3% larger.
    expect(radius(big)).toBeLessThan(radius(small) * 1.5)
  })

  it("clear() resets both the live list and the packed count", () => {
    const f = field()
    for (let i = 0; i < 40; i++) f.update(1 / 60, 0.3, true)
    f.pack(1, 874)
    expect(f.count).toBeGreaterThan(0)
    f.clear()
    expect(f.length).toBe(0)
    expect(f.count).toBe(0)
  })
})
