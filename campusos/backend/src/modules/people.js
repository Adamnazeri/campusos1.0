import { HttpError } from '../http.js'
import { newId } from '../security.js'
import { str, int, oneOf, date, email as vEmail, list, bad, clock } from '../validate.js'
import { can } from '../perms.js'
import { created, workloadStatus, orgClock, addDays, pct, round1, DAYS } from '../lib.js'
import { checkLimit, createInvite, deliverInvite, insertTeacher } from '../services.js'
import { ensureSubject, linkClassSubject } from '../curriculum.js'

const ROOM_TYPES = ['Classroom', 'Laboratory', 'Computer Lab', 'Auditorium', 'Library', 'Gym', 'Other']

export function peopleRoutes(ctx) {
  const { q, tx, must, log, ref, settingsOf, teacherOf } = ctx

  // ===================== GURU =====================
  const TSQL = `SELECT t.*, d.name department, b.name branch,
    (SELECT COUNT(*) FROM classes c WHERE c.status='Active' AND (c.teacher_id=t.id OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id=c.id AND cs.teacher_id=t.id))) classes_count
    FROM teachers t LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN branches b ON b.id=t.branch_id`
  const toTeacher = (r) => ({
    id: r.id, name: r.name, email: r.email, phone: r.phone, department: r.department, departmentId: r.department_id,
    branch: r.branch, branchId: r.branch_id, subjects: JSON.parse(r.subjects), role: r.title, joined: r.joined_at,
    hours: r.weekly_hours, classes: r.classes_count, status: workloadStatus(r.weekly_hours),
    attendanceRate: r.attendance_rate, hasAccount: !!r.user_id,
  })
  ctx.svc.teachers = (orgId) => q(`${TSQL} WHERE t.org_id=? AND t.active=1 ORDER BY t.name`).all(orgId).map(toTeacher)

  const subjectsOf = (v) => list(v, 'subjects', { max: 20 }).map((s) => str(s, 'subjects[]', { required: true, max: 60 }))

  const listTeachers = ({ user, query }) => {
    let rows = ctx.svc.teachers(user.org_id)
    const term = query.get('q')?.toLowerCase().trim()
    if (term) rows = rows.filter((t) => [t.name, t.email, ...t.subjects].some((s) => s.toLowerCase().includes(term)))
    for (const [param, key] of [['department', 'departmentId'], ['branch', 'branchId']]) {
      const v = query.get(param)
      if (v) { const id = ref(param === 'department' ? 'departments' : 'branches', user.org_id, v, param); rows = rows.filter((t) => t[key] === id) }
    }
    const st = query.get('status')
    if (st) rows = rows.filter((t) => t.status === st)
    const total = rows.length
    const limit = Math.min(Math.max(Number(query.get('limit') ?? 200) || 200, 1), 500), offset = Math.max(Number(query.get('offset') ?? 0) || 0, 0)
    return { items: rows.slice(offset, offset + limit), total, limit, offset }
  }

  const teacherFields = (b, orgId, partial = false) => {
    const has = (k) => b[k] !== undefined
    const f = {}
    if (!partial || has('name')) f.name = str(b.name, 'name', { required: true, max: 80 })
    if (!partial || has('email')) f.email = vEmail(b.email)
    if (has('phone')) f.phone = str(b.phone, 'phone', { max: 30 })
    if (has('department')) f.department_id = ref('departments', orgId, b.department, 'department')
    if (has('branch')) f.branch_id = ref('branches', orgId, b.branch, 'branch')
    if (has('subjects')) f.subjects = subjectsOf(b.subjects)
    if (has('title') || has('role')) f.title = str(b.title ?? b.role, 'title', { required: true, max: 60 })
    if (has('joined')) f.joined_at = date(b.joined, 'joined')
    if (has('weeklyHours')) f.weekly_hours = int(b.weeklyHours, 'weeklyHours', { min: 0, max: 80, required: true })
    if (has('attendanceRate')) { if (typeof b.attendanceRate !== 'number' || b.attendanceRate < 0 || b.attendanceRate > 100) throw bad('attendanceRate', 'mesti 0–100'); f.attendance_rate = b.attendanceRate }
    return f
  }

  ctx.svc.teacherFields = teacherFields // dipakai modul import
  const addTeacher = async ({ user, org, body }) => {
    const b = await body()
    const f = teacherFields(b, org.id)
    const wantInvite = b.invite !== false
    const out = tx(() => {
      checkLimit(ctx, org.id, org.plan, 'teachers')
      const id = insertTeacher(ctx, org.id, f)
      const token = wantInvite ? createInvite(ctx, { orgId: org.id, email: f.email, role: 'teacher', teacherId: id, createdBy: user.id }) : null
      log(user, `Added teacher ${f.name}`)
      return { id, token }
    })
    const mailed = wantInvite ? await deliverInvite(ctx, org.id, f.email) : { emailed: false, emailError: null }
    return created({ ...toTeacher(q(`${TSQL} WHERE t.id=?`).get(out.id)), invited: wantInvite, emailed: mailed.emailed, ...(mailed.emailError ? { emailError: mailed.emailError } : {}), ...(out.token && (ctx.exposeInviteLinks() || (wantInvite && !mailed.emailed)) ? { inviteToken: out.token } : {}) })
  }

  const getTeacher = ({ user, params }) => {
    const t = must(q(`${TSQL} WHERE t.id=? AND t.org_id=?`).get(params.id, user.org_id), 'Guru')
    if (!can(user.role, 'directory:read') && teacherOf(user)?.id !== t.id) throw new HttpError(403, 'FORBIDDEN', 'Anda hanya boleh melihat profil sendiri')
    return {
      ...toTeacher(t),
      classList: [...ctx.svc.teacherClassIds(t.id)].map((cid) => {
        const c = q('SELECT id,name,teacher_id FROM classes WHERE id=?').get(cid)
        const subs = q('SELECT s.name FROM class_subjects cs JOIN subjects s ON s.id=cs.subject_id WHERE cs.class_id=? AND cs.teacher_id=? ORDER BY s.name').all(cid, t.id).map((x) => x.name)
        return { id: c.id, name: c.name, subject: subs.length ? subs.join(', ') : 'Class teacher', classTeacher: c.teacher_id === t.id }
      }).sort((a, b) => a.name.localeCompare(b.name)),
      schedule: ctx.svc.sessions(user.org_id, { teacherId: t.id }),
      leave: { balances: ctx.svc.leaveBalances(ctx.q('SELECT * FROM organizations WHERE id=?').get(user.org_id), t.id), recent: ctx.svc.leaveList(user.org_id, { teacherId: t.id, limit: 5 }) },
      openTasks: q("SELECT COUNT(*) c FROM tasks WHERE assignee_id=? AND status<>'Completed'").get(t.id).c,
    }
  }

  const patchTeacher = async ({ user, params, body }) => {
    const t = must(q('SELECT * FROM teachers WHERE id=? AND org_id=? AND active=1').get(params.id, user.org_id), 'Guru')
    const f = teacherFields(await body(), user.org_id, true)
    const cols = Object.keys(f)
    if (cols.length) {
      try {
        q(`UPDATE teachers SET ${cols.map((c) => `${c}=?`).join(', ')} WHERE id=?`).run(...cols.map((c) => (c === 'subjects' ? JSON.stringify(f[c]) : f[c])), t.id)
      } catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'EMAIL_TAKEN', 'E-mel sudah digunakan guru lain'); throw e }
      if (f.name && t.user_id) q('UPDATE users SET name=? WHERE id=?').run(f.name, t.user_id)
      log(user, `Updated teacher ${f.name ?? t.name}`)
    }
    return toTeacher(q(`${TSQL} WHERE t.id=?`).get(t.id))
  }

  const archiveTeacher = ({ user, params }) => {
    const t = must(q('SELECT * FROM teachers WHERE id=? AND org_id=? AND active=1').get(params.id, user.org_id), 'Guru')
    const n = ctx.svc.teacherClassIds(t.id).size
    if (n) throw new HttpError(409, 'HAS_CLASSES', `Guru ini masih ditetapkan pada ${n} kelas aktif (guru kelas atau guru subjek). Tukar guru terlebih dahulu.`, { classes: n })
    tx(() => {
      q('UPDATE teachers SET active=0 WHERE id=?').run(t.id)
      if (t.user_id) { q('UPDATE users SET active=0 WHERE id=?').run(t.user_id); q('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?').run(t.user_id) }
      q('DELETE FROM sessions WHERE teacher_id=?').run(t.id)
      log(user, `Archived teacher ${t.name}`)
    })
  }

  // ===================== PELAJAR =====================
  const toStudent = (s) => ({
    id: s.id, name: s.name, classId: s.class_id, class: s.class_name,
    studentCode: s.student_code ?? null,
    guardianName: s.guardian_name ?? null,
    guardianPhone: s.guardian_phone ?? null,
    guardianEmail: s.guardian_email ?? null,
    notes: s.notes ?? null,
  })
  const cleanStudentInput = (item, orgId, excludeId = null) => {
    const name = str(item.name, 'name', { required: true, max: 80 })
    const studentCode = item.studentCode !== undefined && item.studentCode !== null && String(item.studentCode).trim() !== ''
      ? str(item.studentCode, 'studentCode', { max: 40 }) : null
    if (studentCode) {
      const clash = q('SELECT id FROM students WHERE org_id=? AND active=1 AND student_code=? COLLATE NOCASE AND id<>?').get(orgId, studentCode, excludeId ?? '')
      if (clash) throw new HttpError(409, 'CODE_TAKEN', `No. pelajar / ID "${studentCode}" sudah digunakan`)
    }
    const guardianName = item.guardianName ? str(item.guardianName, 'guardianName', { max: 80 }) : null
    const guardianPhone = item.guardianPhone ? str(item.guardianPhone, 'guardianPhone', { max: 30 }) : null
    const guardianEmail = item.guardianEmail ? vEmail(item.guardianEmail, 'guardianEmail', false) : null
    const notes = item.notes ? str(item.notes, 'notes', { max: 500 }) : null
    return { name, studentCode, guardianName, guardianPhone, guardianEmail, notes }
  }
  ctx.svc.cleanStudentInput = cleanStudentInput

  const listStudents = ({ user, query }) => {
    const where = ['s.org_id=?', 's.active=1'], args = [user.org_id]
    if (query.get('classId')) { where.push('s.class_id=?'); args.push(query.get('classId')) }
    const term = query.get('q')?.trim()
    if (term) {
      const esc = `%${term.replace(/[\\%_]/g, '\\$&')}%`
      where.push("(s.name LIKE ? ESCAPE '\\' OR s.student_code LIKE ? ESCAPE '\\' OR s.guardian_name LIKE ? ESCAPE '\\')")
      args.push(esc, esc, esc)
    }
    const limit = Math.min(Math.max(Number(query.get('limit') ?? 200) || 200, 1), 500), offset = Math.max(Number(query.get('offset') ?? 0) || 0, 0)
    const rows = q(`SELECT s.*, c.name class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE ${where.join(' AND ')} ORDER BY c.name, s.name LIMIT ? OFFSET ?`).all(...args, limit, offset)
    return { items: rows.map(toStudent), limit, offset }
  }
  const addStudents = async ({ user, body }) => {
    const b = await body()
    const classId = b.classId ? must(q('SELECT id FROM classes WHERE id=? AND org_id=?').get(b.classId, user.org_id), 'Kelas').id : null
    let entries = []
    if (Array.isArray(b.students)) {
      entries = list(b.students, 'students', { max: 200 }).map((x) => cleanStudentInput(x ?? {}, user.org_id))
    } else if (b.names !== undefined) {
      entries = list(b.names, 'names', { max: 200 }).map((n) => cleanStudentInput({ name: n }, user.org_id))
    } else {
      entries = [cleanStudentInput(b, user.org_id)]
    }
    if (!entries.length) throw bad('names', 'wajib diisi')
    const seenCodes = new Set()
    for (const e of entries) {
      if (e.studentCode) {
        const k = e.studentCode.toLowerCase()
        if (seenCodes.has(k)) throw new HttpError(409, 'CODE_TAKEN', `No. pelajar / ID "${e.studentCode}" berulang dalam permintaan`)
        seenCodes.add(k)
      }
    }
    const items = tx(() => entries.map((e) => {
      const id = newId()
      q('INSERT INTO students (id,org_id,class_id,name,student_code,guardian_name,guardian_phone,guardian_email,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(id, user.org_id, classId, e.name, e.studentCode, e.guardianName, e.guardianPhone, e.guardianEmail, e.notes, Date.now())
      return { id, name: e.name, classId, studentCode: e.studentCode, guardianName: e.guardianName, guardianPhone: e.guardianPhone, guardianEmail: e.guardianEmail, notes: e.notes }
    }))
    log(user, `Added ${items.length} student(s)`)
    return created({ items })
  }
  const patchStudent = async ({ user, params, body }) => {
    const s = must(q('SELECT * FROM students WHERE id=? AND org_id=? AND active=1').get(params.id, user.org_id), 'Pelajar')
    const b = await body()
    const name = b.name !== undefined ? str(b.name, 'name', { required: true, max: 80 }) : s.name
    const classId = b.classId !== undefined ? (b.classId ? must(q('SELECT id FROM classes WHERE id=? AND org_id=?').get(b.classId, user.org_id), 'Kelas').id : null) : s.class_id
    const studentCode = b.studentCode !== undefined ? (b.studentCode && String(b.studentCode).trim() ? str(b.studentCode, 'studentCode', { max: 40 }) : null) : s.student_code
    if (studentCode) {
      const clash = q('SELECT id FROM students WHERE org_id=? AND active=1 AND student_code=? COLLATE NOCASE AND id<>?').get(user.org_id, studentCode, s.id)
      if (clash) throw new HttpError(409, 'CODE_TAKEN', `No. pelajar / ID "${studentCode}" sudah digunakan`)
    }
    const guardianName = b.guardianName !== undefined ? (b.guardianName ? str(b.guardianName, 'guardianName', { max: 80 }) : null) : s.guardian_name
    const guardianPhone = b.guardianPhone !== undefined ? (b.guardianPhone ? str(b.guardianPhone, 'guardianPhone', { max: 30 }) : null) : s.guardian_phone
    const guardianEmail = b.guardianEmail !== undefined ? (b.guardianEmail ? vEmail(b.guardianEmail, 'guardianEmail', false) : null) : s.guardian_email
    const notes = b.notes !== undefined ? (b.notes ? str(b.notes, 'notes', { max: 500 }) : null) : s.notes
    q('UPDATE students SET name=?, class_id=?, student_code=?, guardian_name=?, guardian_phone=?, guardian_email=?, notes=? WHERE id=?')
      .run(name, classId, studentCode, guardianName, guardianPhone, guardianEmail, notes, s.id)
    return { id: s.id, name, classId, studentCode, guardianName, guardianPhone, guardianEmail, notes }
  }
  // Padam pelajar. Lalai: nyahaktif (data kehadiran dikekalkan untuk laporan). ?purge=1 = padam KEKAL termasuk
  // kehadiran, penyerahan tugasan & keputusan peperiksaan (permintaan pemadaman data peribadi / PDPA).
  const delStudent = ({ user, params, query }) => {
    const purge = query.get('purge') === '1'
    must(q(`SELECT id FROM students WHERE id=? AND org_id=?${purge ? '' : ' AND active=1'}`).get(params.id, user.org_id), 'Pelajar')
    if (purge) { q('DELETE FROM students WHERE id=?').run(params.id); log(user, 'Permanently erased a student record'); return }
    q('UPDATE students SET active=0 WHERE id=?').run(params.id)
  }
  // Salinan semua data seorang pelajar (permintaan akses data peribadi / PDPA)
  const exportStudent = ({ user, params }) => {
    const s = must(q('SELECT s.*, c.name class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=? AND s.org_id=?').get(params.id, user.org_id), 'Pelajar')
    return {
      student: {
        id: s.id, name: s.name, class: s.class_name, active: !!s.active, createdAt: s.created_at,
        studentCode: s.student_code ?? null, guardianName: s.guardian_name ?? null,
        guardianPhone: s.guardian_phone ?? null, guardianEmail: s.guardian_email ?? null, notes: s.notes ?? null,
      },
      attendance: q('SELECT date, status, class_id classId, marked_at markedAt FROM attendance WHERE student_id=? ORDER BY date').all(s.id),
      submissions: q('SELECT assignment_id assignmentId, submitted_at submittedAt FROM submissions WHERE student_id=?').all(s.id),
      examResults: q(`SELECT er.exam_id examId, e.title, e.subject, e.date, er.mark, e.max_mark maxMark, er.absent, er.remarks, er.entered_at enteredAt
        FROM exam_results er JOIN exams e ON e.id=er.exam_id WHERE er.student_id=? ORDER BY e.date`).all(s.id).map((r) => ({ ...r, absent: !!r.absent })),
      exportedAt: Date.now(),
    }
  }

  /** Naik kelas pukal / tamat pengajian (pertukaran tahun akademik). */
  const promoteStudents = async ({ user, org, body }) => {
    const b = await body()
    const fromCls = must(q('SELECT id, name FROM classes WHERE id=? AND org_id=?').get(b.fromClassId, org.id), 'Kelas asal')
    const graduate = b.graduate === true
    let toCls = null
    if (!graduate) {
      toCls = must(q("SELECT id, name FROM classes WHERE id=? AND org_id=? AND status='Active'").get(b.toClassId, org.id), 'Kelas destinasi')
      if (toCls.id === fromCls.id) throw bad('toClassId', 'Kelas destinasi mesti berbeza daripada kelas asal')
    }
    const inClass = q('SELECT id FROM students WHERE org_id=? AND class_id=? AND active=1').all(org.id, fromCls.id).map((r) => r.id)
    const validSet = new Set(inClass)
    let targetIds = inClass
    if (b.studentIds !== undefined) {
      targetIds = list(b.studentIds, 'studentIds', { max: 500 }).map((id) => str(id, 'studentIds[]', { required: true, max: 64 }))
      for (const id of targetIds) if (!validSet.has(id)) throw bad('studentIds', `Pelajar ${id} bukan pelajar aktif dalam ${fromCls.name}`)
    }
    if (!targetIds.length) throw bad('studentIds', 'Tiada pelajar untuk dipindahkan')
    const newAcademicYear = b.academicYear !== undefined ? str(b.academicYear, 'academicYear', { required: true, max: 60 }) : null
    const newTerm = b.term !== undefined ? str(b.term, 'term', { required: true, max: 60 }) : null
    tx(() => {
      for (const sid of targetIds) {
        if (graduate) q('UPDATE students SET active=0 WHERE id=?').run(sid)
        else q('UPDATE students SET class_id=? WHERE id=?').run(toCls.id, sid)
      }
      if (newAcademicYear || newTerm) {
        const cur = settingsOf(org)
        const next = { ...cur, ...(newAcademicYear ? { academicYear: newAcademicYear } : {}), ...(newTerm ? { term: newTerm } : {}) }
        q('UPDATE organizations SET settings=? WHERE id=?').run(JSON.stringify(next), org.id)
      }
      log(user, graduate ? `Graduated ${targetIds.length} student(s) from ${fromCls.name}` : `Promoted ${targetIds.length} student(s) from ${fromCls.name} to ${toCls.name}`)
    })
    return { moved: targetIds.length, graduated: graduate, fromClassId: fromCls.id, fromClassName: fromCls.name, toClassId: toCls?.id ?? null, toClassName: toCls?.name ?? null }
  }

  // ===================== KELAS (kumpulan pelajar) =====================
  /** Kelas aktif yang diajar guru ini: sebagai guru kelas ATAU guru bagi sekurang-kurangnya satu subjek kelas itu. */
  ctx.svc.teacherClassIds = (teacherId) => new Set(q(`SELECT c.id FROM classes c WHERE c.status='Active' AND (c.teacher_id=? OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id=c.id AND cs.teacher_id=?))`).all(teacherId, teacherId).map((r) => r.id))
  ctx.svc.teachesClass = (teacherId, classId) => !!teacherId && !!q('SELECT 1 FROM classes c WHERE c.id=? AND (c.teacher_id=? OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id=c.id AND cs.teacher_id=?))').get(classId, teacherId, teacherId)
  /** Guru ganti untuk kelas ini pada tarikh tertentu juga dibenarkan menandakan kehadiran pada hari tersebut. */
  ctx.svc.substitutesClass = (teacherId, classId, dateStr = null) => {
    if (!teacherId) return false
    if (dateStr) return !!q('SELECT 1 FROM session_substitutions sub JOIN sessions s ON s.id=sub.session_id WHERE s.class_id=? AND sub.substitute_teacher_id=? AND sub.date=?').get(classId, teacherId, dateStr)
    return !!q('SELECT 1 FROM session_substitutions sub JOIN sessions s ON s.id=sub.session_id WHERE s.class_id=? AND sub.substitute_teacher_id=?').get(classId, teacherId)
  }
  const CS_SQL = `SELECT cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.periods_per_week, s.name subject, t.name teacher
    FROM class_subjects cs JOIN subjects s ON s.id=cs.subject_id LEFT JOIN teachers t ON t.id=cs.teacher_id`
  const toClassSubject = (r) => ({ id: r.id, classId: r.class_id, subjectId: r.subject_id, subject: r.subject, teacherId: r.teacher_id, teacher: r.teacher, periodsPerWeek: r.periods_per_week })
  ctx.svc.classSubjects = (orgId, { classId, teacherId } = {}) =>
    q(`${CS_SQL} WHERE cs.org_id=? ORDER BY s.name`).all(orgId).filter((r) => (!classId || r.class_id === classId) && (!teacherId || r.teacher_id === teacherId)).map(toClassSubject)
  /** Subjek lalai untuk tugasan/peperiksaan kelas: jika kelas hanya ada satu subjek. */
  ctx.svc.onlySubjectOf = (classId) => { const r = q('SELECT s.name FROM class_subjects cs JOIN subjects s ON s.id=cs.subject_id WHERE cs.class_id=?').all(classId); return r.length === 1 ? r[0].name : null }

  const CSQL = `SELECT c.*, t.name teacher, b.name branch, r.name room,
    (SELECT COUNT(*) FROM students s WHERE s.class_id=c.id AND s.active=1) students
    FROM classes c LEFT JOIN teachers t ON t.id=c.teacher_id LEFT JOIN branches b ON b.id=c.branch_id LEFT JOIN rooms r ON r.id=c.room_id`

  function scheduleText(orgId) {
    const rows = q('SELECT class_id, day, start_min FROM sessions WHERE org_id=?').all(orgId)
    const by = new Map()
    for (const r of rows) { const e = by.get(r.class_id) ?? { days: new Set(), min: 1e9 }; e.days.add(r.day); e.min = Math.min(e.min, r.start_min); by.set(r.class_id, e) }
    return (cid) => { const e = by.get(cid); return e ? `${DAYS.filter((d) => e.days.has(d)).join(', ')} · ${clock.fmt(e.min)}` : null }
  }
  function attRates(org, days = 30) {
    const from = addDays(orgClock(org).date, -days)
    const map = new Map()
    for (const r of q("SELECT class_id, COUNT(*) total, SUM(status<>'Absent') att FROM attendance WHERE org_id=? AND date>=? GROUP BY class_id").all(org.id, from)) map.set(r.class_id, pct(r.att, r.total))
    return map
  }
  const toClass = (r, sched, rates, subs = []) => ({
    id: r.id, name: r.name, subjects: subs, subject: subs.map((x) => x.subject).join(', ') || null, // `subject` kekal untuk keserasian; sebenarnya senarai
    teacher: r.teacher, teacherId: r.teacher_id, // guru kelas (homeroom)
    branch: r.branch, branchId: r.branch_id,
    room: r.room, roomId: r.room_id, students: r.students, schedule: sched(r.id), attendance: rates.get(r.id) ?? null, status: r.status,
  })
  ctx.svc.classes = (org, { branchId, teacherId, status = 'Active' } = {}) => {
    const sched = scheduleText(org.id), rates = attRates(org)
    const subsBy = new Map()
    for (const cs of ctx.svc.classSubjects(org.id)) subsBy.set(cs.classId, [...(subsBy.get(cs.classId) ?? []), cs])
    const mine = teacherId ? ctx.svc.teacherClassIds(teacherId) : null
    return q(`${CSQL} WHERE c.org_id=? ORDER BY c.name`).all(org.id)
      .filter((c) => (status === 'all' || c.status === status) && (!branchId || c.branch_id === branchId) && (!mine || mine.has(c.id)))
      .map((c) => toClass(c, sched, rates, subsBy.get(c.id) ?? []))
  }
  /** Pastikan pengguna boleh mengakses kelas ini (guru: kelas sendiri atau kelas relief sahaja). */
  ctx.svc.classAccess = (user, classId, { allowAnyMgmt = true, dateStr = null } = {}) => {
    const c = must(q('SELECT * FROM classes WHERE id=? AND org_id=?').get(classId, user.org_id), 'Kelas')
    const tid = teacherOf(user)?.id
    if (!(allowAnyMgmt && can(user.role, 'attendance:any')) && !(can(user.role, 'classes:manage')) && !ctx.svc.teachesClass(tid, c.id) && !ctx.svc.substitutesClass(tid, c.id, dateStr))
      throw new HttpError(403, 'FORBIDDEN', 'Anda hanya boleh mengakses kelas yang anda ajar')
    return c
  }

  const listClasses = ({ user, org, query }) => {
    const mine = !can(user.role, 'directory:read') ? teacherOf(user)?.id ?? 'none' : query.get('teacherId') ? ctx.teacherRef(org.id, query.get('teacherId'), 'teacherId') : undefined
    const items = ctx.svc.classes(org, {
      branchId: query.get('branch') ? ref('branches', org.id, query.get('branch'), 'branch') : undefined,
      teacherId: mine, status: query.get('status') ?? 'Active',
    })
    return { items, total: items.length }
  }

  const classInput = (b, orgId, partial = false) => {
    const has = (k) => b[k] !== undefined
    const f = {}
    if (!partial || has('name')) f.name = str(b.name, 'name', { required: true, max: 80 })
    if (has('subject')) f.legacySubject = str(b.subject, 'subject', { max: 80 }) // keserasian: dipetakan ke pautan kelas × subjek
    if (has('teacher')) f.teacher_id = ctx.teacherRef(orgId, b.teacher, 'teacher')
    if (has('branch')) f.branch_id = ref('branches', orgId, b.branch, 'branch')
    if (has('room')) f.room_id = ref('rooms', orgId, b.room, 'room')
    if (has('status')) f.status = oneOf(b.status, 'status', ['Active', 'Archived'], { required: true })
    return f
  }
  ctx.svc.classInput = classInput
  const addClass = async ({ user, org, body }) => {
    const f = classInput(await body(), org.id)
    const id = newId()
    tx(() => {
      checkLimit(ctx, org.id, org.plan, 'classes')
      try {
        q('INSERT INTO classes (id,org_id,name,teacher_id,branch_id,room_id,created_at) VALUES (?,?,?,?,?,?,?)')
          .run(id, org.id, f.name, f.teacher_id ?? null, f.branch_id ?? null, f.room_id ?? null, Date.now())
        if (f.legacySubject) linkClassSubject(ctx.db, { orgId: org.id, classId: id, subjectId: ensureSubject(ctx.db, org.id, f.legacySubject), teacherId: f.teacher_id ?? null })
      } catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'ALREADY_EXISTS', 'Nama kelas sudah wujud'); throw e }
      log(user, `Created class ${f.name}`)
    })
    return created(ctx.svc.classes(org).find((c) => c.id === id))
  }
  const getClass = ({ user, org, params }) => {
    const c = ctx.svc.classAccess(user, params.id, { allowAnyMgmt: true })
    const row = ctx.svc.classes(org, { status: 'all' }).find((x) => x.id === c.id)
    const recent = q(`SELECT date, COUNT(*) total, SUM(status='Present') present, SUM(status='Absent') absent, SUM(status='Late') late
      FROM attendance WHERE class_id=? GROUP BY date ORDER BY date DESC LIMIT 7`).all(c.id)
    return {
      ...row,
      roster: q('SELECT id,name,student_code studentCode,guardian_name guardianName,guardian_phone guardianPhone,guardian_email guardianEmail,notes FROM students WHERE class_id=? AND active=1 ORDER BY name').all(c.id),
      sessions: ctx.svc.sessions(org.id, { classId: c.id }),
      recentAttendance: recent.map((r) => ({ date: r.date, present: r.present, absent: r.absent, late: r.late, rate: pct(r.present + r.late, r.total) })),
      assignments: q("SELECT id,title,due_date dueDate,status FROM assignments WHERE class_id=? ORDER BY due_date DESC LIMIT 5").all(c.id),
    }
  }
  const patchClass = async ({ user, org, params, body }) => {
    const c = must(q('SELECT * FROM classes WHERE id=? AND org_id=?').get(params.id, org.id), 'Kelas')
    const f = classInput(await body(), org.id, true)
    delete f.legacySubject
    const cols = Object.keys(f)
    tx(() => {
      if (f.status === 'Active' && c.status === 'Archived') checkLimit(ctx, org.id, org.plan, 'classes')
      if (cols.length) {
        try { q(`UPDATE classes SET ${cols.map((k) => `${k}=?`).join(', ')} WHERE id=?`).run(...cols.map((k) => f[k]), c.id) }
        catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'ALREADY_EXISTS', 'Nama kelas sudah wujud'); throw e }
      }
      if (f.status === 'Archived') q('DELETE FROM sessions WHERE class_id=?').run(c.id)
      if (cols.length) log(user, `Updated class ${f.name ?? c.name}`)
    })
    return ctx.svc.classes(org, { status: 'all' }).find((x) => x.id === c.id)
  }
  const archiveClass = ({ user, params }) => {
    const c = must(q('SELECT * FROM classes WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Kelas')
    tx(() => { q("UPDATE classes SET status='Archived' WHERE id=?").run(c.id); q('DELETE FROM sessions WHERE class_id=?').run(c.id); log(user, `Archived class ${c.name}`) })
  }

  // ===================== BILIK =====================
  const roomMetrics = (org) => {
    const s = settingsOf(org)
    const avail = s.operatingDays.length * (clock.toMin(s.dayEnd) - clock.toMin(s.dayStart))
    const used = new Map(q('SELECT room_id, SUM(duration) m FROM sessions WHERE org_id=? AND room_id IS NOT NULL GROUP BY room_id').all(org.id).map((r) => [r.room_id, r.m]))
    const now = orgClock(org)
    const cancelled = new Set(q('SELECT session_id FROM session_cancellations WHERE date=?').all(now.date).map((r) => r.session_id))
    const live = new Set(q('SELECT id, room_id FROM sessions WHERE org_id=? AND day=? AND start_min<=? AND start_min+duration>?').all(org.id, now.day, now.minutes, now.minutes).filter((s) => !cancelled.has(s.id)).map((s) => s.room_id))
    return (r) => ({
      id: r.id, name: r.name, capacity: r.capacity, building: r.building, type: r.type,
      status: r.status === 'Maintenance' ? 'Maintenance' : live.has(r.id) ? 'Occupied' : 'Available',
      utilization: avail > 0 ? Math.min(100, Math.round(((used.get(r.id) ?? 0) / avail) * 100)) : 0,
    })
  }
  ctx.svc.rooms = (org) => { const m = roomMetrics(org); return q('SELECT * FROM rooms WHERE org_id=? ORDER BY name').all(org.id).map(m) }

  const listRooms = ({ org, query }) => {
    let items = ctx.svc.rooms(org)
    if (query.get('status')) items = items.filter((r) => r.status === query.get('status'))
    if (query.get('type')) items = items.filter((r) => r.type === query.get('type'))
    return { items, total: items.length }
  }
  const roomFields = (b, partial = false) => {
    const has = (k) => b[k] !== undefined
    const f = {}
    if (!partial || has('name')) f.name = str(b.name, 'name', { required: true, max: 80 })
    if (has('capacity')) f.capacity = int(b.capacity, 'capacity', { min: 1, max: 5000, required: true })
    if (has('building')) f.building = str(b.building, 'building', { max: 80 })
    if (has('type')) f.type = oneOf(b.type, 'type', ROOM_TYPES, { required: true })
    if (has('status')) f.status = oneOf(b.status, 'status', ['Available', 'Maintenance'], { required: true })
    return f
  }
  const addRoom = async ({ user, org, body }) => {
    const f = roomFields(await body())
    const id = newId()
    try { q('INSERT INTO rooms (id,org_id,name,capacity,building,type,status) VALUES (?,?,?,?,?,?,?)').run(id, org.id, f.name, f.capacity ?? 30, f.building ?? null, f.type ?? 'Classroom', f.status ?? 'Available') }
    catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'ALREADY_EXISTS', 'Nama bilik sudah wujud'); throw e }
    log(user, `Added room ${f.name}`)
    return created(ctx.svc.rooms(org).find((r) => r.id === id))
  }
  const patchRoom = async ({ user, org, params, body }) => {
    const r = must(q('SELECT * FROM rooms WHERE id=? AND org_id=?').get(params.id, org.id), 'Bilik')
    const f = roomFields(await body(), true)
    const cols = Object.keys(f)
    if (cols.length) {
      try { q(`UPDATE rooms SET ${cols.map((k) => `${k}=?`).join(', ')} WHERE id=?`).run(...cols.map((k) => f[k]), r.id) }
      catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'ALREADY_EXISTS', 'Nama bilik sudah wujud'); throw e }
      log(user, `Updated room ${f.name ?? r.name}`)
    }
    return ctx.svc.rooms(org).find((x) => x.id === r.id)
  }
  const delRoom = ({ user, params }) => {
    const r = must(q('SELECT * FROM rooms WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Bilik')
    if (q('SELECT COUNT(*) c FROM sessions WHERE room_id=?').get(r.id).c) throw new HttpError(409, 'IN_USE', 'Bilik masih digunakan dalam jadual waktu')
    q('DELETE FROM rooms WHERE id=?').run(r.id)
    log(user, `Removed room ${r.name}`)
  }

  return [
    ['GET', '/v1/teachers', listTeachers, { perm: 'directory:read' }],
    ['POST', '/v1/teachers', addTeacher, { perm: 'teachers:manage' }],
    ['GET', '/v1/teachers/:id', getTeacher],
    ['PATCH', '/v1/teachers/:id', patchTeacher, { perm: 'teachers:manage' }],
    ['DELETE', '/v1/teachers/:id', archiveTeacher, { perm: 'teachers:manage' }],
    ['GET', '/v1/students', listStudents, { perm: 'directory:read' }],
    ['POST', '/v1/students', addStudents, { perm: 'classes:manage' }],
    ['PATCH', '/v1/students/:id', patchStudent, { perm: 'classes:manage' }],
    ['DELETE', '/v1/students/:id', delStudent, { perm: 'classes:manage' }],
    ['GET', '/v1/students/:id/export', exportStudent, { perm: 'classes:manage' }],
    ['POST', '/v1/classes/promote', promoteStudents, { perm: 'classes:manage' }],
    ['GET', '/v1/classes', listClasses],
    ['POST', '/v1/classes', addClass, { perm: 'classes:manage' }],
    ['GET', '/v1/classes/:id', getClass],
    ['PATCH', '/v1/classes/:id', patchClass, { perm: 'classes:manage' }],
    ['DELETE', '/v1/classes/:id', archiveClass, { perm: 'classes:manage' }],
    ['GET', '/v1/rooms', listRooms],
    ['POST', '/v1/rooms', addRoom, { perm: 'rooms:manage' }],
    ['PATCH', '/v1/rooms/:id', patchRoom, { perm: 'rooms:manage' }],
    ['DELETE', '/v1/rooms/:id', delRoom, { perm: 'rooms:manage' }],
  ]
}
