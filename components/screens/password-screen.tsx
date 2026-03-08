"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Lock, ArrowLeft } from "lucide-react"

interface PasswordScreenProps {
  onUnlock: () => void
  onCancel: () => void
}

const CORRECT_PASSWORD = "2567"

export function PasswordScreen({ onUnlock, onCancel }: PasswordScreenProps) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState(false)
  const [shaking, setShaking] = useState(false)

  const handleSubmit = () => {
    if (password === CORRECT_PASSWORD) {
      onUnlock()
    } else {
      setError(true)
      setShaking(true)
      setPassword("")
      setTimeout(() => setShaking(false), 500)
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className="w-full max-w-md">
      <Card
        className={`glass-panel p-8 space-y-6 transition-all duration-300 ${
          shaking ? "animate-shake" : ""
        } ${error ? "border-destructive/50" : ""}`}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onCancel}
            className="p-2 rounded-lg hover:bg-white/10 border border-glass-border transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-foreground/60" />
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-foreground">Manager Dashboard</h2>
            <p className="text-sm text-foreground/60 mt-1">Enter access password</p>
          </div>
        </div>

        <div className="flex justify-center">
          <div
            className={`rounded-full p-4 border transition-all ${
              error ? "bg-destructive/20 border-destructive/50 neon-glow" : "bg-primary/20 border-primary/30"
            }`}
          >
            <Lock className={`w-12 h-12 ${error ? "text-destructive" : "text-primary"}`} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-2">Access Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Enter password"
            className={`glass-input ${error ? "border-destructive/50 bg-destructive/5" : ""}`}
            autoFocus
          />
          {error && <p className="text-sm text-destructive mt-2">Incorrect password. Try again.</p>}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!password}
          className="w-full glass-button disabled:opacity-50 py-3 bg-gradient-to-r from-primary/20 to-accent/20 hover:from-primary/30 hover:to-accent/30 border border-primary/30 text-primary font-semibold"
        >
          Unlock Dashboard
        </button>
      </Card>
    </div>
  )
}
