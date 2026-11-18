"use client"

import { useActionState } from "react"
import Image from "next/image"
import { AlertCircle, Eye, EyeOff, LogIn } from "lucide-react"
import { useState } from "react"
import { login } from "./actions"
import { Button } from "@/components/ui/button"
import { Card, Field, TextInput } from "@/components/primitives"

// ============================================================================
// Sign in.
//
// ONE form for everybody. There were previously three (supervisor / manager /
// admin), with the admin one reachable only by clicking a 10×10px dot three
// times — and that dot was `aria-hidden` with `tabIndex={-1}`, so keyboard and
// screen-reader users could never reach the admin form at all.
//
// The modes never provided security either: `profiles.role` decides everything
// after sign-in (app/dashboard/page.tsx routes on it, lib/auth/guards.ts enforces
// it). All the modes did was let someone pick the wrong door and get bounced. Now
// everyone signs in the same way and lands on their own dashboard.
// ============================================================================

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(login, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-4 py-10 bg-surface-page">
      <div className="gradient-orb gradient-orb-1" aria-hidden="true" />
      <div className="gradient-orb gradient-orb-2" aria-hidden="true" />

      <main className="w-full max-w-sm z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <Image
            src="/logo.png"
            alt="Lawson Limited Company"
            width={80}
            height={80}
            className="w-16 h-16 sm:w-20 sm:h-20 object-contain"
            priority
          />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-primary">Lawson Production</h1>
          <p className="mt-1 text-sm text-ink-secondary">Sign in to continue</p>
        </div>

        <Card padded>
          <form action={formAction} className="space-y-4">
            <Field label="Username" required>
              {(a11y) => (
                <TextInput
                  {...a11y}
                  name="username"
                  type="text"
                  placeholder="your username"
                  required
                  disabled={isPending}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              )}
            </Field>

            <Field label="Password" required>
              {(a11y) => (
                <div className="relative">
                  <TextInput
                    {...a11y}
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    disabled={isPending}
                    autoComplete="current-password"
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-lg text-ink-muted hover:text-ink-secondary transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              )}
            </Field>

            {/* role="alert" + aria-live so a failure is announced, not just drawn. */}
            {state?.error && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-critical-subtle border border-critical/30"
              >
                <AlertCircle className="w-4 h-4 text-critical shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm font-medium text-critical-ink">{state.error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-12 text-base font-bold bg-brand-solid hover:bg-brand-solid-hover text-brand-ink rounded-xl active:scale-[0.98] disabled:opacity-70"
            >
              {isPending ? (
                "Signing in…"
              ) : (
                <>
                  <LogIn className="w-4 h-4 mr-1.5" aria-hidden="true" /> Sign in
                </>
              )}
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-xs text-ink-muted">
          Accounts are created by an administrator. If you cannot sign in, ask your manager.
        </p>
      </main>
    </div>
  )
}
