"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  FileText, UserCircle, Download, History,
  Trophy, Medal, Star, Zap, Target, Award,
  CheckCircle2, Clock, Moon, Sunrise, Shuffle, Flame as FlameIcon,
  X, ChevronRight, Sparkles
} from "lucide-react"

// --- Types & Constants ---
interface BadgeMeta { label: string; desc: string; icon: React.ElementType; color: string; bg: string; ring: string }

const BADGE_META: Record<string, BadgeMeta> = {
  first_submit:      { label: "First Step",       desc: "Initial submission",           icon: Star,      color: "text-emerald-500", bg: "bg-emerald-500/10",  ring: "border-emerald-500/20" },
  submissions_50:    { label: "Warm Up",          desc: "50 submissions",               icon: Star,      color: "text-teal-500",    bg: "bg-teal-500/10",     ring: "border-teal-500/20"    },
  submissions_100:   { label: "Century",          desc: "100 submissions",              icon: Medal,     color: "text-amber-500",   bg: "bg-amber-500/10",    ring: "border-amber-500/20"   },
  submissions_1000:  { label: "1K Elite",          desc: "1,000 submissions",            icon: Zap,       color: "text-yellow-400",  bg: "bg-zinc-900",        ring: "border-yellow-400/50"  },
  streak_5:          { label: "On a Roll",         desc: "5-shift streak",               icon: FlameIcon, color: "text-orange-500",  bg: "bg-orange-500/10",   ring: "border-orange-500/20"  },
  night_owl:         { label: "Night Owl",         desc: "On-time Night shift",          icon: Moon,      color: "text-indigo-400",  bg: "bg-indigo-500/10",   ring: "border-indigo-500/20"  },
}

const SHIFT_THEMES: Record<string, { bg: string, text: string, icon: any }> = {
  Morning:   { bg: "bg-orange-50", text: "text-orange-700", icon: Sunrise },
  Afternoon: { bg: "bg-sky-50", text: "text-sky-700", icon: Sparkles },
  Night:     { bg: "bg-indigo-50", text: "text-indigo-700", icon: Moon },
}

// --- Component: Streak Fire ---
function StreakDisplay({ n, done }: { n: number; done: boolean }) {
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative">
        <span className={`text-6xl transition-all duration-700 ${n === 0 ? "grayscale opacity-30" : "drop-shadow-[0_0_15px_rgba(249,115,22,0.4)]"}`}>
          🔥
        </span>
        {done && (
          <div className="absolute -right-1 -top-1 bg-emerald-500 rounded-full p-1 border-2 border-white shadow-lg">
            <CheckCircle2 className="w-3 h-3 text-white" />
          </div>
        )}
      </div>
      <div className="mt-2 text-center">
        <span className="block text-3xl font-black text-slate-800 tabular-nums leading-none">{n}</span>
        <span className="text-[10px] font-bold uppercase tracking-tighter text-slate-400">Streak</span>
      </div>
    </div>
  )
}

// --- Component: Leaderboard Row ---
function LeaderboardRow({ e, rank, isMe }: { e: any; rank: number; isMe: boolean }) {
  return (
    <div className={`group flex items-center gap-4 p-3 rounded-2xl transition-all ${isMe ? "bg-emerald-50/50 ring-1 ring-emerald-100" : "hover:bg-slate-50"}`}>
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white shadow-sm border border-slate-100 font-black text-xs text-slate-500">
        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
      </div>
      <div className="flex-1">
        <p className={`text-sm font-bold ${isMe ? "text-emerald-900" : "text-slate-700"}`}>
          {e.team_label} {isMe && " (You)"}
        </p>
        <p className="text-[10px] text-slate-400 font-medium uppercase">{e.department}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-black text-slate-900">{e.on_time_count}</p>
        <p className="text-[9px] font-bold text-emerald-500 uppercase">Score</p>
      </div>
    </div>
  )
}

export function SupervisorDashboard({ userId }: { userId: string }) {
  const [stats, setStats] = useState<any>(null)
  const [lb, setLb] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const greeting = new Date().getHours() < 12 ? "Good morning" : "Good afternoon"

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#F8FAFC] pb-20 animate-in fade-in duration-500">
      
      {/* --- Header / Hero Section --- */}
      <div className="relative overflow-hidden bg-slate-900 px-6 pt-12 pb-24 rounded-b-[40px] shadow-2xl shadow-slate-200">
        {/* Decorative Aura */}
        <div className="absolute top-[-50%] left-[-10%] w-80 h-80 bg-emerald-500/20 blur-[100px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-60 h-60 bg-blue-500/10 blur-[80px] rounded-full" />
        
        <div className="relative flex justify-between items-start">
          <div className="space-y-1">
            <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em]">{greeting}</p>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {stats?.fullName?.split(' ')[0] || "Supervisor"}
            </h1>
            <div className="flex items-center gap-2 pt-2">
              <div className="px-2 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/80">
                Group {stats?.groupNumber || "—"}
              </div>
              {stats?.currentShift && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-[10px] font-black text-emerald-400">
                  <Clock className="w-3 h-3" /> {stats.currentShift}
                </div>
              )}
            </div>
          </div>
          <div className="bg-white/5 p-4 rounded-[32px] backdrop-blur-xl border border-white/10 shadow-inner">
            <StreakDisplay n={stats?.currentStreak || 0} done={!!stats?.currentShiftComplete} />
          </div>
        </div>
      </div>

      {/* --- Main Content Bento Grid --- */}
      <div className="px-4 -mt-12 space-y-4">
        
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", val: stats?.totalSubmissions || 0, icon: Target, color: "text-emerald-600" },
            { label: "Badges", val: stats?.badges?.length || 0, icon: Award, color: "text-violet-600" },
            { label: "Rank", val: `#${lb.findIndex(x => x.isMe) + 1 || '-'}`, icon: Trophy, color: "text-amber-600" },
          ].map((item, i) => (
            <div key={i} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center gap-1">
              <item.icon className={`w-4 h-4 ${item.color} mb-1`} />
              <span className="text-lg font-black text-slate-800 tabular-nums">{item.val}</span>
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">{item.label}</span>
            </div>
          ))}
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/forms" className="group relative overflow-hidden bg-emerald-600 p-5 rounded-[32px] shadow-lg shadow-emerald-200 active:scale-95 transition-all">
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full transition-transform group-hover:scale-150" />
            <FileText className="text-white w-6 h-6 mb-3 opacity-80" />
            <p className="text-white font-black text-lg">Submit</p>
            <p className="text-emerald-100 text-[10px] font-medium italic">New entry</p>
          </Link>
          
          <div className="grid grid-rows-2 gap-3">
            <Link href="/dashboard/history" className="flex items-center justify-between px-5 bg-white border border-slate-100 rounded-2xl shadow-sm active:scale-95 transition-all">
              <span className="text-sm font-bold text-slate-700">History</span>
              <History className="w-4 h-4 text-slate-400" />
            </Link>
            <Link href="/dashboard/profile" className="flex items-center justify-between px-5 bg-white border border-slate-100 rounded-2xl shadow-sm active:scale-95 transition-all">
              <span className="text-sm font-bold text-slate-700">Account</span>
              <UserCircle className="w-4 h-4 text-slate-400" />
            </Link>
          </div>
        </div>

        {/* Leaderboard Card */}
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-slate-50">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Leaderboard</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase">This Week's Top Performers</p>
            </div>
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          <div className="p-3 space-y-1">
            {lb.slice(0, 3).map((e, i) => (
              <LeaderboardRow key={i} e={e} rank={i + 1} isMe={e.isMe} />
            ))}
          </div>
          <button className="w-full p-4 text-[11px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-50 hover:bg-slate-50 transition-colors">
            View Full Standings
          </button>
        </div>

      </div>

      {/* Floating Export Button */}
      <a href={`/api/records/export?userId=${userId}`} className="fixed bottom-6 right-6 bg-slate-900 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-2 active:scale-90 transition-all z-40">
        <Download className="w-5 h-5" />
        <span className="text-xs font-black uppercase tracking-wider">Export PDF</span>
      </a>
    </div>
  )
}
