import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_ALARM, dueAlarms, normalizeAlarm, toMin, localDate, type AlarmSession } from '../src/lib/alarmLogic.ts'

const S = (id: string, start: string, end: string, state?: string): AlarmSession => ({ id, className: `Kelas ${id}`, start, end, state })
const on = { ...DEFAULT_ALARM, enabled: true }
const at = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s
const D = '2026-10-19'

test('alarm: mati secara lalai (tiada bunyi jika tidak diaktifkan)', () => {
  assert.deepEqual(dueAlarms([S('a', '08:00', '08:40')], at(8, 0), D, new Set(), DEFAULT_ALARM), [])
})

test('alarm: berbunyi tepat pada masa mula dan masa tamat, bukan sebelum', () => {
  const ss = [S('a', '08:00', '08:40')]
  assert.deepEqual(dueAlarms(ss, at(7, 59, 59), D, new Set(), on), [])
  assert.deepEqual(dueAlarms(ss, at(8, 0), D, new Set(), on).map((e) => e.kind), ['start'])
  assert.deepEqual(dueAlarms(ss, at(8, 39, 59), D, new Set(), on), [])
  assert.deepEqual(dueAlarms(ss, at(8, 40), D, new Set(), on).map((e) => e.kind), ['end'])
})

test('alarm: tidak berulang selepas ditanda sudah berbunyi; tempoh lewat 2 minit dilangkau', () => {
  const ss = [S('a', '08:00', '08:40')]
  const e = dueAlarms(ss, at(8, 0, 5), D, new Set(), on)
  assert.equal(e.length, 1)
  assert.deepEqual(dueAlarms(ss, at(8, 0, 6), D, new Set([e[0].key]), on), [])
  assert.deepEqual(dueAlarms(ss, at(8, 3), D, new Set(), on), [], 'sudah lewat >2 minit: jangan bunyi')
  assert.equal(dueAlarms(ss, at(8, 1, 59), D, new Set(), on).length, 1, 'terlewat bangun sedikit: masih bunyi')
})

test('alarm: peringatan awal 5/10 minit hanya bila dipilih', () => {
  const ss = [S('a', '08:00', '08:40')]
  assert.deepEqual(dueAlarms(ss, at(7, 55), D, new Set(), on), [])
  const e = dueAlarms(ss, at(7, 55), D, new Set(), { ...on, leadMin: 5 })
  assert.deepEqual(e.map((x) => x.kind), ['soon'])
  assert.equal(dueAlarms(ss, at(7, 50), D, new Set(), { ...on, leadMin: 10 }).length, 1)
})

test('alarm: boleh matikan mula atau tamat secara berasingan; kelas dibatalkan senyap', () => {
  const ss = [S('a', '08:00', '08:40')]
  assert.deepEqual(dueAlarms(ss, at(8, 0), D, new Set(), { ...on, start: false }), [])
  assert.deepEqual(dueAlarms(ss, at(8, 40), D, new Set(), { ...on, end: false }), [])
  assert.deepEqual(dueAlarms([S('a', '08:00', '08:40', 'cancelled')], at(8, 0), D, new Set(), on), [])
})

test('alarm: kelas berturutan: tamat kelas A dan mula kelas B pada masa sama, disusun', () => {
  const ss = [S('a', '08:00', '09:00'), S('b', '09:00', '10:00')]
  const e = dueAlarms(ss, at(9, 0), D, new Set(), on)
  assert.equal(e.length, 2)
  assert.deepEqual(e.map((x) => `${x.session.id}:${x.kind}`).sort(), ['a:end', 'b:start'])
})

test('alarm: kunci berbeza setiap hari; data rosak tidak melempar ralat', () => {
  const e1 = dueAlarms([S('a', '08:00', '08:40')], at(8, 0), '2026-10-19', new Set(), on)[0]
  const e2 = dueAlarms([S('a', '08:00', '08:40')], at(8, 0), '2026-10-20', new Set(), on)[0]
  assert.notEqual(e1.key, e2.key)
  assert.deepEqual(dueAlarms([S('a', 'rosak', '??')], at(8, 0), D, new Set(), on), [])
  assert.equal(Number.isNaN(toMin('abc')), true)
  assert.equal(toMin('08:05'), 485)
})

test('normalizeAlarm: nilai tersimpan yang rosak kembali ke lalai; leadMin hanya 0/5/10', () => {
  assert.deepEqual(normalizeAlarm(null), DEFAULT_ALARM)
  assert.deepEqual(normalizeAlarm('x'), DEFAULT_ALARM)
  assert.equal(normalizeAlarm({ enabled: true, leadMin: 7 }).leadMin, 0)
  assert.equal(normalizeAlarm({ enabled: true, leadMin: 10 }).leadMin, 10)
  assert.equal(normalizeAlarm({ enabled: 'ya' }).enabled, false)
})

test('localDate: format YYYY-MM-DD mengikut waktu tempatan', () => {
  assert.equal(localDate(new Date(2026, 9, 5, 23, 59)), '2026-10-05')
})
