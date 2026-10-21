import { HttpError } from '../http.js'
import { can } from '../perms.js'
import { gradeFor, orgClock, round1 } from '../lib.js'

/**
 * Markah & keputusan peperiksaan.
 *  - Guru subjek (atau pengurusan) memasukkan markah selepas tarikh peperiksaan.
 *  - Status peperiksaan: Scheduled → Grading (markah mula dimasukkan) → Completed (dikunci untuk guru).
 *  - Gred mengikut skala organisasi (Settings → gradeScale).
 */
export function resultRoutes(ctx) {
  const { q, tx, must, log, settingsOf, teacherOf } = ctx
  const isMgr = (u) => can(u.role, 'directory:read')
  const myId = (u) => teacherOf(u)?.id ?? null
  const scaleOf = (org) => settingsOf(org).gradeScale

  const loadExam = (user, id) => must(q('SELECT e.*, c.name class_name FROM exams e JOIN classes c ON c.id=e.class_id WHERE e.id=? AND e.org_id=?').get(id, user.org_id), 'Peperiksaan')
  /** Guru yang mengajar subjek peperiksaan itu kepada kelas tersebut (atau, jika subjek tiada guru, mana-mana guru kelas itu). */
  const isSubjectTeacher = (exam, teacherId) => {
    if (!teacherId) return false
    if (exam.subject) {
      const link = q('SELECT cs.teacher_id FROM class_subjects cs JOIN subjects s ON s.id=cs.subject_id WHERE cs.class_id=? AND s.name=? COLLATE NOCASE').get(exam.class_id, exam.subject)
      if (link?.teacher_id) return link.teacher_id === teacherId
    }
    return ctx.svc.teachesClass(teacherId, exam.class_id)
  }
  const canView = (user, exam) => isMgr(user) || exam.invigilator_id === myId(user) || ctx.svc.teachesClass(myId(user), exam.class_id)
  const canEdit = (user, exam) => isMgr(user) || (exam.status !== 'Completed' && isSubjectTeacher(exam, myId(user)))

  const markPct = (mark, max) => (mark === null || mark === undefined ? null : round1((mark / max) * 100))

  const buildResults = (user, org, exam) => {
    const scale = scaleOf(org)
    const rows = q(`SELECT s.id student_id, s.name, er.mark, er.absent, er.remarks FROM students s LEFT JOIN exam_results er ON er.exam_id=? AND er.student_id=s.id
      WHERE s.class_id=? AND s.active=1 ORDER BY s.name`).all(exam.id, exam.class_id)
    const students = rows.map((r) => {
      const pct = markPct(r.mark, exam.max_mark)
      return { studentId: r.student_id, name: r.name, mark: r.mark, absent: !!r.absent, remarks: r.remarks ?? '', pct, grade: gradeFor(pct, scale), passed: pct === null ? null : pct >= exam.pass_pct }
    })
    const graded = students.filter((s) => s.mark !== null)
    const dist = new Map(scale.map((g) => [g.grade, 0]))
    for (const s of graded) dist.set(s.grade, (dist.get(s.grade) ?? 0) + 1)
    return {
      exam: { id: exam.id, title: exam.title, className: exam.class_name, classId: exam.class_id, subject: exam.subject, date: exam.date, status: exam.status, maxMark: exam.max_mark, passPct: exam.pass_pct },
      canEdit: canEdit(user, exam), scale,
      students,
      stats: {
        total: students.length, graded: graded.length, absent: students.filter((s) => s.absent).length,
        pending: students.filter((s) => s.mark === null && !s.absent).length,
        average: graded.length ? round1(graded.reduce((a, s) => a + s.pct, 0) / graded.length) : null,
        highest: graded.length ? Math.max(...graded.map((s) => s.mark)) : null,
        lowest: graded.length ? Math.min(...graded.map((s) => s.mark)) : null,
        passRate: graded.length ? round1((graded.filter((s) => s.passed).length / graded.length) * 100) : null,
        distribution: [...dist].map(([grade, count]) => ({ grade, count })),
      },
    }
  }

  const getResults = ({ user, org, params }) => {
    const exam = loadExam(user, params.id)
    if (!canView(user, exam)) throw new HttpError(403, 'FORBIDDEN', 'Anda tidak mempunyai akses kepada keputusan ini')
    return buildResults(user, org, exam)
  }

  const putResults = async ({ user, org, params, body }) => {
    const exam = loadExam(user, params.id)
    if (!canEdit(user, exam)) throw new HttpError(403, exam.status === 'Completed' && !isMgr(user) ? 'EXAM_LOCKED' : 'FORBIDDEN',
      exam.status === 'Completed' && !isMgr(user) ? 'Keputusan telah dimuktamadkan. Hubungi pentadbir untuk membukanya semula.' : 'Hanya guru subjek ini atau pentadbir boleh memasukkan markah')
    if (exam.date > orgClock(org).date) throw new HttpError(409, 'EXAM_NOT_HELD', 'Markah hanya boleh dimasukkan pada atau selepas tarikh peperiksaan')
    const b = await body()
    if (!Array.isArray(b.results) || !b.results.length) throw new HttpError(400, 'VALIDATION_ERROR', 'results: wajib diisi')
    const inClass = new Set(q('SELECT id FROM students WHERE class_id=? AND active=1').all(exam.class_id).map((r) => r.id))
    const seen = new Set()
    const clean = b.results.map((r, i) => {
      const f = `results[${i}]`
      if (!r || typeof r !== 'object' || !inClass.has(r.studentId)) throw new HttpError(400, 'VALIDATION_ERROR', `${f}.studentId: pelajar bukan dalam kelas ini`)
      if (seen.has(r.studentId)) throw new HttpError(400, 'VALIDATION_ERROR', `${f}.studentId: pelajar muncul dua kali`)
      seen.add(r.studentId)
      const absent = r.absent === true
      let mark = null
      if (!absent && r.mark !== null && r.mark !== undefined && r.mark !== '') {
        mark = Number(r.mark)
        if (!Number.isFinite(mark) || mark < 0 || mark > exam.max_mark) throw new HttpError(400, 'VALIDATION_ERROR', `${f}.mark: mesti antara 0 dan ${exam.max_mark}`)
        if (Math.round(mark * 100) / 100 !== mark) throw new HttpError(400, 'VALIDATION_ERROR', `${f}.mark: maksimum 2 tempat perpuluhan`)
      }
      const remarks = r.remarks ? String(r.remarks).trim().slice(0, 200) : null
      return { studentId: r.studentId, mark, absent, remarks }
    })
    tx(() => {
      for (const r of clean) {
        if (r.mark === null && !r.absent && !r.remarks) q('DELETE FROM exam_results WHERE exam_id=? AND student_id=?').run(exam.id, r.studentId)
        else q(`INSERT INTO exam_results (exam_id,student_id,org_id,mark,absent,remarks,entered_by,entered_at) VALUES (?,?,?,?,?,?,?,?)
          ON CONFLICT(exam_id,student_id) DO UPDATE SET mark=excluded.mark, absent=excluded.absent, remarks=excluded.remarks, entered_by=excluded.entered_by, entered_at=excluded.entered_at`)
          .run(exam.id, r.studentId, org.id, r.mark, r.absent ? 1 : 0, r.remarks, user.id, Date.now())
      }
      if (exam.status === 'Scheduled') q("UPDATE exams SET status='Grading' WHERE id=?").run(exam.id)
      log(user, `Entered marks for ${exam.title} (${exam.class_name})`)
    })
    return buildResults(user, org, loadExam(user, exam.id))
  }

  const complete = ({ user, org, params }) => {
    const exam = loadExam(user, params.id)
    if (!canEdit(user, exam)) throw new HttpError(403, 'FORBIDDEN', 'Hanya guru subjek ini atau pentadbir boleh memuktamadkan keputusan')
    const r = buildResults(user, org, exam)
    if (r.stats.graded === 0) throw new HttpError(409, 'NO_RESULTS', 'Masukkan sekurang-kurangnya satu markah sebelum memuktamadkan')
    q("UPDATE exams SET status='Completed' WHERE id=?").run(exam.id)
    log(user, `Finalized results for ${exam.title} (${exam.class_name})`)
    return buildResults(user, org, loadExam(user, exam.id))
  }
  const reopen = ({ user, org, params }) => {
    const exam = loadExam(user, params.id)
    q("UPDATE exams SET status='Grading' WHERE id=?").run(exam.id)
    log(user, `Reopened results for ${exam.title} (${exam.class_name})`)
    return buildResults(user, org, loadExam(user, exam.id))
  }

  // ---- ringkasan kelas: pelajar × peperiksaan ----
  const classResults = ({ user, org, params }) => {
    const cls = must(q('SELECT * FROM classes WHERE id=? AND org_id=?').get(params.id, org.id), 'Kelas')
    if (!isMgr(user) && !ctx.svc.teachesClass(myId(user), cls.id)) throw new HttpError(403, 'FORBIDDEN', 'Anda hanya boleh melihat kelas yang anda ajar')
    const scale = scaleOf(org)
    const exams = q(`SELECT e.* FROM exams e WHERE e.class_id=? AND e.org_id=? AND EXISTS (SELECT 1 FROM exam_results er WHERE er.exam_id=e.id AND er.mark IS NOT NULL) ORDER BY e.date, e.title`).all(cls.id, org.id)
    const students = q('SELECT id, name FROM students WHERE class_id=? AND active=1 ORDER BY name').all(cls.id)
    const marks = new Map(q(`SELECT er.exam_id, er.student_id, er.mark, er.absent FROM exam_results er JOIN exams e ON e.id=er.exam_id WHERE e.class_id=?`).all(cls.id).map((r) => [`${r.exam_id}|${r.student_id}`, r]))
    const rows = students.map((s) => {
      const cells = exams.map((e) => {
        const r = marks.get(`${e.id}|${s.id}`)
        const pct = r?.mark != null ? markPct(r.mark, e.max_mark) : null
        return { examId: e.id, mark: r?.mark ?? null, absent: !!r?.absent, pct, grade: gradeFor(pct, scale) }
      })
      const got = cells.filter((c) => c.pct !== null)
      const avg = got.length ? round1(got.reduce((a, c) => a + c.pct, 0) / got.length) : null
      return { studentId: s.id, name: s.name, cells, average: avg, grade: gradeFor(avg, scale) }
    })
    return {
      class: { id: cls.id, name: cls.name }, scale,
      exams: exams.map((e) => ({ id: e.id, title: e.title, subject: e.subject, date: e.date, maxMark: e.max_mark, status: e.status })),
      students: rows,
    }
  }

  // ---- kad laporan seorang pelajar ----
  const studentReport = ({ user, org, params }) => {
    const s = must(q('SELECT s.*, c.name class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id WHERE s.id=? AND s.org_id=?').get(params.id, org.id), 'Pelajar')
    if (!isMgr(user) && !ctx.svc.teachesClass(myId(user), s.class_id)) throw new HttpError(403, 'FORBIDDEN', 'Anda hanya boleh melihat pelajar dalam kelas yang anda ajar')
    const scale = scaleOf(org)
    const items = q(`SELECT e.id, e.title, e.subject, e.date, e.max_mark, e.pass_pct, er.mark, er.absent, er.remarks FROM exam_results er JOIN exams e ON e.id=er.exam_id
      WHERE er.student_id=? AND (er.mark IS NOT NULL OR er.absent=1) ORDER BY e.date, e.title`).all(s.id).map((r) => {
      const pct = markPct(r.mark, r.max_mark)
      const peers = q('SELECT mark FROM exam_results WHERE exam_id=? AND mark IS NOT NULL').all(r.id).map((x) => x.mark)
      const rank = r.mark === null ? null : 1 + peers.filter((m) => m > r.mark).length
      return { examId: r.id, title: r.title, subject: r.subject, date: r.date, mark: r.mark, maxMark: r.max_mark, absent: !!r.absent, remarks: r.remarks, pct, grade: gradeFor(pct, scale), passed: pct === null ? null : pct >= r.pass_pct,
        rank, outOf: peers.length, classAverage: peers.length ? round1((peers.reduce((a, m) => a + m, 0) / peers.length / r.max_mark) * 100) : null }
    })
    const got = items.filter((i) => i.pct !== null)
    const bySubject = new Map()
    for (const i of got) { const k = i.subject ?? 'General'; bySubject.set(k, [...(bySubject.get(k) ?? []), i.pct]) }
    const avg = got.length ? round1(got.reduce((a, i) => a + i.pct, 0) / got.length) : null
    return {
      student: { id: s.id, name: s.name, class: s.class_name }, scale, items,
      summary: { exams: got.length, average: avg, grade: gradeFor(avg, scale),
        subjects: [...bySubject].map(([subject, v]) => { const a = round1(v.reduce((x, y) => x + y, 0) / v.length); return { subject, average: a, grade: gradeFor(a, scale) } }) },
    }
  }

  return [
    ['GET', '/v1/exams/:id/results', getResults],
    ['PUT', '/v1/exams/:id/results', putResults],
    ['POST', '/v1/exams/:id/complete', complete],
    ['POST', '/v1/exams/:id/reopen', reopen, { perm: 'exams:manage' }],
    ['GET', '/v1/classes/:id/results', classResults],
    ['GET', '/v1/students/:id/results', studentReport],
  ]
}
