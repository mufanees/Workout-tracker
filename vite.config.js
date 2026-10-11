import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'

// Which build this is, so Settings can say whether you're on the latest. Coolify passes the commit as
// SOURCE_COMMIT (the Docker build has no .git); locally it comes from git. The build time always differs.
function buildInfo() {
  let commit = process.env.SOURCE_COMMIT || ''
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      commit = ''
    }
  }
  const time = Date.now()
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  return { version, commit: commit.slice(0, 7), time, id: `${commit.slice(0, 7) || 'build'}-${time.toString(36)}` }
}
const BUILD = buildInfo()

// Emits dist/sw.js with the exact list of built files baked in, so the app
// is fully available offline after the first visit.
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'))
      const publicFiles = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.svg', 'badge-96.png']
      // shared/live.mjs (notification text and badge drawing) pasted into the worker without its exports
      const live = readFileSync(new URL('./shared/live.mjs', import.meta.url), 'utf8').replace(/^export /gm, '')
      const precache = ['./', ...files, ...publicFiles]
      const version = createHash('sha1').update(precache.join('|')).digest('hex').slice(0, 10)
      const template = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
      const source = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('/* __LIVE__ */', () => live)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
      // the server reads this and reports it from /api/health
      this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify(BUILD) })
    },
  }
}

export default defineConfig({
  plugins: [preact(), serviceWorker()],
  define: { __BUILD__: JSON.stringify(BUILD) },
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { target: 'es2022' },
})
