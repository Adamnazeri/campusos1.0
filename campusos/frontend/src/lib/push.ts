// Web Push di pelayar: langgan/nyahlangganan, selaras tetapan alarm dengan pelayan.
import { api } from './api'
import { getLang } from './i18n'
import { askNotifyPermission } from './alarm'
import { isIOS, isStandalone } from './pwa'
import { sameKey, urlBase64ToUint8Array, type PushStatus } from './pushUtil'
import type { AlarmSettings } from './alarmLogic'

const FLAG = 'campusos.push'
export const PUSH_EVENT = 'campusos:push-flag'

export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext
/** Pengguna telah menghidupkan alarm latar belakang pada peranti ini. */
export function pushActive(): boolean { try { return localStorage.getItem(FLAG) === '1' } catch { return false } }
function setFlag(on: boolean) {
  try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG) } catch { /* storan diblokir */ }
  window.dispatchEvent(new Event(PUSH_EVENT))
}

const prefsOf = (s: AlarmSettings) => ({ enabled: s.enabled, start: s.start, end: s.end, leadMin: s.leadMin })

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
  await navigator.serviceWorker.ready
  return reg
}

/** Dapatkan (atau cipta) langganan pelayar dan daftarkan kepada pelayan. */
async function subscribeAndRegister(s: AlarmSettings): Promise<PushStatus> {
  const cfg = await api.pushConfig()
  if (!cfg.enabled || !cfg.publicKey) return 'unavailable'
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub.options.applicationServerKey, cfg.publicKey)) { await sub.unsubscribe().catch(() => {}); sub = null }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) as BufferSource })
  await api.pushSubscribe({ subscription: sub.toJSON(), prefs: prefsOf(s), lang: getLang() })
  return 'ok'
}

export async function enablePush(s: AlarmSettings): Promise<PushStatus> {
  try {
    if (!pushSupported()) return 'unsupported'
    if (isIOS() && !isStandalone()) return 'needs-install' // iOS hanya benarkan push untuk app yang dipasang
    if ((await askNotifyPermission()) !== 'granted') return 'denied'
    const r = await subscribeAndRegister(s)
    if (r === 'ok') setFlag(true)
    return r
  } catch { return 'error' }
}

export async function disablePush(): Promise<void> {
  setFlag(false)
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) { await api.pushUnsubscribe(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}) }
  } catch { /* tidak kritikal */ }
}

/** Selaras tetapan/bahasa dengan pelayan (dan langgan semula jika langganan pelayar hilang/kunci bertukar). Senyap jika gagal. */
export async function syncPush(s: AlarmSettings): Promise<void> {
  if (!pushActive() || !pushSupported() || Notification.permission !== 'granted') return
  try { await subscribeAndRegister(s) } catch { /* cuba lagi pada ketika seterusnya */ }
}

/** Semasa log keluar: putuskan peranti ini daripada pengguna (telefon boleh dikongsi). Langganan pelayar dikekalkan; ia didaftar semula apabila log masuk. */
export async function pushOnLogout(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await api.pushUnsubscribe(sub.endpoint).catch(() => {})
  } catch { /* tidak kritikal */ }
}

export async function sendTestPush(): Promise<{ devices: number; sent: number } | null> {
  try { return await api.pushTest(getLang()) } catch { return null }
}
