"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { FileText, UserCircle, Download, History, Trophy, Award, CheckCircle2, Clock, Flame as FlameIcon, ChevronRight, TrendingUp, CalendarClock } from "lucide-react"
import { ON_TIME_WINDOW_LABEL } from "@/lib/shift-config"
import { ActionBtn } from "@/components/features/shared/action-btn"
import { BADGE_META, BadgeCard } from "./supervisor/badge-catalogue"
import { ShiftCountdown, Fire, StatPill, LRow, MVPModal, SHIFT_COLORS, type GStats, type LEntry, type MVPData } from "./supervisor/widgets"

// Supervisor home: streak, badges, weekly team leaderboard, monthly MVP.
// Orchestrator only — widgets live under ./supervisor/*.
export function SupervisorDashboard({ userId }: { userId: string }) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [stats, setStats] = useState<GStats | null>(null)
  const [lb, setLb] = useState<LEntry[]>([])
  const [mvp, setMvp] = useState<MVPData | null>(null)
  const [showMvp, setShowMvp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [gapCount, setGapCount] = useState(0)

  const fetchAll = useCallback(async () => {
    try {
      const [sr, lr, mr, gr] = await Promise.all([
        fetch("/api/gamification/stats"),
        fetch("/api/gamification/leaderboard"),
        fetch("/api/gamification/mvp"),
        fetch("/api/records/gaps"),
      ])
      if (sr.ok) setStats(await sr.json())
      if (lr.ok) setLb((await lr.json()).leaderboard || [])
      if (gr.ok) setGapCount((await gr.json()).count ?? 0)
      if (mr.ok) {
        const d = await mr.json()
        if (d.mvp) {
          setMvp(d.mvp)
          if (d.mvp.showPopup) {
            const seenKey = `mvp_popup_seen_${d.mvp.month.replace(/\s/g, "_")}`
            try {
              if (!localStorage.getItem(seenKey)) { setShowMvp(true); localStorage.setItem(seenKey, "1") }
            } catch { /* localStorage blocked */ }
          }
        }
      }
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 5 * 60_000)
    return () => clearInterval(iv)
  }, [fetchAll])

  const myTeam = stats?.department && stats?.groupNumber ? `${stats.department} — Group ${stats.groupNumber}` : null
  const myRank = myTeam ? lb.findIndex((e) => e.team_label === myTeam) + 1 : 0
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const displayShift = stats?.assignedShift ?? stats?.currentShift ?? null
  const badgeTotal = Object.keys(BADGE_META).length

  return (
    <>
      {showMvp && mvp && <MVPModal mvp={mvp} onClose={() => setShowMvp(false)} />}

      <div className="space-y-3 sm:space-y-4 animate-fade-in-up">
        {/* Hero */}
        <div className="rounded-3xl overflow-hidden shadow-lg shadow-emerald-900/10">
          <div className="bg-gradient-to-br from-slate-900 via-emerald-950 to-emerald-900 px-5 pt-6 pb-0 sm:px-6">
            <div className="flex items-start justify-between gap-4 pb-5">
              <div className="flex-1 min-w-0">
                <p className="text-emerald-400/70 text-[9px] font-black uppercase tracking-[0.2em]">{greeting}</p>
                <h2 className="text-white text-xl sm:text-2xl font-black tracking-tight mt-0.5 truncate">
                  {loading ? <span className="inline-block h-7 w-36 bg-white/10 rounded-lg animate-pulse" /> : stats?.fullName || "Supervisor"}
                </h2>
                {stats?.department && (
                  <p className="text-emerald-400/60 text-xs font-medium mt-0.5">{stats.department}{stats.groupNumber ? ` · Group ${stats.groupNumber}` : ""}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  {displayShift && !stats?.dayOff && (
                    <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border ${SHIFT_COLORS[displayShift]}`}>
                      <Clock className="w-2.5 h-2.5" />{displayShift} Shift
                    </span>
                  )}
                  {stats?.dayOff && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border bg-white/5 text-white/50 border-white/10">
                      {new Date().getUTCDay() === 0 ? "🌴 Sunday rest day" : "🌴 Saturday off"}
                    </span>
                  )}
                  {!loading && stats?.noCompulsory && !stats?.dayOff && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border bg-white/5 text-white/50 border-white/10">
                      ✅ No required submission this shift
                    </span>
                  )}
                  {!loading && stats?.onTimeWindow && !stats?.dayOff && !stats?.noCompulsory && (
                    <ShiftCountdown onTimeWindow={stats.onTimeWindow} shiftComplete={stats.currentShiftComplete} />
                  )}
                  {(stats?.longestStreak || 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded-full bg-white/5 text-white/30 border border-white/5">
                      <TrendingUp className="w-2.5 h-2.5" />Best: {stats?.longestStreak}
                    </span>
                  )}
                </div>
                {!loading && displayShift && !stats?.dayOff && !stats?.noCompulsory && (
                  <p className="text-[9px] text-white/25 font-semibold mt-1.5">On-time window: {ON_TIME_WINDOW_LABEL[displayShift]}</p>
                )}
              </div>
              {!loading && <Fire n={stats?.currentStreak || 0} done={stats?.currentShiftComplete || false} />}
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-white/5 bg-white/[0.03] -mx-5 sm:-mx-6 px-5 sm:px-6">
              {[
                { val: stats?.totalSubmissions?.toLocaleString() ?? "—", label: "Total", color: "text-emerald-400", icon: CheckCircle2 },
                { val: String(stats?.currentStreak ?? "—"), label: "Streak", color: "text-orange-400", icon: FlameIcon },
                { val: String(stats?.badges?.length ?? "—"), label: "Badges", color: "text-violet-400", icon: Award },
              ].map(({ val, label, color, icon }) => (
                <StatPill key={label} val={loading ? "…" : val} label={label} color={color} icon={icon} />
              ))}
            </div>
          </div>
        </div>

        {/* Unsubmitted days nudge */}
        {!loading && gapCount > 0 && (
          <Link href="/dashboard/forms" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 hover:bg-amber-100 transition-colors active:scale-[0.99]">
            <CalendarClock className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-900">{gapCount} past shift{gapCount !== 1 ? "s" : ""} need{gapCount === 1 ? "s" : ""} a record</p>
              <p className="text-xs text-amber-700/80 font-medium">Submit the missing records or mark them as no-work.</p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
          </Link>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ActionBtn href="/dashboard/forms" icon={FileText} label="Submit Record" primary />
          <ActionBtn href="/dashboard/history" icon={History} label="My History" />
          <ActionBtn href="/dashboard/profile" icon={UserCircle} label="Profile" />
          <ActionBtn href={`/api/records/export?userId=${userId}&month=${currentMonth}`} icon={Download} label="Export Month" external />
        </div>

        {/* Badges + Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Badges */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center"><Award className="w-3.5 h-3.5 text-amber-500" /></div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">My Badges</h3>
                  {stats && <p className="text-[8px] text-slate-400 font-semibold mt-0.5">{stats.badges.length} of {badgeTotal} earned</p>}
                </div>
              </div>
              {stats && stats.badges.length > 0 && (
                <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full transition-all duration-700" style={{ width: `${(stats.badges.length / badgeTotal) * 100}%` }} />
                </div>
              )}
            </div>
            <div className="p-4">
              {loading && <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-slate-50 animate-pulse" />)}</div>}
              {!loading && stats?.badges.length === 0 && (
                <div className="py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3"><Award className="w-7 h-7 text-slate-200" /></div>
                  <p className="text-xs text-slate-500 font-bold">No badges yet</p>
                  <p className="text-[10px] text-slate-300 mt-1">Submit your first record to start earning!</p>
                </div>
              )}
              {!loading && (stats?.badges.length || 0) > 0 && (
                <div className="grid grid-cols-3 gap-2">{stats!.badges.map((b) => <BadgeCard key={b.badge_type} type={b.badge_type} earnedAt={b.earned_at} />)}</div>
              )}
              {!loading && stats && stats.badges.length < badgeTotal && (
                <div className="mt-3 pt-3 border-t border-slate-50">
                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-300 mb-2">Locked</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.entries(BADGE_META).filter(([t]) => !stats.badges.find((b) => b.badge_type === t)).map(([t, m]) => {
                      const Icon = m.icon
                      return <div key={t} title={`${m.label}: ${m.desc}`} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center opacity-20 cursor-help hover:opacity-30 transition-opacity"><Icon className="w-4 h-4 text-slate-400" /></div>
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
                <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center"><Trophy className="w-3.5 h-3.5 text-amber-500" /></div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Leaderboard</h3>
                  <p className="text-[8px] text-slate-400 font-semibold mt-0.5">On-time this week</p>
                </div>
              </div>
              {myRank > 0 && <span className="text-[9px] font-black text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">Rank #{myRank}</span>}
            </div>
            <div className="p-3">
              {loading && <div className="space-y-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="h-11 rounded-xl bg-slate-50 animate-pulse" />)}</div>}
              {!loading && lb.length === 0 && (
                <div className="py-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3"><Trophy className="w-7 h-7 text-slate-200" /></div>
                  <p className="text-xs text-slate-500 font-bold">No data yet this week</p>
                  <p className="text-[10px] text-slate-300 mt-1">Submit on time to appear here!</p>
                </div>
              )}
              {!loading && lb.length > 0 && (
                <div className="space-y-0.5">{lb.slice(0, 8).map((e, i) => <LRow key={e.team_label} e={e} rank={i + 1} isMe={e.team_label === myTeam} />)}</div>
              )}
              {!loading && myRank > 8 && myTeam && lb[myRank - 1] && (
                <div className="mt-2 pt-2 border-t border-slate-50">
                  <p className="text-[8px] text-slate-300 text-center mb-1 font-bold uppercase tracking-widest">Your team</p>
                  <LRow e={lb[myRank - 1]} rank={myRank} isMe={true} />
                </div>
              )}
            </div>
            <div className="px-5 pb-4"><p className="text-[8px] text-slate-300 text-center leading-relaxed">Resets every Monday · Mon–Sat · 3-shift rotation</p></div>
          </div>
        </div>

        {/* MVP banners */}
        {!loading && mvp && !mvp.isMe && (
          <button onClick={() => setShowMvp(true)} className="w-full group bg-white border border-amber-200/60 rounded-2xl px-5 py-4 flex items-center gap-3.5 hover:border-amber-300 hover:shadow-md hover:shadow-amber-100 transition-all text-left active:scale-[0.99]">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><span className="text-xl">👑</span></div>
            <div className="flex-1 min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.15em] text-amber-500">MVP of {mvp.month}</p>
              <p className="text-sm font-black text-slate-800 truncate mt-0.5">{mvp.fullName}</p>
              <p className="text-[10px] text-slate-400 font-medium">{mvp.onTimeCount} on-time shifts</p>
            </div>
            <ChevronRight className="w-4 h-4 text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        )}
        {!loading && mvp?.isMe && (
          <button onClick={() => setShowMvp(true)} className="w-full group bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 rounded-2xl px-5 py-4 flex items-center gap-3.5 hover:from-amber-500 hover:to-amber-500 transition-all text-left active:scale-[0.99] shadow-md shadow-amber-400/30">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0"><span className="text-xl">🏆</span></div>
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
