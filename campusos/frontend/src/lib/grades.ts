// Pengiraan gred tulen (bergantung pada lib/i18n sahaja). Diuji dalam tests/grades.test.ts
import { t as tr } from './i18n.ts'
export type GradeBand = { grade: string; min: number }
const r1 = (n: number) => Math.round(n * 10) / 10

export const pctOf = (mark: number | null | undefined, max: number) => (mark === null || mark === undefined || !Number.isFinite(mark) || max <= 0 ? null : r1((mark / max) * 100))

/** Sama dengan backend: gred pertama (menurun mengikut min) yang dicapai oleh peratus itu. */
export function gradeFor(p: number | null, scale: GradeBand[]): string | null {
  if (p === null) return null
  const s = [...scale].sort((a, b) => b.min - a.min)
  return (s.find((x) => p >= x.min) ?? s[s.length - 1])?.grade ?? null
}

/** Semak input markah (rentetan daripada <input>). Pulangkan {value} atau {error}. Kosong = tiada markah. */
export function parseMark(raw: string, max: number): { value: number | null } | { error: string } {
  const t = raw.trim().replace(',', '.')
  if (t === '') return { value: null }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { error: tr('Enter a number (up to 2 decimals)') }
  const n = Number(t)
  if (n > max) return { error: tr('Cannot be more than {max}', { max }) }
  return { value: n }
}

/** Semak skala gred yang diedit pengguna; pulangkan mesej ralat atau null. */
export function scaleError(scale: { grade: string; min: string | number }[]): string | null {
  if (scale.length < 2) return tr('Add at least two grades.')
  const names = scale.map((g) => g.grade.trim().toLowerCase())
  if (names.some((n) => !n)) return tr('Every grade needs a name.')
  if (new Set(names).size !== names.length) return tr('Grade names must be different.')
  const mins = scale.map((g) => Number(g.min))
  if (mins.some((m) => !Number.isInteger(m) || m < 0 || m > 100)) return tr('Minimum % must be a whole number from 0 to 100.')
  if (new Set(mins).size !== mins.length) return tr('Each grade needs a different minimum %.')
  if (!mins.includes(0)) return tr('One grade must start at 0%.')
  return null
}
