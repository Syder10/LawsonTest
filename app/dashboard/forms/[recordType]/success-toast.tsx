"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, CheckCircle2, Home, ArrowRight } from "lucide-react"

const CONFETTI = ["🎉", "✨", "⭐", "🌟", "💚", "🏆", "🔥", "💯", "👏", "🎊", "🌈", "💪"]

export interface SuccessInfo {
  recordType: string
  department: string
  shift: string
  date: string
  count: number
}

// Animated success overlay shown after a submission. Extracted from the form
// component to keep the form focused on data entry.
export function SuccessToast({
  info,
  onDismiss,
  onAnother,
}: {
  info: SuccessInfo
  onDismiss: () => void
  onAnother: () => void
}) {
  const [pieces, setPieces] = useState<{ id: number; emoji: string; x: number; delay: number; dur: number }[]>([])
  const [visible, setVisible] = useState(false)
  const submittedAt = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  const dateLabel = info.date
    ? new Date(info.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : ""

  useEffect(() => {
    setPieces(
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        emoji: CONFETTI[i % CONFETTI.length],
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.6 + Math.random() * 1,
      })),
    )
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    setTimeout(onDismiss, 300)
  }

  return (
    <>
      <style>{`
        @keyframes toast-confetti { from { transform: translateY(-30px) rotate(0deg); opacity: 1; } to { transform: translateY(110vh) rotate(600deg); opacity: 0; } }
        .toast-piece { animation: toast-confetti linear forwards; position: fixed; top: 0; pointer-events: none; user-select: none; font-size: 1.4rem; z-index: 60; }
        @keyframes check-pop { 0% { transform: scale(0) rotate(-180deg); opacity: 0; } 60% { transform: scale(1.2) rotate(10deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
        .check-pop { animation: check-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.1s both; }
        @keyframes ring-pulse { 0%, 100% { transform: scale(1); opacity: 0.4; } 50% { transform: scale(1.5); opacity: 0; } }
        .ring-1 { animation: ring-pulse 1.2s ease-out infinite; }
        .ring-2 { animation: ring-pulse 1.2s ease-out 0.3s infinite; }
      `}</style>

      {pieces.map((p) => (
        <span key={p.id} className="toast-piece" style={{ left: `${p.x}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}>
          {p.emoji}
        </span>
      ))}

      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center p-4 transition-all duration-300" style={{ opacity: visible ? 1 : 0 }} onClick={handleDismiss}>
        <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transition-all duration-300" style={{ transform: visible ? "translateY(0) scale(1)" : "translateY(40px) scale(0.95)", opacity: visible ? 1 : 0 }} onClick={(e) => e.stopPropagation()}>
          <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600" />
          <div className="p-6 text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="ring-1 absolute inset-0 rounded-full bg-emerald-400/30" />
              <div className="ring-2 absolute inset-1 rounded-full bg-emerald-300/20" />
              <div className="check-pop absolute inset-0 w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/40">
                <CheckCircle2 className="w-8 h-8 text-white" strokeWidth={2.5} />
              </div>
            </div>
            <h3 className="text-xl font-black text-emerald-950 tracking-tight">Submitted! 🎉</h3>
            <p className="text-sm text-emerald-600/80 font-semibold mt-0.5">Great work, keep it up!</p>
            <div className="mt-4 bg-slate-50 rounded-2xl border border-slate-100 p-3.5 text-left space-y-2">
              <Row label="Record" value={info.recordType} truncate />
              {info.department && <Row label="Department" value={info.department} />}
              {info.shift && <Row label="Shift" value={info.shift} />}
              {dateLabel && <Row label="Date" value={dateLabel} />}
              {info.count > 1 && <Row label="Records saved" value={String(info.count)} />}
              <div className="flex justify-between items-center text-xs border-t border-slate-100 pt-2">
                <span className="text-slate-400 font-semibold">Submitted at</span>
                <span className="font-black text-emerald-600">{submittedAt} ✓</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button onClick={onAnother} className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl py-3 text-sm font-bold transition-all shadow-sm shadow-emerald-600/20">
                <Plus className="w-4 h-4" /> Add More
              </button>
              <Link href="/dashboard" className="flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-3 text-sm font-bold transition-all">
                <Home className="w-4 h-4" /> Dashboard
              </Link>
            </div>
            <button onClick={handleDismiss} className="mt-3 text-[10px] text-slate-400 hover:text-slate-600 transition-colors font-semibold">
              Dismiss <ArrowRight className="inline w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function Row({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs gap-2">
      <span className="text-slate-400 font-semibold shrink-0">{label}</span>
      <span className={`font-bold text-slate-700 text-right ${truncate ? "truncate max-w-[55%]" : ""}`}>{value}</span>
    </div>
  )
}
