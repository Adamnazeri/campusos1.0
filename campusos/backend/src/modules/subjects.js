import { HttpError } from '../http.js'
import { newId } from '../security.js'
import { str, int } from '../validate.js'
import { can } from '../perms.js'
import { created } from '../lib.js'
import { cleanName } from '../curriculum.js'

/** Subjek (senarai sekolah) + pautan kelas × subjek (siapa mengajar apa, kepada kelas mana). */
export function subjectRoutes(ctx) {
  const { q, tx, must, log, teacherOf } = ctx
  const uniq = (e) => { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'ALREADY_EXISTS', 'Subjek itu sudah wujud'); throw e }

  const toSubject = (r) => ({ id: r.id, name: r.name, code: r.code, classes: r.classes, teachers: r.teachers ? r.teachers.split('|') : [] })
  const SQL = `SELECT s.*, (SELECT COUNT(*) FROM class_subjects cs WHERE cs.subject_id=s.id) classes,
    (SELECT GROUP_CONCAT(name, '|') FROM (SELECT DISTINCT t.name FROM class_subjects cs JOIN teachers t ON t.id=cs.teacher_id WHERE cs.subject_id=s.id ORDER BY t.name)) teachers FROM subjects s`
  const row = (id) => toSubject(q(`${SQL} WHERE s.id=?`).get(id))

  const list = ({ user }) => {
    const items = q(`${SQL} WHERE s.org_id=? ORDER BY s.name`).all(user.org_id).map(toSubject)
    return { items, total: items.length }
  }
  const add = async ({ user, body }) => {
    const b = await body()
    const name = cleanName(str(b.name, 'name', { required: true, max: 80 }))
    const id = newId()
    try { q('INSERT INTO subjects (id,org_id,name,code,created_at) VALUES (?,?,?,?,?)').run(id, user.org_id, name, str(b.code, 'code', { max: 20 }) ?? null, Date.now()) } catch (e) { uniq(e) }
    log(user, `Added subject ${name}`)
    return created(row(id))
  }
  const patch = async ({ user, params, body }) => {
    const s = must(q('SELECT * FROM subjects WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Subjek')
    const b = await body()
    const name = b.name !== undefined ? cleanName(str(b.name, 'name', { required: true, max: 80 })) : s.name
    const code = b.code !== undefined ? (str(b.code, 'code', { max: 20 }) ?? null) : s.code
    tx(() => {
      try { q('UPDATE subjects SET name=?, code=? WHERE id=?').run(name, code, s.id) } catch (e) { uniq(e) }
      if (name !== s.name) // salinan nama pada jadual, tugasan & peperiksaan mengikut nama baharu
        for (const t of ['sessions', 'assignments', 'exams']) q(`UPDATE ${t} SET subject=? WHERE org_id=? AND subject=? COLLATE NOCASE`).run(name, user.org_id, s.name)
      log(user, `Updated subject ${name}`)
    })
    return row(s.id)
  }
  const del = ({ user, params }) => {
    const s = must(q('SELECT * FROM subjects WHERE id=? AND org_id=?').get(params.id, user.org_id), 'Subjek')
    const n = q('SELECT COUNT(*) c FROM class_subjects WHERE subject_id=?').get(s.id).c
    if (n) throw new HttpError(409, 'IN_USE', `Subjek ini masih diajar kepada ${n} kelas. Buang pautan kelas dahulu.`, { classes: n })
    q('DELETE FROM subjects WHERE id=?').run(s.id)
    log(user, `Deleted subject ${s.name}`)
  }

  // ---------- kelas × subjek ----------
  const listLinks = ({ user, org, query }) => {
    const mine = !can(user.role, 'directory:read') ? teacherOf(user)?.id ?? 'none' : query.get('teacherId') ? ctx.teacherRef(org.id, query.get('teacherId'), 'teacherId') : undefined
    const items = ctx.svc.classSubjects(org.id, { classId: query.get('classId') ?? undefined, teacherId: mine })
    return { items, total: items.length }
  }
  const resolveSubject = (orgId, v) => {
    const key = str(v, 'subject', { required: true, max: 80 })
    return must(q('SELECT id,name FROM subjects WHERE org_id=? AND (id=? OR name=?)').get(orgId, key, key), 'Subjek')
  }
  const linkOut = (id) => ctx.svc.classSubjects(q('SELECT org_id FROM class_subjects WHERE id=?').get(id).org_id).find((x) => x.id === id)

  const addLink = async ({ user, org, params, body }) => {
    const cls = must(q("SELECT * FROM classes WHERE id=? AND org_id=? AND status='Active'").get(params.id, org.id), 'Kelas aktif')
    const b = await body()
    const subject = resolveSubject(org.id, b.subject ?? b.subjectId)
    const teacherId = b.teacher !== undefined || b.teacherId !== undefined ? ctx.teacherRef(org.id, b.teacher ?? b.teacherId, 'teacher') : null
    const periods = b.periodsPerWeek !== undefined ? int(b.periodsPerWeek, 'periodsPerWeek', { min: 0, max: 60 }) : 0
    const id = newId()
    try { q('INSERT INTO class_subjects (id,org_id,class_id,subject_id,teacher_id,periods_per_week) VALUES (?,?,?,?,?,?)').run(id, org.id, cls.id, subject.id, teacherId, periods) }
    catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'ALREADY_EXISTS', `${cls.name} sudah mengambil ${subject.name}`); throw e }
    log(user, `Assigned ${subject.name} to ${cls.name}`)
    return created(linkOut(id))
  }
  const patchLink = async ({ user, org, params, body }) => {
    const l = must(q('SELECT * FROM class_subjects WHERE id=? AND org_id=?').get(params.id, org.id), 'Pautan subjek')
    const b = await body()
    const teacherId = b.teacher !== undefined || b.teacherId !== undefined ? ctx.teacherRef(org.id, b.teacher ?? b.teacherId, 'teacher') : l.teacher_id
    const periods = b.periodsPerWeek !== undefined ? int(b.periodsPerWeek, 'periodsPerWeek', { min: 0, max: 60 }) : l.periods_per_week
    const subj = q('SELECT name FROM subjects WHERE id=?').get(l.subject_id).name
    tx(() => {
      q('UPDATE class_subjects SET teacher_id=?, periods_per_week=? WHERE id=?').run(teacherId, periods, l.id)
      // sesi jadual kelas × subjek ini mengikut guru baharu
      if (teacherId !== l.teacher_id) q('UPDATE sessions SET teacher_id=? WHERE class_id=? AND subject=? COLLATE NOCASE').run(teacherId, l.class_id, subj)
      log(user, `Updated ${subj} teacher for a class`)
    })
    return linkOut(l.id)
  }
  const delLink = ({ user, org, params }) => {
    const l = must(q('SELECT * FROM class_subjects WHERE id=? AND org_id=?').get(params.id, org.id), 'Pautan subjek')
    const subj = q('SELECT name FROM subjects WHERE id=?').get(l.subject_id).name
    const n = q('SELECT COUNT(*) c FROM sessions WHERE class_id=? AND subject=? COLLATE NOCASE').get(l.class_id, subj).c
    if (n) throw new HttpError(409, 'IN_USE', `${subj} masih ada ${n} sesi dalam jadual kelas ini. Buang sesi itu dahulu.`, { sessions: n })
    q('DELETE FROM class_subjects WHERE id=?').run(l.id)
    log(user, `Removed ${subj} from a class`)
  }

  return [
    ['GET', '/v1/subjects', list],
    ['POST', '/v1/subjects', add, { perm: 'classes:manage' }],
    ['PATCH', '/v1/subjects/:id', patch, { perm: 'classes:manage' }],
    ['DELETE', '/v1/subjects/:id', del, { perm: 'classes:manage' }],
    ['GET', '/v1/class-subjects', listLinks],
    ['POST', '/v1/classes/:id/subjects', addLink, { perm: 'classes:manage' }],
    ['PATCH', '/v1/class-subjects/:id', patchLink, { perm: 'classes:manage' }],
    ['DELETE', '/v1/class-subjects/:id', delLink, { perm: 'classes:manage' }],
  ]
}
