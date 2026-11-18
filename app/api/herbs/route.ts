import { type NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/guards"

// Herb type list + creation. Now authenticated (the old route was public, so
// anyone on the internet could insert rows). Any signed-in user may add a herb,
// matching the in-app "Create Herb" affordance.
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.ctx.supabase
    .from("herb_types")
    .select("name")
    .order("name", { ascending: true })

  if (error) {
    console.error("[herbs] fetch error:", error.message)
    return NextResponse.json({ error: "Failed to fetch herbs" }, { status: 500 })
  }
  return NextResponse.json({ herbs: (data ?? []).map((r) => r.name) })
}

export async function POST(request: NextRequest) {
  const auth = await requireUser()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let name: string
  try {
    name = (await request.json()).name
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const trimmed = name?.trim()
  if (!trimmed) return NextResponse.json({ error: "Herb name is required" }, { status: 400 })

  // Insert and rely on the primary-key/unique constraint to reject duplicates,
  // rather than a separate check-then-insert (which races).
  const { data, error } = await auth.ctx.supabase
    .from("herb_types")
    .insert({ name: trimmed })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This herb already exists" }, { status: 409 })
    }
    console.error("[herbs] create error:", error.message)
    return NextResponse.json({ error: "Failed to create herb" }, { status: 500 })
  }
  return NextResponse.json({ success: true, herb: data })
}
