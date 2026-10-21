// "Pasang app" (PWA): tangkap acara pemasangan pelayar dan beri ciri-ciri kepada UI.
import { useEffect, useState } from 'react'

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: InstallPrompt | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPrompt; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; emit() })
}

/** Sedang berjalan sebagai app yang dipasang (bukan tab pelayar)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}
export function isIOS(): boolean {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)
}
export function isAndroid(): boolean { return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) }

export function useInstall() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    ios: isIOS(),
    android: isAndroid(),
    async install(): Promise<boolean> {
      if (!deferred) return false
      const p = deferred
      deferred = null; emit()
      try { await p.prompt(); return (await p.userChoice).outcome === 'accepted' } catch { return false }
    },
  }
}
