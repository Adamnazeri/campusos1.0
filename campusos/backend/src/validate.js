import { HttpError } from './http.js'

const bad = (field, msg) => new HttpError(400, 'VALIDATION_ERROR', `${field}: ${msg}`, { field })

export function str(v, field, { max = 200, required = false, min = 0 } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(field, 'wajib diisi')
    return null
  }
  if (typeof v !== 'string') throw bad(field, 'mesti string')
  const t = v.trim()
  if (required && !t) throw bad(field, 'wajib diisi')
  if (t && t.length < min) throw bad(field, `minimum ${min} aksara`)
  if (t.length > max) throw bad(field, `maksimum ${max} aksara`)
  return t || null
}

export function int(v, field, { min = -Infinity, max = Infinity, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(field, 'wajib diisi')
    return null
  }
  if (typeof v !== 'number' || !Number.isInteger(v)) throw bad(field, 'mesti nombor bulat')
  if (v < min || v > max) throw bad(field, `mesti antara ${min} dan ${max}`)
  return v
}

export function oneOf(v, field, list, { required = false, fallback } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(field, 'wajib diisi')
    return fallback ?? null
  }
  if (!list.includes(v)) throw bad(field, `mesti salah satu daripada ${list.join(', ')}`)
  return v
}

export function date(v, field, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(field, 'wajib diisi')
    return null
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z')) ||
      new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v) throw bad(field, 'format mesti YYYY-MM-DD')
  return v
}

export function time(v, field, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(field, 'wajib diisi')
    return null
  }
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(field, 'format mesti HH:MM')
  return v
}

export function email(v, field = 'email', required = true) {
  const e = str(v, field, { max: 254, required })?.toLowerCase() ?? null
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad(field, 'format tidak sah')
  return e
}

export function password(v, field = 'password') {
  if (typeof v !== 'string' || v.length < 8) throw bad(field, 'minimum 8 aksara')
  if (v.length > 200) throw bad(field, 'terlalu panjang')
  return v
}

export function list(v, field, { max = 200 } = {}) {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw bad(field, 'mesti array')
  if (v.length > max) throw bad(field, `maksimum ${max} item`)
  return v
}

export const bool = (v) => (v ? 1 : 0)
export const clock = { toMin: (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)), fmt: (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }
export { bad }
