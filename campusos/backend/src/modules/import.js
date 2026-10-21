import { HttpError } from '../http.js'
import { newId } from '../security.js'
import { can } from '../perms.js'
import { email as vEmail } from '../validate.js'
import { checkLimit, createInvite, insertTeacher } from '../services.js'

const MAX_ROWS = 2000
const text = (v) => (v === undefined || v === null ? '' : String(v).trim())
const low = (v) => text(v).toLowerCase()

/**
 * Import pukal (CSV yang diparse di klien → JSON): guru, kelas, pelajar.
 *   POST /v1/import/:kind   { rows: [...], dryRun?: true, invite?: boolean, classId?: string }
 * Setiap baris disahkan secara berasingan: baris yang salah dilaporkan (dengan nombor baris) dan DILANGKAU,
 * baris yang betul diimport. `dryRun` hanya mengesahkan (tiada apa-apa ditulis).
 */
export function importRoutes(ctx) {
  const { q, tx, log, db } = ctx
  const msg = (e) => String(e?.message ?? e).replace(/^[\w.[\]]+: /, (m) => m) // mesej ralat dari validator/HttpError

  const run = (rows, dryRun, handler) => {
    const results = []
    const attempt = (i, fn) => {
      const line = i + 2 // baris 1 = pengepala
      try {
        if (dryRun) { const info = fn(); results.push({ line, status: 'ok', ...(info ?? {}) }) } else {
          db.exec('SAVEPOINT imp')
          try { const info = fn(); db.exec('RELEASE imp'); results.push({ line, status: 'ok', ...(info ?? {}) }) } catch (e) { db.exec('ROLLBACK TO imp'); db.exec('RELEASE imp'); throw e }
        }
      } catch (e) { results.push({ line, status: 'error', message: msg(e) }) }
    }
    rows.forEach((r, i) => attempt(i, () => handler(r, i)))
    return results
  }

  const importKind = async ({ user, org, params, body }) => {
    const kind = params.kind
    if (!['teachers', 'classes', 'students'].includes(kind)) throw new HttpError(404, 'NOT_FOUND', 'Unknown import type')
    if (!can(user.role, kind === 'teachers' ? 'teachers:manage' : 'classes:manage')) throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to do that.')
    const b = await body()
    if (!Array.isArray(b.rows) || !b.rows.length) throw new HttpError(400, 'VALIDATION_ERROR', 'rows: wajib diisi')
    if (b.rows.length > MAX_ROWS) throw new HttpError(400, 'VALIDATION_ERROR', `You can import at most ${MAX_ROWS} rows at a time.`)
    const dryRun = b.dryRun === true
    const rows = b.rows.map((r) => (r && typeof r === 'object' ? r : {}))
    const invites = []
    let created = 0

    const seen = new Set() // pendua dalam fail yang sama
    const dup = (key, what) => { if (seen.has(key)) throw new Error(`${what} appears more than once in this file`); seen.add(key) }

    const handlers = {
      teachers: (r) => {
        const email = low(r.email)
        if (email) dup(email, `Email ${email}`)
        const input = { name: text(r.name), email: text(r.email), title: text(r.title) || 'Teacher' }
        if (text(r.phone)) input.phone = text(r.phone)
        if (text(r.weeklyHours)) input.weeklyHours = Number(text(r.weeklyHours))
        if (text(r.subjects)) input.subjects = text(r.subjects).split(/[;,|]/).map((s) => s.trim()).filter(Boolean)
        if (text(r.branch)) input.branch = text(r.branch)
        const f = ctx.svc.teacherFields(input, org.id)
        if (q('SELECT 1 FROM teachers WHERE org_id=? AND email=? COLLATE NOCASE').get(org.id, f.email)) throw new Error(`Email ${f.email} already exists`)
        const deptName = text(r.department)
        const dept = deptName ? q('SELECT id FROM departments WHERE org_id=? AND name=? COLLATE NOCASE').get(org.id, deptName) : null
        if (dryRun) { if (deptName && !dept) return { note: `department "${deptName}" will be created` }; return }
        checkLimit(ctx, org.id, org.plan, 'teachers')
        let deptId = dept?.id ?? null
        if (deptName && !deptId) { deptId = newId(); q('INSERT INTO departments (id,org_id,name,branch_id) VALUES (?,?,?,NULL)').run(deptId, org.id, deptName) }
        const id = insertTeacher(ctx, org.id, { ...f, department_id: deptId })
        if (b.invite !== false) { const token = createInvite(ctx, { orgId: org.id, email: f.email, role: 'teacher', teacherId: id, createdBy: user.id }); invites.push({ email: f.email, name: f.name, token }) }
        created++
      },
      classes: (r) => {
        const name = text(r.name)
        if (name) dup(low(name), `Class ${name}`)
        const input = { name }
        if (text(r.classTeacher)) input.teacher = text(r.classTeacher)
        if (text(r.room)) input.room = text(r.room)
        if (text(r.branch)) input.branch = text(r.branch)
        const f = ctx.svc.classInput(input, org.id)
        if (q('SELECT 1 FROM classes WHERE org_id=? AND name=? COLLATE NOCASE').get(org.id, f.name)) throw new Error(`Class ${f.name} already exists`)
        if (dryRun) return
        checkLimit(ctx, org.id, org.plan, 'classes')
        q('INSERT INTO classes (id,org_id,name,teacher_id,branch_id,room_id,created_at) VALUES (?,?,?,?,?,?,?)').run(newId(), org.id, f.name, f.teacher_id ?? null, f.branch_id ?? null, f.room_id ?? null, Date.now())
        created++
      },
      students: (r) => {
        const name = text(r.name)
        if (!name) throw new Error('Name is required')
        if (name.length > 80) throw new Error('Name must be at most 80 characters')
        const studentCode = text(r.studentCode) || null
        if (studentCode && studentCode.length > 40) throw new Error('Student ID must be at most 40 characters')
        const guardianName = text(r.guardianName) || null
        if (guardianName && guardianName.length > 80) throw new Error('Guardian name must be at most 80 characters')
        const guardianPhone = text(r.guardianPhone) || null
        if (guardianPhone && guardianPhone.length > 30) throw new Error('Guardian phone must be at most 30 characters')
        const guardianEmail = text(r.guardianEmail) ? vEmail(text(r.guardianEmail), 'guardianEmail', false) : null
        const notes = text(r.notes) || null
        const className = text(r.class) || text(r.className)
        let cls = null
        if (className) {
          cls = q('SELECT id,name FROM classes WHERE org_id=? AND name=? COLLATE NOCASE AND status=\'Active\'').get(org.id, className)
          if (!cls) throw new Error(`class "${className}" does not exist`)
        } else if (b.classId) {
          cls = q('SELECT id,name FROM classes WHERE id=? AND org_id=?').get(b.classId, org.id)
          if (!cls) throw new Error('class does not exist')
        }
        dup(`${low(name)}|${cls?.id ?? ''}`, `Student ${name}${cls ? ` (${cls.name})` : ''}`)
        if (studentCode) {
          dup(`code|${low(studentCode)}`, `Student ID ${studentCode}`)
          if (q('SELECT 1 FROM students WHERE org_id=? AND active=1 AND student_code=? COLLATE NOCASE').get(org.id, studentCode))
            throw new Error(`Student ID ${studentCode} already exists`)
        }
        if (q('SELECT 1 FROM students WHERE org_id=? AND active=1 AND name=? COLLATE NOCASE AND IFNULL(class_id,\'\')=?').get(org.id, name, cls?.id ?? '')) throw new Error(`${name} is already in ${cls?.name ?? 'the unassigned list'}`)
        if (dryRun) return
        q('INSERT INTO students (id,org_id,class_id,name,student_code,guardian_name,guardian_phone,guardian_email,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(newId(), org.id, cls?.id ?? null, name, studentCode, guardianName, guardianPhone, guardianEmail, notes, Date.now())
        created++
      },
    }

    const results = tx(() => run(rows, dryRun, handlers[kind]))
    const errors = results.filter((r) => r.status === 'error').length
    if (!dryRun && created) log(user, `Imported ${created} ${kind} from CSV`)
    return {
      kind, dryRun, total: rows.length, ok: rows.length - errors, errors, created: dryRun ? 0 : created, results,
      // bila e-mel tidak disediakan, pautan jemputan dipulangkan supaya admin boleh kongsi secara manual
      ...(!dryRun && invites.length ? { emailed: ctx.mail.configured(), ...(ctx.exposeInviteLinks() ? { invites } : {}) } : {}),
    }
  }

  return [['POST', '/v1/import/:kind', importKind]]
}
