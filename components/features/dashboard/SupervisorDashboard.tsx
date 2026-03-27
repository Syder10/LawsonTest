"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { FileText, UserCircle, Download, History, Trophy, Medal, Star, Zap, Target, Award, CheckCircle2, Clock } from "lucide-react"

// ── Badge definitions ──────────────────────────────────────────────────────
interface BadgeMeta { label: string; desc: string; icon: React.ElementType; color: string; bg: string; ring: string }
const BADGE_META: Record<string, BadgeMeta> = {
  first_submit:      { label: "First Step",     desc: "Submitted your first record",             icon: Star,    color: "text-emerald-600", bg: "bg-emerald-50",  ring: "ring-emerald-200" },
  submissions_100:   { label: "Century",         desc: "100 total submissions",                   icon: Medal,   color: "text-amber-600",   bg: "bg-amber-50",    ring: "ring-amber-200"   },
  submissions_200:   { label: "Double Century",  desc: "200 total submissions",                   icon: Medal,   color: "text-orange-500",  bg: "bg-orange-50",   ring: "ring-orange-200"  },
  submissions_300:   { label: "Triple Crown",    desc: "300 total submissions",                   icon: Trophy,  color: "text-yellow-500",  bg: "bg-yellow-50",   ring: "ring-yellow-200"  },
  submissions_400:   { label: "400 Club",        desc: "400 total submissions",                   icon: Trophy,  color: "text-cyan-600",    bg: "bg-cyan-50",     ring: "ring-cyan-200"    },
  submissions_500:   { label: "Half-K Legend",   desc: "500 total submissions",                   icon: Award,   color: "text-violet-600",  bg: "bg-violet-50",   ring: "ring-violet-200"  },
  submissions_750:   { label: "750 Warrior",     desc: "750 total submissions",                   icon: Award,   color: "text-rose-500",    bg: "bg-rose-50",     ring: "ring-rose-200"    },
  submissions_1000:  { label: "1K Elite",        desc: "1,000 submissions — legendary",           icon: Zap,     color: "text-yellow-400",  bg: "bg-zinc-900",    ring: "ring-yellow-400"  },
  perfect_week:      { label: "Perfect Week",    desc: "All shifts submitted on time for a week", icon: Target,  color: "text-emerald-400", bg: "bg-emerald-900", ring: "ring-emerald-400" },
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
}
interface LEntry { team_label: string; department: string; group_number: number; on_time_count: number; last_submission: string }

// ── Streak flame ───────────────────────────────────────────────────────────
function Flame({ streak, complete }: { streak: number; complete: boolean }) {
  const textSize = streak === 0 ? "text-4xl" : streak < 5 ? "text-5xl" : streak < 15 ? "text-6xl" : "text-7xl"
  const glow     = streak === 0 ? "" : streak < 5 ? "drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]" : streak < 15 ? "drop-shadow-[0_0_16px_rgba(251,146,60,0.75)]" : "drop-shadow-[0_0_28px_rgba(251,146,60,1)]"
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`${textSize} ${glow} transition-all duration-500 select-none ${streak === 0 ? "grayscale opacity-20" : ""}`}>🔥</span>
      <p className={`text-3xl font-black tabular-nums leading-none ${streak === 0 ? "text-slate-200" : "text-orange-500"}`}>{streak}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-200/70">shift streak</p>
      {complete && (
        <span className="flex items-center gap-1 text-[9px] font-black text-emerald-300 bg-emerald-700/50 px-2 py-0.5 rounded-full border border-emerald-600/50">
          <CheckCircle2 className="w-2.5 h-2.5" /> Done
        </span>
      )}
    </div>
  )
}

// ── Badge card ─────────────────────────────────────────────────────────────
function BadgeCard({ type, earnedAt }: { type: string; earnedAt: string }) {
  const m = BADGE_META[type]; if (!m) return null
  const Icon = m.icon
  return (
    <div className={`${m.bg} rounded-2xl ring-2 ${m.ring} p-3 flex flex-col items-center gap-1 text-center`}>
      <Icon className={`w-6 h-6 ${m.color}`} />
      <p className={`text-[9px] font-black uppercase tracking-wider ${m.color} leading-tight`}>{m.label}</p>
      <p className="text-[8px] text-slate-400 leading-tight">{m.desc}</p>
      <p className="text-[8px] text-slate-300">{new Date(earnedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
    </div>
  )
}

// ── Leaderboard row ────────────────────────────────────────────────────────
function LRow({ entry, rank, isMe }: { entry: LEntry; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${isMe ? "bg-emerald-50 border-2 border-emerald-300" : "hover:bg-slate-50"}`}>
      <div className="w-6 text-center shrink-0">
        {medal ? <span className="text-sm">{medal}</span> : <span className="text-[10px] font-black text-slate-300">#{rank}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold truncate ${isMe ? "text-emerald-800" : "text-slate-700"}`}>
          {entry.team_label}
          {isMe && <span className="ml-1 text-[8px] font-black text-emerald-500 uppercase tracking-wider">YOU</span>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-black tabular-nums ${rank <= 3 ? "text-emerald-600" : "text-slate-500"}`}>{entry.on_time_count}</p>
        <p className="text-[8px] text-slate-300 uppercase tracking-wide">on-time</p>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export function SupervisorDashboard({ userId }: { userId: string }) {
  const now          = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [stats, setStats]         = useState<GStats | null>(null)
  const [lb, setLb]               = useState<LEntry[]>([])
  const [loading, setLoading]     = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [sr, lr] = await Promise.all([fetch("/api/gamification/stats"), fetch("/api/gamification/leaderboard")])
      if (sr.ok) setStats(await sr.json())
      if (lr.ok) { const d = await lr.json(); setLb(d.leaderboard || []) }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 5 * 60_000); return () => clearInterval(iv) }, [fetchAll])

  const myTeam = stats?.department && stats?.groupNumber ? `${stats.department} — Group ${stats.groupNumber}` : null
  const myRank = myTeam ? lb.findIndex(e => e.team_label === myTeam) + 1 : 0
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in-up">

      {/* ── Hero header with streak ──────────────────────────────────────── */}
      <div className="rounded-3xl overflow-hidden shadow-sm">
        {/* Green top band */}
        <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-emerald-200 text-[10px] font-black uppercase tracking-widest">{greeting}</p>
              <h2 className="text-white text-xl sm:text-2xl font-black tracking-tight mt-0.5 truncate">
                {loading ? "…" : stats?.fullName || "Supervisor"}
              </h2>
              {stats?.department && (
                <p className="text-emerald-200 text-xs font-semibold mt-0.5">
                  {stats.department}{stats.groupNumber ? ` · Group ${stats.groupNumber}` : ""}
                </p>
              )}
              {stats?.currentShift && (
                <span className={`inline-flex items-center gap-1 mt-2 text-[9px] font-black px-2 py-0.5 rounded-full border ${SHIFT_COLORS[stats.currentShift]}`}>
                  <Clock className="w-2.5 h-2.5" />{stats.currentShift} Shift
                </span>
              )}
            </div>
            {!loading && <Flame streak={stats?.currentStreak || 0} complete={stats?.currentShiftComplete || false} />}
          </div>

          {/* Longest streak note */}
          {(stats?.longestStreak || 0) > 0 && (
            <p className="text-emerald-300/70 text-[9px] mt-2 font-semibold">Personal best: {stats?.longestStreak} shifts</p>
          )}
        </div>

        {/* Stats strip */}
        <div className="bg-white border-x border-b border-slate-100 grid grid-cols-3 divide-x divide-slate-100">
          {[
            { val: stats?.totalSubmissions?.toLocaleString() ?? "—", label: "Submissions", color: "text-emerald-700" },
            { val: String(stats?.currentStreak ?? "—"),              label: "Streak",      color: "text-orange-500" },
            { val: String(stats?.badges?.length ?? "—"),             label: "Badges",      color: "text-violet-500" },
          ].map(({ val, label, color }) => (
            <div key={label} className="py-3 text-center">
              <p className={`text-lg font-black tabular-nums ${color}`}>{loading ? "…" : val}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: "/dashboard/forms",   icon: FileText,   label: "Submit",  sub: "Fill today's records",  bg: "bg-emerald-600 text-white hover:bg-emerald-700", card: "" },
          { href: "/dashboard/history", icon: History,    label: "History", sub: "View past records",      bg: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200", card: "" },
          { href: "/dashboard/profile", icon: UserCircle, label: "Profile", sub: "Settings & password",    bg: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200", card: "" },
          { href: `/api/records/export?userId=${userId}&month=${currentMonth}`, icon: Download, label: "Export", sub: "This month's data", bg: "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200", external: true },
        ].map(({ href, icon: Icon, label, sub, bg, external }) =>
          external ? (
            <a key={label} href={href} className={`${bg} rounded-2xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-all`}>
              <Icon className="w-5 h-5 opacity-70" /><p className="text-sm font-bold leading-tight">{label}</p>
              <p className="text-[10px] opacity-60 hidden sm:block">{sub}</p>
            </a>
          ) : (
            <Link key={label} href={href} className={`${bg} rounded-2xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-all`}>
              <Icon className="w-5 h-5 opacity-70" /><p className="text-sm font-bold leading-tight">{label}</p>
              <p className="text-[10px] opacity-60 hidden sm:block">{sub}</p>
            </Link>
          )
        )}
      </div>

      {/* ── Badges + Leaderboard ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

        {/* Badges panel */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">My Badges</h3>
            </div>
            {stats && <span className="text-[9px] font-bold text-slate-400">{stats.badges.length}/{Object.keys(BADGE_META).length}</span>}
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

        {/* Leaderboard panel */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-700">Weekly Leaderboard</h3>
            </div>
            <span className="text-[9px] font-bold text-slate-400">On-time submissions</span>
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
                {lb.slice(0, 8).map((e, i) => <LRow key={e.team_label} entry={e} rank={i+1} isMe={e.team_label === myTeam} />)}
              </div>
            )}

            {/* Show my rank if outside top 8 */}
            {!loading && myRank > 8 && myTeam && lb[myRank - 1] && (
              <div className="mt-2 pt-2 border-t border-slate-50">
                <p className="text-[8px] text-slate-300 text-center mb-1 font-bold uppercase tracking-widest">Your team</p>
                <LRow entry={lb[myRank - 1]} rank={myRank} isMe={true} />
              </div>
            )}
          </div>

          <div className="px-4 pb-3">
            <p className="text-[8px] text-slate-300 text-center">Resets every Monday · Based on 3-shift schedule (6–2–9–5)</p>
          </div>
        </div>
      </div>

    </div>
  )
}
