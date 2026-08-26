'use client'

import type { CSSProperties } from 'react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

// Theme-aware toaster wired to the design tokens, so a toast matches the app in
// both modes instead of using sonner's own palette. Status colours come from the
// reserved status tokens — the same ones the stock badges use — so "success" is
// the same green everywhere.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'rounded-xl border shadow-lg',
          title: 'font-semibold',
          description: 'text-ink-secondary',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--surface-raised)',
          '--normal-text': 'var(--ink-primary)',
          '--normal-border': 'var(--line-hairline)',
          '--success-bg': 'var(--status-good-subtle)',
          '--success-text': 'var(--status-good-ink)',
          '--success-border': 'var(--status-good)',
          '--error-bg': 'var(--status-critical-subtle)',
          '--error-text': 'var(--status-critical-ink)',
          '--error-border': 'var(--status-critical)',
          '--warning-bg': 'var(--status-warning-subtle)',
          '--warning-text': 'var(--status-warning-ink)',
          '--warning-border': 'var(--status-warning)',
          '--info-bg': 'var(--brand-subtle)',
          '--info-text': 'var(--brand-subtle-ink)',
          '--info-border': 'var(--brand)',
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
