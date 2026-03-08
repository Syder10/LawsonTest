"use client"

import { CheckCircle } from "lucide-react"
import Image from "next/image"

interface SuccessScreenProps {
  onAddAnother: () => void
  onBackToTypes: () => void
}

export default function SuccessScreen({ onAddAnother, onBackToTypes }: SuccessScreenProps) {
  return (
    <div className="w-full max-w-md animate-fade-in-up">
      <div className="glass-panel p-8 space-y-6 text-center overflow-hidden relative">
        <div className="flex justify-center mb-2">
          <Image
            src="/logo.png"
            alt="Lawson LLC Logo"
            width={80}
            height={80}
            className="drop-shadow-lg animate-float rounded-lg bg-white p-2"
          />
        </div>

        <div className="flex justify-center">
          <div className="rounded-full bg-emerald-100/80 p-6 border-2 border-emerald-300 animate-pulse-glow">
            <CheckCircle className="w-16 h-16 text-emerald-600" />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-emerald-950">Record Saved Successfully</h2>
          <p className="text-sm text-emerald-700/60 mt-2 leading-relaxed">
            Your production record has been securely saved to the system.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <button
            onClick={onAddAnother}
            className="w-full glass-button-primary py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]"
          >
            Add Another Record
          </button>
          <button
            onClick={onBackToTypes}
            className="w-full glass-button py-3 rounded-xl font-semibold transition-all hover:scale-[1.02]"
          >
            Back to Record Types
          </button>
        </div>
      </div>
    </div>
  )
}
