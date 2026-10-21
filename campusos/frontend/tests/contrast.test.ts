import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Kunci kontras (WCAG) untuk token warna dalam index.css, mod cerah DAN gelap. Jika seseorang menukar palet, ujian ini gagal bila teks menjadi sukar dibaca.
const css = readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {')
  assert.ok(start >= 0, `blok ${selector} tiada`)
  const end = css.indexOf('\n}', start)
  const out: Record<string, string> = {}
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2]
  return out
}
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => lin(v / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const mix = (fg: string, bg: string, a: number) => '#' + rgb(fg).map((v, i) => Math.round(v * a + rgb(bg)[i] * (1 - a)).toString(16).padStart(2, '0')).join('')

const themes: Record<string, Record<string, string>> = { cerah: block(':root'), gelap: block('.dark') }

// [teks, latar, minimum]
const PAIRS: [string, string, number][] = [
  ['foreground', 'background', 12], ['foreground', 'surface', 12], ['foreground', 'surface-2', 12],
  ['muted-foreground', 'background', 7], ['muted-foreground', 'surface', 7], ['muted-foreground', 'surface-2', 7], ['muted-foreground', 'muted', 5.5],
  ['primary-foreground', 'primary', 7], ['primary-foreground', 'primary-hover', 7], ['primary', 'background', 7], ['primary', 'surface', 7], ['primary', 'primary-soft', 6],
  ['foreground', 'primary-soft', 10], ['accent-foreground', 'accent', 7],
  ['sidebar-foreground', 'sidebar', 10], ['sidebar-muted', 'sidebar', 7], ['sidebar-foreground', 'sidebar-hover', 7], ['sidebar-muted', 'sidebar-hover', 6],
  ['sidebar-active-foreground', 'sidebar-active', 7], ['accent', 'sidebar', 7],
  ['ok', 'ok-soft', 4.5], ['warn', 'warn-soft', 4.5], ['danger', 'danger-soft', 4.5], ['info', 'info-soft', 4.5],
  ['ok', 'surface', 4.5], ['warn', 'surface', 4.5], ['danger', 'surface', 4.5], ['info', 'surface', 4.5],
  ['danger-foreground', 'danger', 4.5], ['danger-foreground', 'danger-hover', 4.5],
  ['border-strong', 'surface', 3], // sempadan input/kawalan mesti kelihatan (WCAG 1.4.11)
]
for (const [name, T] of Object.entries(themes)) {
  test(`kontras mod ${name}: semua pasangan teks/latar memenuhi WCAG`, () => {
    const fails: string[] = []
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(T[fg] && T[bg], `token ${fg}/${bg} tiada`)
      const r = ratio(T[fg], T[bg])
      if (r < min) fails.push(`${fg} pada ${bg}: ${r.toFixed(2)} < ${min}`)
    }
    assert.deepEqual(fails, [])
  })
  test(`kontras mod ${name}: kad hero dan panel jenama (teks sekunder 85% pada bar sisi) kekal terbaca`, () => {
    assert.ok(ratio(mix(T['sidebar-foreground'], T.sidebar, 0.85), T.sidebar) >= 7)
  })
}

test('mod gelap: teks sekunder ≥ 8:1 dan tiada permukaan hampir sama dengan latar (lapisan jelas)', () => {
  const D = themes.gelap
  assert.ok(ratio(D['muted-foreground'], D.surface) >= 8)
  assert.ok(ratio(D.border, D.surface) >= 1.3, 'garis halus kelihatan')
  assert.ok(ratio(D.surface, D.background) >= 1.05)
})
