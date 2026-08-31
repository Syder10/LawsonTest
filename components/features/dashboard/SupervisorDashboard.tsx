"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import Link from "next/link"
import {
  Award, CalendarClock, CheckCircle2, ChevronRight, Clock, Crown, Download, FileText,
  Flame as FlameIcon, History, TrendingUp, Trophy, UserCircle,
} from "lucide-react"
import { ON_TIME_WINDOW_LABEL } from "@/lib/shift-config"
import { ActionBtn } from "@/components/features/shared/action-btn"
import { Card, CardHeader, Chip, EmptyState } from "@/components/primitives"
import { cn } from "@/lib/utils"
import { BADGE_META, BadgeCard } from "./supervisor/badge-catalogue"
import {
  Fire, LRow, MVPModal, SHIFT_COLORS, ShiftCountdown, StatPill,
  type GStats, type LEntry, type MVPData,
} from "./supervisor/widgets"

/**
 * Chip for the dark hero panel.
 *
 * The design-system Chip is built for light card surfaces, so hero chips carry
 * their own translucent-white treatment rather than adding a second colour
 * system to Chip for the one panel in the app that is deliberately dark.
 */
function HeroChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold",
        className ?? "bg-white/10 text-white/75 border-white/15",
      )}
    >
      {children}
    </span>
  )
}

// Supervisor home: streak, badges, monthly team leaderboard, monthly MVP.
// Orchestrator only — widgets live under ./supervisor/*.
export function SupervisorDashboard({ userId }: { userId: string }) {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  const [stats, setStats] = useState<GStats | null>(null)
  const [lb, setLb] = useState<LEntry[]>([])
  // Captioned with the period the API actually computed, not a hardcoded word.
  const [lbPeriod, setLbPeriod] = useState<string | null>(null)
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
      if (lr.ok) {
        const d = await lr.json()
        setLb(d.leaderboard || [])
        setLbPeriod(d.period?.label ?? null)
      }
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
  const earned = stats?.badges.length ?? 0

  return (
    <>
      {showMvp && mvp && <MVPModal mvp={mvp} onClose={() => setShowMvp(false)} />}

      <div className="space-y-3 sm:space-y-4 animate-fade-in-up">
        {/* Hero — the one deliberately dark panel in the app (see .hero-panel). */}
        <div className="hero-panel rounded-3xl overflow-hidden shadow-sm">
          <div className="flex items-start justify-between gap-4 px-5 py-6 sm:px-6">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">{greeting}</p>
              <h2 className="mt-0.5 truncate text-xl sm:text-2xl font-bold tracking-tight text-white">
                {loading
                  ? <span className="inline-block h-7 w-36 rounded-lg bg-white/10 animate-pulse" />
                  : stats?.fullName || "Supervisor"}
              </h2>
              {stats?.department && (
                <p className="mt-0.5 text-sm font-medium text-white/60">
                  {stats.department}{stats.groupNumber ? ` · Group ${stats.groupNumber}` : ""}
                </p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {displayShift && !stats?.dayOff && (
                  <HeroChip className={SHIFT_COLORS[displayShift]}>
                    <Clock className="w-3 h-3 shrink-0" aria-hidden="true" />{displayShift} shift
                  </HeroChip>
                )}
                {stats?.dayOff && (
                  <HeroChip>{new Date().getUTCDay() === 0 ? "Sunday rest day" : "Saturday off"}</HeroChip>
                )}
                {!loading && stats?.noCompulsory && !stats?.dayOff && (
                  <HeroChip>
                    <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />No required submission this shift
                  </HeroChip>
                )}
                {!loading && stats?.onTimeWindow && !stats?.dayOff && !stats?.noCompulsory && (
                  <ShiftCountdown onTimeWindow={stats.onTimeWindow} shiftComplete={stats.currentShiftComplete} />
                )}
                {(stats?.longestStreak || 0) > 0 && (
                  <HeroChip>
                    <TrendingUp className="w-3 h-3 shrink-0" aria-hidden="true" />Best: {stats?.longestStreak}
                  </HeroChip>
                )}
              </div>

              {!loading && displayShift && !stats?.dayOff && !stats?.noCompulsory && (
                <p className="mt-1.5 text-xs font-semibold text-white/45">
                  On-time window: {ON_TIME_WINDOW_LABEL[displayShift]}
                </p>
              )}
            </div>
            {!loading && <Fire n={stats?.currentStreak || 0} done={stats?.currentShiftComplete || false} />}
          </div>
        </div>

        {/* Stat strip — moved off the hero: its labels use the light-surface ink
            tokens, which are unreadable on the dark panel. */}
        <Card>
          <div className="grid grid-cols-3 divide-x divide-hairline">
            <StatPill val={loading ? "…" : stats?.totalSubmissions?.toLocaleString() ?? "—"} label="Total" tone="brand" icon={CheckCircle2} />
            <StatPill val={loading ? "…" : String(stats?.currentStreak ?? "—")} label="Streak" tone="warning" icon={FlameIcon} />
            <StatPill val={loading ? "…" : String(earned || "—")} label="Badges" tone="neutral" icon={Award} />
          </div>
        </Card>

        {/* Unsubmitted days nudge */}
        {!loading && gapCount > 0 && (
          <Link
            href="/dashboard/forms"
            className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning-subtle px-4 py-3 transition-colors hover:border-warning/60 active:scale-[0.99]"
          >
            <CalendarClock className="w-5 h-5 shrink-0 text-warning-ink" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-warning-ink">
                {gapCount} past shift{gapCount !== 1 ? "s" : ""} need{gapCount === 1 ? "s" : ""} a record
              </p>
              <p className="text-xs font-medium text-warning-ink/80">Submit the missing records, or mark them as no-work.</p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0 text-warning-ink/70" aria-hidden="true" />
          </Link>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ActionBtn href="/dashboard/forms" icon={FileText} label="Submit Record" primary />
          <ActionBtn href="/dashboard/history" icon={History} label="My History" />
          <ActionBtn href="/dashboard/profile" icon={UserCircle} label="Profile" />
          <ActionBtn href={`/api/records/export?userId=${userId}&month=${currentMonth}`} icon={Download} label="Export Month" external />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {/* Badges */}
          <Card>
            <CardHeader
              title="My badges"
              hint={stats ? `${earned} of ${badgeTotal} earned` : undefined}
              actions={
                stats && earned > 0 ? (
                  <div
                    className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken"
                    role="img"
                    aria-label={`${earned} of ${badgeTotal} badges earned`}
                  >
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-700"
                      style={{ width: `${(earned / badgeTotal) * 100}%` }}
                    />
                  </div>
                ) : undefined
              }
            />
            <div className="p-4">
              {loading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-surface-sunken animate-pulse" />)}
                </div>
              )}
              {!loading && earned === 0 && (
                <EmptyState
                  compact
                  icon={<Award className="w-5 h-5" aria-hidden="true" />}
                  title="No badges yet"
                  description="Submit your first record to start earning them."
                />
              )}
              {!loading && earned > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {stats!.badges.map((b) => <BadgeCard key={b.badge_type} type={b.badge_type} earnedAt={b.earned_at} />)}
                </div>
              )}
            </div>
          </Card>

          {/* Leaderboard */}
          <Card>
            <CardHeader
              title="Leaderboard"
              hint={lbPeriod ? `On-time · ${lbPeriod}` : "On-time this month"}
              actions={myRank > 0 ? <Chip tone="brand">Rank #{myRank}</Chip> : undefined}
            />
            <div className="p-3">
              {loading && (
                <div className="space-y-1.5">
                  {[0, 1, 2, 3].map((i) => <div key={i} className="h-11 rounded-xl bg-surface-sunken animate-pulse" />)}
                </div>
              )}
              {!loading && lb.length === 0 && (
                <EmptyState
                  compact
                  icon={<Trophy className="w-5 h-5" aria-hidden="true" />}
                  title="No data yet this month"
                  description="Submit inside your on-time window to appear here."
                />
              )}
              {!loading && lb.length > 0 && (
                <ol className="space-y-0.5">
                  {lb.slice(0, 8).map((e, i) => <LRow key={e.team_label} e={e} rank={i + 1} isMe={e.team_label === myTeam} />)}
                </ol>
              )}
              {!loading && myRank > 8 && myTeam && lb[myRank - 1] && (
                <div className="mt-2 border-t border-hairline pt-2">
                  <p className="mb-1 text-center text-xs font-bold uppercase tracking-widest text-ink-muted">Your team</p>
                  <ol><LRow e={lb[myRank - 1]} rank={myRank} isMe /></ol>
                </div>
              )}
            </div>
            <div className="px-5 pb-4">
              <p className="text-center text-xs text-ink-muted">
                Resets on the 1st · Mon–Sat · 3-shift rotation
              </p>
            </div>
          </Card>
        </div>

        {/* MVP banner. Spans, not <p>, because a paragraph inside a button is
            invalid HTML — which is what this was. */}
        {!loading && mvp && (
          <button
            onClick={() => setShowMvp(true)}
            className={cn(
              "group flex w-full items-center gap-3.5 rounded-2xl px-5 py-4 text-left shadow-sm transition-colors active:scale-[0.99]",
              mvp.isMe
                ? "bg-brand-solid hover:bg-brand-solid-hover text-brand-ink"
                : "border border-warning/30 bg-surface-card hover:bg-warning-subtle",
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                mvp.isMe ? "bg-white/15" : "bg-warning-subtle",
              )}
            >
              {mvp.isMe
                ? <Trophy className="h-5 w-5 text-brand-ink" aria-hidden="true" />
                : <Crown className="h-5 w-5 text-warning-ink" aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-xs font-bold uppercase tracking-widest", mvp.isMe ? "text-brand-ink/75" : "text-warning-ink")}>
                {mvp.isMe ? "You are the" : `MVP of ${mvp.month}`}
              </span>
              <span className={cn("mt-0.5 block truncate text-sm font-bold", mvp.isMe ? "text-brand-ink" : "text-ink-primary")}>
                {mvp.isMe ? `MVP of ${mvp.month}` : mvp.fullName}
              </span>
              <span className={cn("block text-xs font-medium", mvp.isMe ? "text-brand-ink/70" : "text-ink-muted")}>
                {mvp.onTimeCount} on-time shift{mvp.onTimeCount !== 1 ? "s" : ""}
              </span>
            </span>
            <ChevronRight
              className={cn("h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5", mvp.isMe ? "text-brand-ink/70" : "text-ink-muted")}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </>
  )
}
