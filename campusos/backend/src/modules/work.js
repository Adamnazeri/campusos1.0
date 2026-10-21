import { HttpError } from '../http.js'
import { newId } from '../security.js'
import { str, int, oneOf, date, time, list, bad } from '../validate.js'
import { can } from '../perms.js'
import { created, orgClock, addDays, dayName, pct } from '../lib.js'

const ASSIGN_STATUS = ['Draft', 'Published', 'Completed']
const EXAM_STATUS = ['Scheduled', 'Grading', 'Completed']
const LEAVE_TYPES = ['Annual leave', 'Medical leave', 'Casual leave', 'Study leave']
const LEAVE_KEY = { 'Annual leave': 'Annual', 'Medical leave': 'Medical', 'Casual leave': 'Casual' } // Study leave tiada had
const PRIORITIES = ['High', 'Medium', 'Low']
const TASK_STATUS = ['To Do', 'In Progress', 'Completed']
const TAGS = ['General', 'Schedule', 'Emergency', 'Meeting']
const AUD_TYPES = ['all', 'branch', 'department', 'role']

export function workRoutes(ctx) {
  const { q, tx, must, log, ref, settingsOf, teacherOf, teacherRef } = ctx
  const isMgr = (user) => can(user.role, 'directory:read')
  const myTeacherId = (user) => teacherOf(user)?.id ?? null

  // ===================== TUGASAN (assignments) =====================
  const ASQL = `SELECT a.*, c.name class_name, t.name teacher,
    (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id=a.id) submitted,
    (SELECT COUNT(*) FROM students st WHERE st.class_id=a.class_id AND st.active=1) total
    FROM assignments a JOIN classes c ON c.id=a.class_id LEFT JOIN teachers t ON t.id=a.teacher_id`
  /** Subjek mesti salah satu subjek yang diambil kelas itu (jika kelas sudah mempunyai subjek). Pulang nama subjek betul. */
  const subjectForClass = (classId, wanted, teacherId = null) => {
    const links = ctx.svc.classSubjects(q('SELECT org_id FROM classes WHERE id=?').get(classId).org_id, { classId })
    if (wanted === undefined || wanted === null || wanted === '') {
      // satu subjek sahaja, atau guru ini hanya mengajar satu subjek di kelas itu → lalai
      const mine = teacherId ? links.filter((l) => l.teacherId === teacherId) : []
      const pick = links.length === 1 ? links[0] : mine.length === 1 ? mine[0] : null
      return { name: pick?.subject ?? null, link: pick }
    }
    const link = links.find((l) => l.subject.toLowerCase() === String(wanted).toLowerCase())
    if (!link && links.length) throw bad('subject', 'subjek itu tidak diambil oleh kelas ini')
    return { name: link ? link.subject : String(wanted), link }
  }
  const toAssignment = (a) => ({ id: a.id, title: a.title, classId: a.class_id, className: a.class_name, teacherId: a.teacher_id, teacher: a.teacher, subject: a.subject, due: a.due_date, submitted: a.submitted, total: a.total, status: a.status })
  ctx.svc.assignments = (orgId, { teacherId, classIds, from, to } = {}) =>
    q(`${ASQL} WHERE a.org_id=? ORDER BY a.due_date DESC`).all(orgId).filter((a) => (!teacherId || a.teacher_id === teacherId) && (!classIds || classIds.includes(a.class_id)) && (!from || a.due_date >= from) && (!to || a.due_date <= to)).map(toAssignment)

  const listAssignments = ({ user, org, query }) => {
    const teacherId = isMgr(user) ? (query.get('teacherId') ? teacherRef(org.id, query.get('teacherId'), 'teacherId') : undefined) : myTeacherId(user) ?? 'none'
    let items = ctx.svc.assignments(org.id, { teacherId })
    if (query.get('status')) items = items.filter((a) => a.status === query.get('status'))
    if (query.get('classId')) items = items.filter((a) => a.classId === query.get('classId'))
    return { items, total: items.length }
  }
  const assignmentAccess = (user, id) => {
    const a = must(q('SELECT * FROM assignments WHERE id=? AND org_id=?').get(id, user.org_id), 'Tugasan')
    if (!isMgr(user) && a.teacher_id !== myTeacherId(user) && !ctx.svc.teachesClass(myTeacherId(user), a.class_id))
      throw new HttpError(403, 'FORBIDDEN', 'Anda hanya boleh mengurus tugasan sendiri')
    return a
  }
  const addAssignment = async ({ user, org, body }) => {
    const b = await body()
    const cls = ctx.svc.classAccess(user, str(b.classId, 'classId', { required: true, max: 64 }))
    const subj = subjectForClass(cls.id, str(b.subject, 'subject', { max: 80 }), myTeacherId(user))
    const teacherId = isMgr(user) && b.teacherId ? teacherRef(org.id, b.teacherId, 'teacherId') : (myTeacherId(user) ?? subj.link?.teacherId ?? cls.teacher_id)
    const id = newId()
    q('INSERT INTO assignments (id,org_id,title,class_id,teacher_id,subject,due_date,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, org.id, str(b.title, 'title', { required: true, max: 200 }), cls.id, teacherId, subj.name, date(b.due, 'due'), oneOf(b.status, 'status', ASSIGN_STATUS, { fallback: 'Draft' }), Date.now())
    log(user, `Created assignment ${b.title}`)
    return created(toAssignment(q(`${ASQL} WHERE a.id=?`).get(id)))
  }
  const patchAssignment = async ({ user, params, body }) => {
    const a = assignmentAccess(user, params.id)
    const b = await body()
    const f = {}
    if (b.title !== undefined) f.title = str(b.title, 'title', { required: true, max: 200 })
    if (b.due !== undefined) f.due_date = date(b.due, 'due')
    if (b.subject !== undefined) f.subject = subjectForClass(a.class_id, str(b.subject, 'subject', { max: 80 })).name
    if (b.status !== undefined) f.status = oneOf(b.status, 'status', ASSIGN_STATUS, { required: true })
    const cols = Object.keys(f)
    if (cols.length) q(`UPDATE assignments SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`).run(...cols.map((c) => f[c]), a.id)
    if (f.status === 'Published' && a.status !== 'Published') log(user, `Published assignment: ${f.title ?? a.title}`)
    return toAssignment(q(`${ASQL} WHERE a.id=?`).get(a.id))
  }
  const delAssignment = ({ user, params }) => { const a = assignmentAccess(user, params.id); q('DELETE FROM assignments WHERE id=?').run(a.id) }
  const getSubmissions = ({ user, params }) => {
    const a = assignmentAccess(user, params.id)
    const row = toAssignment(q(`${ASQL} WHERE a.id=?`).get(a.id))
    const students = q(`SELECT s.id, s.name, s.student_code studentCode, sub.submitted_at submittedAt
      FROM students s LEFT JOIN submissions sub ON sub.assignment_id=? AND sub.student_id=s.id
      WHERE s.class_id=? AND s.active=1 ORDER BY s.name`).all(a.id, a.class_id)
      .map((r) => ({ id: r.id, name: r.name, studentCode: r.studentCode ?? null, submitted: !!r.submittedAt, submittedAt: r.submittedAt ?? null }))
    return { assignment: row, students }
  }
  const submit = async ({ user, params, body }) => {
    const a = assignmentAccess(user, params.id)
    if (a.status === 'Draft') throw new HttpError(409, 'NOT_PUBLISHED', 'Tugasan masih draf')
    const b = await body()
    const ids = list(b.studentIds, 'studentIds', { max: 500 })
    const roster = new Set(q('SELECT id FROM students WHERE class_id=? AND active=1').all(a.class_id).map((r) => r.id))
    for (const id of ids) if (!roster.has(id)) throw bad('studentIds', `${id} bukan pelajar kelas ini`)
    const wantSet = new Set(ids)
    tx(() => {
      if (b.replace === true) {
        for (const cur of q('SELECT student_id FROM submissions WHERE assignment_id=?').all(a.id)) {
          if (!wantSet.has(cur.student_id)) q('DELETE FROM submissions WHERE assignment_id=? AND student_id=?').run(a.id, cur.student_id)
        }
      }
      for (const id of ids) q('INSERT OR IGNORE INTO submissions (assignment_id,student_id,submitted_at) VALUES (?,?,?)').run(a.id, id, Date.now())
    })
    return toAssignment(q(`${ASQL} WHERE a.id=?`).get(a.id))
  }

  // ===================== PEPERIKSAAN =====================
  const ESQL = `SELECT e.*, c.name class_name, r.name room, t.name invigilator,
    (SELECT COUNT(*) FROM exam_results er WHERE er.exam_id=e.id AND (er.mark IS NOT NULL OR er.absent=1)) results_entered,
    (SELECT COUNT(*) FROM students s WHERE s.class_id=e.class_id AND s.active=1) class_students
    FROM exams e JOIN classes c ON c.id=e.class_id
    LEFT JOIN rooms r ON r.id=e.room_id LEFT JOIN teachers t ON t.id=e.invigilator_id`
  const toExam = (e) => ({ id: e.id, title: e.title, classId: e.class_id, className: e.class_name, subject: e.subject, date: e.date, time: e.time, roomId: e.room_id, room: e.room, invigilatorId: e.invigilator_id, invigilator: e.invigilator, status: e.status,
    maxMark: e.max_mark, passPct: e.pass_pct, resultsEntered: e.results_entered, classStudents: e.class_students })
  ctx.svc.exams = (orgId, { from, to } = {}) => q(`${ESQL} WHERE e.org_id=? ORDER BY e.date, e.time`).all(orgId).filter((e) => (!from || e.date >= from) && (!to || e.date <= to)).map(toExam)

  const listExams = ({ user, org, query }) => {
    let items = ctx.svc.exams(org.id)
    if (!isMgr(user)) {
      // pengawas, atau guru yang mengajar kelas itu (supaya boleh memasukkan markah)
      const me = myTeacherId(user); const mine = me ? ctx.svc.teacherClassIds(me) : new Set()
      items = items.filter((e) => e.invigilatorId === me || mine.has(e.classId))
    }
    if (query.get('status')) items = items.filter((e) => e.status === query.get('status'))
    return { items, total: items.length }
  }
  const examConflicts = (orgId, f, excludeId) => {
    const rows = q('SELECT e.*, r.name room, t.name invigilator FROM exams e LEFT JOIN rooms r ON r.id=e.room_id LEFT JOIN teachers t ON t.id=e.invigilator_id WHERE e.org_id=? AND e.date=? AND e.time=? AND e.id<>?').all(orgId, f.date, f.time, excludeId ?? '')
    return rows.flatMap((e) => [
      f.room_id && e.room_id === f.room_id && { type: 'room', message: `${e.room} digunakan oleh "${e.title}" pada masa yang sama` },
      f.invigilator_id && e.invigilator_id === f.invigilator_id && { type: 'invigilator', message: `${e.invigilator} menjaga "${e.title}" pada masa yang sama` },
      e.class_id === f.class_id && { type: 'class', message: `Kelas ini sudah ada "${e.title}" pada masa yang sama` },
    ].filter(Boolean))
  }
  const examFields = (b, orgId, cur = null) => {
    const has = (k) => b[k] !== undefined
    const f = { max_mark: cur?.max_mark ?? 100, pass_pct: cur?.pass_pct ?? 40, class_id: cur?.class_id, title: cur?.title, subject: cur?.subject, date: cur?.date, time: cur?.time, room_id: cur?.room_id ?? null, invigilator_id: cur?.invigilator_id ?? null, status: cur?.status ?? 'Scheduled' }
    if (has('title') || !cur) f.title = str(b.title, 'title', { required: true, max: 200 })
    if (has('classId') || !cur) f.class_id = must(q('SELECT id FROM classes WHERE id=? AND org_id=?').get(b.classId, orgId), 'Kelas').id
    if (has('subject') || !cur) f.subject = subjectForClass(f.class_id, has('subject') ? str(b.subject, 'subject', { max: 80 }) : undefined).name
    if (has('date') || !cur) f.date = date(b.date, 'date', { required: true })
    if (has('time') || !cur) f.time = time(b.time, 'time', { required: true })
    if (has('room')) f.room_id = ref('rooms', orgId, b.room, 'room')
    if (has('invigilator')) f.invigilator_id = teacherRef(orgId, b.invigilator, 'invigilator')
    if (has('maxMark')) f.max_mark = int(b.maxMark, 'maxMark', { min: 1, max: 1000, required: true })
    if (has('passPct')) f.pass_pct = int(b.passPct, 'passPct', { min: 0, max: 100, required: true })
    if (has('status')) f.status = oneOf(b.status, 'status', EXAM_STATUS, { required: true })
    return f
  }
  const saveExam = (user, f, id, force) => {
    const conflicts = examConflicts(user.org_id, f, id)
    if (conflicts.length && !force) throw new HttpError(409, 'CONFLICT', 'Peperiksaan bertembung dengan yang lain. Gunakan ?force=1 untuk mengatasi.', { conflicts })
    const row = [f.title, f.class_id, f.subject ?? null, f.date, f.time, f.room_id ?? null, f.invigilator_id ?? null, f.status, f.max_mark, f.pass_pct]
    if (id) q('UPDATE exams SET title=?,class_id=?,subject=?,date=?,time=?,room_id=?,invigilator_id=?,status=?,max_mark=?,pass_pct=? WHERE id=?').run(...row, id)
    else { id = newId(); q('INSERT INTO exams (title,class_id,subject,date,time,room_id,invigilator_id,status,max_mark,pass_pct,id,org_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...row, id, user.org_id, Date.now()) }
    return toExam(q(`${ESQL} WHERE e.id=?`).get(id))
  }
  const addExam = async ({ user, body, query }) => { const e = saveExam(user, examFields(await body(), user.org_id), null, query.get('force') === '1'); log(user, `Scheduled exam ${e.title}`); return created(e) }
  const patchExam = async ({ user, params, body, query }) => {
    const cur = must(q('SELECT * FROM exams WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Peperiksaan')
    return saveExam(user, examFields(await body(), user.org_id, cur), cur.id, query.get('force') === '1')
  }
  const delExam = ({ user, params }) => { must(q('SELECT id FROM exams WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Peperiksaan'); q('DELETE FROM exams WHERE id=?').run(params.id) }

  // ===================== CUTI =====================
  const LSQL = `SELECT l.*, t.name teacher FROM leave_requests l JOIN teachers t ON t.id=l.teacher_id`
  const toLeave = (l) => ({ id: l.id, teacherId: l.teacher_id, teacher: l.teacher, type: l.type, from: l.from_date, to: l.to_date, days: l.days, reason: l.reason, status: l.status, note: l.note, decidedAt: l.decided_at, createdAt: l.created_at })
  ctx.svc.leaveList = (orgId, { teacherId, status, from, to, limit = 200 } = {}) =>
    q(`${LSQL} WHERE l.org_id=? ORDER BY l.created_at DESC`).all(orgId).filter((l) => (!teacherId || l.teacher_id === teacherId) && (!status || l.status === status) && (!from || l.to_date >= from) && (!to || l.from_date <= to)).slice(0, limit).map(toLeave)

  /** Kira hari bekerja antara `from` dan `to` mengikut `operatingDays` organisasi (cth. Ahad–Khamis atau Isnin–Jumaat) dan tolak Cuti Umum / Cuti Sekolah. */
  const workingLeaveDays = (org, from, to) => {
    const s = settingsOf(org)
    const opDays = new Set(Array.isArray(s.operatingDays) && s.operatingDays.length ? s.operatingDays : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    const useHolidays = s.holidays !== false
    const holidaySet = useHolidays && ctx.svc.holidayDatesBetween ? ctx.svc.holidayDatesBetween(org.id, from, to) : new Set()
    let n = 0
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (opDays.has(dayName(d)) && !holidaySet.has(d)) n++
    }
    return n
  }

  /** Baki cuti = peruntukan − hari cuti Approved tahun ini (Study leave tiada had). */
  ctx.svc.leaveBalances = (org, teacherId, year = orgClock(org).date.slice(0, 4)) => {
    const allow = settingsOf(org).leaveAllowance
    const used = Object.fromEntries(q("SELECT type, SUM(days) d FROM leave_requests WHERE teacher_id=? AND status='Approved' AND from_date LIKE ? GROUP BY type").all(teacherId, `${year}-%`).map((r) => [r.type, r.d]))
    return Object.entries(LEAVE_KEY).map(([type, key]) => ({ type, allowance: allow[key], used: used[type] ?? 0, remaining: allow[key] - (used[type] ?? 0) }))
  }

  const listLeave = ({ user, org, query }) => {
    const teacherId = isMgr(user) ? (query.get('teacherId') ? teacherRef(org.id, query.get('teacherId'), 'teacherId') : undefined) : myTeacherId(user) ?? 'none'
    const status = query.get('status') ? oneOf(query.get('status'), 'status', ['Pending', 'Approved', 'Rejected']) : undefined
    const items = ctx.svc.leaveList(org.id, { teacherId, status })
    const all = ctx.svc.leaveList(org.id, { teacherId })
    return { items, counts: { Pending: all.filter((l) => l.status === 'Pending').length, Approved: all.filter((l) => l.status === 'Approved').length, Rejected: all.filter((l) => l.status === 'Rejected').length } }
  }
  const leaveBalance = ({ user, org, query }) => {
    const tid = isMgr(user) && query.get('teacherId') ? teacherRef(org.id, query.get('teacherId'), 'teacherId') : myTeacherId(user)
    if (!tid) throw new HttpError(404, 'NOT_FOUND', 'Akaun ini tidak dipautkan kepada profil guru')
    return { teacherId: tid, balances: ctx.svc.leaveBalances(org, tid) }
  }
  const requestLeave = async ({ user, org, body }) => {
    const b = await body()
    const tid = isMgr(user) && b.teacherId ? teacherRef(org.id, b.teacherId, 'teacherId') : myTeacherId(user)
    if (!tid) throw new HttpError(400, 'NO_TEACHER_PROFILE', 'Akaun ini tidak dipautkan kepada profil guru')
    const type = oneOf(b.type, 'type', LEAVE_TYPES, { required: true })
    const from = date(b.from, 'from', { required: true }), to = date(b.to, 'to', { required: true })
    if (to < from) throw bad('to', 'mesti selepas atau sama dengan from')
    if (from < addDays(orgClock(org).date, -30)) throw bad('from', 'tidak boleh lebih 30 hari ke belakang')
    const days = workingLeaveDays(org, from, to)
    if (days < 1) throw bad('from', 'julat tarikh tidak mengandungi hari bekerja (atau jatuh pada cuti sekolah/umum)')
    if (days > 60) throw bad('to', 'maksimum 60 hari bekerja')
    const overlap = q("SELECT 1 FROM leave_requests WHERE teacher_id=? AND status<>'Rejected' AND from_date<=? AND to_date>=?").get(tid, to, from)
    if (overlap) throw new HttpError(409, 'OVERLAP', 'Anda sudah mempunyai permohonan cuti pada tarikh yang bertindih')
    const key = LEAVE_KEY[type]
    if (key) {
      const bal = ctx.svc.leaveBalances(org, tid, from.slice(0, 4)).find((x) => x.type === type)
      if (days > bal.remaining) throw new HttpError(422, 'INSUFFICIENT_BALANCE', `Baki ${type} tidak mencukupi (baki ${bal.remaining} hari, diminta ${days})`, { remaining: bal.remaining, requested: days })
    }
    const id = newId()
    q('INSERT INTO leave_requests (id,org_id,teacher_id,type,from_date,to_date,days,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, org.id, tid, type, from, to, days, str(b.reason, 'reason', { max: 1000 }), Date.now())
    log(user, `Requested ${type.toLowerCase()} (${days} day${days > 1 ? 's' : ''})`)
    if (settingsOf(org).notifications.leave) {
      const who = q('SELECT name FROM teachers WHERE id=?').get(tid).name
      for (const a of q("SELECT email FROM users WHERE org_id=? AND active=1 AND role IN ('owner','admin','academic')").all(org.id))
        ctx.mail.send({ orgId: org.id, to: a.email, subject: `New leave request: ${who}`, text: `${who} requested ${type.toLowerCase()} (${from} to ${to}, ${days} day${days === 1 ? '' : 's'}).\nReason: ${b.reason ?? '-'}\n\nReview it at ${ctx.config.appUrl}` })
    }
    return created(toLeave(q(`${LSQL} WHERE l.id=?`).get(id)))
  }
  const decideLeave = async ({ user, org, params, body }) => {
    const l = must(q('SELECT * FROM leave_requests WHERE id=? AND org_id=?').get(params.id, org.id), 'Permohonan cuti')
    const b = await body()
    const status = oneOf(b.status, 'status', ['Approved', 'Rejected'], { required: true })
    if (l.status !== 'Pending') throw new HttpError(409, 'ALREADY_DECIDED', `Permohonan ini sudah ${l.status.toLowerCase()}`)
    const t = q('SELECT name, user_id FROM teachers WHERE id=?').get(l.teacher_id)
    if (t.user_id === user.id) throw new HttpError(403, 'SELF_APPROVAL', 'Anda tidak boleh meluluskan cuti sendiri')
    if (status === 'Approved' && LEAVE_KEY[l.type]) {
      const bal = ctx.svc.leaveBalances(org, l.teacher_id, l.from_date.slice(0, 4)).find((x) => x.type === l.type)
      if (l.days > bal.remaining) throw new HttpError(422, 'INSUFFICIENT_BALANCE', `Baki ${l.type} tidak mencukupi (baki ${bal.remaining} hari)`)
    }
    q('UPDATE leave_requests SET status=?, decided_by=?, decided_at=?, note=? WHERE id=?').run(status, user.id, Date.now(), str(b.note, 'note', { max: 500 }), l.id)
    log(user, `${status === 'Approved' ? 'Approved' : 'Rejected'} leave request for ${t.name}`)
    const tu = t.user_id ? q('SELECT email FROM users WHERE id=?').get(t.user_id) : null
    if (tu && settingsOf(org).notifications.leave)
      ctx.mail.send({ orgId: org.id, to: tu.email, subject: `Your leave request was ${status === 'Approved' ? 'approved' : 'declined'}`, text: `${l.type} (${l.from_date} to ${l.to_date}) was ${status === 'Approved' ? 'approved' : 'declined'}.${b.note ? `\nNote: ${b.note}` : ''}` })
    return toLeave(q(`${LSQL} WHERE l.id=?`).get(l.id))
  }
  const reopenLeave = ({ user, org, params }) => { // butang "Undo" di UI
    const l = must(q('SELECT * FROM leave_requests WHERE id=? AND org_id=?').get(params.id, org.id), 'Permohonan cuti')
    if (l.status === 'Pending') throw new HttpError(409, 'ALREADY_PENDING', 'Permohonan masih menunggu keputusan')
    q("UPDATE leave_requests SET status='Pending', decided_by=NULL, decided_at=NULL, note=NULL WHERE id=?").run(l.id)
    log(user, 'Reopened a leave request')
    return toLeave(q(`${LSQL} WHERE l.id=?`).get(l.id))
  }
  const cancelLeave = ({ user, org, params }) => {
    const l = must(q('SELECT * FROM leave_requests WHERE id=? AND org_id=?').get(params.id, org.id), 'Permohonan cuti')
    if (!isMgr(user) && l.teacher_id !== myTeacherId(user)) throw new HttpError(403, 'FORBIDDEN', 'Bukan permohonan anda')
    if (l.status !== 'Pending' && !isMgr(user)) throw new HttpError(409, 'ALREADY_DECIDED', 'Hanya permohonan yang menunggu boleh dibatalkan')
    q('DELETE FROM leave_requests WHERE id=?').run(l.id)
  }

  // ===================== TUGAS (tasks) =====================
  const TKSQL = `SELECT k.*, t.name assignee FROM tasks k LEFT JOIN teachers t ON t.id=k.assignee_id`
  const toTask = (k) => ({ id: k.id, title: k.title, assigneeId: k.assignee_id, assignee: k.assignee, due: k.due_date, priority: k.priority, status: k.status, completedAt: k.completed_at })
  ctx.svc.tasks = (orgId, { assigneeId } = {}) => q(`${TKSQL} WHERE k.org_id=? ORDER BY CASE k.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, k.due_date`).all(orgId).filter((k) => !assigneeId || k.assignee_id === assigneeId).map(toTask)

  const listTasks = ({ user, org, query }) => {
    const assigneeId = isMgr(user) ? (query.get('assignee') ? teacherRef(org.id, query.get('assignee'), 'assignee') : undefined) : myTeacherId(user) ?? 'none'
    let items = ctx.svc.tasks(org.id, { assigneeId })
    if (query.get('status')) items = items.filter((k) => k.status === query.get('status'))
    return { items, total: items.length }
  }
  const taskFields = (b, orgId, partial) => {
    const has = (k) => b[k] !== undefined
    const f = {}
    if (!partial || has('title')) f.title = str(b.title, 'title', { required: true, max: 200 })
    if (has('assignee')) f.assignee_id = teacherRef(orgId, b.assignee, 'assignee')
    if (has('due')) f.due_date = date(b.due, 'due')
    if (has('priority')) f.priority = oneOf(b.priority, 'priority', PRIORITIES, { required: true })
    if (has('status')) f.status = oneOf(b.status, 'status', TASK_STATUS, { required: true })
    return f
  }
  const addTask = async ({ user, org, body }) => {
    const f = taskFields(await body(), org.id, false)
    const id = newId()
    q('INSERT INTO tasks (id,org_id,title,assignee_id,due_date,priority,status,created_by,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, org.id, f.title, f.assignee_id ?? null, f.due_date ?? null, f.priority ?? 'Medium', f.status ?? 'To Do', user.id, Date.now(), f.status === 'Completed' ? Date.now() : null)
    log(user, `Created task "${f.title}"`)
    return created(toTask(q(`${TKSQL} WHERE k.id=?`).get(id)))
  }
  const taskAccess = (user, id) => {
    const k = must(q('SELECT * FROM tasks WHERE id=? AND org_id=?').get(id, user.org_id), 'Tugas')
    if (!can(user.role, 'tasks:assign') && k.assignee_id !== myTeacherId(user)) throw new HttpError(403, 'FORBIDDEN', 'Tugas ini bukan untuk anda')
    return k
  }
  const setStatus = (k, status) => q('UPDATE tasks SET status=?, completed_at=? WHERE id=?').run(status, status === 'Completed' ? Date.now() : null, k.id)
  const patchTask = async ({ user, org, params, body }) => {
    const k = taskAccess(user, params.id)
    const b = await body()
    if (!can(user.role, 'tasks:assign')) { // guru hanya boleh menukar status tugas sendiri
      if (Object.keys(b).some((x) => x !== 'status')) throw new HttpError(403, 'FORBIDDEN', 'Anda hanya boleh mengemas kini status')
    }
    const f = taskFields(b, org.id, true)
    const cols = Object.keys(f).filter((c) => c !== 'status')
    if (cols.length) q(`UPDATE tasks SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`).run(...cols.map((c) => f[c]), k.id)
    if (f.status) setStatus(k, f.status)
    return toTask(q(`${TKSQL} WHERE k.id=?`).get(k.id))
  }
  const advanceTask = ({ user, params }) => { // "Move →" di UI
    const k = taskAccess(user, params.id)
    const next = k.status === 'To Do' ? 'In Progress' : 'Completed'
    if (k.status !== 'Completed') setStatus(k, next)
    if (next === 'Completed' && k.status !== 'Completed') log(user, `Completed task "${k.title}"`)
    return toTask(q(`${TKSQL} WHERE k.id=?`).get(k.id))
  }
  const delTask = ({ user, params }) => { must(q('SELECT id FROM tasks WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Tugas'); q('DELETE FROM tasks WHERE id=?').run(params.id) }

  // ===================== PENGUMUMAN =====================
  const audienceLabel = (a) => (a.audience_type === 'all' ? 'Entire organization' : a.audience_type === 'role' ? (a.audience_value === 'teacher' ? 'Teachers' : `${a.audience_value}s`) : a.audience_value)
  /** Penerima: senarai user id mengikut sasaran. */
  const recipients = (orgId, a) => {
    if (a.audience_type === 'role') return q('SELECT id FROM users WHERE org_id=? AND active=1 AND role=?').all(orgId, a.audience_value).map((r) => r.id)
    if (a.audience_type === 'all') return q('SELECT id FROM users WHERE org_id=? AND active=1').all(orgId).map((r) => r.id)
    const col = a.audience_type === 'branch' ? 'branch_id' : 'department_id'
    return q(`SELECT u.id FROM users u JOIN teachers t ON t.user_id=u.id WHERE u.org_id=? AND u.active=1 AND t.active=1 AND t.${col}=?`).all(orgId, a.audience_value).map((r) => r.id)
  }
  const visibleTo = (user, a) => {
    if (a.status !== 'Published') return can(user.role, 'announce:write')
    if (can(user.role, 'announce:write')) return true
    return recipients(user.org_id, a).includes(user.id)
  }
  const toAnnouncement = (a, readSet, authors) => ({ id: a.id, title: a.title, body: a.body, tag: a.tag, status: a.status, audience: audienceLabel(a), audienceType: a.audience_type, audienceValue: a.audience_value, author: authors.get(a.author_id) ?? 'System', createdAt: a.created_at, read: readSet.has(a.id) })
  ctx.svc.announcementsFor = (user) => {
    const authors = new Map(q('SELECT id,name FROM users WHERE org_id=?').all(user.org_id).map((u) => [u.id, u.name]))
    const reads = new Set(q('SELECT announcement_id FROM announcement_reads WHERE user_id=?').all(user.id).map((r) => r.announcement_id))
    return q('SELECT * FROM announcements WHERE org_id=? ORDER BY created_at DESC').all(user.org_id).filter((a) => visibleTo(user, a)).map((a) => toAnnouncement(a, reads, authors))
  }
  const listAnnouncements = ({ user, query }) => {
    let items = ctx.svc.announcementsFor(user)
    if (query.get('unread') === '1') items = items.filter((a) => !a.read && a.status === 'Published')
    return { items, unread: items.filter((a) => !a.read && a.status === 'Published').length }
  }
  const audienceInput = (b, orgId) => {
    const type = oneOf(b.audienceType ?? 'all', 'audienceType', AUD_TYPES, { required: true })
    if (type === 'all') return { type, value: null }
    const v = str(b.audienceValue, 'audienceValue', { required: true, max: 80 })
    if (type === 'branch') return { type, value: ref('branches', orgId, v, 'audienceValue') }
    if (type === 'department') return { type, value: ref('departments', orgId, v, 'audienceValue') }
    return { type, value: oneOf(v, 'audienceValue', ['teacher', 'coordinator', 'academic', 'admin'], { required: true }) }
  }
  const addAnnouncement = async ({ user, org, body }) => {
    const b = await body()
    const aud = audienceInput(b, org.id)
    const status = oneOf(b.status, 'status', ['Published', 'Draft'], { fallback: 'Published' })
    const id = newId()
    q('INSERT INTO announcements (id,org_id,title,body,audience_type,audience_value,tag,status,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, org.id, str(b.title, 'title', { required: true, max: 200 }), str(b.body, 'body', { required: true, max: 5000 }), aud.type, aud.value, oneOf(b.tag, 'tag', TAGS, { fallback: 'General' }), status, user.id, Date.now())
    if (status === 'Published') log(user, `Published announcement "${b.title}"`)
    const a = q('SELECT * FROM announcements WHERE id=?').get(id)
    return created({ ...toAnnouncement(a, new Set([id]), new Map([[user.id, user.name]])), recipients: status === 'Published' ? recipients(org.id, a).length : 0 })
  }
  const publishAnnouncement = ({ user, params }) => {
    const a = must(q('SELECT * FROM announcements WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Pengumuman')
    if (a.status === 'Published') throw new HttpError(409, 'ALREADY_PUBLISHED', 'Pengumuman sudah diterbitkan')
    q("UPDATE announcements SET status='Published', created_at=? WHERE id=?").run(Date.now(), a.id)
    log(user, `Published announcement "${a.title}"`)
    return ctx.svc.announcementsFor(user).find((x) => x.id === a.id)
  }
  const readAnnouncement = ({ user, params }) => {
    const a = must(q('SELECT * FROM announcements WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Pengumuman')
    if (!visibleTo(user, a)) throw new HttpError(404, 'NOT_FOUND', 'Pengumuman tidak ditemui')
    q('INSERT OR IGNORE INTO announcement_reads (announcement_id,user_id,read_at) VALUES (?,?,?)').run(a.id, user.id, Date.now())
    return { id: a.id, read: true }
  }
  const delAnnouncement = ({ user, params }) => { must(q('SELECT id FROM announcements WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Pengumuman'); q('DELETE FROM announcements WHERE id=?').run(params.id) }
  const reach = ({ org }) => {
    const total = q('SELECT COUNT(*) c FROM users WHERE org_id=? AND active=1').get(org.id).c
    const rows = [{ label: 'Entire organization', count: total }]
    for (const b of q('SELECT id,name FROM branches WHERE org_id=? ORDER BY name').all(org.id)) rows.push({ label: b.name, count: recipients(org.id, { audience_type: 'branch', audience_value: b.id }).length })
    for (const d of q('SELECT id,name FROM departments WHERE org_id=? ORDER BY name').all(org.id)) rows.push({ label: d.name, count: recipients(org.id, { audience_type: 'department', audience_value: d.id }).length })
    for (const r of ['coordinator', 'teacher']) rows.push({ label: r === 'teacher' ? 'Teachers' : 'Coordinators', count: recipients(org.id, { audience_type: 'role', audience_value: r }).length })
    return { items: rows.filter((r) => r.count > 0 || r.label === 'Entire organization') }
  }

  return [
    ['GET', '/v1/assignments', listAssignments],
    ['POST', '/v1/assignments', addAssignment, { perm: 'attendance:own' }],
    ['PATCH', '/v1/assignments/:id', patchAssignment],
    ['DELETE', '/v1/assignments/:id', delAssignment],
    ['GET', '/v1/assignments/:id/submissions', getSubmissions],
    ['POST', '/v1/assignments/:id/submissions', submit],
    ['GET', '/v1/exams', listExams],
    ['POST', '/v1/exams', addExam, { perm: 'exams:manage' }],
    ['PATCH', '/v1/exams/:id', patchExam, { perm: 'exams:manage' }],
    ['DELETE', '/v1/exams/:id', delExam, { perm: 'exams:manage' }],
    ['GET', '/v1/leave', listLeave],
    ['GET', '/v1/leave/balance', leaveBalance],
    ['POST', '/v1/leave', requestLeave],
    ['POST', '/v1/leave/:id/decide', decideLeave, { perm: 'leave:decide' }],
    ['POST', '/v1/leave/:id/reopen', reopenLeave, { perm: 'leave:decide' }],
    ['DELETE', '/v1/leave/:id', cancelLeave],
    ['GET', '/v1/tasks', listTasks],
    ['POST', '/v1/tasks', addTask, { perm: 'tasks:assign' }],
    ['PATCH', '/v1/tasks/:id', patchTask],
    ['POST', '/v1/tasks/:id/advance', advanceTask],
    ['DELETE', '/v1/tasks/:id', delTask, { perm: 'tasks:assign' }],
    ['GET', '/v1/announcements', listAnnouncements],
    ['GET', '/v1/announcements/reach', reach, { perm: 'announce:write' }],
    ['POST', '/v1/announcements', addAnnouncement, { perm: 'announce:write' }],
    ['POST', '/v1/announcements/:id/publish', publishAnnouncement, { perm: 'announce:write' }],
    ['POST', '/v1/announcements/:id/read', readAnnouncement],
    ['DELETE', '/v1/announcements/:id', delAnnouncement, { perm: 'announce:write' }],
  ]
}
