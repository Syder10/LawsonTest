"use client"

import { useEffect } from "react"
import { AlertCircle, RotateCcw } from "lucide-react"
import { Card, EmptyState } from "@/components/primitives"

// Route-level error boundary for everything under /dashboard.
//
// Shows a recoverable message instead of Next's default error screen, and offers
// `reset()` — which re-renders the segment without a full page reload, so the
// user keeps their session and scroll position.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The digest is the only handle on the server-side stack, which is not sent
    // to the browser — log it so a report can be matched to server logs.
    console.error("[dashboard] render error:", error.message, error.digest ?? "")
  }, [error])

  return (
    <Card>
      <EmptyState
        icon={<AlertCircle className="w-5 h-5 text-critical" />}
        title="Something went wrong on this page"
        description="The page failed to load. Try again — if it keeps happening, tell an administrator and mention the time."
        action={
          <button
            onClick={reset}
            className="h-11 px-4 flex items-center gap-1.5 rounded-xl bg-brand-solid hover:bg-brand-solid-hover text-brand-ink text-sm font-bold active:scale-[0.97]"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> Try again
          </button>
        }
      />
    </Card>
  )
}
