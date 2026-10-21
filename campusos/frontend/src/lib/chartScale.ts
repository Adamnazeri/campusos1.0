// Logik tulen graf garis (tiada DOM): skala "cantik", tanda paksi, tarikh, titik terdekat. Diuji dalam tests/chart.test.ts.

const clean = (v: number) => Math.round(v * 1e9) / 1e9

/** Langkah "cantik" (1, 2, 5 × 10^n) supaya sekitar `count` selang meliputi `range`. */
export function niceStep(range: number, count: number): number {
  const raw = Math.max(range, 1e-9) / Math.max(1, count)
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
}

export type Domain = { min: number; max: number; step: number }

/**
 * Domain paksi menegak yang kemas. `cap` = had atas (cth. 100 untuk peratus; tidak melebihi). `floor` = had bawah (cth. 0; tidak kurang).
 * Titik data selalu berada dalam domain.
 */
export function niceDomain(lo: number, hi: number, count = 5, cap?: number, floor?: number): Domain {
  let a = lo, b = hi
  if (a === b) { const pad = Math.abs(a) * 0.1 || 1; a -= pad; b += pad }
  const top = cap !== undefined ? Math.min(b, cap) : b
  const step = niceStep(top - a, count)
  let min = Math.floor(clean(a / step)) * step
  if (floor !== undefined) min = Math.max(floor, min)
  let max = Math.ceil(clean(b / step)) * step
  if (cap !== undefined) max = Math.min(max, cap)
  if (max <= min) max = min + step
  return { min: clean(min), max: clean(max), step: clean(step) }
}

export function tickValues(d: Domain): number[] {
  const out: number[] = []
  for (let v = d.min; v <= d.max + d.step * 1e-9; v += d.step) out.push(clean(v))
  return out
}

/** Tanda kecil di antara tanda utama (seperti paksi pada graf rujukan). */
export function minorTicks(d: Domain, perStep = 4): number[] {
  const out: number[] = [], sub = d.step / perStep
  for (let v = d.min; v < d.max - sub * 1e-9; v += sub) if (Math.abs(clean(v / d.step) - Math.round(clean(v / d.step))) > 1e-6) out.push(clean(v))
  return out
}

export const linear = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0))
export const invert = (d0: number, d1: number, r0: number, r1: number) => (px: number) => (r1 === r0 ? d0 : d0 + ((px - r0) / (r1 - r0)) * (d1 - d0))

/** ISO (YYYY-MM-DD) → bilangan hari sejak 1970 (UTC, tanpa kesan zon masa). */
export function daysOf(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000) : NaN
}
export const isoOf = (days: number) => new Date(days * 86_400_000).toISOString().slice(0, 10)

const DATE_STEPS = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365]
/** Tanda tarikh: langkah hari terkecil (1, 2, 3, 7, 14, 30 ...) yang memberi tidak lebih daripada `maxTicks` tanda. */
export function dateTicks(minDay: number, maxDay: number, maxTicks: number): number[] {
  const span = Math.max(0, maxDay - minDay)
  const step = DATE_STEPS.find((s) => Math.floor(span / s) + 1 <= maxTicks) ?? DATE_STEPS[DATE_STEPS.length - 1]
  const out: number[] = []
  for (let d = minDay; d <= maxDay; d += step) out.push(d)
  return out
}

/** Paparkan setiap k-label supaya tidak bertindih: k terkecil dengan lebar setiap label ≥ labelPx. */
export function thinEvery(count: number, widthPx: number, labelPx: number): number {
  if (count <= 1) return 1
  const slot = widthPx / count
  return Math.max(1, Math.ceil(labelPx / Math.max(1, slot)))
}

/** Indeks nilai x terdekat (xs tersusun menaik). */
export function nearestIndex(xs: number[], x: number): number {
  if (!xs.length) return -1
  let best = 0, bd = Infinity
  for (let i = 0; i < xs.length; i++) { const d = Math.abs(xs[i] - x); if (d < bd) { bd = d; best = i } }
  return best
}

export const linePath = (pts: [number, number][]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p[0] * 100) / 100},${Math.round(p[1] * 100) / 100}`).join(' ')
