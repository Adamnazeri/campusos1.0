// Bahagian peranti alarm: tetapan tersimpan, bunyi (WebAudio), getaran, notifikasi sistem.
// Had pelayar: bunyi/getaran hanya berfungsi semasa app dibuka (atau baru dibuka di latar belakang). iOS tidak menyokong getaran dalam pelayar.
import { DEFAULT_ALARM, normalizeAlarm, type AlarmKind, type AlarmSettings } from './alarmLogic.ts'

const KEY = 'campusos.alarm'
const FIRED = 'campusos.alarm.fired'
export const ALARM_EVENT = 'campusos:alarm-settings'

export function loadAlarm(): AlarmSettings {
  try { return normalizeAlarm(JSON.parse(localStorage.getItem(KEY) ?? 'null')) } catch { return { ...DEFAULT_ALARM } }
}
export function saveAlarm(s: AlarmSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storan diblokir */ }
  window.dispatchEvent(new Event(ALARM_EVENT))
}

/** Kunci alarm yang sudah berbunyi (disimpan supaya muat semula halaman tidak membunyikan semula). Hanya untuk tarikh semasa. */
export function loadFired(date: string): Set<string> {
  try {
    const o = JSON.parse(localStorage.getItem(FIRED) ?? 'null') as { date: string; keys: string[] } | null
    return o && o.date === date ? new Set(o.keys) : new Set()
  } catch { return new Set() }
}
export function saveFired(date: string, keys: Set<string>) {
  try { localStorage.setItem(FIRED, JSON.stringify({ date, keys: [...keys] })) } catch { /* storan diblokir */ }
}

// ---- bunyi ----------------------------------------------------------------
let ctx: AudioContext | null = null
type ACtor = typeof AudioContext
function audio(): AudioContext | null {
  if (ctx) return ctx
  const A = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext) as ACtor | undefined
  if (!A) return null
  try { ctx = new A() } catch { ctx = null }
  return ctx
}
/** Panggil pada ketikan pertama pengguna: pelayar hanya benarkan bunyi selepas interaksi. */
export function unlockAudio() {
  const c = audio()
  if (c && c.state === 'suspended') void c.resume().catch(() => {})
}

function tone(c: AudioContext, freq: number, at: number, dur: number) {
  const o = c.createOscillator(), g = c.createGain()
  o.type = 'sine'; o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, at)
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(c.destination)
  o.start(at); o.stop(at + dur + 0.05)
}
/** mula/peringatan = tiga bunyi naik; tamat = dua bunyi turun */
function chime(kind: AlarmKind) {
  const c = audio()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => {})
  const t0 = c.currentTime + 0.05
  const notes = kind === 'end' ? [[784, 0], [523, 0.32]] : kind === 'soon' ? [[659, 0], [784, 0.25]] : [[523, 0], [659, 0.28], [784, 0.56]]
  for (const [f, d] of notes) tone(c, f, t0 + d, 0.3)
}
const PATTERN: Record<AlarmKind, number[]> = { start: [400, 200, 400, 200, 400], end: [700, 250, 700], soon: [300, 150, 300] }

/** Mula berbunyi + bergetar berulang setiap 3 saat (maks. 30 saat). Pulangkan fungsi henti. */
export function startRinging(kind: AlarmKind, o: { sound: boolean; vibrate: boolean }): () => void {
  const once = () => {
    if (o.sound) chime(kind)
    if (o.vibrate && typeof navigator.vibrate === 'function') navigator.vibrate(PATTERN[kind])
  }
  once()
  const iv = window.setInterval(once, 3000)
  const to = window.setTimeout(() => stop(), 30000)
  function stop() {
    window.clearInterval(iv); window.clearTimeout(to)
    if (typeof navigator.vibrate === 'function') navigator.vibrate(0)
  }
  return stop
}

// ---- notifikasi sistem ------------------------------------------------------
export const notifySupported = () => typeof Notification !== 'undefined'
export const notifyPermission = (): string => (notifySupported() ? Notification.permission : 'unsupported')
export async function askNotifyPermission(): Promise<string> {
  if (!notifySupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try { return await Notification.requestPermission() } catch { return Notification.permission }
}
export async function showSystemNotification(title: string, body: string, tag: string) {
  if (!notifySupported() || Notification.permission !== 'granted') return
  const opts = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', requireInteraction: true, vibrate: [300, 150, 300] } as NotificationOptions
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) await reg.showNotification(title, opts)
    else new Notification(title, opts)
  } catch { /* sesetengah pelayar tidak benarkan */ }
}
