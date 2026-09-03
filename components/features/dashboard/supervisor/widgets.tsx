"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, Crown, Flame, Timer, X } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Chip } from "@/components/primitives"

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

/**
 * Appears only in the last 30 minutes before the on-time window closes, and turns
 * urgent at 15. Hidden once the shift is complete or the window has passed.
 *
 * `now` is held in state rather than read during render: a render-time Date.now()
 * is an impure read, and the 1s interval was already what forced the re-render,
 * so it may as well carry the value it is re-rendering for. The first paint
 * therefore renders nothing, which also keeps the server and client markup equal.
 */
export function ShiftCountdown({ onTimeWindow, shiftComplete }: { onTimeWindow: OnTimeWindowInfo; shiftComplete: boolean }) {
  const [now, setNow] = useState(0)
  useEffect(() => {
    setNow(Date.now())
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])
  if (shiftComplete || now === 0) return null

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

  return (
    <span
      role="timer"
      aria-live="off"
      className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border ${
        urgent
          ? "bg-critical/20 border-critical/40 text-white motion-safe:animate-pulse"
          : "bg-warning/20 border-warning/40 text-white"
      }`}
    >
      <Timer className="w-3 h-3 shrink-0" aria-hidden="true" />
      {urgent ? "Submit now — " : "Closes in "}
      <span className="tnum">{fmt(msLeft)}</span>
    </span>
  )
}

/**
 * Streak counter. Scales and glows with the streak length.
 *
 * Uses the Flame icon rather than an emoji: at these sizes an emoji renders
 * differently on every platform, and this is the single largest element on the
 * supervisor's home screen.
 */
export function Fire({ n, done }: { n: number; done: boolean }) {
  const tier = n === 0 ? 0 : n < 5 ? 1 : n < 20 ? 2 : 3
  const size = ["w-9 h-9", "w-11 h-11", "w-14 h-14", "w-16 h-16"][tier]
  const glow = [
    "",
    "drop-shadow-[0_0_8px_var(--status-warning)]",
    "drop-shadow-[0_0_18px_var(--status-warning)]",
    "drop-shadow-[0_0_30px_var(--status-warning)]",
  ][tier]

  return (
    <div className="flex flex-col items-center gap-0.5">
      <Flame
        className={`${size} ${glow} transition-all duration-500 ${n === 0 ? "text-white/25" : "text-warning"}`}
        aria-hidden="true"
      />
      <p className={`text-3xl font-bold tnum leading-none ${n === 0 ? "text-white/40" : "text-white"}`}>{n}</p>
      <p className="text-xs font-bold uppercase tracking-widest text-white/60">shift streak</p>
      {done && (
        <span className="mt-1 flex items-center gap-1 text-xs font-bold text-white bg-good/30 px-2 py-0.5 rounded-full border border-good/40">
          <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
          Done
        </span>
      )}
    </div>
  )
}

export function StatPill({
  val,
  label,
  tone = "brand",
  icon: Icon,
}: {
  val: string
  label: string
  tone?: "brand" | "warning" | "neutral"
  icon?: React.ElementType
}) {
  const color = { brand: "text-brand", warning: "text-warning-ink", neutral: "text-ink-secondary" }[tone]
  return (
    <div className="flex flex-col items-center gap-0.5 py-3 px-2">
      <div className="flex items-center gap-1">
        {Icon && <Icon className={`w-3.5 h-3.5 ${color} opacity-70`} aria-hidden="true" />}
        <p className={`text-lg font-bold tnum ${color}`}>{val}</p>
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">{label}</p>
    </div>
  )
}

/** One leaderboard row. Rank 1–3 get a medal; the viewer's own team is marked. */
export function LRow({ e, rank, isMe }: { e: LEntry; rank: number; isMe: boolean }) {
  const medal = rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : null
  return (
    <li
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
        isMe ? "bg-brand-subtle border border-brand/25" : "hover:bg-surface-sunken"
      }`}
    >
      <div className="w-6 text-center shrink-0">
        {medal ? (
          <span className="text-sm leading-none" aria-hidden="true">{medal}</span>
        ) : (
          <span className="text-xs font-bold text-ink-muted">#{rank}</span>
        )}
        <span className="sr-only">Rank {rank}</span>
      </div>
      <p className={`min-w-0 flex-1 text-sm font-semibold ${isMe ? "text-brand-subtle-ink" : "text-ink-secondary"}`}>
        {e.team_label}
        {isMe && <Chip tone="brand" className="ml-1.5">You</Chip>}
      </p>
      <div className="text-right shrink-0 flex items-center gap-1.5">
        <p className={`text-sm font-bold tnum ${rank <= 3 ? "text-brand" : "text-ink-muted"}`}>{e.on_time_count}</p>
        <p className="text-xs text-ink-muted uppercase tracking-wide">on-time</p>
      </div>
    </li>
  )
}

/**
 * Monthly MVP announcement. Auto-dismisses after 5s with a visible progress bar
 * so the countdown isn't a surprise.
 *
 * On the Dialog primitive, so Escape and focus trapping come free — the previous
 * hand-rolled overlay had neither. The confetti is gone: it was 12 emoji spans
 * with runtime-injected keyframes, and this fires once a month, which is not
 * enough for anyone to learn what the animation meant.
 */
export function MVPModal({ mvp, onClose }: { mvp: MVPData; onClose: () => void }) {
  const [progress, setProgress] = useState(100)
  // Latest-value ref so the 50ms interval never restarts when onClose's identity
  // changes. Assigned in an effect, not during render — a render-phase write is
  // unsafe under concurrent rendering, since a discarded render would still have
  // moved the ref.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const start = Date.now()
    const iv = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / 5000) * 100)
      setProgress(pct)
      if (pct <= 0) {
        clearInterval(iv)
        closeRef.current()
      }
    }, 50)
    return () => clearInterval(iv)
  }, [])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden gap-0">
        <div className="bg-gradient-to-br from-warning to-warning/70 px-6 pt-8 pb-6 text-center">
          <Crown className="w-12 h-12 mx-auto text-white drop-shadow" aria-hidden="true" />
          <p className="text-white/80 text-xs font-bold uppercase tracking-widest mt-3">{mvp.month}</p>
          <h2 className="text-white text-2xl font-bold tracking-tight mt-1">MVP of the month</h2>
        </div>

        <div className="px-6 py-6 text-center space-y-4">
          <div>
            <p className="text-xl sm:text-2xl font-bold text-ink-primary tracking-tight break-words">{mvp.fullName}</p>
            {mvp.department && (
              <p className="text-sm font-medium text-ink-secondary mt-1">
                {mvp.department}
                {mvp.groupNumber ? ` · Group ${mvp.groupNumber}` : ""}
              </p>
            )}
          </div>

          <div className="bg-brand-subtle border border-brand/25 rounded-2xl px-5 py-3 inline-block">
            <p className="text-3xl font-bold text-brand-subtle-ink tnum">{mvp.onTimeCount}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-subtle-ink/70">on-time shifts</p>
          </div>

          <p className="text-sm text-ink-secondary">
            {mvp.isMe ? "That’s you — nicely done." : "Keep going; next month is open."}
          </p>
        </div>

        <div className="px-6 pb-5 space-y-3">
          <div className="h-1 bg-surface-sunken rounded-full overflow-hidden" aria-hidden="true">
            <div className="h-full bg-brand rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <button
            onClick={onClose}
            className="w-full h-11 rounded-xl bg-surface-sunken hover:bg-hairline text-ink-secondary text-sm font-bold transition-colors flex items-center justify-center gap-1.5 active:scale-[0.97]"
          >
            <X className="w-4 h-4" aria-hidden="true" /> Dismiss
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Shift identity. Morning / Afternoon / Night keep distinct hues because a
 * supervisor reads their shift at a glance — but they are tinted brand steps
 * rather than three unrelated colour families.
 */
export const SHIFT_COLORS: Record<string, string> = {
  Morning: "bg-warning-subtle text-warning-ink border-warning/30",
  Afternoon: "bg-brand-subtle text-brand-subtle-ink border-brand/25",
  Night: "bg-surface-sunken text-ink-secondary border-hairline",
}
