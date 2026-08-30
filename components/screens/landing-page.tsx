"use client"

import Image from "next/image"
import { ArrowRight } from "lucide-react"

// ============================================================================
// Splash screen.
//
// FIXES A REAL CLIPPING BUG. The previous version combined `min-h-screen` +
// `justify-center` + `overflow-hidden` with a fixed 280px logo, `space-y-12` and a
// 48px headline. On a 360×640 phone the content measured ~680px, and centred
// overflow inside `overflow-hidden` clips at BOTH ends — so "Get Started" could
// become unreachable on short viewports.
//
// Now: `min-h-dvh` (accounts for mobile browser chrome), no `overflow-hidden` on
// the scroll container, a viewport-relative logo, and a clamped headline.
// ============================================================================

export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-6 py-12 bg-mesh">
      {/* The orbs are the only decorative motion, and they sit behind everything
          with pointer-events: none so they can never intercept the CTA. */}
      <div className="gradient-orb gradient-orb-1 animate-float" aria-hidden="true" />
      <div className="gradient-orb gradient-orb-2 animate-float delay-300" aria-hidden="true" />

      <main className="flex flex-col items-center text-center gap-8 z-10 max-w-lg">
        <Image
          src="/logo.png"
          alt="Lawson Limited Company"
          width={280}
          height={280}
          // Scales with the viewport instead of forcing 280px onto a 360px screen.
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
      </main>
    </div>
  )
}
