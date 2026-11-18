import type { MetadataRoute } from "next"

/**
 * Web app manifest — this is what makes "Add to Home Screen" produce a real app icon
 * and launch without browser chrome, rather than a screenshot-of-a-webpage bookmark.
 *
 * Supervisors run this on their own phones, all shift, on the factory floor. Standalone
 * display matters for them specifically: no address bar means no accidental navigation
 * away from a half-filled form, and the extra ~60px of height is a whole field on a
 * small screen.
 *
 * Icons come from scripts/gen-icons.mjs, all derived from public/logo.png. The maskable
 * copy is separate on purpose: Android crops icons to whatever shape the launcher uses,
 * so it needs the mark inside a smaller safe zone — feeding the same padding to both
 * would either clip the logo or leave the plain icon floating in white space.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lawson Limited Company — Production Management",
    // What actually fits under a home-screen icon; the full name is truncated there.
    short_name: "Lawson",
    description:
      "Daily production records, stock levels and shift reporting for Lawson Limited Company.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Phones are held upright on the line, and every screen is a single column.
    orientation: "portrait",
    // Matches --surface-page (light) so the splash and the status bar agree instead of
    // flashing white before the first paint.
    background_color: "#f4f6f5",
    theme_color: "#f4f6f5",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
