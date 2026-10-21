import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gradeFor, parseMark, pctOf, scaleError } from '../src/lib/grades.ts'

const scale = [{ grade: 'A', min: 80 }, { grade: 'B', min: 70 }, { grade: 'C', min: 60 }, { grade: 'D', min: 50 }, { grade: 'E', min: 40 }, { grade: 'F', min: 0 }]

test('gradeFor: sempadan tepat, tidak bergantung pada urutan skala, null → null', () => {
  assert.equal(gradeFor(80, scale), 'A'); assert.equal(gradeFor(79.9, scale), 'B'); assert.equal(gradeFor(0, scale), 'F'); assert.equal(gradeFor(39.9, scale), 'F')
  assert.equal(gradeFor(65, [...scale].reverse()), 'C'); assert.equal(gradeFor(null, scale), null)
})

test('pctOf membundar 1 perpuluhan dan menolak nilai tidak sah', () => {
  assert.equal(pctOf(30.5, 50), 61); assert.equal(pctOf(1, 3), 33.3); assert.equal(pctOf(null, 50), null); assert.equal(pctOf(5, 0), null)
})

test('parseMark: kosong, koma perpuluhan, melebihi had, aksara salah', () => {
  assert.deepEqual(parseMark('', 50), { value: null }); assert.deepEqual(parseMark(' 42,5 ', 50), { value: 42.5 }); assert.deepEqual(parseMark('50', 50), { value: 50 })
  assert.ok('error' in parseMark('51', 50)); assert.ok('error' in parseMark('abc', 50)); assert.ok('error' in parseMark('-3', 50)); assert.ok('error' in parseMark('1.234', 50))
})

test('scaleError: peraturan sama seperti backend', () => {
  assert.equal(scaleError(scale), null)
  assert.match(scaleError([{ grade: 'A', min: 0 }])!, /two/)
  assert.match(scaleError([{ grade: 'A', min: 50 }, { grade: 'B', min: 10 }])!, /0%/)
  assert.match(scaleError([{ grade: 'A', min: 50 }, { grade: 'a', min: 0 }])!, /different/)
  assert.match(scaleError([{ grade: 'A', min: 50 }, { grade: 'B', min: 50 }, { grade: 'C', min: 0 }])!, /different minimum/)
  assert.match(scaleError([{ grade: '', min: 50 }, { grade: 'B', min: 0 }])!, /name/)
  assert.match(scaleError([{ grade: 'A', min: 150 }, { grade: 'B', min: 0 }])!, /0 to 100/)
})
