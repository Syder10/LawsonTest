import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

// Exposed as CSS variables so globals.css can wire them into Tailwind's
// --font-sans / --font-mono. Previously only `geist.className` was applied to
// <body> and `@theme` never defined --font-sans, so `font-sans` on the dashboard
// layout resolved to Tailwind's default stack and overrode Geist for the entire
// authenticated app. Geist_Mono was downloaded and never used at all.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" })

export const metadata: Metadata = {
  title: "Lawson Limited Company — Production Management System",
  description:
    "Production management and daily records tracking for Lawson Limited Company. Track and manage production data with precision and efficiency.",
  // iOS ignores most of the web app manifest, so the home-screen behaviour has to be
  // stated again here: without `capable` it opens in Safari with the address bar, which
  // is the difference between an app and a bookmark. Icons come from the app/icon.png
  // and app/apple-icon.png file conventions; the manifest itself from app/manifest.ts.
  appleWebApp: {
    capable: true,
    title: "Lawson",
    // The app's surfaces are light, so a dark status bar overlay would be unreadable.
    statusBarStyle: "default",
  },
  applicationName: "Lawson",
  formatDetection: { telephone: false },
}

// Supervisors work on phones on the factory floor: lock the initial scale to the
// device width and let content extend into the safe areas.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0d" },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning is required: next-themes sets the class on <html>
    // before React hydrates, so server and client markup differ by design.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Analytics />
          {/* Imported from components/ui/sonner (not straight from `sonner`) so
              toasts follow the active theme. The previous direct import meant the
              theme-aware wrapper never ran and richColors used sonner's own
              palette instead of ours. bottom-center puts dismissals in thumb
              reach on a phone. */}
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  )
}
