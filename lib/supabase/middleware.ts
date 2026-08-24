import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // Without credentials createServerClient() throws, and because this runs in
    // middleware that turned EVERY route — including the health check — into an
    // opaque 500 stack trace. Fail closed with a readable message instead, but
    // let /api/health through so the misconfiguration stays diagnosable.
    if (!supabaseUrl || !supabaseAnonKey) {
        if (request.nextUrl.pathname === '/api/health') {
            return NextResponse.next({ request })
        }
        const missing = [
            !supabaseUrl && 'NEXT_PUBLIC_SUPABASE_URL',
            !supabaseAnonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        ].filter(Boolean).join(', ')
        console.error(`[middleware] Supabase is not configured — missing ${missing}.`)
        return new NextResponse(
            `Server configuration error: ${missing} is not set.\n\n` +
            `Set it in your hosting provider's environment variables and redeploy.\n` +
            `Visit /api/health for a full check.`,
            { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
        )
    }

    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Protect all routes except the landing page and login page
    const isPublicRoute = request.nextUrl.pathname === '/' || request.nextUrl.pathname.startsWith('/login')

    // Also allow API routes related to public things if needed, or webhooks
    const isApiRoute = request.nextUrl.pathname.startsWith('/api/')

    if (!user && !isPublicRoute && !isApiRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // If user is already logged in, they shouldn't visit /login
    if (user && request.nextUrl.pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
