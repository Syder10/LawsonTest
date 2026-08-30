"use client"

import { useRouter } from "next/navigation"
import LandingPage from "@/components/screens/landing-page"

// Thin wrapper: the splash owns its own full-height layout, so this must not add
// a competing one. It previously wrapped the splash in a second `min-h-screen`
// flex-centre with its own gradient, which fought the splash's `min-h-dvh` and
// contributed to content being clipped on short viewports.
export default function Page() {
  const router = useRouter()
  return <LandingPage onStart={() => router.push("/login")} />
}
