import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dateTicks, daysOf, invert, isoOf, linePath, linear, minorTicks, nearestIndex, niceDomain, niceStep, thinEvery, tickValues } from '../src/lib/chartScale.ts'

test('niceStep: 1, 2, 5 × 10^n', () => {
  assert.equal(niceStep(100, 5), 20)
  assert.equal(niceStep(97, 5), 20)
  assert.equal(niceStep(9, 5), 2)
  assert.equal(niceStep(0.7, 5), 0.2)
  assert.equal(niceStep(110000, 11), 10000) // graf rujukan: 0 hingga 110000 setiap 10000
})

test('niceDomain: kemas, meliputi semua data, dan menghormati had atas/bawah', () => {
  assert.deepEqual(niceDomain(0, 97), { min: 0, max: 100, step: 20 })
  const d = niceDomain(86.4, 99.2, 5, 100)
  assert.equal(d.max, 100); assert.ok(d.min <= 86.4); assert.equal(d.min % d.step, 0); assert.equal(100 % d.step, 0)
  assert.deepEqual(tickValues(niceDomain(0, 110000, 11)).slice(0, 3), [0, 10000, 20000])
  assert.equal(niceDomain(3, 7, 5, undefined, 0).min >= 0, true)
  const flat = niceDomain(50, 50) // semua nilai sama: tidak membahagi dengan sifar
  assert.ok(flat.max > flat.min)
  assert.ok(niceDomain(-12, 30).min <= -12)
})

test('tickValues dan minorTicks: tanda utama sama jarak; tanda kecil di antara (bukan di atas tanda utama)', () => {
  const d = niceDomain(0, 100, 5)
  assert.deepEqual(tickValues(d), [0, 20, 40, 60, 80, 100])
  const m = minorTicks(d, 4)
  assert.equal(m.length, 5 * 3) // 3 tanda kecil dalam setiap 5 selang
  assert.ok(m.every((v) => v % 20 !== 0))
})

test('skala linear dan songsangannya pergi-balik; domain sifar lebar tidak menghasilkan NaN', () => {
  const f = linear(0, 100, 200, 0), g = invert(0, 100, 200, 0)
  assert.equal(f(0), 200); assert.equal(f(100), 0); assert.equal(f(50), 100)
  assert.ok(Math.abs(g(f(37)) - 37) < 1e-9)
  assert.equal(Number.isNaN(linear(5, 5, 0, 10)(5)), false)
})

test('daysOf/isoOf: pergi-balik, tiada kesan zon masa, selisih hari betul melintasi bulan dan tahun lompat', () => {
  assert.equal(isoOf(daysOf('2026-10-19')), '2026-10-19')
  assert.equal(daysOf('2026-03-01') - daysOf('2026-02-28'), 1)
  assert.equal(daysOf('2024-03-01') - daysOf('2024-02-28'), 2)
  assert.equal(daysOf('2027-01-01') - daysOf('2026-01-01'), 365)
  assert.equal(Number.isNaN(daysOf('bukan-tarikh')), true)
})

test('dateTicks: langkah terkecil yang muat; sentiasa bermula pada hari pertama', () => {
  const t7 = dateTicks(100, 106, 8); assert.deepEqual(t7, [100, 101, 102, 103, 104, 105, 106])
  const t30 = dateTicks(100, 129, 8); assert.equal(t30[0], 100); assert.ok(t30.length <= 8); assert.equal(t30[1] - t30[0], 7 > 29 / 7 ? 7 : 7)
  const t90 = dateTicks(0, 89, 8); assert.ok(t90.length <= 8 && t90.length >= 4)
  assert.deepEqual(dateTicks(5, 5, 8), [5])
})

test('thinEvery dan nearestIndex dan linePath', () => {
  assert.equal(thinEvery(7, 700, 50), 1)
  assert.equal(thinEvery(30, 600, 60), 3)
  assert.equal(thinEvery(1, 10, 50), 1)
  assert.equal(nearestIndex([0, 10, 20, 30], 14), 1)
  assert.equal(nearestIndex([0, 10, 20, 30], 26), 3)
  assert.equal(nearestIndex([], 5), -1)
  assert.equal(linePath([[0, 10], [5.126, 20]]), 'M0,10 L5.13,20')
})
