// Gloop's app icon: a lime goo blob (lumps fused by a metaball filter, a droplet pinching off)
// holding the Lucide dumbbell in dark ink. Writes the SVG sources; scripts/icon-png.cjs renders
// the PNGs. Run: node scripts/icon.mjs && node scripts/icon-png.cjs
import { writeFileSync } from 'node:fs'

const LIME = '#c6f432'
const INK = '#0b0c0f'
const DUMBBELL = [
  'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z',
  'm2.5 21.5 1.4-1.4',
  'm20.1 3.9 1.4-1.4',
  'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z',
  'm9.6 14.4 4.8-4.8',
]

/** The icon at 512 × 512. `bg`: draw the dark square (app icons) or leave it clear (favicon). `k`: blob scale. */
function icon({ bg = true, k = 1 } = {}) {
  const c = (x, y, r) => `<circle cx="${256 + (x - 256) * k}" cy="${256 + (y - 256) * k}" r="${r * k}"/>`
  const lumps = [
    c(248, 258, 146), // body, a little off-centre
    c(166, 200, 72), // lumps that keep it from reading as a circle
    c(352, 236, 74),
    c(184, 348, 68),
    // a drip running off the bottom right
    c(318, 384, 34),
    c(330, 424, 30),
    // a droplet pinching off the top right, on a thin neck
    c(350, 150, 12),
    c(382, 118, 26),
  ].join('')
  const s = 8.6 * k // dumbbell: 24-unit Lucide icon at about 206 px
  const d = DUMBBELL.map((p) => `<path d="${p}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <filter id="goo" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceGraphic" stdDeviation="12"/>
      <feColorMatrix mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"/>
    </filter>
  </defs>
  ${bg ? `<rect width="512" height="512" fill="${INK}"/>` : ''}
  <g fill="${LIME}" filter="url(#goo)">${lumps}</g>
  <g transform="translate(${250 - 12 * s} ${262 - 12 * s}) scale(${s})" fill="none" stroke="${INK}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${d}</g>
</svg>
`
}

writeFileSync('design-system/icon/gloop-icon.svg', icon())
writeFileSync('design-system/icon/gloop-icon-maskable.svg', icon({ k: 0.86 }))
writeFileSync('public/favicon.svg', icon({ bg: false }))
console.log('wrote design-system/icon/*.svg and public/favicon.svg')
