import { createServerSupabase } from "@/lib/supabase/server"
import ProfileForm from "./profile-form"
import { Card, PageHeader } from "@/components/primitives"

export default async function ProfilePage() {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return null

    const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, department, group_number")
        .eq("id", user.id)
        .single()

    const displayUsername = user.email?.split("@")[0] || ""

    return (
        <div className="space-y-6 max-w-3xl mx-auto animate-fade-in-up">
            <PageHeader title="My profile" description="Your account details and password." />
            <Card padded>
                <ProfileForm initialData={profile || {}} username={displayUsername} />
            </Card>
        </div>
    )
}
