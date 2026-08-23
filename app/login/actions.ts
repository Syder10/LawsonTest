"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export async function login(state: unknown, formData: FormData) {
    const supabase  = await createClient()
    const rawUsername = (formData.get("username") as string)?.trim()
    const password    = formData.get("password") as string
    const requestedMode = (formData.get("mode") as string) || "supervisor"
    const mode = ["supervisor", "manager", "admin"].includes(requestedMode)
        ? requestedMode
        : "supervisor"

    if (!rawUsername || !password) {
        return { error: "Username and password are required." }
    }

    // All accounts use @llc.com — just append if the user typed a bare username
    const emailToUse = rawUsername.includes("@")
        ? rawUsername
        : `${rawUsername}@llc.com`

    const { error } = await supabase.auth.signInWithPassword({
        email:    emailToUse,
        password,
    })

    if (error) {
        // Give a friendly message regardless of mode
        return { error: "Incorrect username or password." }
    }

    // After login, verify the user's role matches the mode they used.
    // This prevents a supervisor from stumbling into the manager panel
    // just by clicking the wrong button.
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        await supabase.auth.signOut()
        return { error: "Unable to load this account. Please try again." }
    }

    const { data: profile, error: profileError }  = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()

    if (profileError || !profile) {
        await supabase.auth.signOut()
        return { error: "No valid profile is configured for this account." }
    }

    const role = profile.role

    if (mode === "manager" && role !== "manager" && role !== "admin") {
        await supabase.auth.signOut()
        return { error: "This account does not have manager access." }
    }

    if (mode === "admin" && role !== "admin") {
        await supabase.auth.signOut()
        return { error: "Access denied." }
    }

    if (mode === "supervisor" && role !== "supervisor" && role !== "procurement") {
        await supabase.auth.signOut()
        return { error: "This account must use its assigned access level." }
    }

    revalidatePath("/", "layout")
    redirect("/dashboard")
}
