"use server"

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(state: any, formData: FormData) {
    const supabase = await createClient()

    const rawUsername = formData.get('username') as string
    const password = formData.get('password') as string

    let emailToUse = rawUsername

    // If it's not an email, append @llc.com
    if (!rawUsername.includes('@')) {
        emailToUse = `${rawUsername}@llc.com`
    }

    const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
    })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
}
