// Data demo yang realistik (berdasarkan data contoh dalam UI CampusOS). Tarikh relatif kepada hari ini.
import { migrateLegacyClassSubjects } from './curriculum.js'
import { newId, hashPassword, sha256 } from './security.js'
import { DEFAULT_SETTINGS, orgClock, addDays, dayName, isWeekday, weekdaysBetween } from './lib.js'

export const DEMO = { orgName: 'Greenfield Academy', password: 'password123', admin: 'admin@campusos.io', teacher: 'sarah.m@campusos.io', coordinator: 'grace.b@campusos.io' }

function rng(seed) { // mulberry32: keputusan sama setiap kali
  let a = seed
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const FIRST = ['Abena', 'Kwame', 'Zainab', 'Emeka', 'Lindiwe', 'Tunde', 'Naledi', 'Yaw', 'Chiamaka', 'Kofi', 'Amara', 'Sipho', 'Efua', 'Musa', 'Thandiwe', 'Kelechi', 'Adwoa', 'Bongani', 'Ngozi', 'Kojo', 'Fatoumata', 'Chinedu', 'Ama', 'Sekou', 'Nomvula', 'Ibrahima', 'Akosua', 'Oluwaseun', 'Palesa', 'Yusuf']
const LAST = ['Asante', 'Nkrumah', 'Musa', 'Obi', 'Dube', 'Bakare', 'Khumalo', 'Darko', 'Eze', 'Adjei', 'Nwosu', 'Ndlovu', 'Owusu', 'Ibrahim', 'Zulu', 'Uche', 'Serwaa', 'Sithole', 'Okeke', 'Antwi', 'Diallo', 'Okonkwo', 'Ofori', 'Traore', 'Mokoena', 'Sow', 'Frimpong', 'Ade', 'Molefe', 'Hassan']

export function seedDemo(db, now = Date.now()) {
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(DEMO.admin)) return null
  const run = (sql, ...a) => db.prepare(sql).run(...a)
  const orgId = newId()
  const clock = orgClock({ timezone: 'GMT (UTC+0)' }, now)
  const today = clock.date
  const rel = (n) => addDays(today, n)
  const rand = rng(20261005)

  db.exec('BEGIN')
  try {
    run('INSERT INTO organizations (id,name,type,contact_email,timezone,plan,settings,created_at) VALUES (?,?,?,?,?,?,?,?)',
      orgId, DEMO.orgName, 'School', DEMO.admin, 'GMT (UTC+0)', 'growth', JSON.stringify(DEFAULT_SETTINGS), now)

    const branch = {}, dept = {}
    for (const n of ['Main Campus', 'East Branch', 'West Branch']) { branch[n] = newId(); run('INSERT INTO branches (id,org_id,name) VALUES (?,?,?)', branch[n], orgId, n) }
    for (const n of ['Mathematics', 'Sciences', 'Languages', 'Humanities', 'ICT']) { dept[n] = newId(); run('INSERT INTO departments (id,org_id,name) VALUES (?,?,?)', dept[n], orgId, n) }
    for (const n of ['Primary', 'Secondary', 'Administration']) run('INSERT INTO departments (id,org_id,name,branch_id) VALUES (?,?,?,?)', newId(), orgId, n, branch['Main Campus'])

    const user = {}
    const mkUser = (key, email, name, role) => { user[key] = newId(); run('INSERT INTO users (id,org_id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)', user[key], orgId, email, name, hashPassword(DEMO.password), role, now) }
    mkUser('admin', DEMO.admin, 'Admin', 'owner')

    // guru: [kunci, nama, e-mel, jabatan, mata pelajaran, cawangan, jam, status-kelas, kadar kehadiran, jawatan, telefon, tarikh sertai]
    const T = [
      ['t1', 'Sarah Mensah', 'sarah.m@campusos.io', 'Mathematics', ['Mathematics', 'Statistics'], 'Main Campus', 18, 97.2, 'Senior Teacher', '+233 24 118 9042', '2022-01-10'],
      ['t2', 'Daniel Okafor', 'daniel.o@campusos.io', 'Sciences', ['Physics', 'Chemistry'], 'Main Campus', 26, 94.8, 'Teacher', '+233 20 553 8871', '2021-08-23'],
      ['t3', 'Michael Adeyemi', 'michael.a@campusos.io', 'Sciences', ['Biology', 'Chemistry'], 'East Branch', 34, 91.4, 'Teacher', '+233 27 902 1140', '2020-09-07'],
      ['t4', 'Grace Boateng', 'grace.b@campusos.io', 'Languages', ['English', 'Literature'], 'Main Campus', 21, 98.6, 'Coordinator', '+233 24 771 2093', '2019-02-04'],
      ['t5', 'James Owusu', 'james.o@campusos.io', 'Humanities', ['History', 'Geography'], 'East Branch', 15, 96.1, 'Teacher', '+233 55 128 4471', '2023-11-13'],
      ['t6', 'Fatima Bello', 'fatima.b@campusos.io', 'Mathematics', ['Mathematics', 'Further Maths'], 'Main Campus', 29, 93.2, 'Senior Teacher', '+233 24 440 9982', '2021-03-15'],
      ['t7', 'David Kimani', 'david.k@campusos.io', 'ICT', ['Computer Science', 'ICT'], 'West Branch', 22, 95.5, 'Teacher', '+233 20 337 1029', '2022-07-18'],
      ['t8', 'Amina Yusuf', 'amina.y@campusos.io', 'Sciences', ['Chemistry'], 'West Branch', 17, 97.8, 'Teacher', '+233 27 665 0043', '2023-10-09'],
    ]
    const tid = {}
    for (const [k, name, email, d, subj, b, h, rate, title, phone, joined] of T) {
      tid[k] = newId()
      run(`INSERT INTO teachers (id,org_id,name,email,phone,department_id,branch_id,title,subjects,weekly_hours,attendance_rate,joined_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        tid[k], orgId, name, email, phone, dept[d], branch[b], title, JSON.stringify(subj), h, rate, joined, now)
    }
    mkUser('sarah', DEMO.teacher, 'Sarah Mensah', 'teacher'); run('UPDATE teachers SET user_id=? WHERE id=?', user.sarah, tid.t1)
    mkUser('grace', DEMO.coordinator, 'Grace Boateng', 'coordinator'); run('UPDATE teachers SET user_id=? WHERE id=?', user.grace, tid.t4)

    const R = [['r1', 'Room 204', 40, 'Block B', 'Classroom'], ['r2', 'Room 301', 30, 'Block C', 'Classroom'], ['r3', 'Lab 305', 24, 'Science Wing', 'Laboratory'], ['r4', 'Computer Lab', 28, 'Block A', 'Computer Lab'],
      ['r5', 'Room 112', 36, 'Block B', 'Classroom'], ['r6', 'Hall 1', 120, 'Main Hall', 'Auditorium'], ['r7', 'Room 208', 38, 'Block B', 'Classroom'], ['r8', 'Lab 301', 26, 'Science Wing', 'Laboratory'], ['r9', 'Room 104', 34, 'Block A', 'Classroom']]
    const rid = {}
    for (const [k, name, cap, building, type] of R) { rid[name] = newId(); run('INSERT INTO rooms (id,org_id,name,capacity,building,type,status) VALUES (?,?,?,?,?,?,?)', rid[name], orgId, name, cap, building, type, name === 'Hall 1' ? 'Maintenance' : 'Available') }

    // kelas: [kunci, nama, guru, subjek, cawangan, bilik, bil. pelajar, kadar kehadiran asas]
    const C = [
      ['c1', 'Form 4A', 't1', 'Mathematics', 'Main Campus', 'Room 204', 32, 0.952], ['c2', 'Form 5B', 't2', 'Physics', 'Main Campus', 'Lab 301', 28, 0.928],
      ['c3', 'Form 4C', 't1', 'Mathematics', 'Main Campus', 'Room 204', 30, 0.961], ['c4', 'Form 3A', 't4', 'English', 'Main Campus', 'Room 112', 34, 0.984],
      ['c5', 'Form 6 Sci', 't3', 'Biology', 'East Branch', 'Lab 305', 24, 0.897], ['c6', 'Form 5A', 't6', 'Further Maths', 'Main Campus', 'Room 208', 29, 0.935],
      ['c7', 'CS Cohort 2', 't7', 'Computer Science', 'West Branch', 'Computer Lab', 22, 0.949], ['c8', 'Form 2B', 't5', 'History', 'East Branch', 'Room 104', 31, 0.912],
    ]
    const cid = {}, roster = {}
    let n = 0
    for (const [k, name, t, subj, b, room, count] of C) {
      cid[k] = newId(); roster[k] = []
      run('INSERT INTO classes (id,org_id,name,subject,teacher_id,branch_id,room_id,created_at) VALUES (?,?,?,?,?,?,?,?)', cid[k], orgId, name, subj, tid[t], branch[b], rid[room], now)
      for (let i = 0; i < count; i++, n++) {
        const sid = newId(); roster[k].push(sid)
        run('INSERT INTO students (id,org_id,class_id,name,created_at) VALUES (?,?,?,?,?)', sid, orgId, cid[k], `${FIRST[n % FIRST.length]} ${LAST[(n * 7 + Math.floor(n / 30)) % LAST.length]}`, now)
      }
    }

    // jadual waktu (s15 sengaja bertembung dengan s14 di Room 204. Sama seperti banner konflik di UI)
    const S = [
      ['Mon', '08:00', 'Mathematics', 'c1', 't1', 'Room 204'], ['Mon', '10:00', 'Physics', 'c2', 't2', 'Lab 301'], ['Mon', '11:00', 'Biology', 'c5', 't3', 'Lab 305'], ['Mon', '14:00', 'History', 'c8', 't5', 'Room 104'],
      ['Tue', '08:00', 'Further Maths', 'c6', 't6', 'Room 208'], ['Tue', '09:00', 'English', 'c4', 't4', 'Room 112'], ['Tue', '14:00', 'Mathematics', 'c3', 't1', 'Room 204'],
      ['Wed', '08:00', 'Mathematics', 'c1', 't1', 'Room 204'], ['Wed', '11:00', 'Biology', 'c5', 't3', 'Lab 305'], ['Wed', '13:00', 'Computer Science', 'c7', 't7', 'Computer Lab'],
      ['Thu', '09:00', 'English', 'c4', 't4', 'Room 112'], ['Thu', '10:00', 'History', 'c8', 't5', 'Room 104'], ['Thu', '14:00', 'Mathematics', 'c3', 't1', 'Room 204'],
      ['Fri', '08:00', 'Mathematics', 'c1', 't1', 'Room 204'], ['Fri', '08:00', 'Further Maths', 'c6', 't6', 'Room 204'], ['Fri', '13:00', 'Computer Science', 'c7', 't7', 'Computer Lab'],
    ]
    const sessionIds = []
    for (const [day, start, subj, c, t, room] of S) {
      const id = newId(); sessionIds.push(id)
      run('INSERT INTO sessions (id,org_id,day,start_min,duration,class_id,subject,teacher_id,room_id) VALUES (?,?,?,?,?,?,?,?,?)', id, orgId, day, Number(start.slice(0, 2)) * 60 + Number(start.slice(3)), 60, cid[c], subj, tid[t], rid[room])
    }

    // kehadiran: 10 hari bekerja lepas; hari ini sudah ditanda untuk 3 kelas sahaja
    const days = []
    for (let d = -1; days.length < 10; d--) if (isWeekday(rel(d))) days.push(rel(d))
    const mark = (k, date, base) => {
      for (const sid of roster[k]) {
        const r = rand()
        const status = r > base ? 'Absent' : r < 0.03 ? 'Late' : 'Present'
        run('INSERT INTO attendance (org_id,class_id,student_id,date,status,marked_by,marked_at) VALUES (?,?,?,?,?,?,?)', orgId, cid[k], sid, date, status, user.sarah, now)
      }
    }
    for (const date of days) for (const [k, , , , , , , base] of C) mark(k, date, base)
    if (isWeekday(today)) for (const [k, , , , , , , base] of C.slice(0, 3)) mark(k, today, base)

    // tugasan + penyerahan
    const A = [['as1', 'Quadratic Equations: Problem Set 4', 'c1', 't1', 'Mathematics', 2, 'Published', 24], ['as2', 'Newton’s Laws lab report', 'c2', 't2', 'Physics', 4, 'Published', 12],
      ['as3', 'Essay: Themes in Macbeth', 'c4', 't4', 'English', -3, 'Completed', 34], ['as4', 'Cell division worksheet', 'c5', 't3', 'Biology', 6, 'Draft', 0], ['as5', 'Python functions exercise', 'c7', 't7', 'Computer Science', 3, 'Published', 18]]
    for (const [, title, c, t, subj, due, status, sub] of A) {
      const id = newId()
      run('INSERT INTO assignments (id,org_id,title,class_id,teacher_id,subject,due_date,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)', id, orgId, title, cid[c], tid[t], subj, rel(due), status, now)
      for (const sid of roster[c].slice(0, sub)) run('INSERT INTO submissions (assignment_id,student_id,submitted_at) VALUES (?,?,?)', id, sid, now)
    }

    const E = [['Mathematics Mid-Term', 'c1', 'Mathematics', 3, '09:00', 'Hall 1', 't1', 'Scheduled'], ['Physics Mid-Term', 'c2', 'Physics', 4, '11:00', 'Hall 1', 't2', 'Scheduled'],
      ['English Language', 'c4', 'English', -3, '09:00', 'Room 112', 't4', 'Grading'], ['Biology Practical', 'c5', 'Biology', -10, '13:00', 'Lab 305', 't3', 'Completed']]
    for (const [title, c, subj, off, time, room, t, status] of E)
      run('INSERT INTO exams (id,org_id,title,class_id,subject,date,time,room_id,invigilator_id,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', newId(), orgId, title, cid[c], subj, rel(off), time, rid[room], tid[t], status, now)

    const L = [['t1', 'Medical leave', 1, 2, 'Scheduled medical appointment and recovery.', 'Pending'], ['t2', 'Casual leave', 3, 3, 'Family commitment.', 'Pending'], ['t5', 'Study leave', 6, 10, 'Attending certification exam.', 'Pending'],
      ['t4', 'Annual leave', -15, -13, 'Annual vacation.', 'Approved'], ['t8', 'Medical leave', -25, -24, 'Sick leave.', 'Rejected']]
    for (const [t, type, a, b, reason, status] of L) {
      const decided = status === 'Pending' ? [null, null] : [user.admin, now - 86_400_000]
      run('INSERT INTO leave_requests (id,org_id,teacher_id,type,from_date,to_date,days,reason,status,decided_by,decided_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        newId(), orgId, tid[t], type, rel(a), rel(b), Math.max(1, weekdaysBetween(rel(a), rel(b))), reason, status, decided[0], decided[1], now - 3 * 86_400_000)
    }

    const K = [['Prepare Form 5 examination materials', 't1', 2, 'High', 'In Progress'], ['Submit Q3 attendance summary', 't4', -5, 'High', 'To Do'], ['Update Physics lab inventory', 't2', 4, 'Medium', 'To Do'],
      ['Review new teacher applications', 't5', 6, 'Low', 'In Progress'], ['Finalize term timetable draft', 't6', -7, 'High', 'Completed'], ['Distribute parent-evening notices', 't7', -4, 'Medium', 'Completed'], ['Set up computer lab for CS mock', 't7', 3, 'Medium', 'To Do']]
    for (const [title, t, due, pr, status] of K)
      run('INSERT INTO tasks (id,org_id,title,assignee_id,due_date,priority,status,created_by,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)', newId(), orgId, title, tid[t], rel(due), pr, status, user.admin, now, status === 'Completed' ? now : null)

    const N = [['Term 1 examination schedule released', 'The examination timetable for Term 1 is now published. Please review your invigilation assignments and confirm availability by Friday.', 'role', 'teacher', 'Schedule', 2 * 3600e3],
      ['Staff meeting: Thursday 3:30 PM', 'Monthly all-staff meeting in Hall 1. Agenda includes term review and the new attendance policy rollout.', 'branch', branch['Main Campus'], 'Meeting', 5 * 3600e3],
      ['Water outage in Science Wing tomorrow', 'Maintenance will shut off water in the Science Wing from 8–11 AM. Labs 305 and 301 sessions are relocated to Block B.', 'department', dept.Sciences, 'Emergency', 24 * 3600e3],
      ['New grading rubric now in effect', 'The updated grading rubric applies from this term. Documentation is available in the resources library.', 'role', 'teacher', 'General', 48 * 3600e3]]
    N.forEach(([title, body, at, av, tag, ago], i) => {
      const id = newId()
      run('INSERT INTO announcements (id,org_id,title,body,audience_type,audience_value,tag,status,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, orgId, title, body, at, av, tag, 'Published', user.admin, now - ago)
      if (i >= 2) run('INSERT INTO announcement_reads (announcement_id,user_id,read_at) VALUES (?,?,?)', id, user.sarah, now)
      if (i >= 2) run('INSERT INTO announcement_reads (announcement_id,user_id,read_at) VALUES (?,?,?)', id, user.admin, now)
    })

    const act = [['Sarah Mensah', 'Marked attendance for Form 4A', 5], ['Sarah Mensah', 'Published assignment: Problem Set 4', 4], ['Admin', 'Approved leave request for Grace Boateng', 3], ['Sarah Mensah', 'Requested medical leave (2 days)', 2], ['Admin', 'Resolved schedule conflict in Room 204', 1]]
    for (const [actor, text, h] of act) run('INSERT INTO activity (id,org_id,actor,text,at) VALUES (?,?,?,?,?)', newId(), orgId, actor, text, now - h * 3600e3)

    for (let m = 1; m <= 3; m++) { const d = new Date(now); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (m - 1)); run('INSERT INTO invoices (id,org_id,amount_cents,status,plan,issued_at) VALUES (?,?,?,?,?,?)', newId(), orgId, 14900, 'Paid', 'growth', d.getTime()) }

    db.exec('COMMIT')
  } catch (e) { db.exec('ROLLBACK'); throw e }
  migrateLegacyClassSubjects(db, orgId) // kelas demo ada satu subjek setiap satu → jadi pautan kelas × subjek
  return { orgId, today }
}
