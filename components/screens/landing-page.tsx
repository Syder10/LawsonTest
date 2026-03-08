"use client"

import Image from "next/image"

interface LandingPageProps {
  onStart: () => void
}

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 bg-mesh">
      {/* Refined gradient orbs for subtle ambient lighting */}
      <div className="gradient-orb gradient-orb-1 animate-float" />
      <div className="gradient-orb gradient-orb-2 animate-float delay-300" />

      {/* Centered logo with reveal animation */}
      <div className="flex flex-col items-center justify-center space-y-12 z-10">
        <div className="animate-logo-reveal opacity-0">
          <Image
            src="/logo.png"
            alt="Lawson LLC Logo"
            width={280}
            height={280}
            className="drop-shadow-2xl rounded-full bg-white p-4"
            priority
          />
        </div>

        {/* Minimal company name and system title */}
        <div className="text-center space-y-4 animate-fade-in-up opacity-0 delay-200">
          <h1 className="text-5xl md:text-6xl font-bold text-emerald-950 tracking-tight">Lawson Limited Company</h1>
          <p className="text-2xl md:text-3xl font-medium text-emerald-700/70 tracking-wide">Production Management</p>
        </div>

        {/* Simple, elegant CTA button */}
        <div className="pt-8 animate-fade-in-up opacity-0 delay-400">
          <button onClick={onStart} className="glass-button-hero">
            Get Started
          </button>
        </div>
      </div>
    </div>
  )
}
