// Regenerates the app icons from public/logo.png:  node scripts/gen-icons.mjs
//
// Run this when the logo changes. Everything is derived from the one source file, so
// there is no set of hand-exported PNGs to drift out of step with it.
//
// Sizes and padding are not arbitrary: 192/512 are what the manifest asks for, the
// maskable variant keeps the mark inside Android's circular safe zone, and the Apple
// icon is opaque because iOS composites transparency onto black.
import sharp from "sharp"
import { mkdirSync } from "node:fs"

// public/logo.png is 597×521; rows 500-514 are empty and row 515 carries stray
// near-#EDEDED pixels, so crop to 500 rows first (same crop the splash uses), then
// trim the surrounding transparency to get a tight mark to lay out.
const cropped = await sharp("public/logo.png")
  .extract({ left: 0, top: 0, width: 597, height: 500 })
  .toBuffer()
// trim() in a separate pipeline: chained after extract, sharp rejects the area.
const base = await sharp(cropped).trim().toBuffer()

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

/** Logo centred on an opaque square. `cover` is the fraction of the square it fills. */
async function icon(size, cover, out) {
  const inner = Math.round(size * cover)
  const logo = await sharp(base).resize(inner, inner, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  const meta = await sharp(logo).metadata()
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(out, `${size}×${size}`, `logo ${meta.width}×${meta.height}`)
}

mkdirSync("public/icons", { recursive: true })
// Home-screen / manifest icons.
await icon(192, 0.78, "public/icons/icon-192.png")
await icon(512, 0.78, "public/icons/icon-512.png")
// Maskable: Android crops to a circle, so the mark must sit inside the safe zone.
await icon(512, 0.58, "public/icons/icon-maskable-512.png")
// Next file conventions: browser tab + iOS home screen.
await icon(512, 0.82, "app/icon.png")
await icon(180, 0.78, "app/apple-icon.png")
import sharp from "sharp"
import { mkdirSync } from "node:fs"

// public/logo.png is 597×521; rows 500-514 are empty and row 515 carries stray
// near-#EDEDED pixels, so crop to 500 rows first (same crop the splash uses), then
// trim the surrounding transparency to get a tight mark to lay out.
const cropped = await sharp("public/logo.png")
  .extract({ left: 0, top: 0, width: 597, height: 500 })
  .toBuffer()
// trim() in a separate pipeline: chained after extract, sharp rejects the area.
const base = await sharp(cropped).trim().toBuffer()

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

/** Logo centred on an opaque square. `cover` is the fraction of the square it fills. */
async function icon(size, cover, out) {
  const inner = Math.round(size * cover)
  const logo = await sharp(base).resize(inner, inner, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer()
  const meta = await sharp(logo).metadata()
  await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(out, `${size}×${size}`, `logo ${meta.width}×${meta.height}`)
}

mkdirSync("public/icons", { recursive: true })
// Home-screen / manifest icons.
await icon(192, 0.78, "public/icons/icon-192.png")
await icon(512, 0.78, "public/icons/icon-512.png")
// Maskable: Android crops to a circle, so the mark must sit inside the safe zone.
await icon(512, 0.58, "public/icons/icon-maskable-512.png")
// Next file conventions: browser tab + iOS home screen.
await icon(512, 0.82, "app/icon.png")
await icon(180, 0.78, "app/apple-icon.png")
