import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// Emits dist/sw.js with the exact list of built files baked in, so the app
// is fully available offline after the first visit.
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'))
      const publicFiles = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon.svg']
      const precache = ['./', ...files, ...publicFiles]
      const version = createHash('sha1').update(precache.join('|')).digest('hex').slice(0, 10)
      const template = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [preact(), serviceWorker()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { target: 'es2022' },
})
