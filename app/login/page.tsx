"use client"

import { login } from "./actions"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActionState, useState } from "react"

type Mode = "supervisor" | "manager" | "admin"

const MODE_CONFIG = {
  supervisor: {
    heading:         "Welcome!",
    sub:             "Sign in to your account",
    btnLabel:        "Sign In",
    btnClass:        "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-emerald-600/20",
    userPlaceholder: "Username",
  },
  manager: {
    heading:         "Manager Login",
    sub:             "Sign in to your manager account",
    btnLabel:        "Sign In",
    btnClass:        "bg-slate-800 hover:bg-slate-900 active:bg-slate-950 shadow-slate-800/20",
    userPlaceholder: "Username",
  },
  admin: {
    heading:         "System Access",
    sub:             "Authorised personnel only",
    btnLabel:        "Access System",
    btnClass:        "bg-zinc-900 hover:bg-zinc-950 active:bg-black shadow-zinc-900/20",
    userPlaceholder: "Admin username",
  },
}

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null)
  const [mode, setMode] = useState<Mode>("supervisor")
  const [dotClicks, setDotClicks] = useState(0)

  const cfg = MODE_CONFIG[mode]

  const handleDotClick = () => {
    const next = dotClicks + 1
    if (next >= 3) {
      setMode("admin")
      setDotClicks(0)
    } else {
      setDotClicks(next)
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setDotClicks(0)
  }

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 bg-gradient-to-br from-emerald-50 via-white to-green-50">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-300/30 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-300/30 rounded-full blur-[100px] pointer-events-none" />

      <div className={`w-full max-w-md backdrop-blur-xl border shadow-2xl rounded-3xl p-6 sm:p-8 z-10 transition-all duration-300 ${
        mode === "admin"
          ? "bg-zinc-50/90 border-zinc-300"
          : mode === "manager"
          ? "bg-white/80 border-slate-200"
          : "bg-white/80 border-white/50"
      }`}>

        {/* Logo + heading */}
        <div className="flex flex-col items-center space-y-4 mb-6 sm:mb-8">
          <Image
            src="/logo.png"
            alt="Lawson LLC Logo"
            width={100}
            height={100}
            className={`w-20 h-20 sm:w-[100px] sm:h-[100px] drop-shadow-lg rounded-full bg-white p-2 transition-all duration-300 ${
              mode === "admin" ? "grayscale opacity-50" : ""
            }`}
            priority
          />
          <div className="text-center space-y-1">
            <h1 className={`text-xl sm:text-2xl font-bold tracking-tight transition-colors duration-200 ${
              mode === "admin" ? "text-zinc-700" : "text-emerald-950"
            }`}>
              {cfg.heading}
            </h1>
            <p className={`text-sm font-medium tracking-wide transition-colors duration-200 ${
              mode === "admin" ? "text-zinc-400" : "text-emerald-700/70"
            }`}>
              {cfg.sub}
            </p>
          </div>
        </div>

        {/* Login form */}
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="mode" value={mode} />

          <div className="space-y-2">
            <Label htmlFor="username" className={`font-semibold text-sm ${
              mode === "admin" ? "text-zinc-600" : "text-emerald-900"
            }`}>
              Username
            </Label>
            <Input
              id="username"
              name="username"
              type="text"
              placeholder={cfg.userPlaceholder}
              required
              disabled={isPending}
              autoComplete="username"
              className={`w-full px-4 py-3 text-base rounded-xl transition-all ${
                mode === "admin"
                  ? "border-zinc-300 bg-white focus:border-zinc-500 focus:ring-zinc-400/20"
                  : "border-emerald-100 bg-white/50 focus:border-emerald-500 focus:ring-emerald-500/20"
              }`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className={`font-semibold text-sm ${
              mode === "admin" ? "text-zinc-600" : "text-emerald-900"
            }`}>
              Password
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              disabled={isPending}
              autoComplete="current-password"
              className={`w-full px-4 py-3 text-base rounded-xl transition-all ${
                mode === "admin"
                  ? "border-zinc-300 bg-white focus:border-zinc-500 focus:ring-zinc-400/20"
                  : "border-emerald-100 bg-white/50 focus:border-emerald-500 focus:ring-emerald-500/20"
              }`}
            />
          </div>

          {state?.error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center font-medium">
              {state.error}
            </div>
          )}

          <Button
            type="submit"
            disabled={isPending}
            className={`w-full py-4 text-base font-bold text-white rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 mt-1 ${cfg.btnClass}`}
          >
            {isPending ? "Signing In..." : cfg.btnLabel}
          </Button>
        </form>

        {/* Supervisor mode: show "Manager" switch below */}
        {mode === "supervisor" && (
          <div className="mt-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-emerald-100" />
            <button
              type="button"
              onClick={() => switchMode("manager")}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded-lg hover:bg-slate-50"
            >
              Manager
            </button>
            <div className="flex-1 h-px bg-emerald-100" />
          </div>
        )}

        {/* Manager / admin mode: show back link */}
        {mode !== "supervisor" && (
          <button
            type="button"
            onClick={() => switchMode("supervisor")}
            className="mt-5 w-full text-xs text-slate-400 hover:text-slate-500 transition-colors text-center"
          >
            ← Back
          </button>
        )}
      </div>

      {/* Hidden admin trigger — tiny dot bottom-right, click 3× to reveal admin form */}
      <button
        type="button"
        onClick={handleDotClick}
        aria-hidden="true"
        tabIndex={-1}
        className="fixed bottom-5 right-5 w-2.5 h-2.5 rounded-full bg-slate-300 opacity-30 hover:opacity-50 transition-opacity cursor-default focus:outline-none"
      />
    </div>
  )
}
