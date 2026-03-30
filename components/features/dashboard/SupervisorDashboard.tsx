"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  FileText, UserCircle, Download, History,
  Trophy, Medal, Star, Zap, Target, Award,
  CheckCircle2, Clock, Moon, Sunrise, Shuffle, Flame as FlameIcon,
  X, ChevronRight, TrendingUp,
} from "lucide-react"

// ── Badge catalogue ────────────────────────────────────────────────────────
interface BadgeMeta { label: string; desc: string; icon: React.ElementType; color: string; bg: string; ring: string; darkBg?: string }

const BADGE_META: Record<string, BadgeMeta> = {
  first_submit:      { label: "First Step",       desc: "Your very first submission",              icon: Star,      color: "text-emerald-600", bg: "bg-emerald-50",  ring: "ring-emerald-200" },
  submissions_50:    { label: "Warm Up",           desc: "50 submissions",                          icon: Star,      color: "text-teal-600",    bg: "bg-teal-50",     ring: "ring-teal-200"    },
  submissions_100:   { label: "Century",           desc: "100 submissions",                         icon: Medal,     color: "text-amber-600",   bg: "bg-amber-50",    ring: "ring-amber-200"   },
  submissions_200:   { label: "Double Century",    desc: "200 submissions",                         icon: Medal,     color: "text-orange-500",  bg: "bg-orange-50",   ring: "ring-orange-200"  },
  submissions_300:   { label: "Triple Crown",      desc: "300 submissions",                         icon: Trophy,    color: "text-yellow-600",  bg: "bg-yellow-50",   ring: "ring-yellow-200"  },
  submissions_400:   { label: "400 Club",          desc: "400 submissions",                         icon: Trophy,    color: "text-cyan-600",    bg: "bg-cyan-50",     ring: "ring-cyan-200"    },
  submissions_500:   { label: "Half-K Legend",     desc: "500 submissions",                         icon: Award,     color: "text-violet-600",  bg: "bg-violet-50",   ring: "ring-violet-200"  },
  submissions_750:   { label: "750 Warrior",       desc: "750 submissions",                         icon: Award,     color: "text-rose-500",    bg: "bg-rose-50",     ring: "ring-rose-200"    },
  submissions_1000:  { label: "1K Elite",          desc: "1,000 submissions",                       icon: Zap,       color: "text-yellow-400",  bg: "bg-zinc-900",    ring: "ring-yellow-400"  },
  submissions_1500:  { label: "1.5K Master",       desc: "1,500 submissions",                       icon: Zap,       color: "text-purple-400",  bg: "bg-purple-900",  ring: "ring-purple-400"  },
  submissions_2000:  { label: "2K Immortal",       desc: "2,000 submissions — hall of fame",        icon: Zap,       color: "text-red-400",     bg: "bg-red-900",     ring: "ring-red-400"     },
  streak_5:          { label: "On a Roll",         desc: "5-shift streak",                          icon: FlameIcon, color: "text-orange-500",  bg: "bg-orange-50",   ring: "ring-orange-200"  },
  streak_10:         { label: "Unstoppable",       desc: "10-shift streak",                         icon: FlameIcon, color: "text-orange-600",  bg: "bg-orange-100",  ring: "ring-orange-300"  },
  streak_20:         { label: "Machine",           desc: "20-shift streak",                         icon: FlameIcon, color: "text-red-500",     bg: "bg-red-50",      ring: "ring-red-200"     },
  streak_30:         { label: "Iron Will",         desc: "30-shift streak",                         icon: FlameIcon, color: "text-red-600",     bg: "bg-red-100",     ring: "ring-red-300"     },
  streak_50:         { label: "Legendary Run",     desc: "50-shift streak",                         icon: FlameIcon, color: "text-rose-500",    bg: "bg-rose-900",    ring: "ring-rose-400"    },
  streak_100:        { label: "The Eternal Flame", desc: "100-shift streak — extraordinary",        icon: FlameIcon, color: "text-yellow-300",  bg: "bg-zinc-900",    ring: "ring-yellow-300"  },
  perfect_week:      { label: "Perfect Week",      desc: "All shifts on time for a full week",      icon: Target,    color: "text-emerald-400", bg: "bg-emerald-900", ring: "ring-emerald-400" },
  night_owl:         { label: "Night Owl",         desc: "Submitted a Night shift on time",         icon: Moon,      color: "text-indigo-400",  bg: "bg-indigo-900",  ring: "ring-indigo-400"  },
  early_bird:        { label: "Early Bird",        desc: "Submitted before 3pm on a Morning shift", icon: Sunrise,   color: "text-amber-400",   bg: "bg-amber-50",    ring: "ring-amber-300"   },
  all_rounder:       { label: "All-Rounder",       desc: "Submitted on all 3 shift types",          icon: Shuffle,   color: "text-teal-500",    bg: "bg-teal-50",     ring: "ring-teal-200"    },
}

const SHIFT_COLORS: Record<string, string> = {
  Morning:   "bg-amber-100 text-amber-700 border-amber-200",
  Afternoon: "bg-sky-100 text-sky-700 border-sky-200",
  Night:     "bg-indigo-100 text-indigo-700 border-indigo-200",
}

interface GStats {
  currentStreak: number; longestStreak: number; currentShiftComplete: boolean
  currentShift: string; totalSubmissions: number; department: string | null
  groupNumber: number | null; fullName: string | null
  badges: { badge_type: string; earned_at: string }[]
  saturdayOff?: boolean
  dayOff?: boolean
}
interface LEntry { team_label: string; department: string; group_number: number; on_time_count: number }
interface MVPData { userId: string; fullName: string; department: string | null; groupNumber: number | null; onTimeCount: number; month: string; isMe: boolean; showPopup: boolean }

// ── Badge Achievement Toast ────────────────────────────────────────────────
interface BadgeToastProps {
  badgeType: string
  onDismiss: () => void
}

function BadgeToast({ badgeType, onDismiss }: BadgeToastProps) {
  const m = BADGE_META[badgeType]
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Trigger enter animation
    const showTimer = setTimeout(() => setVisible(true), 30)

    // Auto-dismiss after 6s
    timerRef.current = setTimeout(() => handleDismiss(), 6000)

    return () => {
      clearTimeout(showTimer)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function handleDismiss() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setExiting(true)
    setTimeout(() => onDismiss(), 350)
  }

  if (!m) return null
  const Icon = m.icon

  return (
    <>
      <style>{`
        @keyframes badge-slide-in {
          from { transform: translateY(100%) scale(0.95); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes badge-slide-out {
          from { transform: translateY(0) scale(1); opacity: 1; }
          to   { transform: translateY(100%) scale(0.95); opacity: 0; }
        }
        @keyframes badge-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes badge-glow-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0); }
          50%       { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0.15); }
        }
        .badge-toast-enter {
          animation: badge-slide-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .badge-toast-exit {
          animation: badge-slide-out 0.35s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }
        .badge-shimmer-text {
          background: linear-gradient(90deg, #d97706 0%, #f59e0b 40%, #fbbf24 50%, #f59e0b 60%, #d97706 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: badge-shimmer 2s linear infinite;
        }
      `}</style>

      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[calc(100vw-2rem)] max-w-sm
          ${visible && !exiting ? "badge-toast-enter" : ""}
          ${exiting ? "badge-toast-exit" : ""}
          ${!visible && !exiting ? "opacity-0" : ""}
        `}
      >
        <div
          className="relative bg-white rounded-2xl border border-amber-200 shadow-xl shadow-black/10 overflow-hidden"
          style={{ animation: visible && !exiting ? "badge-glow-pulse 2s ease-in-out infinite" : "none" }}
        >
          {/* Shimmer strip at top */}
          <div className="h-0.5 w-full bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-300" />

          <div className="flex items-center gap-3.5 px-4 py-3.5">
            {/* Icon */}
            <div className={`${m.bg} ring-2 ${m.ring} rounded-xl p-2.5 shrink-0`}>
              <Icon className={`w-5 h-5 ${m.color}`} />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-amber-500 leading-none mb-0.5">
                Achievement Unlocked
              </p>
              <p className="text-sm font-black text-slate-900 leading-tight badge-shimmer-text">
                {m.label}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-tight truncate">{m.desc}</p>
            </div>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className="shrink-0 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
            >
              <X className="w-3 h-3 text-slate-400" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-amber-50">
            <div
              className="h-full bg-amber-400 rounded-full origin-left"
              style={{ animation: visible && !exiting ? "badgeProgress 6s linear forwards" : "none" }}
            />
          </div>
          <style>{`
            @keyframes badgeProgress {
              from { width: 100%; }
              to   { width: 0%; }
            }
          `}</style>
        </div>
      </div>
    </>
  )
}

// ── Streak fire ────────────────────────────────────────────────────────────
function Fire({ n, done }: { n: number; done: boolean }) {
  const sz   = n === 0 ? "text-4xl" : n < 5 ? "text-5xl" : n < 20 ? "text-6xl" : "text-7xl"
  const glow = n === 0 ? "" : n < 5 ? "drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" : n < 20 ? "drop-shadow-[0_0_18px_rgba(251,146,60,0.8)]" : "drop-shadow-[0_0_30px_rgba(251,146,60,1)]"
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`${sz} ${glow} select-none transition-all duration-500 ${n === 0 ? "grayscale opacity-20" : ""}`}>🔥</span>
      <p className={`text-3xl font-black tabular-nums leading-none ${n === 0 ? "text-white/30" : "text-orange-300"}`}>{n}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-white/40">shift streak</p>
      {done && (
        <span className="mt-1 flex items-center gap-1 text-[9px] font-black text-emerald-300 bg-emerald-700/40 px-2 py-0.5 rounded-full border border-emerald-600/40">
          <CheckCircle2 className="w-2.5 h-2.5" />Done
        </span>
      )}
    </div>
  )
}

// ── Badge card ─────────────────────────────────────────────────────────────
function BadgeCard({ type, earnedAt }: { type: string; earnedAt: string }) {
  const m = BADGE_META[type]
  if (!m) return null
  const Icon = m.icon
  return (
    <div className={`${m.bg} rounded-2xl ring-2 ${m.ring} p-3 flex flex-col items-center gap-1 text-center group relative hover:scale-[1.03] transition-transform duration-200`}>
      <div className="w-8 h-8 flex items-center justify-center">
        <Icon className={`w-5 h-5 ${m.color}`} />
      </div>
      <p className={`text-[9px] font-black uppercase tracking-wider ${m.color} leading-tight`}>{m.label}</p>
      <p className="text-[8px] text-slate-400 leading-tight">{m.desc}</p>
      <p className="text-[8px] text-slate-300">{new Date(earnedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
    </div>
  )
}

// ── Stat pill ──────────────────────────────────────────────────────────────
function StatPill({ val, label, color, icon: Icon }: { val: string; label: string; color: string; icon?: React.ElementType }) {
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

// ── Leaderboard row ────────────────────────────────────────────────────────
function LRow({ e, rank, isMe }: { e: LEntry; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150
      ${isMe
        ? "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/60 shadow-sm shadow-emerald-100"
        : "hover:bg-slate-50/80"
      }`}
    >
      <div className="w-6 text-center shrink-0">
        {medal
          ? <span className="text-sm leading-none">{medal}</span>
          : <span className={`text-[10px] font-black ${rank <= 3 ? "text-amber-400" : "text-slate-300"}`}>#{rank}</span>
        }
      </div>
      <p className={`text-xs font-semibold flex-1 truncate ${isMe ? "text-emerald-800 font-bold" : "text-slate-600"}`}>
        {e.team_label}
        {isMe && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[7px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-600">You</span>}
      </p>
      <div className="text-right shrink-0 flex items-center gap-1.5">
        <p className={`text-sm font-black tabular-nums ${rank === 1 ? "text-amber-500" : rank <= 3 ? "text-emerald-600" : "text-slate-400"}`}>
          {e.on_time_count}
        </p>
        <p className="text-[8px] text-slate-300 uppercase tracking-wide">on-time</p>
      </div>
    </div>
  )
}

// ── MVP Modal ──────────────────────────────────────────────────────────────
function MVPModal({ mvp, onClose }: { mvp: MVPData; onClose: () => void }) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start    = Date.now()
    const DURATION = 5000
    const iv = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.max(0, 100 - (elapsed / DURATION) * 100)
      setProgress(pct)
      if (pct <= 0) { clearInterval(iv); onClose() }
    }, 50)
    return () => clearInterval(iv)
  }, [onClose])

  return (
    <>
      <style>{`
        @keyframes mvp-confetti {
          from { transform: translateY(-20px) rotate(0deg) scale(1); opacity: 1; }
          to   { transform: translateY(120vh) rotate(540deg) scale(0.5); opacity: 0; }
        }
        .mvp-piece { animation: mvp-confetti linear forwards; position: fixed; top: 0; pointer-events: none; user-select: none; font-size: 1.4rem; z-index: 60; }
        @keyframes mvp-in { from { transform: scale(0.5) translateY(40px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        .mvp-card { animation: mvp-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>

      {["🏆","🎉","✨","⭐","🌟","💚","🎊","👑","🥇","💯","🔥","🎖️"].map((e, i) => (
        <span key={i} className="mvp-piece" style={{ left: `${Math.random() * 100}%`, animationDelay: `${i * 0.12}s`, animationDuration: `${2.5 + Math.random()}s` }}>{e}</span>
      ))}

      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="mvp-card bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 px-6 pt-8 pb-6 text-center">
            <div className="text-6xl mb-3 drop-shadow-lg">👑</div>
            <p className="text-amber-900 text-[10px] font-black uppercase tracking-[0.2em]">{mvp.month}</p>
            <h2 className="text-amber-950 text-2xl font-black tracking-tight mt-1">MVP of the Month</h2>
          </div>

          <div className="px-6 py-6 text-center space-y-4">
            <div>
              <p className="text-3xl font-black text-slate-900 tracking-tight">{mvp.fullName}</p>
              {mvp.department && (
                <p className="text-sm font-semibold text-slate-500 mt-1">
                  {mvp.department}{mvp.groupNumber ? ` · Group ${mvp.groupNumber}` : ""}
                </p>
              )}
            </div>
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl px-5 py-3 inline-block">
              <p className="text-3xl font-black text-emerald-700 tabular-nums">{mvp.onTimeCount}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">on-time shifts completed</p>
            </div>
            {mvp.isMe && (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl px-4 py-3">
                <p className="text-sm font-black text-amber-700">🎉 That's you! Congratulations!</p>
                <p className="text-xs text-amber-500 mt-0.5">You've earned the MVP badge for this month.</p>
              </div>
            )}
            {!mvp.isMe && (
              <p className="text-xs text-slate-400 font-semibold">Keep it up — you could be next month's MVP! 💪</p>
            )}
          </div>

          <div className="px-6 pb-5 space-y-3">
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full transition-none" style={{ width: `${progress}%` }} />
            </div>
            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-all flex items-center justify-center gap-1.5">
              <X className="w-4 h-4" /> Dismiss
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Quick action button ────────────────────────────────────────────────────
function ActionBtn({ href, icon: Icon, label, primary, external }: {
  href: string; icon: React.ElementType; label: string; primary?: boolean; external?: boolean
}) {
  const cls = `group flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all duration-150 active:scale-[0.97]
    ${primary
      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25"
      : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-sm"
    }`

  const inner = (
    <>
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors
        ${primary ? "bg-white/10 group-hover:bg-white/20" : "bg-slate-100 group-hover:bg-slate-200"}`}
      >
        <Icon className={`w-4 h-4 ${primary ? "text-white" : "text-slate-500"}`} />
      </span>
      <p className="text-sm font-bold">{label}</p>
      <ChevronRight className={`w-4 h-4 ml-auto shrink-0 opacity-0 group-hover:opacity-40 transition-opacity ${primary ? "text-white" : "text-slate-400"}`} />
    </>
  )

  return external
    ? <a href={href} className={cls}>{inner}</a>
    : <Link href={href} className={cls}>{inner}</Link>
}

// ── Main ───────────────────────────────────────────────────────────────────
export function SupervisorDashboard({ userId }: { userId: string }) {
  const now          = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [stats, setStats]           = useState<GStats | null>(null)
  const [lb, setLb]                 = useState<LEntry[]>([])
  const [mvp, setMvp]               = useState<MVPData | null>(null)
  const [showMvp, setShowMvp]       = useState(false)
  const [loading, setLoading]       = useState(true)

  // Badge toast state: tracks which badge to show (one at a time, once per session)
  const [toastBadge, setToastBadge] = useState<string | null>(null)
  const prevBadges                  = useRef<Set<string>>(new Set())
  const toastQueue                  = useRef<string[]>([])

  const fetchAll = useCallback(async () => {
    try {
      const [sr, lr, mr] = await Promise.all([
        fetch("/api/gamification/stats"),
        fetch("/api/gamification/leaderboard"),
        fetch("/api/gamification/mvp"),
      ])
      if (sr.ok) {
        const data: GStats = await sr.json()
        setStats(data)

        // ── Badge toast logic ──────────────────────────────────────────────
        // Compare current badges to previously known ones.
        // Any badge not in our prev set → newly earned → queue a toast (once per session).
        const currentBadgeTypes = new Set((data.badges || []).map(b => b.badge_type))

        currentBadgeTypes.forEach(type => {
          if (!prevBadges.current.has(type)) {
            // New badge — check session storage so we only show each toast once per session
            const seenKey = `badge_toast_${type}_${userId}`
            if (!sessionStorage.getItem(seenKey)) {
              sessionStorage.setItem(seenKey, "1")
              toastQueue.current = [...toastQueue.current, type]
            }
          }
        })

        // Update our known-badges set
        prevBadges.current = currentBadgeTypes

        // If no toast is currently showing, pop one from the queue
        setToastBadge(prev => {
          if (!prev && toastQueue.current.length > 0) {
            const next = toastQueue.current[0]
            toastQueue.current = toastQueue.current.slice(1)
            return next
          }
          return prev
        })
      }

      if (lr.ok) { const d = await lr.json(); setLb(d.leaderboard || []) }
      if (mr.ok) {
        const d = await mr.json()
        if (d.mvp) {
          setMvp(d.mvp)
          if (d.mvp.showPopup) {
            const seenKey = `mvp_popup_${d.mvp.month.replace(/\s/g, "_")}_${userId}`
            if (!sessionStorage.getItem(seenKey)) {
              setShowMvp(true)
              sessionStorage.setItem(seenKey, "1")
            }
          }
        }
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [userId])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 5 * 60_000)
    return () => clearInterval(iv)
  }, [fetchAll])

  // When a toast is dismissed, pop the next one from the queue (if any)
  function handleToastDismiss() {
    if (toastQueue.current.length > 0) {
      const next = toastQueue.current[0]
      toastQueue.current = toastQueue.current.slice(1)
      setToastBadge(next)
    } else {
      setToastBadge(null)
    }
  }

  const myTeam = stats?.department && stats?.groupNumber ? `${stats.department} — Group ${stats.groupNumber}` : null
  const myRank = myTeam ? lb.findIndex(e => e.team_label === myTeam) + 1 : 0
  const hour   = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"

  return (
    <>
      {/* ── Badge achievement toast (one at a time, once per session) ── */}
      {toastBadge && (
        <BadgeToast
          key={toastBadge}
          badgeType={toastBadge}
          onDismiss={handleToastDismiss}
        />
      )}

      {/* ── MVP pop-up ── */}
      {showMvp && mvp && <MVPModal mvp={mvp} onClose={() => setShowMvp(false)} />}

      <div className="space-y-3 sm:space-y-4 animate-fade-in-up">

        {/* ── Hero header ─────────────────────────────────────────────── */}
        <div className="rounded-3xl overflow-hidden shadow-lg shadow-emerald-900/10">
          {/* Top gradient band */}
          <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-emerald-900 px-5 pt-6 pb-0 sm:px-6">
            <div className="flex items-start justify-between gap-4 pb-5">
              <div className="flex-1 min-w-0">
                <p className="text-emerald-400/70 text-[9px] font-black uppercase tracking-[0.2em]">{greeting}</p>
                <h2 className="text-white text-xl sm:text-2xl font-black tracking-tight mt-0.5 truncate">
                  {loading ? <span className="inline-block h-7 w-36 bg-white/10 rounded-lg animate-pulse" /> : (stats?.fullName || "Supervisor")}
                </h2>
                {stats?.department && (
                  <p className="text-emerald-400/60 text-xs font-medium mt-0.5">
                    {stats.department}{stats.groupNumber ? ` · Group ${stats.groupNumber}` : ""}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  {stats?.currentShift && !stats?.dayOff && (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border ${SHIFT_COLORS[stats.currentShift]}`}>
                      <Clock className="w-2.5 h-2.5" />{stats.currentShift} Shift
                    </span>
                  )}
                  {stats?.dayOff && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border bg-white/5 text-white/50 border-white/10">
                      {new Date().getUTCDay() === 0 ? "🌴 Sunday rest day" : "🌴 Saturday off"}
                    </span>
                  )}
                  {(stats?.longestStreak || 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded-full bg-white/5 text-white/30 border border-white/5">
                      <TrendingUp className="w-2.5 h-2.5" />Best: {stats?.longestStreak}
                    </span>
                  )}
                </div>
              </div>

              {!loading && <Fire n={stats?.currentStreak || 0} done={stats?.currentShiftComplete || false} />}
            </div>

            {/* Stats strip — sits flush at bottom of header */}
            <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-white/[0.03] -mx-5 sm:-mx-6 px-5 sm:px-6">
              {[
                { val: stats?.totalSubmissions?.toLocaleString() ?? "—", label: "Total",  color: "text-emerald-400", icon: CheckCircle2 },
                { val: String(stats?.currentStreak ?? "—"),              label: "Streak", color: "text-orange-400",  icon: FlameIcon    },
                { val: String(stats?.badges?.length ?? "—"),             label: "Badges", color: "text-violet-400",  icon: Award        },
              ].map(({ val, label, color, icon }) => (
                <StatPill key={label} val={loading ? "…" : val} label={label} color={color} icon={icon} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Quick actions ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ActionBtn href="/dashboard/forms"   icon={FileText}   label="Submit Record"  primary />
          <ActionBtn href="/dashboard/history" icon={History}    label="My History" />
          <ActionBtn href="/dashboard/profile" icon={UserCircle} label="Profile" />
          <ActionBtn
            href={`/api/records/export?userId=${userId}&month=${currentMonth}`}
            icon={Download}
            label="Export Month"
            external
          />
        </div>

        {/* ── Badges + Leaderboard ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">

          {/* Badges */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">My Badges</h3>
                  {stats && <p className="text-[8px] text-slate-400 font-semibold mt-0.5">{stats.badges.length} of {Object.keys(BADGE_META).length} earned</p>}
                </div>
              </div>
              {stats && stats.badges.length > 0 && (
                <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full transition-all duration-700"
                    style={{ width: `${(stats.badges.length / Object.keys(BADGE_META).length) * 100}%` }}
                  />
                </div>
              )}
            </div>

            <div className="p-4">
              {loading && (
                <div className="grid grid-cols-3 gap-2">
                  {[0,1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-50 animate-pulse" />)}
                </div>
              )}
              {!loading && stats?.badges.length === 0 && (
                <div className="py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
                    <Award className="w-7 h-7 text-slate-200" />
                  </div>
                  <p className="text-xs text-slate-500 font-bold">No badges yet</p>
                  <p className="text-[10px] text-slate-300 mt-1">Submit your first record to start earning!</p>
                </div>
              )}
              {!loading && (stats?.badges.length || 0) > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {stats!.badges.map(b => <BadgeCard key={b.badge_type} type={b.badge_type} earnedAt={b.earned_at} />)}
                </div>
              )}

              {/* Locked previews */}
              {!loading && stats && stats.badges.length < Object.keys(BADGE_META).length && (
                <div className="mt-3 pt-3 border-t border-slate-50">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-300 mb-2">Locked</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.entries(BADGE_META)
                      .filter(([t]) => !stats.badges.find(b => b.badge_type === t))
                      .map(([t, m]) => {
                        const Icon = m.icon
                        return (
                          <div
                            key={t}
                            title={`${m.label}: ${m.desc}`}
                            className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center opacity-20 cursor-help hover:opacity-30 transition-opacity"
                          >
                            <Icon className="w-4 h-4 text-slate-400" />
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Leaderboard</h3>
                  <p className="text-[8px] text-slate-400 font-semibold mt-0.5">On-time this week</p>
                </div>
              </div>
              {myRank > 0 && (
                <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">
                  Rank #{myRank}
                </span>
              )}
            </div>

            <div className="p-3">
              {loading && (
                <div className="space-y-1.5">
                  {[0,1,2,3].map(i => <div key={i} className="h-11 rounded-xl bg-slate-50 animate-pulse" />)}
                </div>
              )}
              {!loading && lb.length === 0 && (
                <div className="py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
                    <Trophy className="w-7 h-7 text-slate-200" />
                  </div>
                  <p className="text-xs text-slate-500 font-bold">No data yet this week</p>
                  <p className="text-[10px] text-slate-300 mt-1">Submit on time to appear here!</p>
                </div>
              )}
              {!loading && lb.length > 0 && (
                <div className="space-y-0.5">
                  {lb.slice(0, 8).map((e, i) => (
                    <LRow key={e.team_label} e={e} rank={i + 1} isMe={e.team_label === myTeam} />
                  ))}
                </div>
              )}
              {!loading && myRank > 8 && myTeam && lb[myRank - 1] && (
                <div className="mt-2 pt-2 border-t border-slate-50">
                  <p className="text-[8px] text-slate-300 text-center mb-1 font-bold uppercase tracking-widest">Your team</p>
                  <LRow e={lb[myRank - 1]} rank={myRank} isMe={true} />
                </div>
              )}
            </div>

            <div className="px-5 pb-4">
              <p className="text-[8px] text-slate-300 text-center leading-relaxed">
                Resets every Monday · Mon–Sat · 3-shift schedule
              </p>
            </div>
          </div>
        </div>

        {/* ── Monthly MVP banner — not me ─────────────────────────────── */}
        {!loading && mvp && !mvp.isMe && (
          <button
            onClick={() => setShowMvp(true)}
            className="w-full group bg-white border border-amber-200/60 rounded-2xl px-5 py-4 flex items-center gap-3.5 hover:border-amber-300 hover:shadow-md hover:shadow-amber-100 transition-all text-left active:scale-[0.99]"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <span className="text-xl">👑</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-amber-500">MVP of {mvp.month}</p>
              <p className="text-sm font-black text-slate-800 truncate mt-0.5">{mvp.fullName}</p>
              <p className="text-[10px] text-slate-400 font-medium">{mvp.onTimeCount} on-time shifts</p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        )}

        {/* ── MVP winner banner — is me ────────────────────────────────── */}
        {!loading && mvp?.isMe && (
          <button
            onClick={() => setShowMvp(true)}
            className="w-full group bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 rounded-2xl px-5 py-4 flex items-center gap-3.5 hover:from-amber-500 hover:to-amber-500 transition-all text-left active:scale-[0.99] shadow-md shadow-amber-400/30"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <span className="text-xl">🏆</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-amber-900/70">You are the</p>
              <p className="text-base font-black text-amber-950 mt-0.5">MVP of {mvp.month}!</p>
              <p className="text-[10px] text-amber-800/60 font-medium">{mvp.onTimeCount} on-time shifts completed</p>
            </div>
            <span className="text-lg shrink-0 group-hover:scale-110 transition-transform">🎉</span>
          </button>
        )}

      </div>
    </>
  )
}
