// Fungsi pemformatan tulen (hanya bergantung pada lib/i18n, juga tulen). Diuji dalam tests/format.test.ts
import { getLang, t } from './i18n.ts'
import { EMPTY } from './empty.ts'
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MON_MS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis']
const MON = { at: (i: number) => (getLang() === 'ms' ? MON_MS : MON_EN)[i] }

/** "2026-10-05" → "05 Oct" */
export const fmtDay = (iso?: string | null) => (iso ? `${iso.slice(8, 10)} ${MON.at(Number(iso.slice(5, 7)) - 1)}` : EMPTY)
export const fmtMonYear = (iso?: string | null) => (iso ? `${MON.at(Number(iso.slice(5, 7)) - 1)} ${iso.slice(0, 4)}` : EMPTY)
export const monthOf = (iso: string) => MON.at(Number(iso.slice(5, 7)) - 1).toUpperCase()

/** Terjemah singkatan hari dalam teks jadual (cth. "Mon, Wed · 08:00" → "Isn, Rab · 08:00"). */
export const fmtSchedule = (s?: string | null) =>
  s ? s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (d) => t(d)) : EMPTY

export function ago(ms: number, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ms) / 60_000))
  if (m < 1) return t('just now')
  if (m < 60) return t('{n}m ago', { n: m })
  if (m < 1440) return t('{n}h ago', { n: Math.round(m / 60) })
  return t('{n}d ago', { n: Math.round(m / 1440) })
}
export const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5)

/** Nilai EMPTY (pemegang tempat daripada adapter) → '' supaya borang suntingan tidak menghantar EMPTY ke API. */
export const blankIfDash = (v?: string | null) => (!v || v === EMPTY ? '' : v)

/** Huruf pertama (maks 2) nama organisasi, untuk logo kecil di sidebar. */
export const orgInitials = (name: string) =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '·'

/** Tukar nombor telefon Malaysia/antarabangsa (cth. 012-3456789 → 60123456789) kepada pautan wa.me. */
export function whatsappUrl(phone?: string | null, text?: string): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D+/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) digits = '60' + digits.slice(1)
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
