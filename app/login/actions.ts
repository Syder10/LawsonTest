"use server"

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(state: any, formData: FormData) {
    const supabase = await createClient()

    const rawUsername = formData.get('username') as string
    const password = formData.get('password') as string

    let emailToUse = rawUsername

    // If it's not an email, assume it's a supervisor_id (e.g., BLE_001)
    if (!rawUsername.includes('@')) {
        // Query the profiles table to cross-reference the supervisor_id
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('email')
            .eq('supervisor_id', rawUsername)
            .single()

        if (profileError || !profile) {
            return { error: 'Invalid Username or Supervisor ID' }
        }

        emailToUse = profile.email
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
