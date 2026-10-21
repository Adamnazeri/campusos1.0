import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo, DEMO } from '../src/demo.js'

const config = { jwtSecret: 't', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3, corsOrigin: '*', authRateMax: 1000, loginFailMax: 50,
  exposeInviteTokens: true, billingEnabled: false, appUrl: 'http://app.test', mailFrom: 'x@y', mailWebhook: '', billingSecret: '', resetTtlMs: 3600e3, devEndpoints: true }
let server, base, db, admin
const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') && text ? JSON.parse(text) : text }
}
before(async () => {
  db = openDb(':memory:'); seedDemo(db)
  server = createServer(createApp({ db, config }).handler)
  await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
  admin = (await call('POST', '/v1/auth/login', { body: { email: DEMO.admin, password: DEMO.password } })).body.accessToken
})
after(() => server.close())
const addDays = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10)

test('analitik = kiraan sebenar daripada pangkalan data (dibandingkan dengan SQL bebas)', async () => {
  const a = (await call('GET', '/v1/analytics?range=term', { token: admin })).body
  const row = db.prepare("SELECT COUNT(*) n, SUM(status<>'Absent') att FROM attendance WHERE date>=? AND date<=?").get(a.from, a.to)
  assert.ok(row.n > 100)
  assert.equal(a.attendance.rate, Math.round((row.att / row.n) * 1000) / 10)
  assert.equal(a.totals.attendanceRecords, row.n)
  // purata hari dalam minggu: setiap hari dikira sendiri
  for (const w of a.attendanceByWeekday) {
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w.label)
    const r = db.prepare("SELECT COUNT(*) n, SUM(status<>'Absent') att FROM attendance WHERE date>=? AND date<=? AND CAST(strftime('%w', date) AS INTEGER)=?").get(a.from, a.to, idx)
    assert.equal(w.value, Math.round((r.att / r.n) * 1000) / 10, w.label)
  }
  // jam mengajar mengikut subjek = jumlah tempoh sesi sebenar
  const hrs = db.prepare("SELECT subject, SUM(duration)/60.0 h FROM sessions GROUP BY subject").all()
  for (const h of a.hoursBySubject) assert.equal(h.value, Math.round(hrs.find((x) => x.subject === h.label).h * 10) / 10)
  // kelas yang perlu perhatian diisih daripada terendah
  const rates = a.classesNeedingAttention.map((c) => c.rate)
  assert.deepEqual(rates, [...rates].sort((x, y) => x - y))
  assert.ok(a.completionBySubject.length > 0)
  assert.equal(a.totals.students, db.prepare('SELECT COUNT(*) c FROM students WHERE active=1').get().c)
})

test('organisasi baharu yang kosong: tiada angka rekaan (null / senarai kosong)', async () => {
  const r = await call('POST', '/v1/auth/signup-org', { body: { orgName: 'Kosong', name: 'O', email: 'o@kosong.edu.my', password: 'password123' } })
  const a = (await call('GET', '/v1/analytics', { token: r.body.accessToken })).body
  assert.equal(a.attendance.rate, null); assert.equal(a.assignmentCompletion, null)
  assert.deepEqual(a.attendanceTrend, []); assert.deepEqual(a.attendanceByWeekday, []); assert.deepEqual(a.frequentAbsentees, [])
  assert.deepEqual(a.hoursBySubject, []); assert.deepEqual(a.leaveDaysByType, [])
  assert.deepEqual(a.totals, { students: 0, attendanceRecords: 0, subjectsWithoutTeacher: 0, classesWithoutSubjects: 0 })
})

test('data baharu mengubah analitik: kehadiran, pelajar kerap tidak hadir, subjek tanpa guru', async () => {
  const r = await call('POST', '/v1/auth/signup-org', { body: { orgName: 'Sebenar', name: 'O', email: 'o@sebenar.edu.my', password: 'password123' } })
  const t = r.body.accessToken
  const cls = (await call('POST', '/v1/classes', { token: t, body: { name: '1 Amanah' } })).body
  const st = (await call('POST', '/v1/students', { token: t, body: { classId: cls.id, names: ['Ali', 'Siti', 'Budi'] } })).body.items
  await call('POST', '/v1/subjects', { token: t, body: { name: 'Sains' } })
  await call('POST', `/v1/classes/${cls.id}/subjects`, { token: t, body: { subject: 'Sains' } }) // tanpa guru
  const to = (await call('GET', '/v1/analytics', { token: t })).body.to
  // 3 hari: Ali sentiasa tidak hadir, Siti lewat sekali, Budi hadir
  const days = [to, addDays(to, -1), addDays(to, -2)]
  for (const [i, d] of days.entries()) {
    const put = await call('PUT', `/v1/classes/${cls.id}/attendance`, { token: t, body: { date: d, records: [
      { studentId: st[0].id, status: 'Absent' }, { studentId: st[1].id, status: i === 0 ? 'Late' : 'Present' }, { studentId: st[2].id, status: 'Present' }] } })
    assert.equal(put.status, 200, JSON.stringify(put.body))
  }
  const a = (await call('GET', '/v1/analytics?range=week', { token: t })).body
  assert.equal(a.totals.attendanceRecords, 9)
  assert.equal(a.attendance.rate, 66.7) // 6 daripada 9 hadir/lewat (Ali 3 tidak hadir)
  assert.deepEqual(a.frequentAbsentees, [{ id: st[0].id, name: 'Ali', class: '1 Amanah', absent: 3, late: 0, records: 3, rate: 0 }])
  assert.equal(a.classesNeedingAttention[0].name, '1 Amanah'); assert.equal(a.classesNeedingAttention[0].absent, 3)
  assert.equal(a.totals.subjectsWithoutTeacher, 1)
  assert.equal(a.totals.classesWithoutSubjects, 0)
  // guru tidak boleh melihat analitik pengurusan
  const teacher = (await call('POST', '/v1/auth/login', { body: { email: DEMO.teacher, password: DEMO.password } })).body.accessToken
  assert.equal((await call('GET', '/v1/analytics', { token: teacher })).status, 403)
})
