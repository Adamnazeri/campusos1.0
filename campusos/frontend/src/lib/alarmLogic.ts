// Logik tulen alarm kelas (tiada DOM). Boleh diuji dalam Node.
// Peraturan: alarm berbunyi pada masa mula dan masa tamat setiap sesi hari ini (+ peringatan awal pilihan).
// Jika telefon "terlewat bangun", alarm masih berbunyi dalam tempoh `graceSec`; selepas itu dilangkau (tidak membunyikan kelas yang sudah lama berlalu).

export type AlarmSettings = {
  enabled: boolean
  start: boolean // bunyi bila kelas bermula
  end: boolean // bunyi bila kelas tamat
  leadMin: 0 | 5 | 10 // peringatan awal sebelum mula (0 = tiada)
  sound: boolean
  vibrate: boolean
  notify: boolean // notifikasi sistem bila app di latar belakang
}

export const DEFAULT_ALARM: AlarmSettings = { enabled: false, start: true, end: true, leadMin: 0, sound: true, vibrate: true, notify: true }

export type AlarmSession = { id: string; className: string; subject?: string | null; room?: string | null; start: string; end: string; state?: string }
export type AlarmKind = 'soon' | 'start' | 'end'
export type AlarmEvent = { key: string; kind: AlarmKind; session: AlarmSession; atSec: number }

/** "HH:MM" → minit sejak tengah malam; tidak sah → NaN */
export function toMin(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

/** Gabungkan tetapan tersimpan dengan lalai; nilai rosak diabaikan. */
export function normalizeAlarm(raw: unknown): AlarmSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const b = (k: keyof AlarmSettings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_ALARM[k] as boolean))
  const lead = r.leadMin === 5 || r.leadMin === 10 ? r.leadMin : 0
  return { enabled: b('enabled'), start: b('start'), end: b('end'), leadMin: lead, sound: b('sound'), vibrate: b('vibrate'), notify: b('notify') }
}

/**
 * Alarm yang patut berbunyi sekarang.
 * @param nowSec saat sejak tengah malam (waktu peranti)
 * @param date tarikh hari ini (YYYY-MM-DD). Sebahagian daripada kunci supaya alarm tidak berulang
 * @param fired kunci alarm yang sudah berbunyi
 */
export function dueAlarms(sessions: AlarmSession[], nowSec: number, date: string, fired: ReadonlySet<string>, s: AlarmSettings, graceSec = 120): AlarmEvent[] {
  if (!s.enabled) return []
  const out: AlarmEvent[] = []
  for (const x of sessions) {
    if (x.state === 'cancelled') continue
    const st = toMin(x.start) * 60, en = toMin(x.end) * 60
    if (!Number.isFinite(st) || !Number.isFinite(en)) continue
    const cand: [AlarmKind, number, boolean][] = [
      ['soon', st - s.leadMin * 60, s.start && s.leadMin > 0],
      ['start', st, s.start],
      ['end', en, s.end],
    ]
    for (const [kind, at, on] of cand) {
      if (!on || at < 0) continue
      const key = `${date}|${x.id}|${kind}`
      if (nowSec >= at && nowSec - at <= graceSec && !fired.has(key)) out.push({ key, kind, session: x, atSec: at })
    }
  }
  return out.sort((a, b) => a.atSec - b.atSec)
}

/** Tarikh tempatan peranti sebagai YYYY-MM-DD. */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const secondsOfDay = (d = new Date()): number => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
