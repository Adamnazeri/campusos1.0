import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo, DEMO } from '../src/demo.js'
import { addDays, dayName } from '../src/lib.js'

const config = {
  jwtSecret: 'prod-test-secret', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3,
  corsOrigin: '*', authRateMax: 1000, loginFailMax: 50, exposeInviteTokens: true,
  billingEnabled: false, appUrl: 'http://app.test', mailFrom: 'x@y', mailWebhook: '',
  billingSecret: '', resetTtlMs: 3600e3, devEndpoints: true,
}

let server, base, db, admin, teacherToken, coordToken, today
const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') && text ? JSON.parse(text) : text }
}

before(async () => {
  db = openDb(':memory:')
  const seeded = seedDemo(db)
  today = seeded.today
  server = createServer(createApp({ db, config }).handler)
  await new Promise((r) => server.listen(0, r))
  base = `http://localhost:${server.address().port}`
  admin = (await call('POST', '/v1/auth/login', { body: { email: DEMO.admin, password: DEMO.password } })).body.accessToken
  teacherToken = (await call('POST', '/v1/auth/login', { body: { email: DEMO.teacher, password: DEMO.password } })).body.accessToken
  coordToken = (await call('POST', '/v1/auth/login', { body: { email: DEMO.coordinator, password: DEMO.password } })).body.accessToken
})
after(() => server.close())

test('pelajar: ID pelajar (studentCode), maklumat waris, carian, import CSV & eksport PDPA lengkap (termasuk examResults)', async () => {
  const classes = (await call('GET', '/v1/classes', { token: admin })).body.items
  const c1 = classes.find((c) => c.name === 'Form 4A')

  // Tambah pelajar lengkap dengan maklumat waris & studentCode
  const added = await call('POST', '/v1/students', {
    token: admin,
    body: {
      classId: c1.id,
      students: [{
        name: 'Muhammad Aiman Hakimi',
        studentCode: 'SMK-2026-901',
        guardianName: 'Hakimi bin Razak',
        guardianPhone: '012-9876543',
        guardianEmail: 'hakimi@waris.my',
        notes: 'Alahan kacang',
      }],
    },
  })
  assert.equal(added.status, 201)
  const stu = added.body.items[0]
  assert.equal(stu.studentCode, 'SMK-2026-901')
  assert.equal(stu.guardianName, 'Hakimi bin Razak')
  assert.equal(stu.guardianPhone, '012-9876543')

  // Tolak studentCode pendua
  const dup = await call('POST', '/v1/students', {
    token: admin,
    body: { classId: c1.id, students: [{ name: 'Pelajar Lain', studentCode: 'smk-2026-901' }] },
  })
  assert.equal(dup.status, 409)
  assert.equal(dup.body.error.code, 'CODE_TAKEN')

  // Carian mengikut studentCode dan nama penjaga
  const byCode = await call('GET', '/v1/students?q=SMK-2026-901', { token: admin })
  assert.equal(byCode.body.items.length, 1)
  assert.equal(byCode.body.items[0].id, stu.id)
  const byGuardian = await call('GET', '/v1/students?q=Hakimi+bin+Razak', { token: admin })
  assert.equal(byGuardian.body.items.length, 1)

  // Kemas kini maklumat waris melalui PATCH
  const patched = await call('PATCH', `/v1/students/${stu.id}`, {
    token: admin,
    body: { guardianPhone: '019-1122334', notes: 'Asma ringan' },
  })
  assert.equal(patched.status, 200)
  assert.equal(patched.body.guardianPhone, '019-1122334')
  assert.equal(patched.body.notes, 'Asma ringan')

  // Masukkan markah peperiksaan lampau & sahkan eksport PDPA mengandungi examResults + maklumat waris
  const ex = await call('POST', '/v1/exams', {
    token: admin,
    body: { title: 'Ujian Bulanan Matematik', classId: c1.id, subject: 'Mathematics', date: addDays(today, -1), time: '09:00', maxMark: 100, passPct: 40 },
  })
  assert.equal(ex.status, 201)
  const putRes = await call('PUT', `/v1/exams/${ex.body.id}/results`, {
    token: admin,
    body: { results: [{ studentId: stu.id, mark: 88, absent: false, remarks: 'Cemerlang' }] },
  })
  assert.equal(putRes.status, 200)

  const pdpa = await call('GET', `/v1/students/${stu.id}/export`, { token: admin })
  assert.equal(pdpa.status, 200)
  assert.equal(pdpa.body.student.studentCode, 'SMK-2026-901')
  assert.equal(pdpa.body.student.guardianName, 'Hakimi bin Razak')
  assert.equal(pdpa.body.student.guardianPhone, '019-1122334')
  assert.equal(pdpa.body.examResults.length, 1)
  assert.equal(pdpa.body.examResults[0].mark, 88)
  assert.equal(pdpa.body.examResults[0].title, 'Ujian Bulanan Matematik')

  // Import CSV pelajar dengan studentCode & maklumat waris
  const csvImp = await call('POST', '/v1/import/students', {
    token: admin,
    body: {
      classId: c1.id,
      rows: [
        { name: 'Nurul Izzah', studentCode: 'SMK-2026-902', guardianName: 'Azman bin Ali', guardianPhone: '013-5566778', guardianEmail: 'azman@waris.my' },
        { name: 'Pendua Kod', studentCode: 'SMK-2026-901' }, // sudah wujud dalam DB
      ],
    },
  })
  assert.equal(csvImp.status, 200)
  assert.equal(csvImp.body.created, 1)
  assert.equal(csvImp.body.errors, 1)
})

test('kalendar cuti sekolah, cuti umum & minggu persekolahan Ahad–Khamis (Kelantan/Terengganu/Kedah/Johor)', async () => {
  // Cari minggu hadapan (Ahad hingga Jumaat)
  let sun = addDays(today, 1)
  while (dayName(sun) !== 'Sun') sun = addDays(sun, 1)
  const mon = addDays(sun, 1)
  const tue = addDays(sun, 2)
  const fri = addDays(sun, 5)

  // Tukar hari operasi sekolah kepada Ahad–Khamis (Kumpulan A: Kelantan/Terengganu/Kedah/Johor)
  await call('PATCH', '/v1/org/settings', {
    token: admin,
    body: { operatingDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] },
  })

  // Tambah cuti umum pada hari Selasa
  const hol = await call('POST', '/v1/holidays', {
    token: admin,
    body: { title: 'Hari Kelepasan Khas', startDate: tue, endDate: tue, type: 'Public Holiday' },
  })
  assert.equal(hol.status, 201)
  assert.equal(hol.body.days, 1)

  // Guru memohon cuti dari Ahad hingga Selasa (3 hari bekerja Ahad, Isnin, Selasa; Selasa ialah Cuti Umum → 2 hari ditolak!)
  const lv = await call('POST', '/v1/leave', {
    token: coordToken,
    body: { type: 'Casual leave', from: sun, to: tue, reason: 'Urusan keluarga' },
  })
  assert.equal(lv.status, 201, JSON.stringify(lv.body))
  assert.equal(lv.body.days, 2) // Ahad & Isnin dikira hari bekerja, Selasa Cuti Umum dikecualikan!

  // Permohonan cuti pada hari Jumaat sahaja ditolak kerana Jumaat ialah hari cuti mingguan bagi sekolah Ahad–Khamis
  const friLeave = await call('POST', '/v1/leave', {
    token: coordToken,
    body: { type: 'Casual leave', from: fri, to: fri, reason: 'Jumaat' },
  })
  assert.equal(friLeave.status, 400)

  // Pulihkan tetapan hari operasi asal & bersihkan rekod
  await call('PATCH', '/v1/org/settings', {
    token: admin,
    body: { operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] },
  })
  await call('DELETE', `/v1/leave/${lv.body.id}`, { token: coordToken })
  const delH = await call('DELETE', `/v1/holidays/${hol.body.id}`, { token: admin })
  assert.equal(delH.status, 204)
})

test('senarai semak penyerahan tugasan (GET & POST /v1/assignments/:id/submissions dengan replace=true)', async () => {
  const classes = (await call('GET', '/v1/classes', { token: admin })).body.items
  const c1 = classes.find((c) => c.name === 'Form 4A')
  const asg = await call('POST', '/v1/assignments', {
    token: teacherToken,
    body: { title: 'Kuiz Algebra', classId: c1.id, subject: 'Mathematics', due: addDays(today, 3), status: 'Published' },
  })
  assert.equal(asg.status, 201)

  const check0 = await call('GET', `/v1/assignments/${asg.body.id}/submissions`, { token: teacherToken })
  assert.equal(check0.status, 200)
  assert.ok(check0.body.students.length >= 30)
  assert.equal(check0.body.students.filter((s) => s.submitted).length, 0)

  const firstThree = check0.body.students.slice(0, 3).map((s) => s.id)
  const sub1 = await call('POST', `/v1/assignments/${asg.body.id}/submissions`, {
    token: teacherToken,
    body: { studentIds: firstThree, replace: true },
  })
  assert.equal(sub1.status, 200)
  assert.equal(sub1.body.submitted, 3)

  // Kemas kini senarai semak dengan replace=true kepada 1 pelajar sahaja
  const sub2 = await call('POST', `/v1/assignments/${asg.body.id}/submissions`, {
    token: teacherToken,
    body: { studentIds: [firstThree[0]], replace: true },
  })
  assert.equal(sub2.status, 200)
  assert.equal(sub2.body.submitted, 1)
})

test('sistem guru ganti (relief): kesan sesi guru bercuti, lantik guru ganti, sekat konflik, dan beri akses kehadiran', async () => {
  // Cari tarikh Isnin akan datang supaya Sarah Mensah (t1) ada kelas Mathematics Form 4A (08:00)
  // (mulai today+3 supaya tidak bertindih dengan cuti tertunda Sarah dalam data demo pada today+1..today+2. Penting pada hari Sabtu/Ahad)
  let nextMon = addDays(today, 3)
  while (dayName(nextMon) !== 'Mon') nextMon = addDays(nextMon, 1)

  // Sarah memohon cuti pada nextMon dan diluluskan oleh Admin
  const req = await call('POST', '/v1/leave', {
    token: teacherToken,
    body: { type: 'Casual leave', from: nextMon, to: nextMon, reason: 'Kursus luar' },
  })
  assert.equal(req.status, 201)
  const dec = await call('POST', `/v1/leave/${req.body.id}/decide`, {
    token: admin,
    body: { status: 'Approved', note: 'Diluluskan' },
  })
  assert.equal(dec.status, 200)

  // Semak senarai sesi yang memerlukan guru ganti pada nextMon
  const subs = await call('GET', `/v1/timetable/substitutions?date=${nextMon}`, { token: admin })
  assert.equal(subs.status, 200)
  assert.ok(subs.body.counts.uncovered >= 1)
  const target = subs.body.items.find((i) => i.className === 'Form 4A')
  assert.ok(target)
  assert.equal(target.status, 'Needs Relief')
  assert.ok(target.availableTeachers.length > 0)

  // Pilih Grace Boateng (coordinator/teacher) sebagai guru ganti
  const teachers = (await call('GET', '/v1/teachers', { token: admin })).body.items
  const grace = teachers.find((t) => t.email === DEMO.coordinator)
  assert.ok(target.availableTeachers.some((t) => t.id === grace.id))

  const assign = await call('PUT', `/v1/timetable/sessions/${target.sessionId}/substitute`, {
    token: admin,
    body: { date: nextMon, substituteTeacherId: grace.id, note: 'Sila guna modul ulang kaji' },
  })
  assert.equal(assign.status, 200)
  assert.equal(assign.body.substituteTeacher, 'Grace Boateng')

  // Sahkan status bertukar kepada Covered
  const subsAfter = await call('GET', `/v1/timetable/substitutions?date=${nextMon}`, { token: admin })
  const coveredItem = subsAfter.body.items.find((i) => i.sessionId === target.sessionId)
  assert.equal(coveredItem.status, 'Covered')
  assert.equal(coveredItem.substituteTeacherId, grace.id)

  // Guru yang sedang bercuti (Sarah) tidak boleh dilantik sebagai guru ganti sesi lain pada tarikh sama
  const selfSub = await call('PUT', `/v1/timetable/sessions/${target.sessionId}/substitute`, {
    token: admin,
    body: { date: nextMon, substituteTeacherId: target.originalTeacherId },
  })
  assert.equal(selfSub.status, 400)

  // Padam lantikan guru ganti
  const delSub = await call('DELETE', `/v1/timetable/sessions/${target.sessionId}/substitute?date=${nextMon}`, { token: admin })
  assert.equal(delSub.status, 204)
})

test('naik kelas pukal (promote) & tamat pengajian (graduate) semasa pertukaran tahun akademik', async () => {
  const cFrom = (await call('POST', '/v1/classes', { token: admin, body: { name: 'Tingkatan 4 Bestari' } })).body
  const cTo = (await call('POST', '/v1/classes', { token: admin, body: { name: 'Tingkatan 5 Bestari' } })).body
  const added = (await call('POST', '/v1/students', {
    token: admin,
    body: { classId: cFrom.id, names: ['Pelajar Satu', 'Pelajar Dua', 'Pelajar Tiga'] },
  })).body.items
  assert.equal(added.length, 3)

  // Naikkan semua pelajar dari Tingkatan 4 Bestari ke Tingkatan 5 Bestari + kemas kini tahun akademik
  const prom = await call('POST', '/v1/classes/promote', {
    token: admin,
    body: { fromClassId: cFrom.id, toClassId: cTo.id, academicYear: '2026/27', term: 'Term 1' },
  })
  assert.equal(prom.status, 200)
  assert.equal(prom.body.moved, 3)
  assert.equal((await call('GET', `/v1/classes/${cFrom.id}`, { token: admin })).body.roster.length, 0)
  assert.equal((await call('GET', `/v1/classes/${cTo.id}`, { token: admin })).body.roster.length, 3)
  assert.equal((await call('GET', '/v1/org/settings', { token: admin })).body.academicYear, '2026/27')

  // Tamatkan pengajian (graduate) pelajar Tingkatan 5 Bestari
  const grad = await call('POST', '/v1/classes/promote', {
    token: admin,
    body: { fromClassId: cTo.id, graduate: true },
  })
  assert.equal(grad.status, 200)
  assert.equal(grad.body.graduated, true)
  assert.equal(grad.body.moved, 3)
  assert.equal((await call('GET', `/v1/classes/${cTo.id}`, { token: admin })).body.roster.length, 0)
})
