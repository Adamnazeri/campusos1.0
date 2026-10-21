import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo, DEMO } from '../src/demo.js'
import { gradeFor } from '../src/lib.js'

const config = { jwtSecret: 't', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3, corsOrigin: '*', authRateMax: 1000, loginFailMax: 50,
  exposeInviteTokens: true, billingEnabled: false, appUrl: 'http://app.test', mailFrom: 'x@y', mailWebhook: '', billingSecret: '', resetTtlMs: 3600e3, devEndpoints: true }
let server, base, db, admin, sarah, daniel
const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') && text ? JSON.parse(text) : text }
}
const login = async (e) => (await call('POST', '/v1/auth/login', { body: { email: e, password: DEMO.password } })).body.accessToken
before(async () => {
  db = openDb(':memory:'); seedDemo(db)
  server = createServer(createApp({ db, config }).handler)
  await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
  admin = await login(DEMO.admin); sarah = await login(DEMO.teacher)
  // guru kedua (bukan guru Mathematics kelas itu): cipta guru + terima jemputan
  const nt = (await call('POST', '/v1/teachers', { token: admin, body: { name: 'Guru Lain', email: 'guru.lain@sekolah.edu.my', department: 'Sciences' } })).body
  const acc = await call('POST', '/v1/auth/accept-invite', { body: { token: nt.inviteToken, password: 'password123' } })
  daniel = acc.body.accessToken
})
after(() => server.close())
const ymd = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

// kelas Form 4A: guru Mathematics ialah Sarah Mensah (demo). Cipta peperiksaan lampau.
let exam, cls, students
test('sediakan: peperiksaan lampau dengan markah penuh 50 dan lulus 40%', async () => {
  const classes = (await call('GET', '/v1/classes', { token: admin })).body.items
  cls = classes.find((c) => c.subjects.some((s) => s.subject === 'Mathematics' && s.teacher?.includes('Sarah')))
  assert.ok(cls, 'ada kelas Mathematics yang diajar Sarah')
  students = (await call('POST', '/v1/students', { token: admin, body: { classId: cls.id, names: ['Zed Ujian A', 'Zed Ujian B', 'Zed Ujian C', 'Zed Ujian D'] } })).body.items
  const r = await call('POST', '/v1/exams?force=1', { token: admin, body: { title: 'Ujian Bulanan', classId: cls.id, subject: 'Mathematics', date: ymd(-3), time: '09:00', maxMark: 50, passPct: 40 } })
  assert.equal(r.status, 201); assert.equal(r.body.maxMark, 50); assert.equal(r.body.passPct, 40)
  exam = r.body
})

test('guru subjek memasukkan markah: gred, statistik dan status Grading dikira betul', async () => {
  const idx = (await call('GET', `/v1/exams/${exam.id}/results`, { token: sarah })).body
  assert.equal(idx.canEdit, true); assert.equal(idx.exam.maxMark, 50)
  const [a, b, c, d] = students.map((s) => s.id)
  const put = await call('PUT', `/v1/exams/${exam.id}/results`, { token: sarah, body: { results: [
    { studentId: a, mark: 45 },            // 90% → A
    { studentId: b, mark: 30.5 },          // 61% → C
    { studentId: c, mark: 15 },            // 30% → F (gagal)
    { studentId: d, absent: true, remarks: 'Sakit' },
  ] } })
  assert.equal(put.status, 200, JSON.stringify(put.body))
  const byId = Object.fromEntries(put.body.students.filter((s) => s.name.startsWith('Zed')).map((s) => [s.studentId, s]))
  assert.deepEqual([byId[a].pct, byId[a].grade, byId[a].passed], [90, 'A', true])
  assert.deepEqual([byId[b].pct, byId[b].grade], [61, 'C'])
  assert.deepEqual([byId[c].pct, byId[c].grade, byId[c].passed], [30, 'F', false])
  assert.deepEqual([byId[d].mark, byId[d].absent, byId[d].grade, byId[d].remarks], [null, true, null, 'Sakit'])
  const st = put.body.stats
  const gradedAll = put.body.students.filter((s) => s.mark !== null)
  assert.equal(st.graded, gradedAll.length)
  assert.equal(st.average, Math.round((gradedAll.reduce((x, s) => x + s.pct, 0) / gradedAll.length) * 10) / 10)
  assert.equal(st.highest, Math.max(...gradedAll.map((s) => s.mark))); assert.equal(st.lowest, Math.min(...gradedAll.map((s) => s.mark)))
  assert.equal(st.absent, 1)
  assert.equal(st.distribution.find((x) => x.grade === 'A').count >= 1, true)
  assert.equal(db.prepare('SELECT status FROM exams WHERE id=?').get(exam.id).status, 'Grading')
  // kemas kini markah (bukan pendua) + kosongkan
  const fix = await call('PUT', `/v1/exams/${exam.id}/results`, { token: sarah, body: { results: [{ studentId: c, mark: 22 }, { studentId: d, mark: null, absent: false }] } })
  assert.equal(fix.status, 200)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM exam_results WHERE exam_id=?').get(exam.id).c, 3) // D dipadam (kosong)
  assert.equal(fix.body.students.find((s) => s.studentId === c).grade, 'E') // 44% (E = 40–49)
})

test('pengesahan input: markah di luar julat, perpuluhan berlebihan, pelajar bukan dalam kelas, tarikh masa depan', async () => {
  const [a] = students
  const put = (results, token = sarah, id = exam.id) => call('PUT', `/v1/exams/${id}/results`, { token, body: { results } })
  assert.equal((await put([{ studentId: a.id, mark: 51 }])).status, 400)
  assert.equal((await put([{ studentId: a.id, mark: -1 }])).status, 400)
  assert.equal((await put([{ studentId: a.id, mark: 'abc' }])).status, 400)
  assert.equal((await put([{ studentId: a.id, mark: 12.345 }])).status, 400)
  assert.equal((await put([{ studentId: 'tidak-wujud', mark: 5 }])).status, 400)
  assert.equal((await put([{ studentId: a.id, mark: 5 }, { studentId: a.id, mark: 6 }])).status, 400)
  assert.equal((await put([])).status, 400)
  // masih tidak berubah
  assert.equal(db.prepare('SELECT mark FROM exam_results WHERE exam_id=? AND student_id=?').get(exam.id, a.id).mark, 45)
  const future = (await call('POST', '/v1/exams?force=1', { token: admin, body: { title: 'Akan Datang', classId: cls.id, subject: 'Mathematics', date: ymd(5), time: '10:00' } })).body
  const early = await put([{ studentId: a.id, mark: 50 }], admin, future.id)
  assert.equal(early.status, 409); assert.equal(early.body.error.code, 'EXAM_NOT_HELD')
})

test('kebenaran: guru subjek lain tidak boleh edit/lihat; selepas dimuktamadkan guru dikunci, pentadbir boleh', async () => {
  const [a] = students
  assert.equal((await call('PUT', `/v1/exams/${exam.id}/results`, { token: daniel, body: { results: [{ studentId: a.id, mark: 1 }] } })).status, 403)
  assert.equal((await call('GET', `/v1/exams/${exam.id}/results`, { token: daniel })).status, 403) // bukan guru kelas itu
  const done = await call('POST', `/v1/exams/${exam.id}/complete`, { token: sarah })
  assert.equal(done.status, 200); assert.equal(done.body.exam.status, 'Completed')
  const locked = await call('PUT', `/v1/exams/${exam.id}/results`, { token: sarah, body: { results: [{ studentId: a.id, mark: 50 }] } })
  assert.equal(locked.status, 403); assert.equal(locked.body.error.code, 'EXAM_LOCKED')
  assert.equal((await call('GET', `/v1/exams/${exam.id}/results`, { token: sarah })).body.canEdit, false)
  assert.equal((await call('POST', `/v1/exams/${exam.id}/reopen`, { token: sarah })).status, 403)
  const adm = await call('PUT', `/v1/exams/${exam.id}/results`, { token: admin, body: { results: [{ studentId: a.id, mark: 48 }] } })
  assert.equal(adm.status, 200) // pentadbir boleh membetulkan walaupun dikunci
  assert.equal((await call('POST', `/v1/exams/${exam.id}/reopen`, { token: admin })).body.exam.status, 'Grading')
  // peperiksaan tanpa markah tidak boleh dimuktamadkan
  const empty = (await call('POST', '/v1/exams?force=1', { token: admin, body: { title: 'Kosong', classId: cls.id, subject: 'Mathematics', date: ymd(-1), time: '11:00' } })).body
  assert.equal((await call('POST', `/v1/exams/${empty.id}/complete`, { token: admin })).body.error.code, 'NO_RESULTS')
})

test('ringkasan kelas & kad laporan pelajar: purata, gred, kedudukan', async () => {
  // peperiksaan kedua supaya ada purata berbilang
  const e2 = (await call('POST', '/v1/exams?force=1', { token: admin, body: { title: 'Ujian Dua', classId: cls.id, subject: 'Mathematics', date: ymd(-2), time: '09:00', maxMark: 100 } })).body
  const [a, b] = students
  await call('PUT', `/v1/exams/${e2.id}/results`, { token: sarah, body: { results: [{ studentId: a.id, mark: 70 }, { studentId: b.id, mark: 95 }] } })
  const rep = (await call('GET', `/v1/classes/${cls.id}/results`, { token: sarah })).body
  assert.ok(rep.exams.length >= 2)
  const rowA = rep.students.find((s) => s.studentId === a.id)
  // A: Ujian Bulanan 48/50 = 96% (dibetulkan pentadbir), Ujian Dua 70% → purata 83
  assert.equal(rowA.average, 83); assert.equal(rowA.grade, 'A')
  assert.equal(rep.students.find((s) => s.name === 'Zed Ujian D').average, null)
  const card = (await call('GET', `/v1/students/${a.id}/results`, { token: sarah })).body
  assert.equal(card.summary.exams, 2); assert.equal(card.summary.average, 83)
  assert.deepEqual(card.summary.subjects, [{ subject: 'Mathematics', average: 83, grade: 'A' }])
  const t2 = card.items.find((i) => i.title === 'Ujian Dua')
  assert.equal(t2.rank, 2); assert.equal(t2.outOf, 2) // B (95) di hadapan A (70)
  assert.equal((await call('GET', `/v1/students/${a.id}/results`, { token: daniel })).status, 403)
  assert.equal((await call('GET', `/v1/classes/${cls.id}/results`, { token: daniel })).status, 403)
})

test('skala gred boleh diubah: pengesahan + gred dikira semula', async () => {
  assert.equal(gradeFor(79.9, [{ grade: 'A', min: 80 }, { grade: 'B', min: 0 }]), 'B')
  const bad = (gradeScale) => call('PATCH', '/v1/org/settings', { token: admin, body: { gradeScale } })
  assert.equal((await bad([{ grade: 'A', min: 50 }])).status, 400)                                  // < 2 gred
  assert.equal((await bad([{ grade: 'A', min: 50 }, { grade: 'B', min: 10 }])).status, 400)           // tiada 0%
  assert.equal((await bad([{ grade: 'A', min: 50 }, { grade: 'a', min: 0 }])).status, 400)            // gred pendua
  assert.equal((await bad([{ grade: 'A', min: 50 }, { grade: 'B', min: 50 }, { grade: 'C', min: 0 }])).status, 400)
  const ok = await bad([{ grade: 'Lulus', min: 0 }, { grade: 'Cemerlang', min: 85 }, { grade: 'Baik', min: 50 }])
  assert.equal(ok.status, 200); assert.deepEqual(ok.body.gradeScale.map((g) => g.grade), ['Cemerlang', 'Baik', 'Lulus'])
  const r = (await call('GET', `/v1/exams/${exam.id}/results`, { token: admin })).body
  assert.equal(r.students.find((s) => s.studentId === students[0].id).grade, 'Cemerlang')
  assert.equal(r.students.find((s) => s.studentId === students[2].id).grade, 'Lulus') // 44%
})

test('analitik peperiksaan: purata ikut subjek dan kadar lulus dikira daripada markah sebenar', async () => {
  const a = (await call('GET', '/v1/analytics?range=month', { token: admin })).body
  const row = db.prepare(`SELECT AVG(er.mark*100.0/e.max_mark) v, SUM(er.mark*100.0/e.max_mark>=e.pass_pct) p, COUNT(*) n FROM exam_results er JOIN exams e ON e.id=er.exam_id
    WHERE e.subject='Mathematics' AND er.mark IS NOT NULL AND e.date>=? AND e.date<=?`).get(a.from, a.to)
  const m = a.examAverageBySubject.find((x) => x.label === 'Mathematics')
  assert.equal(m.value, Math.round(row.v * 10) / 10)
  assert.equal(a.examTotals.marksEntered >= row.n, true)
  assert.equal(a.examPassRate, Math.round((db.prepare(`SELECT SUM(er.mark*100.0/e.max_mark>=e.pass_pct) p, COUNT(*) n FROM exam_results er JOIN exams e ON e.id=er.exam_id WHERE er.mark IS NOT NULL AND e.date>=? AND e.date<=?`).get(a.from, a.to)).p * 1000 /
    db.prepare(`SELECT COUNT(*) n FROM exam_results er JOIN exams e ON e.id=er.exam_id WHERE er.mark IS NOT NULL AND e.date>=? AND e.date<=?`).get(a.from, a.to).n) / 10)
})

test('analitik peperiksaan: examTrend ialah purata markah sebenar setiap peperiksaan, tersusun mengikut tarikh', async () => {
  const a = (await call('GET', '/v1/analytics?range=term', { token: admin })).body
  const rows = db.prepare(`SELECT e.id, e.date, AVG(er.mark*100.0/e.max_mark) v, COUNT(*) n FROM exam_results er JOIN exams e ON e.id=er.exam_id
    WHERE e.org_id=? AND e.date>=? AND e.date<=? AND er.mark IS NOT NULL GROUP BY e.id ORDER BY e.date, e.title`).all(a.attendance ? db.prepare('SELECT id FROM organizations LIMIT 1').get().id : '', a.from, a.to)
  assert.equal(a.examTrend.length, rows.length)
  assert.ok(rows.length > 0, 'ada peperiksaan bermarkah dalam tempoh')
  rows.forEach((r, i) => {
    assert.equal(a.examTrend[i].id, r.id); assert.equal(a.examTrend[i].date, r.date)
    assert.equal(a.examTrend[i].value, Math.round(r.v * 10) / 10); assert.equal(a.examTrend[i].marks, r.n)
  })
  const dates = a.examTrend.map((x) => x.date); assert.deepEqual(dates, [...dates].sort())
})

test('padam peperiksaan membuang markahnya; pelajar dinyahaktif tidak muncul dalam senarai markah', async () => {
  const [a, , , d] = students
  await call('DELETE', `/v1/students/${d.id}`, { token: admin })
  const r = (await call('GET', `/v1/exams/${exam.id}/results`, { token: admin })).body
  assert.ok(!r.students.some((s) => s.studentId === d.id))
  assert.ok(db.prepare('SELECT COUNT(*) c FROM exam_results WHERE exam_id=?').get(exam.id).c > 0)
  assert.equal((await call('DELETE', `/v1/exams/${exam.id}`, { token: admin })).status, 204)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM exam_results WHERE exam_id=?').get(exam.id).c, 0)
  assert.equal((await call('GET', `/v1/students/${a.id}/results`, { token: admin })).body.items.some((i) => i.examId === exam.id), false)
})
