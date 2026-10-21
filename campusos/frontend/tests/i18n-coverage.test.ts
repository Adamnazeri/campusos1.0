import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { MS } from '../src/lib/i18n-ms.ts'

// Setiap teks literal dalam t('…') / tr('…') / tp(n, '…', '…') mesti ada terjemahan BM. Mencegah teks English "tertinggal" bila UI ditambah.
// Dikecualikan: slip keputusan dwibahasa (sengaja), contoh e-mel/kod, dan nama zon masa.
const SKIP = new Set([' leave', 'in-progress', 'Class Teacher / Guru Kelas', 'Parent / Ibu Bapa / Penjaga', 'Principal / Pengetua', 'CampusOS', 'MATH', 'ESC', 'GMT (UTC+0)', 'WAT (UTC+1)', 'EAT (UTC+3)', 'MYT (UTC+8)'])
const LIT = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) yield* files(p)
    else if (/\.tsx?$/.test(e.name) && !/i18n-ms/.test(e.name)) yield p
  }
}
function* calls(s: string, fn: string): Generator<string[]> {
  const re = new RegExp(`(?<![\\w.$])${fn}\\(`, 'g')
  for (let m; (m = re.exec(s)); ) {
    let i = re.lastIndex, depth = 1, q: string | null = null, start = i
    const args: string[] = []
    for (; depth && i < s.length; i++) {
      const c = s[i]
      if (q) { if (c === '\\') i++; else if (c === q) q = null }
      else if (c === "'" || c === '"' || c === '`') q = c
      else if ('([{'.includes(c)) depth++
      else if (')]}'.includes(c)) depth--
      else if (c === ',' && depth === 1) { args.push(s.slice(start, i)); start = i + 1 }
    }
    args.push(s.slice(start, i - 1))
    yield args
  }
}

test('semua teks t()/tr()/tp() dalam src ada terjemahan BM', () => {
  const missing = new Set<string>()
  for (const f of files('src')) {
    const s = readFileSync(f, 'utf8')
    for (const [fn, from, to] of [['t', 0, 1], ['tr', 0, 1], ['tp', 1, 3]] as const) {
      for (const args of calls(s, fn)) {
        for (const a of args.slice(from, to)) {
          for (const m of a.matchAll(LIT)) {
            const v = (m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"')
            if (!/[A-Za-z]{2}/.test(v) || /^[a-z]+$/.test(v) || v.includes('@') || SKIP.has(v) || fn === 't' && f.endsWith('i18n.ts')) continue
            if (!(v in MS)) missing.add(`${f}: ${v}`)
          }
        }
      }
    }
  }
  assert.deepEqual([...missing].sort(), [])
})

// Teks paparan yang dihantar terus ke komponen yang menterjemah sendiri (Badge, Button, toast, Modal, Tabs…) tanpa t():
// semua literal berhuruf besar dalam konsol/guru/komponen mesti ada dalam kamus, kecuali nama data di bawah.
const DATA = new Set(['Form ', 'Rm ', 'Room ', 'Computer Science', 'Further Maths', 'English', 'Bahasa Melayu', 'Parent/Guardian', 'Mathematics', 'Science'])
test('literal paparan dalam konsol/guru/komponen ada dalam kamus BM', () => {
  const missing = new Set<string>()
  for (const dir of ['src/management', 'src/teacher', 'src/components']) {
    for (const f of files(dir)) {
      if (/ErrorBoundary|Auth\.tsx|LangSwitch/.test(f)) continue
      const s = readFileSync(f, 'utf8')
        .replace(/\b(?:tr|t|tp)\((?:[^()]|\([^()]*\))*\)/g, '')
        .replace(/^\s*import .*$/gm, '')
      for (const m of s.matchAll(/'((?:\\.|[^'\\\n])*)'/g)) {
        const v = m[1].replace(/\\'/g, "'")
        if (/^[A-Z][A-Za-z'’,.&/ \-–\u2014…!?]*[a-z][A-Za-z'’,.&/ \-–\u2014…!?]*$/.test(v) && v.length > 2 && !DATA.has(v) && !/^(GET|POST|PATCH|PUT|DELETE)$/.test(v) && !(v in MS)) missing.add(`${f}: ${v}`)
      }
    }
  }
  assert.deepEqual([...missing].sort(), [])
})
