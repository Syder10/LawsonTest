"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createServerSupabase } from "@/lib/supabase/server"
import { getProfileForUser } from "@/lib/auth/profile"
import { isKnownRole } from "@/lib/domain/roles"

// Sign in. ONE path for every role — see app/login/page.tsx for why the three
// "modes" were removed. What a user can do afterwards is decided entirely by
// profiles.role, which app/dashboard/page.tsx and lib/auth/guards.ts read.
export async function login(state: unknown, formData: FormData) {
    const supabase = await createServerSupabase()
    const rawUsername = (formData.get("username") as string)?.trim()
    const password = formData.get("password") as string

    if (!rawUsername || !password) {
        return { error: "Enter your username and password." }
    }

    // All accounts use @llc.com — append it if a bare username was typed.
    const emailToUse = rawUsername.includes("@") ? rawUsername : `${rawUsername}@llc.com`

    const { error } = await supabase.auth.signInWithPassword({ email: emailToUse, password })

    if (error) {
        // Deliberately not specific about WHICH is wrong: saying "no such user"
        // would let anyone enumerate valid accounts.
        return { error: "That username and password don’t match." }
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        await supabase.auth.signOut()
        return { error: "Couldn’t load this account. Please try again." }
    }

    // A login without a profile has no role, department or rotation, so nothing
    // downstream can decide what it may do. Sign back out rather than land the
    // user on a dashboard that will fail every request.
    const { profile, reason } = await getProfileForUser(supabase, user.id)

    if (!profile) {
        await supabase.auth.signOut()
        // Three distinct causes with three different fixes — never collapse them.
        const messages = {
            missing:
                "This login exists but has no profile record yet, so it has no role or department. " +
                "An administrator needs to create your profile before you can sign in.",
            misconfigured:
                "The server is missing its database credentials, so your profile could not be loaded. " +
                "An administrator needs to check the deployment's environment variables " +
                "(SUPABASE_SERVICE_ROLE_KEY) and redeploy.",
            unreadable:
                "The database refused to load your profile. An administrator should check the " +
                "profiles access policy and the server logs.",
        } as const
        return { error: messages[reason as keyof typeof messages] ?? messages.unreadable }
    }

    if (!isKnownRole(profile.role)) {
        await supabase.auth.signOut()
        return {
            error: `This account has an unrecognised role ("${profile.role}"). Please contact an administrator.`,
        }
    }

    revalidatePath("/", "layout")
    redirect("/dashboard")
}
