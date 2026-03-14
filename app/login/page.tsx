import { login } from './actions'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
    return (
        <div className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden px-4 bg-gradient-to-br from-emerald-50 via-white to-green-50">
            {/* Refined gradient orbs for ambient lighting */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-300/30 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-green-300/30 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl rounded-3xl p-8 z-10 transition-all duration-500 hover:shadow-emerald-500/10">
                <div className="flex flex-col items-center justify-center space-y-6 mb-8">
                    <Image
                        src="/logo.png"
                        alt="Lawson LLC Logo"
                        width={120}
                        height={120}
                        className="drop-shadow-lg rounded-full bg-white p-2"
                        priority
                    />
                    <div className="text-center space-y-2">
                        <h1 className="text-2xl font-bold text-emerald-950 tracking-tight">Welcome, Super!</h1>
                        <p className="text-sm font-medium text-emerald-700/70 tracking-wide">Sign in to your account</p>
                    </div>
                </div>

                <form className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="username" className="text-emerald-900 font-semibold">Username</Label>
                        <Input
                            id="username"
                            name="username"
                            type="text"
                            placeholder="e.g., john.doe"
                            required
                            className="w-full p-6 text-base rounded-xl border-emerald-100 bg-white/50 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-emerald-900 font-semibold">Password</Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            placeholder="••••••••"
                            required
                            className="w-full p-6 text-base rounded-xl border-emerald-100 bg-white/50 focus:border-emerald-500 focus:ring-emerald-500/20 transition-all"
                        />
                    </div>

                    <Button
                        formAction={login}
                        className="w-full py-6 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]"
                    >
                        Sign In
                    </Button>
                </form>
            </div>
        </div>
    )
}
