import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import ProfileForm from "./profile-form"

export default async function ProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    // Fetch the user's profile data
    const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single()

    const displayUsername = user.email?.split('@')[0] || ''

    return (
        <div className="space-y-8 max-w-4xl mx-auto animate-fade-in-up">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard" className="p-2 bg-white rounded-full border border-emerald-100 hover:bg-emerald-50 transition-colors text-emerald-700">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-emerald-950">My Profile</h2>
                        <p className="text-emerald-700/80 font-medium mt-1">Manage your account information and preferences.</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-emerald-100">
                <ProfileForm
                    userId={user.id}
                    initialData={profile || {}}
                    username={displayUsername}
                    supervisorId={profile?.supervisor_id || ''}
                />
            </div>
        </div>
    )
}
