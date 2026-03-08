"use server"

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
    const supabase = await createClient()

    // We are using 'username' (which we map to email internally or we setup Supabase to use username)
    // Standard Supabase Auth uses email. If the user strictly wants a username, we usually spoof the domain for them (e.g. username@lawson.local)
    // Let's assume standard email auth for now but styled as username, or we append a domain.

    const rawUsername = formData.get('username') as string
    const password = formData.get('password') as string

    // Simple trick: if they type 'john', we log them in as 'john@lawson.com' to satisfy Supabase's email requirement
    const email = rawUsername.includes('@') ? rawUsername : `${rawUsername}@lawson.com`

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
}
