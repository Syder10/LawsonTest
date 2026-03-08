"use client"

import { useRouter } from "next/navigation"
import LandingPage from "@/components/screens/landing-page"

export default function Page() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-green-50 flex items-center justify-center">
      <LandingPage onStart={() => router.push('/login')} />
    </main>
  )
}
