import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Pengawal rupa: corak "dihasilkan AI" yang telah dibuang dari CampusOS. Jika ada yang kembali, ujian ini gagal.
const root = fileURLToPath(new URL('..', import.meta.url))
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) { const p = join(dir, n); statSync(p).isDirectory() ? walk(p, out) : out.push(p) }
  return out
}
const src = walk(join(root, 'src')).filter((f) => /\.(tsx?|css)$/.test(f))
const code = src.filter((f) => /\.tsx?$/.test(f))
const uiCode = code.filter((f) => !/i18n-ms/.test(f))
const read = (f: string) => readFileSync(f, 'utf8')
const rel = (f: string) => f.slice(root.length)
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const hits = (files: string[], re: RegExp, strip = true) =>
  files.flatMap((f) => { const t = strip ? stripComments(read(f)) : read(f); return [...t.matchAll(re)].map((m) => `${rel(f)}: ${m[0]}`) })

test('tiada kecerunan (gradient) dalam gaya atau komponen; tiada teks kecerunan', () => {
  assert.deepEqual(hits([...src, join(root, 'index.html')], /gradient|bg-clip-text|text-transparent/gi), [])
})

test('tiada kesan kaca (backdrop blur/filter) dan tiada grain/noise', () => {
  assert.deepEqual(hits(src, /backdrop-(?:blur|filter)|feTurbulence|\bgrain\b|\bnoise\b/gi), [])
})

test('tiada animasi fade-masuk, kilauan kursor, atau pendedahan semasa skrol', () => {
  assert.deepEqual(hits(src, /animate-in|animate-pulse|IntersectionObserver|mousemove|pointermove|fade-in/g), [])
})

test('butang dan kawalan tidak pudar semasa hover (tiada transition warna/opacity, tiada hover opacity/brightness)', () => {
  assert.deepEqual(hits(src, /transition-(?:all|colors|opacity)|hover:opacity|hover:brightness|hover:bg-[a-z-]+\/\d+/g), [])
})

test('tiada kad bergaris warna di sisi dan tiada bayang berwarna', () => {
  assert.deepEqual(hits(uiCode, /border-[lr]-(?:[2-9]|\[)[^'"` ]*|border-[lrtb]-(?:primary|ok|warn|danger|info|accent)|shadow-(?!none)[a-z0-9]+/g), [])
})

test('fon: bukan Inter, Space Grotesk, Instrument Serif atau Outfit; tiada serif/italik hiasan', () => {
  assert.deepEqual(hits([...src, join(root, 'index.html')], /Inter\b|Space[ +]Grotesk|Instrument[ +]Serif|Outfit/g), [])
  assert.deepEqual(hits(uiCode, /\bitalic\b|font-serif|(?<!sans-)\bserif\b/g), [])
  assert.match(read(join(root, 'src/index.css')), /Nunito Sans/)
  assert.match(read(join(root, 'src/index.css')), /Lexend/)
})

test('tiada ungu/indigo/violet/fuchsia (hex atau kelas Tailwind)', () => {
  assert.deepEqual(hits([...src, join(root, 'index.html'), join(root, 'public/manifest.webmanifest')], /#(?:4f46e5|6366f1|7c3aed|8b5cf6|a855f7|c026d3|a78bfa|8f94fb|a5a9fd|1e3a8a)\b|\b(?:indigo|violet|purple|fuchsia)-\d{2,3}\b/gi), [])
})

test('tiada pustaka ikon/UI templat (Lucide, shadcn, Radix) dan set ikon sendiri tidak menyalin laluan Lucide', () => {
  const pkg = read(join(root, 'package.json'))
  assert.doesNotMatch(pkg, /lucide|shadcn|radix|heroicons|tabler/i)
  const icons = read(join(root, 'src/lib/icons.tsx'))
  assert.doesNotMatch(icons, /1\.94 1\.94 0 0 0 3\.4 0|M18 3a3 3 0 0 0-3 3v12/) // laluan loceng/command Lucide
  assert.match(icons, /strokeLinecap: 'square'/)
})

test('tiada emoji dalam kod antara muka', () => {
  assert.deepEqual(hits(uiCode, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{2728}]/gu, false), [])
})

const repo = join(root, '..')
const repoFiles = walk(repo).filter((f) => !/node_modules|[\\/]dist[\\/]|[\\/]data[\\/]|[\\/]\.git[\\/]|[\\/]tests?[\\/]|\.(png|ico|webp|jpg|zip)$/.test(f))
const textFiles = repoFiles.filter((f) => !/[\\/]\.vscode[\\/]/.test(f)).filter((f) => /\.(tsx?|jsx?|mjs|css|html|md|json|webmanifest|ya?ml|bat|svg|sh)$/.test(f))

test('tiada sempang em di mana-mana (UI, kamus, backend, e-mel, dokumen, komen kod); penanda kosong ialah EMPTY', () => {
  const EM = String.fromCharCode(0x2014)
  const bad = textFiles.flatMap((f) => read(f).split('\n').map((l, i) => (l.includes(EM) ? `${f.slice(repo.length)}:${i + 1}` : '')).filter(Boolean))
  assert.deepEqual(bad, [])
  assert.equal(read(join(root, 'src/lib/empty.ts')).includes("EMPTY = '-'"), true)
})

test('tiada emoji di mana-mana dalam repo (kod, kamus, e-mel, dokumen)', () => {
  const bad = textFiles.flatMap((f) => [...read(f).matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{2728}]/gu)].map(() => f.slice(repo.length)))
  assert.deepEqual(bad, [])
})

test('tiada salinan pemasaran generik di mana-mana (UI, kamus, dokumen); "Google Workspace" nama produk dibenarkan', () => {
  const rx = /seamless|powerful|supercharge|effortless|streamline|all-in-one|next-gen|cutting-edge|elevate|empower|revolution|leverage|robust|world-class|AI-powered|operating system|(?<!Google )workspace|\bunlock\b/i
  const bad = textFiles.filter((f) => !/DESIGN\.md$|PILOT-PERCUMA\.md$/.test(f)).flatMap((f) => read(f).split('\n').map((l, i) => (rx.test(l.replace(/unlockAudio/g, '')) ? `${f.slice(repo.length)}:${i + 1}: ${l.trim().slice(0, 60)}` : '')).filter(Boolean))
  assert.deepEqual(bad, [])
})

test('tiada kotak ikon berlatar (dalam className atau cx()); jarak mengikut skala 4px (tiada langkah separuh)', () => {
  // mana-mana literal rentetan: petak h-N w-N bersaiz ikon + warna latar + tiada teks (font-/text-[ bermaksud inisial/avatar teks)
  const tiles = hits(uiCode, /(['"`])(?:(?!\1)[^\n])*\bh-(?:8|9|10|11) w-(?:8|9|10|11)\b(?:(?!\1)[^\n])*\1/g)
    .filter((h) => /items-center justify-center/.test(h) && /\bbg-(?:primary|muted|[a-z]+-soft)\b/.test(h) && !/font-|text-\[/.test(h))
  assert.deepEqual(tiles, [])
  assert.deepEqual(hits(uiCode, /(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5|2\.5|3\.5)(?![\w.])/g), [])
})

test('tiada kad bergaris berwarna: garis kotak (--line) hanya neutral (border, border-strong, foreground)', () => {
  assert.deepEqual(hits(uiCode, /\[--line:var\(--(?:primary|info|danger|warn|ok|accent)\)\]/g), [])
})

test('tiada tajuk dengan label kecil (kicker/badge) di atas headline dan tiada kad statistik tiga berbaris dengan ikon pada skrin log masuk', () => {
  const auth = read(join(root, 'src/components/Auth.tsx'))
  assert.doesNotMatch(auth, /uppercase tracking-\[0\.\d+em\]/)
  assert.doesNotMatch(auth, /grid-cols-3/)
})

test('tiada ayat pemasaran generik pada skrin log masuk', () => {
  const t = read(join(root, 'src/components/Auth.tsx')) + read(join(root, 'src/components/Onboarding.tsx'))
  assert.doesNotMatch(t, /seamless|powerful|supercharge|effortless|streamline|all-in-one|next-gen|unlock|elevate|empower|operating system|workspace/i)
})

test('kotak serong: jejari token 0, .chamfer ditakrif, dan Card, Button dan Modal menggunakannya', () => {
  const css = read(join(root, 'src/index.css'))
  for (const t of ['sm', 'md', 'lg', 'xl', '2xl', '3xl']) assert.match(css, new RegExp(`--radius-${t}: 0px;`))
  assert.match(css, /\.chamfer \{/); assert.match(css, /\.chamfer::after/); assert.match(css, /polygon\(\s*evenodd/)
  assert.match(css, /\.rounded-full \{ border-radius: 0; \}/)
  const ui = read(join(root, 'src/lib/ui.tsx'))
  assert.match(ui, /relative chamfer \[--line:var\(--border\)\] bg-card/) // Card
  assert.match(ui, /'relative chamfer inline-flex/) // Button
  assert.match(ui, /chamfer chamfer-lg \[--line:var\(--border-strong\)\]/) // Modal
  assert.match(ui, /clipPath/) // Avatar
})

test('penanda fokus butang berada di dalam elemen (clip-path memotong apa yang di luar)', () => {
  const ui = read(join(root, 'src/lib/ui.tsx'))
  assert.match(ui, /focus-visible:outline-2 focus-visible:-outline-offset-4/)
  assert.doesNotMatch(ui.slice(ui.indexOf('export function Button'), ui.indexOf('export function Button') + 1500), /focus-visible:ring-offset/)
})

test('tiada kotak berbulat tertinggal (rounded-xl/2xl) dan tiada kelas rosak sisa penyuntingan', () => {
  assert.deepEqual(hits(uiCode, /rounded-(?:xl|2xl)\b|(?<=[" ])-\[\d+px\](?=[" ])/g), [])
})

test('graf: komponen garis sebenar (kotak plot, grid, paksi berlabel, tooltip, papan kekunci); bukan sparkline diregangkan', () => {
  const c = read(join(root, 'src/components/Charts.tsx'))
  assert.doesNotMatch(c, /preserveAspectRatio="none"/)
  for (const need of ['ResizeObserver', 'onPointerMove', 'onKeyDown', 'sr-only', 'minorTicks', 'dateTicks']) assert.match(c, new RegExp(need), need)
  const callers = ['src/management/Insight.tsx', 'src/management/Operations.tsx'].map((f) => read(join(root, f))).join('\n')
  assert.doesNotMatch(callers, /<LineChart data=/) // API lama tiada lagi
  assert.match(callers, /<LineChart[^>]*series=/)
})

test('skala saiz teks tetap: hanya 12, 14, 16, 24, 32 dan 40 piksel (tiada 10, 11, 13, 15)', () => {
  const sizes = new Set(uiCode.flatMap((f) => [...stripComments(read(f)).matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]))))
  assert.deepEqual([...sizes].filter((s) => ![12, 14, 16, 24, 32, 40].includes(s)), [])
})
