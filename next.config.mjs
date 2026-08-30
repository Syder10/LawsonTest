/** @type {import('next').NextConfig} */
const nextConfig = {
  // v0 scaffolded this as `ignoreBuildErrors: true`, which meant a production
  // build shipped whatever tsc rejected. tsc is a gate in its own right
  // (scripts/check.sh) and is clean, so the build now enforces it too.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
