import Link from "next/link"
import { Compass } from "lucide-react"

// Root 404. There was none, so a mistyped URL got Next's unstyled default page
// with no way back into the app.
export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6 bg-surface-page">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 h-12 w-12 flex items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
          <Compass className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-ink-primary">Page not found</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          That address doesn’t exist. It may have been moved, or the link may be out of date.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-11 px-5 items-center justify-center rounded-xl bg-brand-solid hover:bg-brand-solid-hover text-brand-ink text-sm font-bold transition-colors active:scale-[0.97]"
        >
          Go to the dashboard
        </Link>
      </div>
    </div>
  )
}
