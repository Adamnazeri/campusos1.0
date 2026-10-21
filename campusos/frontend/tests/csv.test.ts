import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, mapRecords, templateCsv, toCsv } from '../src/lib/csv.ts'

test('parseCsv: petikan, petikan berganda, baris baharu dalam medan, CRLF, BOM', () => {
  const rows = parseCsv('\uFEFFname,note\r\n"Tan, Wei","say ""hi"""\r\n"Dua\nbaris",ok\r\n')
  assert.deepEqual(rows, [['name', 'note'], ['Tan, Wei', 'say "hi"'], ['Dua\nbaris', 'ok']])
})

test('parseCsv: pemisah bertitik-bertanda (Excel locale) dan tab dikesan; baris kosong dibuang', () => {
  assert.deepEqual(parseCsv('nama;kelas\nAli;4A\n;\n\nSiti;4B'), [['nama', 'kelas'], ['Ali', '4A'], ['Siti', '4B']])
  assert.deepEqual(parseCsv('name\tclass\nAli\t4A'), [['name', 'class'], ['Ali', '4A']])
  assert.deepEqual(parseCsv(''), [])
})

test('mapRecords: pengepala English & Melayu, lajur tidak dikenali diabaikan, lajur wajib dilaporkan', () => {
  const m = mapRecords(parseCsv('Nama,E-mel,Jabatan,Warna Kegemaran\nAminah,a@s.my,Languages,biru'), 'teachers')
  assert.deepEqual(m.records, [{ name: 'Aminah', email: 'a@s.my', department: 'Languages' }])
  assert.deepEqual(m.ignored, ['Warna Kegemaran']); assert.deepEqual(m.missing, [])
  const bad = mapRecords(parseCsv('Nama\nAli'), 'teachers')
  assert.deepEqual(bad.missing, ['email'])
  const stu = mapRecords(parseCsv('Student Name,Tingkatan,No KP,Nama Penjaga,Telefon Waris\nAli,Form 4A,100101-03-1234,Razak,012-3456789'), 'students')
  assert.deepEqual(stu.records, [{ name: 'Ali', class: 'Form 4A', studentCode: '100101-03-1234', guardianName: 'Razak', guardianPhone: '012-3456789' }])
  assert.deepEqual(mapRecords(parseCsv('Nama\nAli'), 'students').missing, [])
  assert.deepEqual(mapRecords(parseCsv('weekly_hours,Name,Email\n18,A,a@s.my'), 'teachers').records[0], { weeklyHours: '18', name: 'A', email: 'a@s.my' })
})

test('templateCsv boleh dibaca semula oleh parser (pergi-balik) untuk semua jenis', () => {
  for (const k of ['teachers', 'classes', 'students'] as const) {
    const m = mapRecords(parseCsv(templateCsv(k)), k)
    assert.equal(m.records.length, 1); assert.deepEqual(m.missing, []); assert.deepEqual(m.ignored, [])
  }
})

test('toCsv: petikan hanya bila perlu; pergi-balik dengan parseCsv', () => {
  const rows = [['email', 'link'], ['a@s.my', 'https://x/?invite=abc'], ['b,c', 'say "hi"']]
  assert.deepEqual(parseCsv(toCsv(rows)), rows)
})
