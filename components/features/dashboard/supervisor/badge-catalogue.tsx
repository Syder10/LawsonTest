"use client"

import { Trophy, Medal, Star, Zap, Target, Award, Moon, Sunrise, Shuffle, Flame as FlameIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The 21 badge hues are deliberately decorative and per-badge — a badge is an
 * identity, not a status — so they stay literal here rather than moving onto the
 * semantic tokens. `onDark` is the one thing the tile needs to know about its own
 * colour: the elite badges sit on a near-black fill, where the neutral ink tokens
 * would drop to roughly 3.5:1 on the supporting lines.
 */
export interface BadgeMeta {
  label: string
  desc: string
  icon: React.ElementType
  color: string
  bg: string
  ring: string
  /** Tile fill is dark, so the supporting text inverts. */
  onDark?: boolean
}

// The full badge catalogue. Keys match the badge_type values written by the
// gamification service (submissions_*, streak_*, first_submit, perfect_week,
// night_owl, early_bird, all_rounder, mvp_YYYY_M).
export const BADGE_META: Record<string, BadgeMeta> = {
  first_submit:      { label: "First Step",       desc: "Your very first submission",              icon: Star,      color: "text-emerald-600", bg: "bg-emerald-50",  ring: "ring-emerald-200" },
  submissions_50:    { label: "Warm Up",          desc: "50 submissions",                          icon: Star,      color: "text-teal-600",    bg: "bg-teal-50",     ring: "ring-teal-200"    },
  submissions_100:   { label: "Century",          desc: "100 submissions",                         icon: Medal,     color: "text-amber-600",   bg: "bg-amber-50",    ring: "ring-amber-200"   },
  submissions_200:   { label: "Double Century",   desc: "200 submissions",                         icon: Medal,     color: "text-orange-500",  bg: "bg-orange-50",   ring: "ring-orange-200"  },
  submissions_300:   { label: "Triple Crown",     desc: "300 submissions",                         icon: Trophy,    color: "text-yellow-600",  bg: "bg-yellow-50",   ring: "ring-yellow-200"  },
  submissions_400:   { label: "400 Club",         desc: "400 submissions",                         icon: Trophy,    color: "text-cyan-600",    bg: "bg-cyan-50",     ring: "ring-cyan-200"    },
  submissions_500:   { label: "Half-K Legend",    desc: "500 submissions",                         icon: Award,     color: "text-violet-600",  bg: "bg-violet-50",   ring: "ring-violet-200"  },
  submissions_750:   { label: "750 Warrior",      desc: "750 submissions",                         icon: Award,     color: "text-rose-500",    bg: "bg-rose-50",     ring: "ring-rose-200"    },
  submissions_1000:  { label: "1K Elite",         desc: "1,000 submissions",                       icon: Zap,       color: "text-yellow-400",  bg: "bg-zinc-900",    ring: "ring-yellow-400",  onDark: true },
  submissions_1500:  { label: "1.5K Master",      desc: "1,500 submissions",                       icon: Zap,       color: "text-purple-300",  bg: "bg-purple-900",  ring: "ring-purple-400",  onDark: true },
  submissions_2000:  { label: "2K Immortal",      desc: "2,000 submissions — hall of fame",        icon: Zap,       color: "text-red-300",     bg: "bg-red-900",     ring: "ring-red-400",     onDark: true },
  streak_5:          { label: "On a Roll",        desc: "5-shift streak",                          icon: FlameIcon, color: "text-orange-500",  bg: "bg-orange-50",   ring: "ring-orange-200"  },
  streak_10:         { label: "Unstoppable",      desc: "10-shift streak",                         icon: FlameIcon, color: "text-orange-600",  bg: "bg-orange-100",  ring: "ring-orange-300"  },
  streak_20:         { label: "Machine",          desc: "20-shift streak",                         icon: FlameIcon, color: "text-red-500",     bg: "bg-red-50",      ring: "ring-red-200"     },
  streak_30:         { label: "Iron Will",        desc: "30-shift streak",                         icon: FlameIcon, color: "text-red-600",     bg: "bg-red-100",     ring: "ring-red-300"     },
  streak_50:         { label: "Legendary Run",    desc: "50-shift streak",                         icon: FlameIcon, color: "text-rose-300",    bg: "bg-rose-900",    ring: "ring-rose-400",    onDark: true },
  streak_100:        { label: "The Eternal Flame", desc: "100-shift streak — extraordinary",       icon: FlameIcon, color: "text-yellow-300",  bg: "bg-zinc-900",    ring: "ring-yellow-300",  onDark: true },
  perfect_week:      { label: "Perfect Week",     desc: "All shifts on time for a full week",      icon: Target,    color: "text-emerald-300", bg: "bg-emerald-900", ring: "ring-emerald-400", onDark: true },
  night_owl:         { label: "Night Owl",        desc: "Submitted a Night shift on time",         icon: Moon,      color: "text-indigo-300",  bg: "bg-indigo-900",  ring: "ring-indigo-400",  onDark: true },
  early_bird:        { label: "Early Bird",       desc: "Submitted in the first 30 min of window", icon: Sunrise,   color: "text-amber-600",   bg: "bg-amber-50",    ring: "ring-amber-300"   },
  all_rounder:       { label: "All-Rounder",      desc: "Submitted on all 3 shift types",          icon: Shuffle,   color: "text-teal-600",    bg: "bg-teal-50",     ring: "ring-teal-200"    },
}

/**
 * One earned badge. Nothing here goes below 12px — the previous tile ran the
 * description and the date at 8px, which is unreadable on a factory-floor phone.
 */
export function BadgeCard({ type, earnedAt }: { type: string; earnedAt: string }) {
  const m = BADGE_META[type]
  if (!m) return null
  const Icon = m.icon
  const earned = new Date(earnedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl p-3 text-center ring-2 transition-transform duration-200",
        "motion-safe:hover:scale-[1.03]",
        m.bg,
        m.ring,
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", m.color)} aria-hidden="true" />
      <p className={cn("text-xs font-bold uppercase leading-tight tracking-wide", m.color)}>{m.label}</p>
      <p className={cn("text-xs leading-tight", m.onDark ? "text-white/70" : "text-ink-secondary")}>{m.desc}</p>
      <p className={cn("text-xs", m.onDark ? "text-white/50" : "text-ink-muted")}>
        <span className="sr-only">Earned </span>{earned}
      </p>
    </div>
  )
}
