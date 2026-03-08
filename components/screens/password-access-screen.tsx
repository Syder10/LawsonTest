"use client"

import { useState } from "react"
import { Lock, ArrowLeft } from "lucide-react"

interface PasswordAccessScreenProps {
  onUnlock: (mode: "full" | "materials") => void
  onBack: () => void
}

export default function PasswordAccessScreen({ onUnlock, onBack }: PasswordAccessScreenProps) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const handleUnlock = () => {
    if (password === "2567") {
      setError(false)
      setPassword("")
      onUnlock("full")
    } else if (password === "Pro2026") {
      setError(false)
      setPassword("")
      onUnlock("materials")
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      setTimeout(() => setError(false), 3000)
      setPassword("")
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className={`glass-panel p-8 space-y-6 transition-all ${shake ? "animate-shake" : ""} ${error ? "neon-glow-error" : ""}`}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/20 border border-primary/40">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Manager Dashboard</h2>
            <p className="text-sm text-foreground/60">Requires Password</p>
          </div>
        </div>

        <div className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
            placeholder="Enter access password"
            className={`glass-input ${error ? "border-red-500 border-2" : ""}`}
            autoFocus
          />
          {error && <p className="text-sm text-red-500 font-semibold">Incorrect password. Try again.</p>}
        </div>

        <button onClick={handleUnlock} className="w-full glass-button-primary py-3 rounded-xl font-semibold transition-all">
          Unlock Dashboard
        </button>

        <button onClick={onBack} className="w-full glass-button py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>
    </div>
  )
}
