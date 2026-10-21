import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo, DEMO } from '../src/demo.js'
import { totpCode } from '../src/security.js'

const config = { jwtSecret: 't', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3, corsOrigin: '*', authRateMax: 1000, exposeInviteTokens: true, billingEnabled: true, appUrl: 'http://app.test', mailFrom: 'x@y', mailWebhook: '', billingSecret: 'whsec', resetTtlMs: 3600e3, devEndpoints: true }
let server, base, db, admin, sarah, grace
const MON_0830 = Date.parse('2026-10-05T08:30:00Z') // Isnin 08:30 UTC

before(async () => {
  db = openDb(':memory:')
  seedDemo(db)
  const { handler } = createApp({ db, config })
  server = createServer(handler)
  await new Promise((r) => server.listen(0, r))
  base = `http://localhost:${server.address().port}`
  const lg = async (email) => (await (await fetch(base + '/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: DEMO.password }) })).json()).accessToken
  admin = await lg(DEMO.admin); sarah = await lg(DEMO.teacher); grace = await lg(DEMO.coordinator)
})
after(() => server.close())

async function api(method, path, { body, token, raw } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  const json = !raw && res.headers.get('content-type')?.includes('json') && text ? JSON.parse(text) : text
  return { status: res.status, body: json, headers: res.headers }
}
const login = async (email, password = DEMO.password) => { const r = await api('POST', '/v1/auth/login', { body: { email, password } }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body }
const cls = async (name) => (await api('GET', '/v1/classes', { token: admin })).body.items.find((c) => c.name === name)
const tch = async (name) => (await api('GET', '/v1/teachers', { token: admin })).body.items.find((t) => t.name === name)

test('login: peranan, kebenaran, kata laluan salah, tanpa token', async () => {
  const a = await login(DEMO.admin)
  assert.equal(a.user.role, 'owner'); assert.ok(a.user.permissions.includes('billing:manage')); assert.equal(a.user.org.name, 'Greenfield Academy')
  const s = await login(DEMO.teacher)
  assert.equal(s.user.role, 'teacher'); assert.ok(s.user.teacherId); assert.ok(!s.user.permissions.includes('teachers:manage'))
  assert.equal((await api('POST', '/v1/auth/login', { body: { email: DEMO.admin, password: 'salah-salah' } })).status, 401)
  assert.equal((await api('GET', '/v1/me')).status, 401)
})

test('refresh token dirotasi; guna semula membatalkan semua sesi', async () => {
  const s = await login(DEMO.coordinator)
  const r1 = await api('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } })
  assert.equal(r1.status, 200)
  assert.equal((await api('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } })).status, 401)
  assert.equal((await api('POST', '/v1/auth/refresh', { body: { refreshToken: r1.body.refreshToken } })).status, 401)
})

test('RBAC: guru & koordinator disekat daripada tindakan pengurusan', async () => {
  assert.equal((await api('GET', '/v1/teachers', { token: sarah })).status, 403)
  assert.equal((await api('GET', '/v1/billing', { token: grace })).status, 403)
  assert.equal((await api('POST', '/v1/teachers', { token: grace, body: { name: 'X Y', email: 'xy@x.io' } })).status, 403)
  assert.equal((await api('GET', '/v1/teachers', { token: grace })).status, 200)
  assert.equal((await api('POST', '/v1/leave/x/decide', { token: sarah, body: { status: 'Approved' } })).status, 403)
  assert.equal((await api('GET', '/v1/reports/att', { token: sarah })).status, 403)
  const t2 = await tch('Daniel Okafor')
  assert.equal((await api('GET', `/v1/teachers/${t2.id}`, { token: sarah })).status, 403) // bukan profil sendiri
})

test('onboarding: cipta organisasi + jemputan + terima jemputan + had Starter', async () => {
  const r = await api('POST', '/v1/auth/signup-org', { body: {
    orgName: 'Sunrise College', orgType: 'College', name: 'Aisha', email: 'aisha@sunrise.edu', password: 'password123',
    setup: { branches: ['Main'], departments: ['Science'], teachers: [{ name: 'Tom Lee', email: 'tom@sunrise.edu' }], classes: [{ name: '1A', subject: 'Math' }], rooms: [{ name: 'R1', capacity: 30 }],
      timetable: { operatingDays: ['Mon', 'Tue', 'Wed'], dayStart: '09:00', dayEnd: '15:00' }, invites: [{ email: 'coord@sunrise.edu', role: 'coordinator' }] } } })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  assert.equal(r.body.user.role, 'owner'); assert.equal(r.body.invites.length, 2)
  const token = r.body.accessToken
  assert.equal((await api('GET', '/v1/teachers', { token })).body.total, 1)
  assert.deepEqual((await api('GET', '/v1/org/settings', { token })).body.operatingDays, ['Mon', 'Tue', 'Wed'])
  const inv = r.body.invites.find((i) => i.role === 'teacher')
  const acc = await api('POST', '/v1/auth/accept-invite', { body: { token: inv.token, password: 'password123' } })
  assert.equal(acc.status, 201); assert.equal(acc.body.user.name, 'Tom Lee'); assert.ok(acc.body.user.teacherId)
  assert.equal((await api('POST', '/v1/auth/accept-invite', { body: { token: inv.token, password: 'password123' } })).status, 400) // sekali guna
  // organisasi lain tidak nampak data Greenfield
  assert.equal((await api('GET', '/v1/classes', { token })).body.items.length, 1)
  assert.equal((await api('POST', '/v1/auth/signup-org', { body: { orgName: 'Dup', name: 'A', email: 'aisha@sunrise.edu', password: 'password123' } })).status, 409)
  const over = await api('POST', '/v1/auth/signup-org', { body: { orgName: 'Big', name: 'B', email: 'b@big.io', password: 'password123', setup: { branches: ['A', 'B'] } } })
  assert.equal(over.status, 402); assert.equal(over.body.error.code, 'PLAN_LIMIT')
})

test('guru: senarai, tambah, kemas kini, arkib dengan kawalan', async () => {
  const list = await api('GET', '/v1/teachers', { token: admin })
  assert.equal(list.body.total, 8)
  assert.equal(list.body.items.find((t) => t.name === 'Michael Adeyemi').status, 'Overloaded')
  assert.equal((await api('GET', '/v1/teachers?q=chemistry', { token: admin })).body.total, 3)
  const add = await api('POST', '/v1/teachers', { token: admin, body: { name: 'Nina Park', email: 'nina@campusos.io', department: 'ICT', branch: 'West Branch', subjects: ['ICT'] } })
  assert.equal(add.status, 201); assert.equal(add.body.department, 'ICT'); assert.ok(add.body.inviteToken)
  assert.equal((await api('POST', '/v1/teachers', { token: admin, body: { name: 'Nina Dup', email: 'NINA@campusos.io' } })).status, 409)
  assert.equal((await api('POST', '/v1/teachers', { token: admin, body: { name: 'Bad', email: 'bad@x.io', department: 'Tiada' } })).status, 400)
  const up = await api('PATCH', `/v1/teachers/${add.body.id}`, { token: admin, body: { phone: '+60 12 345', weeklyHours: 30 } })
  assert.equal(up.body.status, 'Heavy')
  assert.equal((await api('DELETE', `/v1/teachers/${add.body.id}`, { token: admin })).status, 204)
  assert.equal((await api('GET', '/v1/teachers', { token: admin })).body.total, 8)
  const sar = await tch('Sarah Mensah')
  const blocked = await api('DELETE', `/v1/teachers/${sar.id}`, { token: admin })
  assert.equal(blocked.status, 409); assert.equal(blocked.body.error.code, 'HAS_CLASSES')
  const prof = await api('GET', `/v1/teachers/${sar.id}`, { token: sarah })
  assert.equal(prof.status, 200); assert.ok(prof.body.schedule.length >= 5); assert.equal(prof.body.leave.balances.length, 3)
})

test('kelas & bilik: CRUD, kiraan, guru hanya nampak kelas sendiri', async () => {
  const mine = await api('GET', '/v1/classes', { token: sarah })
  assert.deepEqual(mine.body.items.map((c) => c.name).sort(), ['Form 4A', 'Form 4C'])
  assert.equal((await api('GET', '/v1/classes', { token: admin })).body.total, 8)
  const c = await api('POST', '/v1/classes', { token: admin, body: { name: 'Form 1A', subject: 'Maths', teacher: 'Sarah Mensah', branch: 'Main Campus', room: 'Room 301' } })
  assert.equal(c.status, 201); assert.equal(c.body.teacher, 'Sarah Mensah')
  assert.equal((await api('POST', '/v1/classes', { token: admin, body: { name: 'Form 1A' } })).status, 409)
  const stu = await api('POST', '/v1/students', { token: admin, body: { classId: c.body.id, names: ['Ali', 'Bala', 'Chen'] } })
  assert.equal(stu.status, 201)
  assert.equal((await api('GET', `/v1/classes/${c.body.id}`, { token: sarah })).body.roster.length, 3)
  assert.equal((await api('GET', `/v1/classes/${(await cls('Form 5B')).id}`, { token: sarah })).status, 403)
  assert.equal((await api('DELETE', `/v1/classes/${c.body.id}`, { token: admin })).status, 204)
  const rooms = await api('GET', '/v1/rooms', { token: sarah })
  assert.equal(rooms.body.items.find((r) => r.name === 'Hall 1').status, 'Maintenance')
  const r2 = await api('POST', '/v1/rooms', { token: admin, body: { name: 'Studio', capacity: 20, type: 'Other' } })
  assert.equal(r2.status, 201)
  assert.equal((await api('DELETE', `/v1/rooms/${r2.body.id}`, { token: admin })).status, 204)
  const used = (await api('GET', '/v1/rooms', { token: admin })).body.items.find((r) => r.name === 'Room 204')
  assert.equal((await api('DELETE', `/v1/rooms/${used.id}`, { token: admin })).status, 409)
})

test('jadual waktu: konflik sedia ada, tolak konflik baru, force, pindah, live', async () => {
  const tt = await api('GET', '/v1/timetable', { token: admin })
  assert.equal(tt.body.sessions.length, 16)
  assert.ok(tt.body.conflicts.some((c) => c.type === 'room' && c.day === 'Fri' && c.start === '08:00' && /Room 204/.test(c.message)))
  assert.equal((await api('GET', '/v1/timetable?mine=1', { token: sarah })).body.sessions.every((s) => s.teacher === 'Sarah Mensah'), true)
  const plain = (await api('GET', '/v1/timetable', { token: sarah })).body
  assert.ok(plain.sessions.length > 0 && plain.sessions.every((s) => s.teacher === 'Sarah Mensah')) // tanpa ?mine=1 pun tetap terhad
  assert.deepEqual(plain.conflicts, [])

  const f4a = await cls('Form 4A'), t7 = await tch('David Kimani')
  const clash = await api('POST', '/v1/timetable/sessions', { token: admin, body: { day: 'Mon', start: '08:00', classId: f4a.id, teacherId: t7.id, roomId: 'Room 204' } })
  assert.equal(clash.status, 409); assert.equal(clash.body.error.code, 'CONFLICT'); assert.ok(clash.body.error.conflicts.some((c) => c.type === 'room'))
  assert.equal((await api('POST', '/v1/timetable/sessions', { token: admin, body: { day: 'Mon', start: '07:00', classId: f4a.id } })).status, 400) // luar waktu operasi
  assert.equal((await api('POST', '/v1/timetable/sessions', { token: admin, body: { day: 'Sat', start: '09:00', classId: f4a.id } })).status, 400) // hari tidak beroperasi

  const ok = await api('POST', '/v1/timetable/sessions', { token: admin, body: { day: 'Tue', start: '11:00', classId: f4a.id, roomId: 'Room 301' } })
  assert.equal(ok.status, 201, JSON.stringify(ok.body)); assert.equal(ok.body.teacher, 'Sarah Mensah')
  const moved = await api('PATCH', `/v1/timetable/sessions/${ok.body.id}`, { token: admin, body: { day: 'Thu', start: '12:00' } })
  assert.equal(moved.body.day, 'Thu'); assert.equal(moved.body.start, '12:00')
  assert.equal((await api('DELETE', `/v1/timetable/sessions/${ok.body.id}`, { token: admin })).status, 204)
  const forced = await api('POST', '/v1/timetable/sessions?force=1', { token: admin, body: { day: 'Mon', start: '08:00', classId: f4a.id, teacherId: t7.id, roomId: 'Room 204' } })
  assert.equal(forced.status, 201); assert.ok(forced.body.forcedConflicts >= 1)
  await api('DELETE', `/v1/timetable/sessions/${forced.body.id}`, { token: admin })

  const live = await api('GET', `/v1/timetable/live?at=${MON_0830}`, { token: admin })
  assert.equal(live.body.now.day, 'Mon'); assert.equal(live.body.now.time, '08:30')
  assert.equal(live.body.items.find((i) => i.subject === 'Mathematics').state, 'in-progress')
  const hist = live.body.items.find((i) => i.subject === 'History')
  assert.equal(hist, undefined) // 14:00 masih jauh
  const mon = (await api('GET', '/v1/timetable?day=Mon', { token: admin })).body.sessions.find((s) => s.subject === 'Biology')
  await api('POST', `/v1/timetable/sessions/${mon.id}/cancel`, { token: admin, body: { date: '2026-10-05', reason: 'Guru sakit' } })
  assert.equal((await api('POST', `/v1/timetable/sessions/${mon.id}/cancel`, { token: admin, body: { date: '2026-10-06' } })).status, 400) // bukan hari Isnin
  const live2 = await api('GET', `/v1/timetable/live?at=${Date.parse('2026-10-05T10:30:00Z')}`, { token: admin })
  assert.equal(live2.body.items.find((i) => i.subject === 'Biology').state, 'cancelled')
})

test('kehadiran: guru tandakan kelas sendiri sahaja, tarikh masa depan ditolak, ringkasan', async () => {
  const f4a = await cls('Form 4A'), f5b = await cls('Form 5B')
  // hujung minggu terkini (≤ 6 hari lalu): seed hanya mengisi hari bekerja, dan guru boleh kemas kini sehingga 7 hari ke belakang
  const date = (() => { let d = new Date(Date.now() - 86_400_000); while (d.getUTCDay() !== 6) d = new Date(d.getTime() - 86_400_000); return d.toISOString().slice(0, 10) })()
  const get = await api('GET', `/v1/classes/${f4a.id}/attendance?date=${date}`, { token: sarah })
  assert.equal(get.body.roster.length, 32); assert.equal(get.body.marked, false)
  const put = await api('PUT', `/v1/classes/${f4a.id}/attendance`, { token: sarah, body: { date, defaultStatus: 'Present', records: [{ studentId: get.body.roster[0].id, status: 'Absent' }, { studentId: get.body.roster[1].id, status: 'Late' }] } })
  assert.equal(put.status, 200, JSON.stringify(put.body)); assert.deepEqual([put.body.counts.present, put.body.counts.absent, put.body.counts.late], [30, 1, 1])
  const again = await api('PUT', `/v1/classes/${f4a.id}/attendance`, { token: sarah, body: { date, records: [{ studentId: get.body.roster[0].id, status: 'Present' }] } })
  assert.equal(again.body.counts.absent, 0) // kemas kini, bukan duplikat
  assert.equal((await api('PUT', `/v1/classes/${f5b.id}/attendance`, { token: sarah, body: { date, defaultStatus: 'Present' } })).status, 403)
  assert.equal((await api('PUT', `/v1/classes/${f4a.id}/attendance`, { token: sarah, body: { date: '2099-01-01', defaultStatus: 'Present' } })).status, 400)
  assert.equal((await api('PUT', `/v1/classes/${f4a.id}/attendance`, { token: sarah, body: { date: '2026-01-01', defaultStatus: 'Present' } })).status, 403) // terlalu lama untuk guru
  assert.equal((await api('PUT', `/v1/classes/${f4a.id}/attendance`, { token: sarah, body: { date, records: [{ studentId: 'bukan-pelajar', status: 'Present' }] } })).status, 400)
  assert.equal((await api('PUT', `/v1/classes/${f4a.id}/attendance`, { token: admin, body: { date: '2026-01-01', defaultStatus: 'Present' } })).status, 200) // pengurus boleh
  const ov = await api('GET', '/v1/attendance/overview', { token: admin })
  assert.equal(ov.status, 200); assert.ok(ov.body.rate > 85 && ov.body.rate < 100); assert.ok(ov.body.trend.length >= 8); assert.equal(ov.body.classes.length, 8)
})

test('cuti: mohon, baki, bertindih, lulus/tolak, undo, tiada lulus sendiri', async () => {
  const bal = await api('GET', '/v1/leave/balance', { token: sarah })
  assert.equal(bal.body.balances.find((b) => b.type === 'Medical leave').remaining, 10)
  const bad = await api('POST', '/v1/leave', { token: sarah, body: { type: 'Casual leave', from: '2026-11-02', to: '2026-11-20', reason: 'x' } })
  assert.equal(bad.status, 422); assert.equal(bad.body.error.code, 'INSUFFICIENT_BALANCE') // 15 hari > 6
  assert.equal((await api('POST', '/v1/leave', { token: sarah, body: { type: 'Casual leave', from: '2026-11-10', to: '2026-11-09' } })).status, 400)
  const ok = await api('POST', '/v1/leave', { token: sarah, body: { type: 'Casual leave', from: '2026-11-02', to: '2026-11-04', reason: 'Urusan keluarga' } })
  assert.equal(ok.status, 201); assert.equal(ok.body.days, 3); assert.equal(ok.body.teacher, 'Sarah Mensah'); assert.equal(ok.body.status, 'Pending')
  assert.equal((await api('POST', '/v1/leave', { token: sarah, body: { type: 'Casual leave', from: '2026-11-04', to: '2026-11-05' } })).status, 409)
  const wk = await api('POST', '/v1/leave', { token: sarah, body: { type: 'Study leave', from: '2026-12-05', to: '2026-12-06' } }) // Sabtu–Ahad
  assert.equal(wk.status, 400)
  assert.equal((await api('GET', '/v1/leave', { token: sarah })).body.items.every((l) => l.teacher === 'Sarah Mensah'), true)
  assert.ok((await api('GET', '/v1/leave', { token: admin })).body.counts.Pending >= 4)
  const dec = await api('POST', `/v1/leave/${ok.body.id}/decide`, { token: admin, body: { status: 'Approved', note: 'OK' } })
  assert.equal(dec.body.status, 'Approved')
  assert.equal((await api('POST', `/v1/leave/${ok.body.id}/decide`, { token: admin, body: { status: 'Rejected' } })).status, 409)
  assert.equal((await api('GET', '/v1/leave/balance', { token: sarah })).body.balances.find((b) => b.type === 'Casual leave').remaining, 3)
  const undo = await api('POST', `/v1/leave/${ok.body.id}/reopen`, { token: admin })
  assert.equal(undo.body.status, 'Pending')
  assert.equal((await api('DELETE', `/v1/leave/${ok.body.id}`, { token: sarah })).status, 204) // guru boleh batal yang masih Pending
})

test('tugas & tugasan: guru hanya urus milik sendiri', async () => {
  const mine = await api('GET', '/v1/tasks', { token: sarah })
  assert.ok(mine.body.items.length >= 1 && mine.body.items.every((k) => k.assignee === 'Sarah Mensah'))
  const k = mine.body.items[0]
  assert.equal((await api('POST', `/v1/tasks/${k.id}/advance`, { token: sarah })).body.status, 'Completed') // In Progress → Completed
  const others = (await api('GET', '/v1/tasks', { token: admin })).body.items.find((t) => t.assignee === 'Daniel Okafor')
  assert.equal((await api('POST', `/v1/tasks/${others.id}/advance`, { token: sarah })).status, 403)
  assert.equal((await api('PATCH', `/v1/tasks/${k.id}`, { token: sarah, body: { title: 'ubah' } })).status, 403)
  const nt = await api('POST', '/v1/tasks', { token: admin, body: { title: 'Semak buku', assignee: 'Sarah Mensah', due: '2026-10-20', priority: 'High' } })
  assert.equal(nt.status, 201); assert.equal(nt.body.status, 'To Do')
  assert.equal((await api('POST', `/v1/tasks/${nt.body.id}/advance`, { token: sarah })).body.status, 'In Progress')
  assert.equal((await api('POST', '/v1/tasks', { token: sarah, body: { title: 'x' } })).status, 403)
  // tugasan (assignments)
  const f4a = await cls('Form 4A')
  const as = await api('POST', '/v1/assignments', { token: sarah, body: { title: 'Latihan 5', classId: f4a.id, due: '2026-10-12', status: 'Published' } })
  assert.equal(as.status, 201); assert.equal(as.body.total, 32); assert.equal(as.body.submitted, 0)
  const roster = (await api('GET', `/v1/classes/${f4a.id}`, { token: sarah })).body.roster
  assert.equal((await api('POST', `/v1/assignments/${as.body.id}/submissions`, { token: sarah, body: { studentIds: roster.slice(0, 5).map((r) => r.id) } })).body.submitted, 5)
  const f5b = await cls('Form 5B')
  assert.equal((await api('POST', '/v1/assignments', { token: sarah, body: { title: 'x', classId: f5b.id } })).status, 403)
  assert.equal((await api('GET', '/v1/assignments', { token: sarah })).body.items.every((a) => a.teacher === 'Sarah Mensah'), true)
})

test('peperiksaan: konflik bilik/pengawas', async () => {
  const f4c = await cls('Form 4C'), t2 = await tch('Daniel Okafor')
  // tarikh seed relatif kepada hari ini, jadi ambil tarikh sebenar peperiksaan sedia ada
  const mid = (await api('GET', '/v1/exams', { token: admin })).body.items.find((e) => e.title === 'Mathematics Mid-Term')
  const clash = await api('POST', '/v1/exams', { token: admin, body: { title: 'Ujian X', classId: f4c.id, date: mid.date, time: mid.time, room: 'Hall 1', invigilator: t2.id } })
  assert.equal(clash.status, 409) // Hall 1 sudah dipakai Math Mid-Term pada masa yang sama
  assert.ok(clash.body.error.conflicts.some((c) => c.type === 'room'))
  const ok = await api('POST', '/v1/exams', { token: admin, body: { title: 'Ujian X', classId: f4c.id, date: mid.date, time: mid.time, room: 'Room 301' } })
  assert.equal(ok.status, 201); assert.equal(ok.body.subject, 'Mathematics')
  const up = await api('PATCH', `/v1/exams/${ok.body.id}`, { token: admin, body: { status: 'Grading' } })
  assert.equal(up.body.status, 'Grading')
  // guru nampak peperiksaan yang diawasi ATAU bagi kelas yang diajar (supaya boleh memasukkan markah)
  const mine = new Set((await api('GET', '/v1/classes', { token: sarah })).body.items.map((c) => c.id))
  const seen = (await api('GET', '/v1/exams', { token: sarah })).body.items
  assert.ok(seen.length > 0 && seen.every((e) => e.invigilator === 'Sarah Mensah' || mine.has(e.classId)))
})

test('pengumuman: sasaran, draf, baca, jangkauan', async () => {
  const seen = (await api('GET', '/v1/announcements', { token: sarah })).body
  assert.equal(seen.items.length, 3) // bukan notis Sciences
  assert.ok(!seen.items.some((a) => a.tag === 'Emergency')); assert.equal(seen.unread, 2)
  const first = seen.items.find((a) => !a.read)
  await api('POST', `/v1/announcements/${first.id}/read`, { token: sarah })
  assert.equal((await api('GET', '/v1/announcements', { token: sarah })).body.unread, 1)
  const draft = await api('POST', '/v1/announcements', { token: admin, body: { title: 'Draf', body: 'Isi', status: 'Draft' } })
  assert.equal(draft.status, 201)
  assert.ok(!(await api('GET', '/v1/announcements', { token: sarah })).body.items.some((a) => a.id === draft.body.id))
  const pub = await api('POST', `/v1/announcements/${draft.body.id}/publish`, { token: admin })
  assert.equal(pub.body.status, 'Published')
  const dep = await api('POST', '/v1/announcements', { token: admin, body: { title: 'Sains', body: 'Makmal', audienceType: 'department', audienceValue: 'Sciences', tag: 'Emergency' } })
  assert.equal(dep.body.recipients, 0) // tiada guru Sciences ada akaun
  assert.equal((await api('POST', '/v1/announcements', { token: sarah, body: { title: 'x', body: 'y' } })).status, 403)
  assert.equal((await api('POST', '/v1/announcements', { token: admin, body: { title: 'x', body: 'y', tag: 'Salah' } })).status, 400)
  assert.ok((await api('GET', '/v1/announcements/reach', { token: admin })).body.items.length >= 3)
})

test('analitik, overview, beban kerja, aktiviti', async () => {
  const wl = await api('GET', '/v1/teachers/workload', { token: admin })
  assert.equal(wl.status, 200); assert.equal(wl.body.summary.Overloaded, 1); assert.equal(wl.body.byDepartment[0].label, 'Sciences')
  const an = await api('GET', '/v1/analytics?range=month', { token: admin })
  assert.equal(an.status, 200); assert.ok(an.body.attendance.rate > 85); assert.ok(an.body.roomUtilization >= 0); assert.ok(an.body.assignmentCompletion > 0)
  assert.equal((await api('GET', '/v1/analytics?range=tahun', { token: admin })).status, 400)
  const ov = await api('GET', '/v1/overview', { token: admin })
  assert.equal(ov.body.stats.teachers, 8); assert.equal(ov.body.stats.activeClasses, 8); assert.equal(ov.body.stats.branches, 3)
  assert.ok(ov.body.conflicts.length >= 1); assert.ok(ov.body.activity.length >= 5); assert.ok(ov.body.pendingLeave >= 3)
  assert.equal((await api('GET', '/v1/overview', { token: sarah })).status, 403)
})

test('dashboard guru', async () => {
  const d = await api('GET', '/v1/me/dashboard', { token: sarah })
  assert.equal(d.status, 200); assert.equal(d.body.teacher.name, 'Sarah Mensah'); assert.equal(d.body.classes.length, 2)
  assert.ok(d.body.leaveBalances.length === 3); assert.ok(Array.isArray(d.body.today.sessions))
  const a = await api('GET', '/v1/me/dashboard', { token: admin })
  assert.equal(a.body.teacher, null) // admin tiada profil guru
})

test('laporan: senarai, JSON, CSV selamat, tapis cawangan', async () => {
  assert.equal((await api('GET', '/v1/reports', { token: grace })).body.items.length, 8)
  const att = await api('GET', '/v1/reports/att?from=2026-09-01&to=2026-10-31', { token: admin })
  assert.equal(att.body.rows.length, 8); assert.ok(att.body.summary.rate > 80)
  const east = await api('GET', '/v1/reports/tt?branch=East%20Branch', { token: admin })
  assert.ok(east.body.rows.length > 0 && east.body.rows.every((r) => ['Form 6 Sci', 'Form 2B'].includes(r.className)))
  const csv = await api('GET', '/v1/reports/wl?format=csv', { token: admin })
  assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(csv.body.split('\n')[0], /Teacher,Department/); assert.equal(csv.body.split('\n').length, 9)
  assert.equal((await api('GET', '/v1/reports/xyz', { token: admin })).status, 404)
  assert.equal((await api('GET', '/v1/reports/att?from=2026-12-01&to=2026-01-01', { token: admin })).status, 400)
  // suntikan formula CSV dineutralkan
  await api('PATCH', `/v1/teachers/${(await tch('Amina Yusuf')).id}`, { token: admin, body: { name: '=HYPERLINK("x")' } })
  const leave = await api('GET', '/v1/reports/wl?format=csv', { token: admin })
  assert.ok(leave.body.includes("'=HYPERLINK")) // diawali apostrof supaya Excel tidak menjalankannya sebagai formula
  assert.ok(!/(^|,)=HYPERLINK/m.test(leave.body))
})

test('tetapan, cawangan, pengguna, bil', async () => {
  const st = await api('PATCH', '/v1/org/settings', { token: admin, body: { notifications: { digest: true }, attendanceTarget: 95, term: 'Term 2' } })
  assert.equal(st.body.notifications.digest, true); assert.equal(st.body.notifications.leave, true); assert.equal(st.body.term, 'Term 2')
  assert.equal((await api('PATCH', '/v1/org/settings', { token: admin, body: { tidakWujud: 1 } })).status, 400)
  assert.equal((await api('PATCH', '/v1/org/settings', { token: admin, body: { dayStart: '17:00' } })).status, 400)
  assert.equal((await api('PATCH', '/v1/org/settings', { token: grace, body: { term: 'x' } })).status, 403)
  assert.equal((await api('PATCH', '/v1/org', { token: admin, body: { name: 'Greenfield Academy', timezone: 'WAT (UTC+1)' } })).body.timezone, 'WAT (UTC+1)')
  await api('PATCH', '/v1/org', { token: admin, body: { timezone: 'GMT (UTC+0)' } })
  const roles = await api('GET', '/v1/org/roles', { token: admin })
  assert.equal(roles.body.rows.find((r) => r.permission === 'Billing').allowed.owner, true); assert.equal(roles.body.rows.find((r) => r.permission === 'Billing').allowed.admin, false)

  assert.equal((await api('POST', '/v1/branches', { token: admin, body: { name: 'North' } })).status, 201)
  assert.equal((await api('POST', '/v1/branches', { token: admin, body: { name: 'North' } })).status, 409)
  const users = await api('GET', '/v1/users', { token: admin })
  assert.equal(users.body.items.length, 3)
  const me = users.body.items.find((u) => u.email === DEMO.admin)
  assert.equal((await api('PATCH', `/v1/users/${me.id}`, { token: admin, body: { active: false } })).status, 400)
  assert.equal((await api('PATCH', `/v1/users/${me.id}`, { token: admin, body: { role: 'teacher' } })).status, 409) // pemilik terakhir
  const g = users.body.items.find((u) => u.email === DEMO.coordinator)
  assert.equal((await api('PATCH', `/v1/users/${g.id}`, { token: admin, body: { role: 'academic' } })).body.role, 'academic')
  const inv = await api('POST', '/v1/invites', { token: admin, body: { email: 'new@campusos.io', role: 'teacher' } })
  assert.equal(inv.status, 201); assert.ok(inv.body.token)
  assert.equal((await api('POST', '/v1/invites', { token: admin, body: { email: DEMO.admin, role: 'teacher' } })).status, 409)

  const bill = await api('GET', '/v1/billing', { token: admin })
  assert.equal(bill.body.plan.id, 'growth'); assert.equal(bill.body.usage.teachers.limit, 100); assert.equal(bill.body.invoices.length, 3)
  const down = await api('POST', '/v1/billing/plan', { token: admin, body: { plan: 'starter' } })
  assert.equal(down.status, 409); assert.equal(down.body.error.code, 'DOWNGRADE_BLOCKED')
  assert.equal((await api('POST', '/v1/billing/plan', { token: admin, body: { plan: 'enterprise' } })).status, 400)
})

test('kata laluan: tukar → sesi lama dibatalkan', async () => {
  const s = await login(DEMO.coordinator)
  assert.equal((await api('POST', '/v1/me/password', { token: s.accessToken, body: { current: 'salah', next: 'password456' } })).status, 401)
  const ch = await api('POST', '/v1/me/password', { token: s.accessToken, body: { current: DEMO.password, next: 'password456' } })
  assert.equal(ch.status, 200)
  assert.equal((await api('POST', '/v1/auth/refresh', { body: { refreshToken: s.refreshToken } })).status, 401)
  assert.equal((await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password } })).status, 401)
  await api('POST', '/v1/me/password', { token: ch.body.accessToken, body: { current: 'password456', next: DEMO.password } })
})

test('404/405/CORS dan rate limit', async () => {
  assert.equal((await api('GET', '/v1/nope')).status, 404)
  assert.equal((await api('PUT', '/v1/me')).status, 405)
  assert.equal((await fetch(base + '/v1/me', { method: 'OPTIONS' })).status, 204)
  const db2 = openDb(':memory:')
  const { handler } = createApp({ db: db2, config: { ...config, authRateMax: 3 } })
  const s2 = createServer(handler); await new Promise((r) => s2.listen(0, r))
  const codes = []
  for (let i = 0; i < 5; i++) codes.push((await fetch(`http://localhost:${s2.address().port}/v1/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'a@b.co', password: 'xxxxxxxx' }) })).status)
  s2.close()
  assert.deepEqual(codes, [401, 401, 401, 429, 429])
})

const outbox = async (token = admin) => (await api('GET', '/v1/dev/outbox', { token })).body.items
const settle = () => new Promise((r) => setTimeout(r, 30))

test('lupa kata laluan: e-mel direkod, token sekali guna, sesi lama dibatalkan', async () => {
  const old = await login(DEMO.coordinator)
  const same = await api('POST', '/v1/auth/forgot-password', { body: { email: 'tiada@nowhere.io' } })
  const real = await api('POST', '/v1/auth/forgot-password', { body: { email: DEMO.coordinator } })
  assert.equal(same.status, 202); assert.equal(real.status, 202); assert.deepEqual(same.body, real.body) // tidak bocorkan akaun
  await settle()
  const mail = (await outbox()).find((m) => m.to === DEMO.coordinator && /reset your CampusOS password/i.test(m.subject))
  assert.ok(mail); assert.equal(mail.status, 'logged')
  const token = /\?reset=([\w-]+)/.exec(mail.body)[1]
  assert.equal((await api('POST', '/v1/auth/reset-password', { body: { token: 'salah', password: 'password789' } })).status, 400)
  assert.equal((await api('POST', '/v1/auth/reset-password', { body: { token, password: 'pendek' } })).status, 400)
  assert.equal((await api('POST', '/v1/auth/reset-password', { body: { token, password: 'password789' } })).status, 200)
  assert.equal((await api('POST', '/v1/auth/reset-password', { body: { token, password: 'password000' } })).status, 400) // sekali guna
  assert.equal((await api('POST', '/v1/auth/refresh', { body: { refreshToken: old.refreshToken } })).status, 401)
  assert.equal((await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password } })).status, 401)
  const ok = await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: 'password789' } })
  assert.equal(ok.status, 200)
  await api('POST', '/v1/me/password', { token: ok.body.accessToken, body: { current: 'password789', next: DEMO.password } })
})

test('e-mel jemputan & cuti masuk peti keluar', async () => {
  await api('POST', '/v1/invites', { token: admin, body: { email: 'baru@campusos.io', role: 'teacher' } })
  await api('POST', '/v1/leave', { token: sarah, body: { type: 'Study leave', from: '2027-02-01', to: '2027-02-02', reason: 'Kursus' } })
  await settle()
  const mails = await outbox()
  const inv = mails.find((m) => m.to === 'baru@campusos.io')
  assert.ok(inv && inv.body.includes('http://app.test/?invite='))
  assert.ok(mails.some((m) => m.to === DEMO.admin && /New leave request: Sarah Mensah/.test(m.subject)))
  const mine = (await api('GET', '/v1/leave', { token: sarah })).body.items.find((l) => l.from === '2027-02-01')
  await api('POST', `/v1/leave/${mine.id}/decide`, { token: admin, body: { status: 'Approved', note: 'Selamat belajar' } })
  await settle()
  assert.ok((await outbox()).some((m) => m.to === DEMO.teacher && /approved/.test(m.subject) && m.body.includes('Selamat belajar')))
  assert.equal((await api('GET', '/v1/dev/outbox', { token: sarah })).status, 403)
})

test('penghantaran e-mel melalui webhook (berjaya & gagal)', async () => {
  const calls = []
  let fail = false
  const fakeFetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization }); return { ok: !fail, status: fail ? 500 : 200 } }
  const db2 = openDb(':memory:'); seedDemo(db2)
  const { handler } = createApp({ db: db2, config: { ...config, mailWebhook: 'https://mail.test/send', mailWebhookAuth: 'Bearer k' }, deps: { fetch: fakeFetch } })
  const s2 = createServer(handler); await new Promise((r) => s2.listen(0, r))
  const u = `http://localhost:${s2.address().port}`
  await fetch(u + '/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: DEMO.admin }) })
  await settle()
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://mail.test/send'); assert.equal(calls[0].auth, 'Bearer k'); assert.equal(calls[0].body.to, DEMO.admin)
  assert.equal(db2.prepare("SELECT status FROM emails").get().status, 'sent')
  fail = true
  await fetch(u + '/v1/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: DEMO.admin }) })
  await settle()
  assert.equal(db2.prepare("SELECT COUNT(*) c FROM emails WHERE status='failed'").get().c, 1)
  s2.close()
})

test('2FA TOTP: persediaan, wajib kod semasa login, nyahaktif, kod tidak boleh dipakai semula', async () => {
  const s = await login(DEMO.coordinator)
  const setup = await api('POST', '/v1/me/2fa/setup', { token: s.accessToken })
  assert.match(setup.body.secret, /^[A-Z2-7]{32}$/); assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//)
  assert.equal((await api('POST', '/v1/me/2fa/enable', { token: s.accessToken, body: { code: '000000' } })).status, 400)
  const t0 = Date.now()
  const en = await api('POST', '/v1/me/2fa/enable', { token: s.accessToken, body: { code: totpCode(setup.body.secret, t0) } })
  assert.equal(en.body.twoFactor, true); assert.equal(en.body.recoveryCodes.length, 8)
  const noCode = await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password } })
  assert.equal(noCode.status, 401); assert.equal(noCode.body.error.code, 'TOTP_REQUIRED')
  assert.equal((await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password, code: '123456' } })).body.error.code, 'INVALID_TOTP')
  // kod yang baru digunakan untuk enable tidak boleh dipakai semula; kod langkah 30s berikutnya sah
  const replay = await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password, code: totpCode(setup.body.secret, t0) } })
  assert.equal(replay.status, 401); assert.equal(replay.body.error.code, 'INVALID_TOTP')
  const next = totpCode(setup.body.secret, t0 + 30_000)
  const good = await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password, code: next } })
  assert.equal(good.status, 200); assert.equal(good.body.user.twoFactor, true)
  assert.equal((await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password, code: next } })).status, 401) // guna semula ditolak
  // nilai TOTP rujukan RFC 6238 (secret "12345678901234567890", t=59 → 287082)
  assert.equal(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59_000), '287082')
  // nyahaktif: kod sebelum langkah terakhir ditolak, perlu langkah baru (t0-30s ialah langkah lama → ditolak)
  assert.equal((await api('POST', '/v1/me/2fa/disable', { token: good.body.accessToken, body: { password: 'salah', code: totpCode(setup.body.secret, t0 + 30_000) } })).status, 401)
  const rc = en.body.recoveryCodes[0]
  assert.equal((await api('POST', '/v1/me/2fa/disable', { token: good.body.accessToken, body: { password: DEMO.password, code: rc } })).body.twoFactor, false)
  assert.equal((await api('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password } })).status, 200)
})

test('webhook pembayaran: rahsia, bayaran berjaya, langganan dibatalkan', async () => {
  const r = await api('POST', '/v1/auth/signup-org', { body: { orgName: 'Pay Co', name: 'P', email: 'p@pay.io', password: 'password123' } })
  const t = r.body.accessToken, orgId = r.body.user.org.id
  const up = await api('POST', '/v1/billing/plan', { token: t, body: { plan: 'growth' } })
  assert.equal(up.body.invoices[0].status, 'Due')
  const hook = (body, auth = 'Bearer whsec') => fetch(base + '/v1/billing/webhook', { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await hook({ orgId, event: 'payment_succeeded' }, 'Bearer salah')).status, 401)
  assert.equal((await hook({ orgId, event: 'payment_succeeded' })).status, 200)
  assert.equal((await api('GET', '/v1/billing', { token: t })).body.invoices[0].status, 'Paid')
  assert.equal((await hook({ orgId: 'tiada', event: 'payment_succeeded' })).status, 200) // diabaikan
  assert.equal((await hook({ orgId, event: 'bukan-event' })).status, 400)
  await hook({ orgId, event: 'subscription_cancelled' })
  assert.equal((await api('GET', '/v1/billing', { token: t })).body.plan.id, 'starter')
})
