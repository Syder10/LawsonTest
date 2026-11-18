import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
    const supabase = await createClient()
    await supabase.auth.signOut()

    revalidatePath('/', 'layout')
    return NextResponse.redirect(new URL('/login', request.url), {
        status: 302,
    })
}

// Allows protected server components to clear stale sessions when their
// profile is missing, instead of falling back to supervisor access.
export async function GET(request: NextRequest) {
    return POST(request)
}
