import { test } from 'node:test'
import assert from 'node:assert/strict'
import { t, tp, setLang, getLang } from '../src/lib/i18n.ts'
import { MS } from '../src/lib/i18n-ms.ts'
import { friendlyError } from '../src/lib/errors.ts'
import { fmtDay, ago } from '../src/lib/format.ts'

test('t(): English lalai, BM bila ditukar, teks tiada terjemahan kekal English, pemegang tempat diisi', () => {
  setLang('en')
  assert.equal(t('Sign out'), 'Sign out')
  assert.equal(t('Due {date}', { date: '05 Oct' }), 'Due 05 Oct')
  setLang('ms')
  assert.equal(getLang(), 'ms')
  assert.equal(t('Sign out'), 'Log keluar')
  assert.equal(t('Due {date}', { date: '05 Okt' }), 'Tarikh akhir 05 Okt')
  assert.equal(t('Tiada dalam kamus'), 'Tiada dalam kamus')
  assert.equal(tp(1, '{n} student', '{n} students'), '1 pelajar')
  assert.equal(tp(3, '{n} student', '{n} students'), '3 pelajar')
  setLang('en')
  assert.equal(tp(1, '{n} student', '{n} students'), '1 student')
  assert.equal(tp(3, '{n} student', '{n} students'), '3 students')
})

test('tarikh, masa relatif dan ralat mengikut bahasa', () => {
  setLang('ms')
  assert.equal(fmtDay('2026-10-05'), '05 Okt')
  assert.equal(fmtDay('2026-05-02'), '02 Mei')
  assert.equal(ago(Date.now() - 5 * 60_000), '5 min lalu')
  assert.equal(friendlyError('INVALID_CREDENTIALS', ''), 'E-mel atau kata laluan salah.')
  assert.equal(friendlyError('VALIDATION_ERROR', 'email: wajib diisi'), 'E-mel wajib diisi.')
  assert.equal(friendlyError('VALIDATION_ERROR', 'password: minimum 8 aksara'), 'Kata laluan mesti sekurang-kurangnya 8 aksara.')
  setLang('en')
  assert.equal(fmtDay('2026-10-05'), '05 Oct')
  assert.equal(friendlyError('INVALID_CREDENTIALS', ''), 'Incorrect email or password.')
})

test('kamus BM: tiada nilai kosong dan pemegang tempat {x} sepadan dengan kunci', () => {
  for (const [k, v] of Object.entries(MS)) {
    assert.ok(v.trim(), `nilai kosong: ${k}`)
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    assert.equal(ph(v), ph(k), `pemegang tempat tidak sepadan: ${k}`)
  }
})
