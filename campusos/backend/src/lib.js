import { HttpError } from './http.js'
import { newId } from './security.js'
import { bad } from './validate.js'

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const JS_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const DEFAULT_SETTINGS = {
  academicYear: '2025/26', term: 'Term 1', autoArchive: true, holidays: true,
  operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], dayStart: '08:00', dayEnd: '16:00',
  attendanceTarget: 92,
  // skala gred (peratus minimum → gred); boleh diubah di Settings
  gradeScale: [{ grade: 'A', min: 80 }, { grade: 'B', min: 70 }, { grade: 'C', min: 60 }, { grade: 'D', min: 50 }, { grade: 'E', min: 40 }, { grade: 'F', min: 0 }],
  leaveAllowance: { Annual: 14, Medical: 10, Casual: 6 },
  notifications: { conflicts: true, leave: true, attendance: true, digest: false },
  security: { twoFactor: false, sessionTimeoutMin: 30 },
}

/** Gred bagi peratus markah mengikut skala (disusun menurun mengikut min). */
export const gradeFor = (pctValue, scale) => {
  if (pctValue === null || pctValue === undefined) return null
  const s = [...scale].sort((a, b) => b.min - a.min)
  return (s.find((x) => pctValue >= x.min) ?? s[s.length - 1]).grade
}

export const created = (data) => ({ __status: 201, data })
export const csvReply = (name, body) => ({ __raw: { status: 200, body, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` } } })

export const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (d, n) => isoDate(Date.parse(d + 'T00:00:00Z') + n * 86_400_000)
export const dayName = (d) => JS_DAY[new Date(d + 'T00:00:00Z').getUTCDay()]
export const isWeekday = (d) => !['Sat', 'Sun'].includes(dayName(d))

export function weekdaysBetween(from, to) {
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWeekday(d)) n++
  return n
}

export const round1 = (n) => Math.round(n * 10) / 10
export const pct = (num, den) => (den ? round1((num / den) * 100) : null)

export function workloadStatus(h) {
  return h < 16 ? 'Light' : h < 25 ? 'Healthy' : h < 32 ? 'Heavy' : 'Overloaded'
}

/** Waktu setempat organisasi dari medan timezone seperti "GMT (UTC+1)". */
export function orgClock(org, atMs = Date.now()) {
  const m = /UTC([+-]\d+)(?::(\d+))?/.exec(org?.timezone ?? '')
  const offsetMin = m ? Number(m[1]) * 60 + Math.sign(Number(m[1]) || 1) * Number(m[2] ?? 0) : 0
  const local = new Date(atMs + offsetMin * 60_000)
  const date = local.toISOString().slice(0, 10)
  return { ms: atMs, date, day: JS_DAY[local.getUTCDay()], minutes: local.getUTCHours() * 60 + local.getUTCMinutes() }
}

export function makeCtx(db, config) {
  const cache = new Map()
  const q = (sql) => {
    let s = cache.get(sql)
    if (!s) cache.set(sql, (s = db.prepare(sql)))
    return s
  }
  // handler yang memakai tx() mesti sinkron di dalamnya (tiada await)
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE')
    try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { db.exec('ROLLBACK'); throw e }
  }
  const must = (row, what = 'Data') => {
    if (!row) throw new HttpError(404, 'NOT_FOUND', `${what} tidak ditemui`)
    return row
  }
  const log = (user, text) =>
    q('INSERT INTO activity (id,org_id,user_id,actor,text,at) VALUES (?,?,?,?,?,?)')
      .run(newId(), user.org_id, user.id ?? null, user.name ?? 'System', text, Date.now())

  /** Cari baris dalam organisasi mengikut id ATAU nama. null jika kosong; 400 jika tidak wujud. */
  const ref = (table, orgId, v, field) => {
    if (v === undefined || v === null || v === '') return null
    if (typeof v !== 'string') throw bad(field, 'mesti id atau nama')
    const row = q(`SELECT id FROM ${table} WHERE org_id=? AND (id=? OR name=?)`).get(orgId, v, v)
    if (!row) throw bad(field, `"${v}" tidak wujud`)
    return row.id
  }
  const teacherRef = (orgId, v, field) => {
    if (v === undefined || v === null || v === '') return null
    const row = q('SELECT id FROM teachers WHERE org_id=? AND active=1 AND (id=? OR name=? OR email=?)').get(orgId, v, v, v)
    if (!row) throw bad(field, `guru "${v}" tidak wujud`)
    return row.id
  }

  const settingsOf = (org) => {
    let s = {}
    try { s = JSON.parse(org.settings || '{}') } catch { /* gunakan lalai */ }
    const merged = { ...DEFAULT_SETTINGS, ...s }
    for (const k of ['leaveAllowance', 'notifications', 'security']) merged[k] = { ...DEFAULT_SETTINGS[k], ...(s[k] ?? {}) }
    return merged
  }

  const teacherOf = (user) => q('SELECT * FROM teachers WHERE org_id=? AND user_id=? AND active=1').get(user.org_id, user.id) ?? null

  return { db, config, q, tx, must, log, ref, teacherRef, settingsOf, teacherOf, svc: {} }
}
