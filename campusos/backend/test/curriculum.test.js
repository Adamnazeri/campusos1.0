import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo, DEMO } from '../src/demo.js'

const config = { jwtSecret: 't', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3, corsOrigin: '*', authRateMax: 1000, loginFailMax: 50,
  exposeInviteTokens: true, billingEnabled: false, appUrl: 'http://app.test', mailFrom: 'x@y', mailWebhook: '', billingSecret: '', resetTtlMs: 3600e3, devEndpoints: true }
let server, base, db, admin, teacher
const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') && text ? JSON.parse(text) : text }
}
const login = async (email) => (await call('POST', '/v1/auth/login', { body: { email, password: DEMO.password } })).body.accessToken
before(async () => {
  db = openDb(':memory:'); seedDemo(db)
  server = createServer(createApp({ db, config }).handler)
  await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
  admin = await login(DEMO.admin); teacher = await login(DEMO.teacher)
})
after(() => server.close())

const teachers = async () => (await call('GET', '/v1/teachers', { token: admin })).body.items
const nameToId = async (n) => (await teachers()).find((t) => t.name.includes(n)).id

test('data lama dipindahkan: setiap kelas demo kini ada pautan subjek; lajur lama dikosongkan', async () => {
  const classes = (await call('GET', '/v1/classes', { token: admin })).body.items
  assert.ok(classes.length >= 8)
  for (const c of classes) { assert.equal(c.subjects.length, 1, c.name); assert.equal(c.subject, c.subjects[0].subject); assert.ok(c.subjects[0].teacherId) }
  assert.equal(db.prepare("SELECT COUNT(*) c FROM classes WHERE subject IS NOT NULL").get().c, 0)
  const subs = (await call('GET', '/v1/subjects', { token: admin })).body.items
  assert.ok(subs.some((s) => s.name === 'Mathematics' && s.classes === 2))
  // pindah sekali sahaja: menjalankan semula tidak menggandakan pautan
  const { migrateLegacyClassSubjects } = await import('../src/curriculum.js')
  assert.equal(migrateLegacyClassSubjects(db), 0)
})

test('subjek: tambah, tiada duplikasi (tidak peka huruf), guru tidak boleh mengurus tetapi boleh melihat', async () => {
  const r = await call('POST', '/v1/subjects', { token: admin, body: { name: 'Art & Design', code: 'ART' } })
  assert.equal(r.status, 201); assert.equal(r.body.classes, 0)
  assert.equal((await call('POST', '/v1/subjects', { token: admin, body: { name: 'art & design' } })).body.error.code, 'ALREADY_EXISTS')
  assert.equal((await call('POST', '/v1/subjects', { token: teacher, body: { name: 'Hack' } })).status, 403)
  assert.equal((await call('GET', '/v1/subjects', { token: teacher })).status, 200)
})

test('kelas tanpa subjek: tetapkan subjek + guru berbeza; guru subjek nampak & boleh akses kelas', async () => {
  const cls = (await call('POST', '/v1/classes', { token: admin, body: { name: 'Form 1 Amanah' } })).body
  assert.deepEqual(cls.subjects, []); assert.equal(cls.subject, null)
  const sarah = await nameToId('Sarah'), daniel = await nameToId('Daniel')
  const math = (await call('GET', '/v1/subjects', { token: admin })).body.items.find((s) => s.name === 'Mathematics')
  const l1 = await call('POST', `/v1/classes/${cls.id}/subjects`, { token: admin, body: { subject: math.id, teacher: daniel, periodsPerWeek: 4 } })
  assert.equal(l1.status, 201); assert.equal(l1.body.teacher.includes('Daniel'), true); assert.equal(l1.body.periodsPerWeek, 4)
  const l2 = await call('POST', `/v1/classes/${cls.id}/subjects`, { token: admin, body: { subject: 'Art & Design', teacher: sarah } })
  assert.equal(l2.status, 201)
  assert.equal((await call('POST', `/v1/classes/${cls.id}/subjects`, { token: admin, body: { subject: 'mathematics' } })).body.error.code, 'ALREADY_EXISTS')
  assert.equal((await call('POST', `/v1/classes/${cls.id}/subjects`, { token: admin, body: { subject: 'Tidak Wujud' } })).status, 404)
  assert.equal((await call('POST', `/v1/classes/${cls.id}/subjects`, { token: teacher, body: { subject: 'Mathematics' } })).status, 403)
  const got = (await call('GET', '/v1/classes', { token: admin })).body.items.find((c) => c.id === cls.id)
  assert.deepEqual(got.subjects.map((s) => s.subject).sort(), ['Art & Design', 'Mathematics'])
  // Sarah (guru Art di kelas ini, bukan guru kelas) mesti nampak kelas ini dan boleh mengaksesnya
  const sarahToken = teacher // DEMO.teacher ialah Sarah Mensah
  const mine = (await call('GET', '/v1/classes', { token: sarahToken })).body.items
  assert.ok(mine.some((c) => c.id === cls.id), 'guru subjek nampak kelas')
  assert.equal((await call('GET', `/v1/classes/${cls.id}`, { token: sarahToken })).status, 200)
  const linksMine = (await call('GET', '/v1/class-subjects', { token: sarahToken })).body.items
  assert.ok(linksMine.length >= 1 && linksMine.every((l) => l.teacher.includes('Sarah')))
  globalThis.__cls = cls.id; globalThis.__ids = { l1: l1.body.id, l2: l2.body.id, sarah, daniel }
})

test('jadual: kelas berbilang subjek mesti pilih subjek; guru datang daripada pautan; subjek salah ditolak', async () => {
  const { l1, daniel } = globalThis.__ids, classId = globalThis.__cls
  const noPick = await call('POST', '/v1/timetable/sessions', { token: admin, body: { classId, day: 'Mon', start: '09:00', duration: 60 } })
  assert.equal(noPick.status, 400)
  const wrong = await call('POST', '/v1/timetable/sessions', { token: admin, body: { classId, subjectId: 'Physics', day: 'Mon', start: '09:00' } })
  assert.equal(wrong.status, 400)
  const ok = await call('POST', '/v1/timetable/sessions', { token: admin, body: { classId, subjectId: 'Mathematics', day: 'Mon', start: '15:00', duration: 60 } })
  assert.equal(ok.status, 201); assert.equal(ok.body.subject, 'Mathematics'); assert.equal(ok.body.teacherId, daniel)
  globalThis.__session = ok.body.id
  // tukar guru subjek → sesi mengikut
  const sarah = globalThis.__ids.sarah
  const ch = await call('PATCH', `/v1/class-subjects/${l1}`, { token: admin, body: { teacher: sarah } })
  assert.equal(ch.status, 200)
  const sess = (await call('GET', `/v1/timetable?classId=${classId}`, { token: admin })).body.sessions.find((s) => s.id === ok.body.id)
  assert.equal(sess.teacherId, sarah)
})

test('buang pautan/subjek disekat bila masih digunakan; namakan semula subjek menyegerakkan sesi', async () => {
  const { l1 } = globalThis.__ids
  const blocked = await call('DELETE', `/v1/class-subjects/${l1}`, { token: admin })
  assert.equal(blocked.status, 409); assert.equal(blocked.body.error.code, 'IN_USE')
  const math = (await call('GET', '/v1/subjects', { token: admin })).body.items.find((s) => s.name === 'Mathematics')
  assert.equal((await call('DELETE', `/v1/subjects/${math.id}`, { token: admin })).body.error.code, 'IN_USE')
  const ren = await call('PATCH', `/v1/subjects/${math.id}`, { token: admin, body: { name: 'Maths' } })
  assert.equal(ren.body.name, 'Maths')
  const sess = (await call('GET', `/v1/timetable?classId=${globalThis.__cls}`, { token: admin })).body.sessions.find((s) => s.id === globalThis.__session)
  assert.equal(sess.subject, 'Maths')
  assert.equal((await call('DELETE', `/v1/timetable/sessions/${globalThis.__session}`, { token: admin })).status, 204)
  assert.equal((await call('DELETE', `/v1/class-subjects/${l1}`, { token: admin })).status, 204)
})

test('guru yang hanya mengajar satu subjek tidak boleh diarkibkan; tugasan hanya untuk subjek kelas', async () => {
  const daniel = await nameToId('Daniel')
  // Daniel masih guru kelas/subjek di kelas demo → disekat; mesej menyebut guru kelas atau guru subjek
  const arch = await call('DELETE', `/v1/teachers/${daniel}`, { token: admin })
  assert.equal(arch.status, 409); assert.equal(arch.body.error.code, 'HAS_CLASSES')
  const classId = globalThis.__cls
  const as = await call('POST', '/v1/assignments', { token: admin, body: { classId, title: 'Lukisan', subject: 'Physics', due: '2030-01-01' } })
  assert.equal(as.status, 400)
  const good = await call('POST', '/v1/assignments', { token: admin, body: { classId, title: 'Lukisan', subject: 'art & design', due: '2030-01-01' } })
  assert.equal(good.status, 201); assert.equal(good.body.subject, 'Art & Design'); assert.equal(good.body.teacher.includes('Sarah'), true)
})

test('API lama masih berfungsi: POST /classes dengan `subject` mencipta subjek + pautan', async () => {
  const r = await call('POST', '/v1/classes', { token: admin, body: { name: 'Legacy 1', subject: 'Geography' } })
  assert.equal(r.status, 201); assert.equal(r.body.subjects.length, 1); assert.equal(r.body.subject, 'Geography')
  assert.equal(db.prepare("SELECT subject FROM classes WHERE name='Legacy 1'").get().subject, null)
})

test('onboarding: subjek dan kelas dicipta berasingan (tiada subjek bercampur dalam kelas)', async () => {
  const r = await call('POST', '/v1/auth/signup-org', { body: { orgName: 'Sekolah Baru', name: 'Owner', email: 'owner@sekolahbaru.edu.my', password: 'password123',
    setup: { subjects: ['Matematik', 'Sains', 'matematik'], classes: [{ name: '1 Amanah' }, { name: '1 Bestari' }] } } })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  const t = r.body.accessToken
  const subs = (await call('GET', '/v1/subjects', { token: t })).body.items
  assert.deepEqual(subs.map((s) => s.name).sort(), ['Matematik', 'Sains']) // pendua (tidak peka huruf) digabung
  const cls = (await call('GET', '/v1/classes', { token: t })).body.items
  assert.deepEqual(cls.map((c) => c.name).sort(), ['1 Amanah', '1 Bestari'])
  assert.ok(cls.every((c) => c.subjects.length === 0))
})

// ---------------- import pukal ----------------
test('import guru: dry run tidak menulis; baris salah dilangkau dengan nombor baris; jabatan dicipta; jemputan dicipta', async () => {
  const rows = [
    { name: 'Aminah Yusof', email: 'aminah@sekolah.edu.my', department: 'Languages', weeklyHours: '18', subjects: 'Bahasa Melayu; English' },
    { name: 'Tan Wei Ming', email: 'weiming@sekolah.edu.my', department: 'Pengajian Baharu' },
    { name: '', email: 'kosong@sekolah.edu.my' },                       // nama kosong
    { name: 'Salah Emel', email: 'bukan-emel' },                        // e-mel tidak sah
    { name: 'Pendua', email: 'AMINAH@sekolah.edu.my' },                 // pendua dalam fail (tak peka huruf)
    { name: 'Sedia Ada', email: DEMO.teacher },                         // sudah wujud dalam DB
  ]
  const before = db.prepare('SELECT COUNT(*) c FROM teachers').get().c
  const dry = await call('POST', '/v1/import/teachers', { token: admin, body: { rows, dryRun: true } })
  assert.equal(dry.status, 200); assert.equal(dry.body.ok, 2); assert.equal(dry.body.errors, 4); assert.equal(dry.body.created, 0)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM teachers').get().c, before)
  assert.deepEqual(dry.body.results.filter((r) => r.status === 'error').map((r) => r.line), [4, 5, 6, 7]) // baris 1 = pengepala
  assert.match(dry.body.results[1].note, /will be created/)
  const real = await call('POST', '/v1/import/teachers', { token: admin, body: { rows } })
  assert.equal(real.body.created, 2)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM teachers').get().c, before + 2)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM departments WHERE name='Pengajian Baharu'").get().c, 1)
  assert.equal(db.prepare("SELECT COUNT(*) c FROM invites WHERE email IN ('aminah@sekolah.edu.my','weiming@sekolah.edu.my')").get().c, 2)
  assert.equal(real.body.invites.length, 2) // tiada penghantar e-mel → pautan dipulangkan kepada admin
  // import semula: semuanya kini "sudah wujud"
  const again = await call('POST', '/v1/import/teachers', { token: admin, body: { rows: rows.slice(0, 2) } })
  assert.equal(again.body.created, 0); assert.equal(again.body.errors, 2)
  // tanpa jemputan
  const noInv = await call('POST', '/v1/import/teachers', { token: admin, body: { rows: [{ name: 'Tiada Jemputan', email: 'tj@sekolah.edu.my' }], invite: false } })
  assert.equal(noInv.body.created, 1); assert.equal(noInv.body.invites, undefined)
  assert.equal((await call('POST', '/v1/import/teachers', { token: teacher, body: { rows } })).status, 403)
})

test('import kelas dan pelajar: kelas mesti wujud, tiada pendua, boleh ke satu kelas lalai', async () => {
  const sarah = await nameToId('Sarah')
  const c = await call('POST', '/v1/import/classes', { token: admin, body: { rows: [{ name: 'Tahun 1 Amanah', classTeacher: 'Sarah Mensah' }, { name: 'Tahun 1 Bestari', classTeacher: 'Tiada Guru' }, { name: 'tahun 1 amanah' }] } })
  assert.equal(c.body.created, 1); assert.deepEqual(c.body.results.map((r) => r.status), ['ok', 'error', 'error'])
  assert.equal(db.prepare("SELECT teacher_id FROM classes WHERE name='Tahun 1 Amanah'").get().teacher_id, sarah)
  const students = [
    { name: 'Aisyah Rahman', class: 'tahun 1 amanah' }, { name: 'Wei Jie Tan', class: 'Tahun 1 Amanah' },
    { name: 'Hilang Kelas', class: 'Tahun 9 Entah' }, { name: 'Aisyah Rahman', class: 'Tahun 1 Amanah' }, { name: 'Tanpa Kelas' },
  ]
  const r = await call('POST', '/v1/import/students', { token: admin, body: { rows: students } })
  assert.equal(r.body.created, 3); assert.equal(r.body.errors, 2)
  assert.match(r.body.results[2].message, /does not exist/); assert.match(r.body.results[3].message, /more than once/)
  const cls = (await call('GET', '/v1/classes', { token: admin })).body.items.find((x) => x.name === 'Tahun 1 Amanah')
  assert.equal(cls.students, 2)
  // kelas lalai bila lajur class tiada
  const d = await call('POST', '/v1/import/students', { token: admin, body: { classId: cls.id, rows: [{ name: 'Murid Baharu' }, { name: 'Wei Jie Tan' }] } })
  assert.equal(d.body.created, 1); assert.match(d.body.results[1].message, /already in/)
  assert.equal((await call('POST', '/v1/import/students', { token: teacher, body: { rows: students } })).status, 403)
  assert.equal((await call('POST', '/v1/import/robots', { token: admin, body: { rows: [{}] } })).status, 404)
  assert.equal((await call('POST', '/v1/import/students', { token: admin, body: { rows: [] } })).status, 400)
})
