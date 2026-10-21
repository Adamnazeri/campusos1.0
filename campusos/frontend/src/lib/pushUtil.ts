// Fungsi tulen untuk Web Push (boleh diuji dalam Node).

/** Kunci VAPID base64url → bait untuk pushManager.subscribe({ applicationServerKey }). */
export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Adakah langganan pelayar menggunakan kunci pelayan semasa? (jika kunci VAPID bertukar, langganan lama tidak sah) */
export function sameKey(current: ArrayBuffer | null | undefined, wanted: string): boolean {
  if (!current) return false
  const a = new Uint8Array(current), b = urlBase64ToUint8Array(wanted)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export type PushStatus = 'ok' | 'unsupported' | 'needs-install' | 'denied' | 'unavailable' | 'error'
