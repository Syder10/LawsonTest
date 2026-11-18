"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { GlassSplash } from "@/components/screens/glass-splash"
import { StaticSplash } from "@/components/screens/static-splash"

/**
 * Probes for WebGL2 and releases the context immediately — a probe that keeps its
 * context holds one of the browser's small pool, which the real renderer then has
 * to compete for.
 */
function hasWebGL2() {
  try {
    const probe = document.createElement("canvas").getContext("webgl2")
    if (!probe) return false
    probe.getExtension("WEBGL_lose_context")?.loseContext()
    return true
  } catch {
    return false
  }
}

/**
 * The splash. Server-renders the static version — which is also the fallback — and
 * upgrades to the glass one on mount if the device can run it. Both paint `bg-mesh`
 * on a `min-h-dvh` column, so the upgrade is the canvas fading in rather than a
 * layout change, and a GL failure at any point falls back with nothing on screen to
 * explain it.
 *
 * /login is prefetched here so the commit animation is the only wait; auth is
 * untouched — a signed-in visitor still passes through /login and is redirected by
 * middleware exactly as before.
 */
export default function Page() {
  const router = useRouter()
  const [glass, setGlass] = useState(false)

  useEffect(() => {
    router.prefetch("/login")
    setGlass(hasWebGL2())
  }, [router])

  const start = useCallback(() => router.push("/login"), [router])
  const fallBack = useCallback(() => setGlass(false), [])

  return glass ? <GlassSplash onStart={start} onFail={fallBack} /> : <StaticSplash onStart={start} />
}
