import { createClient as createSSRClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

const NO_WORK_REASONS = [
  "Machine Breakdown",
  "Public Holiday",
  "No Raw Materials",
  "Power Outage",
  "Scheduled Maintenance",
  "Staff Shortage",
  "Other",
]

export async function POST(request: NextRequest) {
  try {
    // Verify the caller is authenticated
    const ssrClient = await createSSRClient()
    const { data: { user } } = await ssrClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { date, supervisorName, shift, group, department, reason } = body

    if (!date || !supervisorName || !shift || !department || !reason) {
      return NextResponse.json(
        { error: "Missing required fields: date, supervisorName, shift, department, reason" },
        { status: 400 }
      )
    }

    if (!NO_WORK_REASONS.includes(reason)) {
      return NextResponse.json({ error: "Invalid reason" }, { status: 400 })
    }

    // Fetch the user's real department from profiles — never trust the client
    const { data: profile } = await ssrClient
      .from("profiles")
      .select("department, role, full_name")
      .eq("id", user.id)
      .single()

    const isManagerOrAdmin = profile?.role === "manager" || profile?.role === "admin"
    if (!isManagerOrAdmin && profile?.department?.toLowerCase() !== department.toLowerCase()) {
      return NextResponse.json({ error: "You can only submit records for your own department" }, { status: 403 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from("no_work_records")
      .insert([{
        user_id:         user.id,
        date,
        supervisor_name: supervisorName,
        shift,
        group_number:    group ?? null,
        department,
        reason:          reason.trim(),
      }])
      .select()

    if (error) {
      console.error("[no-work] Insert error:", error)
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("[no-work] API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
