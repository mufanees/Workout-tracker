// Capacitor wrapper for the Android app (see README → "Android app").
// The app loads the live site, so a web deploy updates the app too; the bundled `dist`
// is only the fallback Capacitor needs to sync. Native code lives in android/ (plugins in
// android/app/src/main/java/my/novas/gloop/), and src/native.ts is the JS side.
// Not imported by the server (server/ stays dependency-free) or by the web bundle.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'my.novas.gloop',
  appName: 'Gloop',
  webDir: 'dist',
  server: {
    url: 'https://gloopapp.novas.my',
    androidScheme: 'https',
    allowNavigation: ['gloopapp.novas.my', 'gloop.novas.my'],
  },
  // Gloop's dark background behind the WebView, so nothing flashes white while the site loads
  backgroundColor: '#0b0c0f',
  android: {
    // the site is https only; no mixed content, no cleartext
    allowMixedContent: false,
  },
}

export default config
