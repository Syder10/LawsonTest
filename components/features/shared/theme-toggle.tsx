"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Monitor, Moon, Sun } from "lucide-react"

// Light / Dark / System, as a three-position segmented control.
//
// A segment rather than a single toggle button because "system" is a real,
// distinct choice — a plain toggle can only express two of the three states and
// silently drops the user out of following their OS.
//
// Deliberately NOT animated: the theme class lands on <html> and repaints the
// whole page, so a transition here would fight that repaint and read as lag.
// next-themes' disableTransitionOnChange (see app/layout.tsx) suppresses
// transitions during the swap for the same reason.
const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // The server cannot know the resolved theme, so render a fixed-size
  // placeholder until mount. Without this the control renders with the wrong
  // segment active for one frame, and the layout shifts as it corrects.
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-9 w-[108px] rounded-full border border-hairline bg-surface-sunken" aria-hidden="true" />
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex h-9 items-center gap-0.5 rounded-full border border-hairline bg-surface-sunken p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              active
                ? "bg-surface-card text-brand shadow-sm"
                : "text-ink-muted hover:text-ink-secondary"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
