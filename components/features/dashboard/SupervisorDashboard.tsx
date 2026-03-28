"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  FileText, UserCircle, Download, History,
  Trophy, Medal, Star, Zap, Target, Award,
  CheckCircle2, Clock, Moon, Sunrise, Shuffle, Flame as FlameIcon,
  X,
} from "lucide-react"

// ── Badge catalogue ────────────────────────────────────────────────────────
interface BadgeMeta { label: string; desc: string; icon: React.ElementType; color: string; bg: string; ring: string }

const BADGE_META: Record<string, BadgeMeta> = {
  // Submission milestones
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
  // Streak milestones
  streak_5:          { label: "On a Roll",         desc: "5-shift streak",                          icon: FlameIcon, color: "text-orange-500",  bg: "bg-orange-50",   ring: "ring-orange-200"  },
  streak_10:         { label: "Unstoppable",       desc: "10-shift streak",                         icon: FlameIcon, color: "text-orange-600",  bg: "bg-orange-100",  ring: "ring-orange-300"  },
  streak_20:         { label: "Machine",           desc: "20-shift streak",                         icon: FlameIcon, color: "text-red-500",     bg: "bg-red-50",      ring: "ring-red-200"     },
  streak_30:         { label: "Iron Will",         desc: "30-shift streak",                         icon: FlameIcon, color: "text-red-600",     bg: "bg-red-100",     ring: "ring-red-300"     },
  streak_50:         { label: "Legendary Run",     desc: "50-shift streak",                         icon: FlameIcon, color: "text-rose-500",    bg: "bg-rose-900",    ring: "ring-rose-400"    },
  streak_100:        { label: "The Eternal Flame", desc: "100-shift streak — extraordinary",        icon: FlameIcon, color: "text-yellow-300",  bg: "bg-zinc-900",    ring: "ring-yellow-300"  },
  // Special
  perfect_week:      { label: "Perfect Week",      desc: "All shifts on time for a full week",      icon: Target,    color: "text-emerald-400", bg: "bg-emerald-900", ring: "ring-emerald-400" },
  night_owl:         { label: "Night Owl",         desc: "Submitted a Night shift on time",         icon: Moon,      color: "text-indigo-400",  bg: "bg-indigo-900",  ring: "ring-indigo-400"  },
  early_bird:        { label: "Early Bird",        desc: "Submitted before 8am on a Morning shift", icon: Sunrise,   color: "text-amber-400",   bg: "bg-amber-50",    ring: "ring-amber-300"   },
  all_rounder:       { label: "All-Rounder",       desc: "Submitted on all 3 shift types",          icon: Shuffle,   color: "text-teal-500",    bg: "bg-teal-50",     ring: "ring-teal-200"    },
}

const SHIFT_COLORS: Record<string, string> = {
  Morning:   "bg-amber-100 text-amber-700 border-amber-200",
  Afternoon: "bg-blue-100 text-blue-700 border-blue-200",
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

// ── Streak fire ────────────────────────────────────────────────────────────
function Fire({ n, done }: { n: number; done: boolean }) {
  const sz   = n === 0 ? "text-4xl" : n < 5 ? "text-5xl" : n < 20 ? "text-6xl" : "text-7xl"
  const glow = n === 0 ? "" : n < 5 ? "drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" : n < 20 ? "drop-shadow-[0_0_18px_rgba(251,146,60,0.8)]" : "drop-shadow-[0_0_30px_rgba(251,146,60,1)]"
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`${sz} ${glow} select-none transition-all duration-500 ${n === 0 ? "grayscale opacity-20" : ""}`}>🔥</span>
      <p className={`text-3xl font-black tabular-nums leading-none ${n === 0 ? "text-slate-200" : "text-orange-500"}`}>{n}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-200/60">shift streak</p>
      {done && <span className="mt-1 flex items-center gap-1 text-[9px] font-black text-emerald-300 bg-emerald-700/40 px-2 py-0.5 rounded-full border border-emerald-600/40"><CheckCircle2 className="w-2.5 h-2.5" />Done</span>}
    </div>
  )
}

// ── Badge card ─────────────────────────────────────────────────────────────
function BadgeCard({ type, earnedAt }: { type: string; earnedAt: string }) {
  const m = BADGE_META[type]
  if (!m) return null
  const Icon = m.icon
  return (
    <div className={`${m.bg} rounded-2xl ring-2 ${m.ring} p-3 flex flex-col items-center gap-1 text-center group relative`}>
      <Icon className={`w-6 h-6 ${m.color} shrink-0`} />
      <p className={`text-[9px] font-black uppercase tracking-wider ${m.color} leading-tight`}>{m.label}</p>
      <p className="text-[8px] text-slate-400 leading-tight">{m.desc}</p>
      <p className="text-[8px] text-slate-300">{new Date(earnedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
    </div>
  )
}

// ── Leaderboard row ────────────────────────────────────────────────────────
function LRow({ e, rank, isMe }: { e: LEntry; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isMe ? "bg-emerald-50 border-2 border-emerald-300" : "hover:bg-slate-50"} transition-colors`}>
      <div className="w-6 text-center shrink-0">
        {medal ? <span className="text-sm">{medal}</span> : <span className="text-[10px] font-black text-slate-300">#{rank}</span>}
      </div>
      <p className={`text-xs font-bold flex-1 truncate ${isMe ? "text-emerald-800" : "text-slate-700"}`}>
        {e.team_label}{isMe && <span className="ml-1 text-[8px] font-black text-emerald-500 uppercase tracking-wider">YOU</span>}
      </p>
      <div className="text-right shrink-0">
        <p className={`text-sm font-black tabular-nums ${rank <= 3 ? "text-emerald-600" : "text-slate-500"}`}>{e.on_time_count}</p>
        <p className="text-[8px] text-slate-300 uppercase tracking-wide">on-time</p>
      </div>
    </div>
  )
}

// ── MVP Modal ──────────────────────────────────────────────────────────────
function MVPModal({ mvp, onClose }: { mvp: MVPData; onClose: () => void }) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start   = Date.now()
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

      {/* Confetti */}
      {["🏆","🎉","✨","⭐","🌟","💚","🎊","👑","🥇","💯","🔥","🎖️"].map((e, i) => (
        <span key={i} className="mvp-piece" style={{ left: `${Math.random() * 100}%`, animationDelay: `${i * 0.12}s`, animationDuration: `${2.5 + Math.random()}s` }}>{e}</span>
      ))}

      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="mvp-card bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>

          {/* Gold header */}
          <div className="bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 px-6 pt-8 pb-6 text-center">
            <div className="text-6xl mb-3 drop-shadow-lg">👑</div>
            <p className="text-amber-900 text-[10px] font-black uppercase tracking-[0.2em]">{mvp.month}</p>
            <h2 className="text-amber-950 text-2xl font-black tracking-tight mt-1">MVP of the Month</h2>
          </div>

          {/* Winner */}
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
              <p className="text-xs text-slate-400 font-semibold">
                Keep it up — you could be next month's MVP! 💪
              </p>
            )}
          </div>

          {/* Progress bar + close */}
          <div className="px-6 pb-5 space-y-3">
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-none"
                style={{ width: `${progress}%` }}
              />
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

// ── Main ───────────────────────────────────────────────────────────────────
export function SupervisorDashboard({ userId }: { userId: string }) {
  const now          = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [stats, setStats]     = useState<GStats | null>(null)
  const [lb, setLb]           = useState<LEntry[]>([])
  const [mvp, setMvp]         = useState<MVPData | null>(null)
  const [showMvp, setShowMvp] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [sr, lr, mr] = await Promise.all([
        fetch("/api/gamification/stats"),
        fetch("/api/gamification/leaderboard"),
        fetch("/api/gamification/mvp"),
      ])
      if (sr.ok) setStats(await sr.json())
      if (lr.ok) { const d = await lr.json(); setLb(d.leaderboard || []) }
      if (mr.ok) {
        const d = await mr.json()
        if (d.mvp) {
            setMvp(d.mvp)
            // Pop-up only shows on the last day of the month (API sets showPopup=true)
            // and only once per session
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

  const myTeam = stats?.department && stats?.groupNumber ? `${stats.department} — Group ${stats.groupNumber}` : null
  const myRank = myTeam ? lb.findIndex(e => e.team_label === myTeam) + 1 : 0
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening"

  return (
    <>
      {/* MVP pop-up */}
      {showMvp && mvp && <MVPModal mvp={mvp} onClose={() => setShowMvp(false)} />}

      <div className="space-y-4 sm:space-y-5 animate-fade-in-up">

        {/* ── Hero header ──────────────────────────────────────────────── */}
        <div className="rounded-3xl overflow-hidden shadow-sm">
          <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-emerald-200 text-[10px] font-black uppercase tracking-widest">{greeting}</p>
                <h2 className="text-white text-xl sm:text-2xl font-black tracking-tight mt-0.5 truncate">
                  {loading ? "…" : stats?.fullName || "Supervisor"}
                </h2>
                {stats?.department && (
                  <p className="text-emerald-200 text-xs font-semibold mt-0.5">
                    {stats.department}{stats.groupNumber ? ` · Group ${stats.groupNumber}` : ""}
                  </p>
                )}
                {stats?.currentShift && !stats?.dayOff && (
                  <span className={`inline-flex items-center gap-1 mt-2 text-[9px] font-black px-2 py-0.5 rounded-full border ${SHIFT_COLORS[stats.currentShift]}`}>
                    <Clock className="w-2.5 h-2.5" />{stats.currentShift} Shift
                  </span>
                )}
                {stats?.dayOff && (
                  <span className="inline-flex items-center gap-1 mt-2 text-[9px] font-black px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
                    {new Date().getUTCDay() === 0 ? "🌴 Sunday — rest day" : "🌴 Saturday off (Night rotation)"}
                  </span>
                )}
                {(stats?.longestStreak || 0) > 0 && (
                  <p className="text-emerald-300/60 text-[9px] mt-2 font-semibold">Personal best: {stats?.longestStreak} shifts</p>
                )}
              </div>
              {!loading && <Fire n={stats?.currentStreak || 0} done={stats?.currentShiftComplete || false} />}
            </div>
          </div>

          {/* Stats strip */}
          <div className="bg-white border-x border-b border-slate-100 grid grid-cols-3 divide-x divide-slate-100">
            {[
              { val: stats?.totalSubmissions?.toLocaleString() ?? "—", label: "Total", color: "text-emerald-700" },
              { val: String(stats?.currentStreak ?? "—"),              label: "Streak", color: "text-orange-500" },
              { val: String(stats?.badges?.length ?? "—"),             label: "Badges", color: "text-violet-500" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-3 text-center">
                <p className={`text-lg font-black tabular-nums ${color}`}>{loading ? "…" : val}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick actions ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/dashboard/forms",   icon: FileText,   label: "Submit",  bg: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20" },
            { href: "/dashboard/history", icon: History,    label: "History", bg: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200" },
            { href: "/dashboard/profile", icon: UserCircle, label: "Profile", bg: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200" },
            { href: `/api/records/export?userId=${userId}&month=${currentMonth}`, icon: Download, label: "Export", bg: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200", external: true },
          ].map(({ href, icon: Icon, label, bg, external }) =>
            external ? (
              <a key={label} href={href} className={`${bg} rounded-2xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-all`}>
                <Icon className="w-5 h-5 opacity-70" /><p className="text-sm font-bold">{label}</p>
              </a>
            ) : (
              <Link key={label} href={href} className={`${bg} rounded-2xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-all`}>
                <Icon className="w-5 h-5 opacity-70" /><p className="text-sm font-bold">{label}</p>
              </Link>
            )
          )}
        </div>

        {/* ── Badges + Leaderboard ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

          {/* Badges */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">My Badges</h3>
              </div>
              {stats && <span className="text-[9px] font-bold text-slate-400">{stats.badges.length} / {Object.keys(BADGE_META).length}</span>}
            </div>
            <div className="p-4">
              {loading && <div className="grid grid-cols-3 gap-2">{[0,1,2].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-50 animate-pulse" />)}</div>}
              {!loading && stats?.badges.length === 0 && (
                <div className="py-8 text-center">
                  <span className="text-5xl block mb-2 grayscale opacity-20">🏅</span>
                  <p className="text-xs text-slate-400 font-bold">No badges yet</p>
                  <p className="text-[10px] text-slate-300 mt-1">Submit your first record to start!</p>
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
                        return <div key={t} title={`${m.label}: ${m.desc}`} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center opacity-25 cursor-help"><Icon className="w-4 h-4 text-slate-400" /></div>
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Weekly Leaderboard</h3>
              </div>
              <span className="text-[9px] font-bold text-slate-400">On-time this week</span>
            </div>
            <div className="p-3">
              {loading && <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-11 rounded-xl bg-slate-50 animate-pulse" />)}</div>}
              {!loading && lb.length === 0 && (
                <div className="py-10 text-center">
                  <Trophy className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-bold">No data yet this week</p>
                  <p className="text-[10px] text-slate-300 mt-1">Submit on time to appear here!</p>
                </div>
              )}
              {!loading && lb.length > 0 && (
                <div className="space-y-0.5">
                  {lb.slice(0, 8).map((e, i) => <LRow key={e.team_label} e={e} rank={i + 1} isMe={e.team_label === myTeam} />)}
                </div>
              )}
              {!loading && myRank > 8 && myTeam && lb[myRank - 1] && (
                <div className="mt-2 pt-2 border-t border-slate-50">
                  <p className="text-[8px] text-slate-300 text-center mb-1 font-bold uppercase tracking-widest">Your team</p>
                  <LRow e={lb[myRank - 1]} rank={myRank} isMe={true} />
                </div>
              )}
            </div>
            <div className="px-4 pb-3">
              <p className="text-[8px] text-slate-300 text-center">Resets every Monday · Rankings shown Mon–Sat · 3-shift schedule</p>
            </div>
          </div>
        </div>

        {/* Monthly MVP banner — last day of month + first 5 days of next month */}
        {!loading && mvp && !mvp.isMe && (
          <button
            onClick={() => setShowMvp(true)}
            className="w-full bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-3 hover:border-amber-300 transition-all text-left active:scale-[0.99]"
          >
            <span className="text-3xl">👑</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-amber-600">MVP of {mvp.month}</p>
              <p className="text-sm font-black text-slate-800 truncate">{mvp.fullName}</p>
              <p className="text-[10px] text-amber-600/70 font-semibold">{mvp.onTimeCount} on-time shifts completed</p>
            </div>
            <span className="text-[10px] font-bold text-amber-500 shrink-0">View →</span>
          </button>
        )}

        {/* MVP winner banner */}
        {!loading && mvp?.isMe && (
          <button
            onClick={() => setShowMvp(true)}
            className="w-full bg-gradient-to-r from-amber-400 to-yellow-400 rounded-2xl px-5 py-4 flex items-center gap-3 hover:from-amber-500 hover:to-yellow-500 transition-all text-left active:scale-[0.99] shadow-sm shadow-amber-400/30"
          >
            <span className="text-3xl">🏆</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-900">You are the</p>
              <p className="text-base font-black text-amber-950">MVP of {mvp.month}!</p>
              <p className="text-[10px] text-amber-800/70 font-semibold">{mvp.onTimeCount} on-time shifts</p>
            </div>
            <span className="text-[10px] font-bold text-amber-800 shrink-0">🎉</span>
          </button>
        )}

      </div>
    </>
  )
}
