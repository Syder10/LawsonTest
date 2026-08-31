"use client"

import { useRef } from "react"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { isSwipeUpCommit, trackVelocity } from "@/lib/domain/swipe"

// ============================================================================
// Static splash — the fallback, and the first thing rendered on every visit.
//
// This is what ships when WebGL2 is unavailable or the GL context is lost, so it
// has to stand on its own rather than look like a degraded state: same tokens, same
// CTA, no mention of a shader. It is also the server-rendered markup, which is why
// the glass splash can swap in on mount without a flash — both paint `bg-mesh`.
//
// FIXES A REAL CLIPPING BUG (kept from the previous landing page). Combining
// `min-h-screen` + `justify-center` + `overflow-hidden` with a fixed 280px logo
// measured ~680px on a 360×640 phone, and centred overflow inside `overflow-hidden`
// clips at BOTH ends — so "Get started" could become unreachable. Now: `min-h-dvh`,
// no `overflow-hidden` on the scroll container, a viewport-relative logo, and a
// clamped headline.
// ============================================================================

export function StaticSplash({ onStart }: { onStart: () => void }) {
  // Swipe up works here too. This screen has no lens to drag, but "swipe up to
  // enter" must mean the same thing whichever splash a device gets — otherwise the
  // gesture silently depends on whether the phone could run a shader.
  const gesture = useRef({ active: false, id: -1, startY: 0, lastY: 0, lastT: 0, vy: 0 })

  const onPointerDown = (e: React.PointerEvent) => {
    gesture.current = { active: true, id: e.pointerId, startY: e.clientY, lastY: e.clientY, lastT: performance.now(), vy: 0 }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g.active || e.pointerId !== g.id) return
    const now = performance.now()
    g.vy = trackVelocity(g.vy, e.clientY - g.lastY, Math.max(1, now - g.lastT) / 1000)
    g.lastY = e.clientY
    g.lastT = now
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    if (!g.active || e.pointerId !== g.id) return
    g.active = false
    if (isSwipeUpCommit(g.startY - g.lastY, g.vy, window.innerHeight)) onStart()
  }

  return (
    <div
      className="relative min-h-dvh flex flex-col items-center justify-center px-6 py-12 bg-mesh touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current.active = false }}
    >
      {/* The orbs are the only decorative motion, and they sit behind everything
          with pointer-events: none so they can never intercept the CTA. */}
      <div className="gradient-orb gradient-orb-1 animate-float" aria-hidden="true" />
      <div className="gradient-orb gradient-orb-2 animate-float delay-300" aria-hidden="true" />

      <main className="flex flex-col items-center text-center gap-8 z-10 max-w-lg">
        <Image
          src="/logo.png"
          alt=""
          width={280}
          height={280}
          className="w-32 h-32 sm:w-44 sm:h-44 object-contain animate-logo-reveal"
          priority
        />

        <div className="space-y-2 animate-fade-in-up delay-200">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-ink-primary text-balance">
            Lawson Limited Company
          </h1>
          <p className="text-lg sm:text-xl font-medium text-ink-secondary">Production Management</p>
        </div>

        <button onClick={onStart} className="glass-button-hero animate-fade-in-up delay-400 inline-flex items-center gap-2">
          Get started
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* Says the gesture out loud: an undiscoverable swipe is not a feature. */}
        <p className="text-xs font-medium text-ink-muted animate-fade-in-up delay-400">or swipe up to enter</p>
      </main>
    </div>
  )
}
