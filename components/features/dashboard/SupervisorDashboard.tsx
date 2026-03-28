"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  FileText, UserCircle, Download, History,
  Trophy, Medal, Star, Zap, Target, Award,
  CheckCircle2, Clock, Moon, Sunrise, Shuffle, Flame as FlameIcon,
  X, ChevronRight
} from "lucide-react"

// ── Badge catalogue ────────────────────────────────────────────────────────
interface BadgeMeta { label: string; desc: string; icon: React.ElementType; color: string; bg: string; border: string }

const BADGE_META: Record<string, BadgeMeta> = {
  first_submit:      { label: "First Step",       desc: "Your very first submission",              icon: Star,      color: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-100" },
  submissions_50:    { label: "Warm Up",          desc: "50 submissions",                          icon: Star,      color: "text-teal-600",    bg: "bg-teal-50",     border: "border-teal-100"    },
  submissions_100:   { label: "Century",          desc: "100 submissions",                         icon: Medal,     color: "text-amber-600",   bg: "bg-amber-50",    border: "border-amber-100"   },
  submissions_200:   { label: "Double Century",   desc: "200 submissions",                         icon: Medal,     color: "text-orange-600",  bg: "bg-orange-50",   border: "border-orange-100"  },
  submissions_300:   { label: "Triple Crown",     desc: "300 submissions",                         icon: Trophy,    color: "text-yellow-600",  bg: "bg-yellow-50",   border: "border-yellow-100"  },
  submissions_400:   { label: "400 Club",         desc: "400 submissions",                         icon: Trophy,    color: "text-cyan-600",    bg: "bg-cyan-50",     border: "border-cyan-100"    },
  submissions_500:   { label: "Half-K Legend",    desc: "500 submissions",                         icon: Award,     color: "text-violet-600",  bg: "bg-violet-50",   border: "border-violet-100"  },
  submissions_750:   { label: "750 Warrior",      desc: "750 submissions",                         icon: Award,     color: "text-rose-600",    bg: "bg-rose-50",     border: "border-rose-100"    },
  submissions_1000:  { label: "1K Elite",         desc: "1,000 submissions",                       icon: Zap,       color: "text-yellow-500",  bg: "bg-slate-900",   border: "border-slate-800"  },
  submissions_1500:  { label: "1.5K Master",      desc: "1,500 submissions",                       icon: Zap,       color: "text-purple-400",  bg: "bg-slate-900",   border: "border-slate-800"  },
  submissions_2000:  { label: "2K Immortal",      desc: "2,000 submissions — hall of fame",        icon: Zap,       color: "text-red-400",     bg: "bg-slate-900",   border: "border-slate-800"      },
  streak_5:          { label: "On a Roll",        desc: "5-shift streak",                          icon: FlameIcon, color: "text-orange-600",  bg: "bg-orange-50",   border: "border-orange-100"  },
  streak_10:         { label: "Unstoppable",      desc: "10-shift streak",                         icon: FlameIcon, color: "text-orange-600",  bg: "bg-orange-100",  border: "border-orange-200"  },
  streak_20:         { label: "Machine",          desc: "20-shift streak",                         icon: FlameIcon, color: "text-red-600",     bg: "bg-red-50",      border: "border-red-100"      },
  streak_30:         { label: "Iron Will",        desc: "30-shift streak",                         icon: FlameIcon, color: "text-red-600",     bg: "bg-red-100",     border: "border-red-200"      },
  streak_50:         { label: "Legendary Run",    desc: "50-shift streak",                         icon: FlameIcon, color: "text-rose-600",    bg: "bg-rose-100",    border: "border-rose-200"    },
  streak_100:        { label: "Eternal Flame",    desc: "100-shift streak — extraordinary",        icon: FlameIcon, color: "text-yellow-400",  bg: "bg-slate-900",   border: "border-slate-800"  },
  perfect_week:      { label: "Perfect Week",     desc: "All shifts on time for a full week",      icon: Target,    color: "text-emerald-600", bg: "bg-emerald-50",  border: "border-emerald-100" },
  night_owl:         { label: "Night Owl",        desc: "Submitted a Night shift on time",         icon: Moon,      color: "text-indigo-600",  bg: "bg-indigo-50",   border: "border-indigo-100"  },
  early_bird:        { label: "Early Bird",       desc: "Submitted before 8am on a Morning shift", icon: Sunrise,   color: "text-amber-600",   bg: "bg-amber-50",    border: "border-amber-100"   },
  all_rounder:       { label: "All-Rounder",      desc: "Submitted on all 3 shift types",          icon: Shuffle,   color: "text-teal-600",    bg: "bg-teal-50",     border: "border-teal-100"    },
}

const SHIFT_COLORS: Record<string, string> = {
  Morning:   "bg-amber-50 text-amber-700 border-amber-200",
  Afternoon: "bg-blue-50 text-blue-700 border-blue-200",
  Night:     "bg-indigo-50 text-indigo-700 border-indigo-200",
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
  const isZero = n === 0;
  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-2xl min-w-[100px] shadow-sm">
      <div className="relative">
        <span className={`text-4xl select-none transition-all duration-300 ${isZero ? "grayscale opacity-30" : "scale-110"}`}>🔥</span>
        {done && (
          <div className="absolute -bottom-1 -right-2 bg-white rounded-full p-0.5 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
        )}
      </div>
      <p className={`text-2xl font-black mt-1 tracking-tight ${isZero ? "text-slate-300" : "text-slate-900"}`}>{n}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Streak</p>
    </div>
  )
}

// ── Badge card ─────────────────────────────────────────────────────────────
function BadgeCard({ type, earnedAt }: { type: string; earnedAt: string }) {
  const m = BADGE_META[type]
  if (!m) return null
  const Icon = m.icon
  return (
    <div className={`flex flex-col items-center justify-center p-4 rounded-2xl border ${m.bg} ${m.border} transition-all hover:scale-[1.02]`}>
      <Icon className={`w-6 h-6 ${m.color} mb-2`} />
      <p className={`text-[10px] font-black uppercase tracking-wider text-center leading-tight ${m.color}`}>{m.label}</p>
      <p className="text-[9px] text-slate-500 font-medium text-center mt-1 leading-snug line-clamp-2">{m.desc}</p>
    </div>
  )
}

// ── Leaderboard row ────────────────────────────────────────────────────────
function LRow({ e, rank, isMe }: { e: LEntry; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null
  return (
    <div className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${isMe ? "bg-emerald-50 border-emerald-200" : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-100"} transition-colors`}>
      <div className="w-6 flex justify-center items-center shrink-0">
        {medal ? <span className="text-lg">{medal}</span> : <span className="text-xs font-bold text-slate-400">{rank}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold truncate ${isMe ? "text-emerald-900" : "text-slate-900"}`}>
          {e.team_label} {isMe && <span className="ml-1 text-[10px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-md uppercase">You</span>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-base font-black tracking-tight ${isMe ? "text-emerald-700" : "text-slate-700"}`}>{e.on_time_count}</p>
      </div>
    </div>
  )
}

// ── MVP Modal ──────────────────────────────────────────────────────────────
function MVPModal({ mvp, onClose }: { mvp: MVPData; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        <div className="p-8 text-center bg-gradient-to-b from-amber-50 to-white">
          <span className="text-6xl block mb-4 drop-shadow-sm">👑</span>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">{mvp.month} MVP</p>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{mvp.fullName}</h2>
          {mvp.department && (
            <p className="text-sm font-medium text-slate-500 mt-1">{mvp.department} {mvp.groupNumber ? `· Group ${mvp.groupNumber}` : ""}</p>
          )}
        </div>
        <div className="px-8 pb-8 text-center space-y-6">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <p className="text-4xl font-black text-slate-900 tracking-tight">{mvp.onTimeCount}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">On-Time Shifts</p>
          </div>
          {mvp.isMe ? (
            <p className="text-sm font-bold text-emerald-600">🎉 Outstanding work! You earned this.</p>
          ) : (
            <p className="text-sm font-medium text-slate-500">Keep it up—you could be next! 💪</p>
          )}
          <button onClick={onClose} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold transition-colors">
            Continue to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export function SupervisorDashboard({ userId }: { userId: string }) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [stats, setStats] = useState<GStats | null>(null)
  const [lb, setLb] = useState<LEntry[]>([])
  const [mvp, setMvp] = useState<MVPData | null>(null)
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
    <div className="min-h-screen bg-slate-50/50 pb-20 font-sans text-slate-900">
      {showMvp && mvp && <MVPModal mvp={mvp} onClose={() => setShowMvp(false)} />}

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* ── Hero header ──────────────────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="space-y-2 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{greeting}</p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              {loading ? <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" /> : (stats?.fullName || "Supervisor")}
            </h1>
            
            {!loading && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {stats?.department && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wide">
                    {stats.department}{stats.groupNumber ? ` · Group ${stats.groupNumber}` : ""}
                  </span>
                )}
                {stats?.currentShift && !stats?.dayOff && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wide ${SHIFT_COLORS[stats.currentShift]}`}>
                    <Clock className="w-3 h-3" /> {stats.currentShift}
                  </span>
                )}
                {stats?.dayOff && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
                    🌴 {new Date().getUTCDay() === 0 ? "Sunday" : "Saturday Off"}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0">
            {loading ? <div className="w-[100px] h-[100px] bg-slate-100 rounded-2xl animate-pulse" /> : <Fire n={stats?.currentStreak || 0} done={stats?.currentShiftComplete || false} />}
          </div>
        </header>

        {/* ── Quick Stats & Actions ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Link href="/dashboard/forms" className="col-span-2 md:col-span-1 flex flex-col items-center justify-center p-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl shadow-sm transition-colors group">
            <FileText className="w-6 h-6 mb-2 opacity-90 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-bold">New Entry</span>
          </Link>
          
          <div className="flex flex-col justify-center p-4 bg-white border border-slate-200 rounded-2xl text-center shadow-sm">
            <p className="text-2xl font-black text-slate-900">{loading ? "—" : stats?.totalSubmissions?.toLocaleString()}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total</p>
          </div>
          
          <div className="flex flex-col justify-center p-4 bg-white border border-slate-200 rounded-2xl text-center shadow-sm">
            <p className="text-2xl font-black text-slate-900">{loading ? "—" : stats?.badges?.length || 0}</p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Badges</p>
          </div>

          <Link href="/dashboard/history" className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 hover:bg-slate-50 rounded-2xl text-slate-700 shadow-sm transition-colors">
            <History className="w-5 h-5 mb-2 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wide">History</span>
          </Link>
        </div>

        {/* ── MVP Banners ─────────────────────────────────────── */}
        {!loading && mvp && (
          <div className={`p-5 rounded-2xl border flex items-center gap-4 ${mvp.isMe ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200 shadow-sm"}`}>
            <span className="text-4xl">{mvp.isMe ? "🏆" : "👑"}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-widest ${mvp.isMe ? "text-amber-600" : "text-slate-400"}`}>
                {mvp.isMe ? "You are the MVP!" : `MVP of ${mvp.month}`}
              </p>
              <p className="text-base font-black tracking-tight text-slate-900 truncate">
                {mvp.isMe ? `Incredible work this month.` : mvp.fullName}
              </p>
            </div>
            <button onClick={() => setShowMvp(true)} className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${mvp.isMe ? "bg-amber-200 text-amber-800 hover:bg-amber-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              View
            </button>
          </div>
        )}

        {/* ── Main Content Grid ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          
          {/* Leaderboard */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight">Leaderboard</h3>
                <p className="text-[10px] font-medium text-slate-500 mt-0.5">Top teams this week</p>
              </div>
              <Trophy className="w-5 h-5 text-slate-300" />
            </div>
            
            <div className="p-2 flex-1">
              {loading ? (
                <div className="space-y-2 p-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-slate-50 rounded-xl animate-pulse" />)}</div>
              ) : lb.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                    <Trophy className="w-5 h-5 text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-600">No rankings yet</p>
                  <p className="text-xs text-slate-400 mt-1">Submit your first on-time shift to appear here.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {lb.slice(0, 6).map((e, i) => <LRow key={e.team_label} e={e} rank={i + 1} isMe={e.team_label === myTeam} />)}
                  
                  {myRank > 6 && myTeam && lb[myRank - 1] && (
                    <>
                      <div className="mx-4 my-2 border-t border-slate-100" />
                      <LRow e={lb[myRank - 1]} rank={myRank} isMe={true} />
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Badges */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight">Achievements</h3>
                <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                  {stats ? `${stats.badges.length} Unlocked` : 'Loading...'}
                </p>
              </div>
              <Award className="w-5 h-5 text-slate-300" />
            </div>
            
            <div className="p-6 flex-1">
              {loading ? (
                <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <div key={i} className="h-28 bg-slate-50 rounded-2xl animate-pulse" />)}</div>
              ) : stats?.badges.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                    <Star className="w-5 h-5 text-slate-300" />
                  </div>
                  <p className="text-sm font-bold text-slate-600">No badges yet</p>
                  <p className="text-xs text-slate-400 mt-1">Complete shifts to start earning.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {stats!.badges.map(b => <BadgeCard key={b.badge_type} type={b.badge_type} earnedAt={b.earned_at} />)}
                </div>
              )}
            </div>
          </section>

        </div>

        {/* ── Footer Actions ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link href="/dashboard/profile" className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
            <UserCircle className="w-4 h-4" /> Account Settings
          </Link>
          <a href={`/api/records/export?userId=${userId}&month=${currentMonth}`} className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
            <Download className="w-4 h-4" /> Export Data
          </a>
        </div>

      </div>
    </div>
  )
}
