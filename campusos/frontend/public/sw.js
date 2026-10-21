/* Service worker CampusOS: membolehkan "Pasang app" dan paparan segera.
   PENTING: tiada data API (/v1/*) pernah dicache (data sekolah/pengguna sentiasa dari pelayan). Hanya fail aplikasi (HTML + /assets/*). */
const CACHE = 'campusos-shell-v1'

self.addEventListener('install', () => { self.skipWaiting() })

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/v1/') || url.pathname === '/health') return // data: jangan sentuh

  // Halaman: rangkaian dahulu (versi terbaharu), simpan salinan untuk luar talian
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); return res })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }
  // Fail ber-hash (JS/CSS): tidak berubah, cache dahulu
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      })),
    )
  }
})

// Web Push: alarm kelas dari pelayan (berfungsi walaupun app ditutup / telefon dikunci)
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data ? e.data.text() : '' } }
  const loud = d.kind === 'start' || d.kind === 'end'
  e.waitUntil(self.registration.showNotification(d.title || 'CampusOS', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    requireInteraction: loud, // kekal di skrin sehingga diketik
    vibrate: d.kind === 'end' ? [700, 250, 700] : [400, 200, 400, 200, 400],
    data: { url: d.url || '/' },
  }))
})

// Ketik notifikasi alarm kelas → buka/fokus aplikasi
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus()
    return self.clients.openWindow('/')
  }))
})
