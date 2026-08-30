import { Loader2 } from "lucide-react"

// Route-level loading state. There were previously NO loading.tsx, error.tsx or
// not-found.tsx files anywhere in app/, so every navigation showed nothing until
// the server component resolved, and any thrown error fell through to Next's
// default screens.
export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-ink-muted" aria-busy="true">
      <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
