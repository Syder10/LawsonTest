import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"

// Change the caller's own password via Supabase Auth.
export async function POST(request: Request) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let password: string
  try {
    password = (await request.json()).password
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!password || typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 })
  }

  const { error } = await auth.ctx.supabase.auth.updateUser({ password })
  if (error) {
    console.error("[profile/update-password] error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
