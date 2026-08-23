"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, Timer, X } from "lucide-react"

export interface OnTimeWindowInfo {
  shift: string; openIso: string; closeIso: string
  startHour: number; startMin: number; endHour: number; endMin: number
}

export interface GStats {
  currentStreak: number
  longestStreak: number
  currentShiftComplete: boolean
  assignedShift: string
  currentShift: string
  totalSubmissions: number
  department: string | null
  groupNumber: number | null
  fullName: string | null
  badges: { badge_type: string; earned_at: string }[]
  dayOff?: boolean
  noCompulsory?: boolean
  onTimeWindow?: OnTimeWindowInfo
}

export interface LEntry { team_label: string; department: string; group_number: number; on_time_count: number }
export interface MVPData { userId: string; fullName: string; department: string | null; groupNumber: number | null; onTimeCount: number; month: string; isMe: boolean; showPopup: boolean }

// Appears only in the last 30 min before the on-time window closes (amber, then
// pulsing red ≤15 min). Hidden once the shift is complete or the window passed.
export function ShiftCountdown({ onTimeWindow, shiftComplete }: { onTimeWindow: OnTimeWindowInfo; shiftComplete: boolean }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(iv)
  }, [])
  if (shiftComplete) return null

  const now = Date.now()
  const closeMs = new Date(onTimeWindow.closeIso).getTime()
  const openMs = new Date(onTimeWindow.openIso).getTime()
  const msLeft = closeMs - now
  const isOpen = now >= openMs && now < closeMs
  if (!isOpen || msLeft > 30 * 60_000) return null

  const fmt = (ms: number) => {
    const t = Math.max(0, Math.floor(ms / 1000))
    return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
  }
  const urgent = Math.floor(msLeft / 60_000) <= 15
  const cls = urgent ? "bg-red-500/20 border-red-400/40 text-red-300 animate-pulse" : "bg-amber-500/20 border-amber-400/40 text-amber-300"
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border ${cls}`}>
      <Timer className="w-2.5 h-2.5" />{urgent ? "Submit now! " : "Deadline — "}{fmt(msLeft)} left
    </span>
  )
}

export function Fire({ n, done }: { n: number; done: boolean }) {
  const sz = n === 0 ? "text-4xl" : n < 5 ? "text-5xl" : n < 20 ? "text-6xl" : "text-7xl"
  const glow = n === 0 ? "" : n < 5 ? "drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" : n < 20 ? "drop-shadow-[0_0_18px_rgba(251,146,60,0.8)]" : "drop-shadow-[0_0_30px_rgba(251,146,60,1)]"
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`${sz} ${glow} select-none transition-all duration-500 ${n === 0 ? "grayscale opacity-20" : ""}`}>🔥</span>
      <p className={`text-3xl font-black tabular-nums leading-none ${n === 0 ? "text-slate-200" : "text-orange-300"}`}>{n}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">shift streak</p>
      {done && (
        <span className="mt-1 flex items-center gap-1 text-[9px] font-black text-emerald-300 bg-emerald-700/40 px-2 py-0.5 rounded-full border border-emerald-600/40">
          <CheckCircle2 className="w-2.5 h-2.5" />Done
        </span>
      )}
    </div>
  )
}

export function StatPill({ val, label, color, icon: Icon }: { val: string; label: string; color: string; icon?: React.ElementType }) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-3 px-2">
      <div className="flex items-center gap-1">
        {Icon && <Icon className={`w-3 h-3 ${color} opacity-70`} />}
        <p className={`text-lg font-black tabular-nums ${color}`}>{val}</p>
      </div>
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  )
}

export function LRow({ e, rank, isMe }: { e: LEntry; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 ${isMe ? "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 shadow-sm shadow-emerald-100" : "hover:bg-slate-50/80"}`}>
      <div className="w-6 text-center shrink-0">
        {medal ? <span className="text-sm leading-none">{medal}</span> : <span className={`text-[10px] font-black ${rank <= 3 ? "text-amber-400" : "text-slate-300"}`}>#{rank}</span>}
      </div>
      <p className={`text-xs font-semibold flex-1 truncate ${isMe ? "text-emerald-800 font-bold" : "text-slate-600"}`}>
        {e.team_label}
        {isMe && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-600">You</span>}
      </p>
      <div className="text-right shrink-0 flex items-center gap-1.5">
        <p className={`text-sm font-black tabular-nums ${rank === 1 ? "text-amber-500" : rank <= 3 ? "text-emerald-600" : "text-slate-400"}`}>{e.on_time_count}</p>
        <p className="text-[8px] text-slate-300 uppercase tracking-wide">on-time</p>
      </div>
    </div>
  )
}

export function MVPModal({ mvp, onClose }: { mvp: MVPData; onClose: () => void }) {
  const [progress, setProgress] = useState(100)
  useEffect(() => {
    const start = Date.now()
    const iv = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / 5000) * 100)
      setProgress(pct)
      if (pct <= 0) { clearInterval(iv); onClose() }
    }, 50)
    return () => clearInterval(iv)
  }, [onClose])

  return (
    <>
      <style>{`
        @keyframes mvp-confetti { from { transform: translateY(-20px) rotate(0deg) scale(1); opacity: 1; } to { transform: translateY(120vh) rotate(540deg) scale(0.5); opacity: 0; } }
        .mvp-piece { animation: mvp-confetti linear forwards; position: fixed; top: 0; pointer-events: none; user-select: none; font-size: 1.4rem; z-index: 60; }
        @keyframes mvp-in { from { transform: scale(0.5) translateY(40px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        .mvp-card { animation: mvp-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>
      {["🏆","🎉","✨","⭐","🌟","💚","🎊","👑","🥇","💯","🔥","🎖️"].map((e, i) => (
        <span key={i} className="mvp-piece" style={{ left: `${Math.random() * 100}%`, animationDelay: `${i * 0.12}s`, animationDuration: `${2.5 + Math.random()}s` }}>{e}</span>
      ))}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="mvp-card bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 px-6 pt-8 pb-6 text-center">
            <div className="text-6xl mb-3 drop-shadow-lg">👑</div>
            <p className="text-amber-900 text-[10px] font-black uppercase tracking-[0.2em]">{mvp.month}</p>
            <h2 className="text-amber-950 text-2xl font-black tracking-tight mt-1">MVP of the Month</h2>
          </div>
          <div className="px-6 py-6 text-center space-y-4">
            <div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">{mvp.fullName}</p>
              {mvp.department && <p className="text-sm font-semibold text-slate-500 mt-1">{mvp.department}{mvp.groupNumber ? ` · Group ${mvp.groupNumber}` : ""}</p>}
            </div>
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl px-5 py-3 inline-block">
              <p className="text-3xl font-black text-emerald-700 tabular-nums">{mvp.onTimeCount}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">on-time shifts completed</p>
            </div>
            {mvp.isMe ? (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-4 py-3">
                <p className="text-sm font-black text-amber-700">🎉 That's you! Congratulations!</p>
                <p className="text-xs text-amber-500 mt-0.5">You've earned the MVP badge for this month.</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 font-semibold">Keep it up — you could be next month's MVP! 💪</p>
            )}
          </div>
          <div className="px-6 pb-5 space-y-3">
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full transition-none" style={{ width: `${progress}%` }} /></div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-all flex items-center justify-center gap-1.5">
              <X className="w-4 h-4" /> Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export const SHIFT_COLORS: Record<string, string> = {
  Morning: "bg-amber-100 text-amber-700 border-amber-200",
  Afternoon: "bg-sky-100 text-sky-700 border-sky-200",
  Night: "bg-indigo-100 text-indigo-700 border-indigo-200",
}
