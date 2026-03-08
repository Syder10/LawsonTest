import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

// GET - fetch all herb names ordered alphabetically
export async function GET() {
  try {
    const { data, error } = await supabase()
      .from("herb_types")
      .select("name")
      .order("name", { ascending: true })

    if (error) {
      console.error("[v0] Error fetching herbs:", error)
      return NextResponse.json({ error: "Failed to fetch herbs" }, { status: 500 })
    }

    const names = data?.map((row: { name: string }) => row.name) ?? []
    return NextResponse.json({ herbs: names })
  } catch (error) {
    console.error("[v0] Unexpected error fetching herbs:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - create a new herb
export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json()

    if (!name?.trim()) {
      return NextResponse.json({ error: "Herb name is required" }, { status: 400 })
    }

    const trimmed = name.trim()

    // Check for duplicates (case-insensitive)
    const { data: existing, error: checkError } = await supabase()
      .from("herb_types")
      .select("name")
      .ilike("name", trimmed)
      .maybeSingle()

    if (checkError) {
      console.error("[v0] Error checking for duplicate herb:", checkError)
      return NextResponse.json({ error: "Failed to check for duplicate" }, { status: 500 })
    }

    if (existing) {
      return NextResponse.json({ error: "This herb already exists" }, { status: 409 })
    }

    const { data, error } = await supabase()
      .from("herb_types")
      .insert([{ name: trimmed }])
      .select()

    if (error) {
      console.error("[v0] Error creating herb:", error)
      return NextResponse.json({ error: "Failed to create herb" }, { status: 500 })
    }

    console.log("[v0] New herb created:", trimmed)
    return NextResponse.json({ success: true, herb: data?.[0] })
  } catch (error) {
    console.error("[v0] Unexpected error creating herb:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
