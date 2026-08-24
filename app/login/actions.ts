"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getProfileForUser } from "@/lib/auth/profile"
import { isKnownRole, normalizeLoginMode, roleLabel, roleSatisfiesMode } from "@/lib/domain/roles"

export async function login(state: unknown, formData: FormData) {
    const supabase  = await createServerSupabase()
    const rawUsername = (formData.get("username") as string)?.trim()
    const password    = formData.get("password") as string
    const mode        = normalizeLoginMode(formData.get("mode") as string | null)

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

    // Verify the account's role clears the bar for the form they used. This stops
    // a supervisor walking into the manager/admin panel by clicking the wrong
    // button; it does NOT stop a manager/admin using the default form.
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        await supabase.auth.signOut()
        return { error: "Unable to load this account. Please try again." }
    }

    const { profile, error: profileError } = await getProfileForUser(supabase, user.id)

    if (profileError || !profile) {
        await supabase.auth.signOut()
        return { error: "No valid profile is configured for this account." }
    }

    const role = profile.role

    if (!isKnownRole(role)) {
        await supabase.auth.signOut()
        return { error: `This account has an unrecognised role ("${role}"). Please contact an administrator.` }
    }

    if (!roleSatisfiesMode(role, mode)) {
        await supabase.auth.signOut()
        // Naming the account's ACTUAL role matters: the password already verified
        // who they are, and a generic refusal makes a mis-assigned role almost
        // impossible to diagnose from the outside.
        const required = mode === "admin" ? "Administrator" : "Manager"
        return {
            error:
                `This is a ${roleLabel(role)} account, so it cannot sign in here — ` +
                `${required} access is required. If that is wrong, ask an administrator ` +
                `to update your role (it is stored on your profile, not on your login).`,
        }
    }

    revalidatePath("/", "layout")
    redirect("/dashboard")
}
