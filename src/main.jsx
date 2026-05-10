import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ─── Persistent storage ──────────────────────────────────────────────
// On iOS PWAs (and other browsers), localStorage CAN be evicted under
// storage pressure. We request "persistent" storage so the OS treats
// our data as durable and won't auto-clear it.
//
// This is fire-and-forget: if it succeeds, great; if not, we still work.
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted()
      if (!isPersisted) {
        const granted = await navigator.storage.persist()
        // eslint-disable-next-line no-console
        console.info('[storage] persistent:', granted)
      }
    } catch {
      // ignore — non-critical
    }
  }
}

// ─── Service worker registration ─────────────────────────────────────
// Registers the app-shell SW so the app works offline and can be
// installed to home screen on iOS / Android.
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // ignore — non-critical
      })
    })
  }
}

requestPersistentStorage()
registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <App />
)
