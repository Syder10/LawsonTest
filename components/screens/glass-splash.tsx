"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight } from "lucide-react"
import { BubbleField } from "@/lib/glass/bubbles"
import { buildMotifAtlas } from "@/lib/glass/motifs"
import { GlassRenderer, type LensState } from "@/lib/glass/renderer"
import { LAYOUT, ScenePainter, logoCenter, unit, type SceneState } from "@/lib/glass/scene"
import { Spring, clamp, ease, mix } from "@/lib/glass/spring"
import { paletteKey, readPalette, toRgb01 } from "@/lib/glass/tokens"

// ============================================================================
// Glass splash.
//
// A refracting lens over a painted scene: drag it around, flick it upward to
// enter. Ported from the reference intro at ~/Desktop/wabi-intro — the shader
// math, the spring constants (210/26 position, 150/21 grab), the superellipse
// exponent 2.8→9.0, the 14 spectral taps and the commit thresholds (22% of the
// viewport travelled, or a fling past 700 px/s) are all the reference's values.
//
// What is NOT the reference: the scene, which is painted from this app's token
// layer; the botanical plume; and the fact that the gesture is only ever an
// enhancement over a real, focusable button.
// ============================================================================

/** Long enough to see the copy change and the plume launch, short enough not to stall. */
const COMMIT_MS = 1050
const COMMIT_MS_REDUCED = 380

export function GlassSplash({ onStart, onFail }: { onStart: () => void; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)
  const [committed, setCommitted] = useState(false)

  // Everything the frame loop touches lives in a ref: the render loop must not
  // depend on React's commit cycle.
  const anim = useRef({
    px: new Spring(0, 210, 26),
    py: new Spring(0, 210, 26),
    grab: new Spring(0, 150, 21),
    committed: false,
    t: 0,
    plumeStart: -1,
    copy: 0,
    bloom: 0,
    dragging: false,
    pointerId: -1,
    reduced: false,
    radius: 0,
    grabY: 0,
  })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Commit is one-way. The copy crossfades and the plume launches, then we navigate
   * — so the transition is something you watch rather than something that delays
   * you. /login is prefetched by the page, so the wait is animation, not loading.
   */
  const commit = useCallback(() => {
    const state = anim.current
    if (state.committed) return
    state.committed = true
    state.plumeStart = state.t
    setCommitted(true)
    timer.current = setTimeout(onStart, state.reduced ? COMMIT_MS_REDUCED : COMMIT_MS)
  }, [onStart])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return

    const state = anim.current
    // Reduced motion lives in the loop's ref, not in React state: the scene reads it
    // every frame and it is part of the repaint hash, so the hint copy follows a
    // mid-session change on its own.
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    state.reduced = reducedQuery.matches
    const onReduced = () => { state.reduced = reducedQuery.matches }
    reducedQuery.addEventListener("change", onReduced)

    let palette = readPalette(host)
    let renderer: GlassRenderer
    try {
      renderer = new GlassRenderer(canvas, buildMotifAtlas(palette))
    } catch {
      // No WebGL2 (or a driver that refuses the context). The page swaps in the
      // static splash; the user is never shown an error about a shader.
      reducedQuery.removeEventListener("change", onReduced)
      onFail()
      return
    }

    const scene = document.createElement("canvas")
    const sceneCtx = scene.getContext("2d", { alpha: false })
    if (!sceneCtx) {
      renderer.dispose()
      reducedQuery.removeEventListener("change", onReduced)
      onFail()
      return
    }

    const painter = new ScenePainter()
    const field = new BubbleField()

    const fontFamily = getComputedStyle(host).fontFamily || "system-ui, sans-serif"

    let w = 0
    let h = 0
    let dpr = 1
    let sceneKey = ""
    let raf = 0
    let last = performance.now()
    let firstFrame = false
    let paletteId = paletteKey(palette)
    let droplet = toRgb01(palette.card)
    let logo: HTMLImageElement | null = null

    const img = new Image()
    const useLogo = () => {
      logo = img
      sceneKey = ""
    }
    // src first: decode() on an image with no source rejects. decode() is preferred
    // where it exists because it guarantees the bitmap is ready to draw, so the first
    // frame containing the logo can't stall the compositor — but it is NOT universal,
    // and `img.decode?.().then(…)` would throw where it is missing, since optional-
    // calling an absent method yields undefined and undefined has no .then.
    img.src = "/logo.png"
    if (typeof img.decode === "function") {
      img.decode().then(useLogo).catch(() => { /* the halo carries the composition */ })
    } else {
      img.onload = useLogo
    }

    // next-themes writes the theme onto <html>, so a live toggle is a class change.
    // Re-reading the tokens and repainting the atlas is all it takes — no hex here
    // to keep in step.
    const themeObserver = new MutationObserver(() => {
      const next = readPalette(host)
      const id = paletteKey(next)
      if (id === paletteId) return
      palette = next
      paletteId = id
      droplet = toRgb01(next.card)
      renderer.setAtlas(buildMotifAtlas(next))
      sceneKey = ""
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    const onContextLost = (e: Event) => {
      e.preventDefault()
      onFail()
    }
    canvas.addEventListener("webglcontextlost", onContextLost)

    // Rest and lift radii keep the reference's 0.95 / 0.30 ratio, but measured
    // against `unit` so a wide desktop viewport doesn't get a lens bigger than the
    // screen. At rest the puck sits below the fold: you see a wide shallow dome
    // along the bottom edge, which is the thing the hint tells you to drag.
    const restRadius = () => unit(w, h) * 0.95
    const liftRadius = () => unit(w, h) * 0.3
    const restY = () => h * 1.19

    const syncSize = () => {
      const rect = canvas.getBoundingClientRect()
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
      const nw = Math.max(1, Math.round(rect.width))
      const nh = Math.max(1, Math.round(rect.height))
      if (nw === w && nh === h && nextDpr === dpr) return

      w = nw
      h = nh
      dpr = nextDpr
      scene.width = Math.round(w * dpr)
      scene.height = Math.round(h * dpr)
      renderer.resize(w, h, dpr)
      const origin = logoCenter(w, h)
      field.resize(w, h, unit(w, h), origin.x, origin.y)
      sceneKey = ""

      // Re-seat the resting puck for the new geometry.
      if (!state.dragging && state.grab.value < 0.02) {
        state.px.set(w * 0.5)
        state.py.set(restY())
      }
    }

    const frame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      state.t += dt
      syncSize()

      // Reduced motion keeps the crossfade but runs it ~3× faster, and the plume
      // and caustic are skipped entirely: fewer and gentler, not zero.
      const speed = state.reduced ? 3.2 : 1
      const since = state.plumeStart >= 0 ? (state.t - state.plumeStart) * speed : -1
      const forward = state.committed && since >= 0
      state.copy = forward ? clamp((since - 0.05) / 0.95, 0, 1) : 0
      state.bloom = forward ? clamp((since - 0.02) / 0.5, 0, 1) : 0

      // Springs: released, the puck falls back below the fold. With reduced motion
      // it is pinned there and never grabbed, so the lens is effectively static.
      if (!state.dragging) {
        state.px.target = w * 0.5
        state.py.target = restY()
        state.grab.target = 0
      }
      state.px.step(dt)
      state.py.step(dt)
      state.grab.step(dt)

      const g = clamp(state.grab.value, 0, 1.15)
      const radius = mix(restRadius(), liftRadius(), ease(g))
      state.radius = radius

      const next: SceneState = {
        w, h, fontFamily, palette, logo,
        copy: state.copy,
        bloom: state.bloom,
        gesture: !state.reduced,
      }
      const key = [
        w, h, dpr, paletteId, logo ? "1" : "0", state.reduced ? "r" : "-",
        next.copy.toFixed(3), next.bloom.toFixed(3),
      ].join("|")
      if (key !== sceneKey) {
        sceneKey = key
        sceneCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        painter.paint(sceneCtx, next)
        renderer.uploadScene(scene)
      }

      const emitting = forward && !state.reduced
      field.update(dt, Math.max(0, since), emitting)
      const packed = field.pack(dpr, scene.height)

      // The caustic is gated on grip AND upward velocity, so it only appears when
      // you are actually lifting the glass — it reads as light pooling, not a glow.
      const caustic = state.reduced ? 0 : clamp(-state.py.velocity / 900, 0, 1) * ease(g)

      const lens: LensState = {
        x: state.px.value,
        y: state.py.value,
        radius,
        flat: mix(0.1, 0.86, ease(g)),
        thickness: radius * mix(0.03, 0.235, ease(g)),
        disperse: mix(0.1, 0.34, ease(g)),
        caustic,
        presence: 1,
        time: state.t,
      }

      renderer.render(lens, packed, field.count, droplet)
      if (!firstFrame) {
        firstFrame = true
        setReady(true)
      }
      raf = requestAnimationFrame(frame)
    }

    /* ---------------- pointer ---------------- */
    const localPoint = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onDown = (e: PointerEvent) => {
      if (state.dragging || state.reduced || state.committed) return
      const p = localPoint(e)

      // You grab the glass, you don't summon it. A press that misses the puck falls
      // through, so nothing above the canvas becomes untappable.
      const dx = p.x - state.px.value
      const dy = p.y - state.py.value
      if (Math.hypot(dx, dy) > state.radius * 1.04) return

      state.dragging = true
      state.pointerId = e.pointerId
      state.grabY = p.y
      canvas.setPointerCapture(e.pointerId)
      state.px.target = p.x
      state.py.target = p.y
      state.grab.target = 1
    }

    const onMove = (e: PointerEvent) => {
      if (!state.dragging || e.pointerId !== state.pointerId) return
      const p = localPoint(e)
      state.px.target = p.x
      state.py.target = p.y
    }

    const onUp = (e: PointerEvent) => {
      if (!state.dragging || e.pointerId !== state.pointerId) return
      state.dragging = false
      state.pointerId = -1
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)

      // Committed if the gesture travelled far enough up, or was flung.
      const travelled = state.grabY - state.py.target
      if (travelled > h * 0.22 || state.py.velocity < -700) commit()
    }

    canvas.addEventListener("pointerdown", onDown)
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerup", onUp)
    canvas.addEventListener("pointercancel", onUp)

    // The headline is painted with the app font; until it loads the scene is drawn
    // in the fallback stack, so invalidate once the real one is ready.
    document.fonts?.ready.then(() => { sceneKey = "" }).catch(() => { /* ignore */ })

    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerup", onUp)
      canvas.removeEventListener("pointercancel", onUp)
      canvas.removeEventListener("webglcontextlost", onContextLost)
      reducedQuery.removeEventListener("change", onReduced)
      themeObserver.disconnect()
      renderer.dispose()
    }
  }, [commit, onFail])

  return (
    // bg-mesh behind the canvas, so the frame or two before the first render — and
    // any moment the canvas is transparent — still shows the app's surface rather
    // than white. No overflow-hidden anywhere on the way down: that, plus centring,
    // is what previously put the CTA out of reach on a short viewport.
    <div ref={hostRef} className="relative min-h-dvh w-full bg-mesh">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Lawson Limited Company. A pane of glass resting over the company mark; drag it upward to enter."
        className={`absolute inset-0 h-full w-full touch-none transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}
        style={{ cursor: committed ? "default" : "grab" }}
      />

      {/* The scene paints the wordmark, so the heading has to exist for real
          somewhere: this is the page's actual h1, and the canvas is decorative. */}
      <h1 className="sr-only">Lawson Limited Company — Production Management</h1>

      {/* The CTA is in normal flow, pushed down to the fraction of the viewport the
          scene reserves for it (LAYOUT.cta) — so it lands above the resting lens
          and, unlike an absolutely-centred stack, can never be clipped out of reach
          on a short viewport. */}
      <div
        className="relative flex min-h-dvh w-full flex-col items-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        style={{ paddingTop: `calc(${LAYOUT.cta} * 100dvh)` }}
      >
        <button
          type="button"
          onClick={commit}
          disabled={committed}
          className="glass-button-hero inline-flex items-center gap-2 disabled:opacity-70"
        >
          {committed ? "Opening…" : "Get started"}
          {!committed && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}
