import { HttpError } from '../http.js'
import { newId } from '../security.js'
import { str, int, oneOf, date, time, list, bad, clock } from '../validate.js'
import { can } from '../perms.js'
import { created, DAYS, orgClock, addDays, dayName, pct } from '../lib.js'

const STATUSES = ['Present', 'Absent', 'Late']

export function scheduleRoutes(ctx) {
  const { q, tx, must, log, ref, settingsOf, teacherOf } = ctx

  // ===================== JADUAL WAKTU =====================
  const SSQL = `SELECT s.*, c.name class_name, c.status class_status, t.name teacher, r.name room
    FROM sessions s JOIN classes c ON c.id=s.class_id LEFT JOIN teachers t ON t.id=s.teacher_id LEFT JOIN rooms r ON r.id=s.room_id`
  const toSession = (s) => ({
    id: s.id, day: s.day, start: clock.fmt(s.start_min), end: clock.fmt(s.start_min + s.duration), duration: s.duration,
    classId: s.class_id, className: s.class_name, subject: s.subject, teacherId: s.teacher_id, teacher: s.teacher, roomId: s.room_id, room: s.room,
  })
  const byTime = (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start)
  ctx.svc.sessions = (orgId, { day, teacherId, classId, roomId } = {}) => {
    const where = ['s.org_id=?'], args = [orgId]
    for (const [col, v] of [['s.day', day], ['s.teacher_id', teacherId], ['s.class_id', classId], ['s.room_id', roomId]]) if (v) { where.push(`${col}=?`); args.push(v) }
    return q(`${SSQL} WHERE ${where.join(' AND ')}`).all(...args).map(toSession).sort(byTime)
  }

  /** Sesi sedia ada yang bertindih masa pada hari yang sama dan berkongsi guru/bilik/kelas. */
  function findConflicts(orgId, c, excludeId = null) {
    const rows = q(`SELECT s.*, cl.name class_name, t.name teacher, r.name room FROM sessions s
      JOIN classes cl ON cl.id=s.class_id LEFT JOIN teachers t ON t.id=s.teacher_id LEFT JOIN rooms r ON r.id=s.room_id
      WHERE s.org_id=? AND s.day=? AND s.start_min < ? AND ? < s.start_min + s.duration AND s.id<>?`)
      .all(orgId, c.day, c.start_min + c.duration, c.start_min, excludeId ?? '')
    const out = []
    for (const s of rows) {
      if (c.room_id && s.room_id === c.room_id) out.push({ type: 'room', with: toSession(s), message: `${s.room} dah ditempah pada ${s.day} ${clock.fmt(s.start_min)}` })
      if (c.teacher_id && s.teacher_id === c.teacher_id) out.push({ type: 'teacher', with: toSession(s), message: `${s.teacher} sudah mengajar ${s.class_name} pada ${s.day} ${clock.fmt(s.start_min)}` })
      if (s.class_id === c.class_id) out.push({ type: 'class', with: toSession(s), message: `${s.class_name} sudah ada sesi pada ${s.day} ${clock.fmt(s.start_min)}` })
    }
    return out
  }

  /** Semua konflik sedia ada dalam organisasi (pasangan sesi bertindih). */
  ctx.svc.allConflicts = (orgId) => {
    const rows = q(`SELECT a.id a_id, b.id b_id, a.day, a.start_min,
        (a.room_id IS NOT NULL AND a.room_id=b.room_id) room, (a.teacher_id IS NOT NULL AND a.teacher_id=b.teacher_id) teacher, (a.class_id=b.class_id) cls,
        r.name room_name, t.name teacher_name, c.name class_name
      FROM sessions a JOIN sessions b ON b.org_id=a.org_id AND a.id<b.id AND a.day=b.day AND a.start_min < b.start_min+b.duration AND b.start_min < a.start_min+a.duration
      LEFT JOIN rooms r ON r.id=a.room_id LEFT JOIN teachers t ON t.id=a.teacher_id JOIN classes c ON c.id=a.class_id
      WHERE a.org_id=? AND (a.room_id=b.room_id OR a.teacher_id=b.teacher_id OR a.class_id=b.class_id)`).all(orgId)
    return rows.flatMap((r) => [
      r.room && { type: 'room', day: r.day, start: clock.fmt(r.start_min), sessionIds: [r.a_id, r.b_id], message: `${r.room_name} double-booked ${r.day} ${clock.fmt(r.start_min)}` },
      r.teacher && { type: 'teacher', day: r.day, start: clock.fmt(r.start_min), sessionIds: [r.a_id, r.b_id], message: `${r.teacher_name} double-booked ${r.day} ${clock.fmt(r.start_min)}` },
      r.cls && { type: 'class', day: r.day, start: clock.fmt(r.start_min), sessionIds: [r.a_id, r.b_id], message: `${r.class_name} double-booked ${r.day} ${clock.fmt(r.start_min)}` },
    ].filter(Boolean))
  }

  const timetable = ({ user, org, query }) => {
    const s = settingsOf(org)
    const day = query.get('day') ? oneOf(query.get('day'), 'day', DAYS) : undefined
    // guru sentiasa hanya nampak jadual sendiri; pengurus boleh menapis mengikut teacherId
    const mine = !can(user.role, 'directory:read') ? (teacherOf(user)?.id ?? 'none') : undefined
    const sessions = ctx.svc.sessions(org.id, {
      day, teacherId: mine ?? (query.get('teacherId') ? ctx.teacherRef(org.id, query.get('teacherId'), 'teacherId') : undefined),
      classId: query.get('classId') || undefined, roomId: query.get('roomId') || undefined,
    })
    const startH = Math.floor(clock.toMin(s.dayStart) / 60), endH = Math.ceil(clock.toMin(s.dayEnd) / 60)
    return {
      days: s.operatingDays, slots: Array.from({ length: Math.max(endH - startH, 0) }, (_, i) => clock.fmt((startH + i) * 60)),
      sessions, conflicts: can(user.role, 'directory:read') ? ctx.svc.allConflicts(org.id) : [],
    }
  }

  function sessionFields(b, orgId, org, cur = null) {
    const s = settingsOf(org)
    const f = { day: cur?.day, start_min: cur?.start_min, duration: cur?.duration ?? 60 }
    if (b.day !== undefined || !cur) f.day = oneOf(b.day, 'day', s.operatingDays, { required: true })
    if (b.start !== undefined || !cur) f.start_min = clock.toMin(time(b.start, 'start', { required: true }))
    if (b.duration !== undefined) f.duration = int(b.duration, 'duration', { min: 15, max: 240, required: true })
    if (f.start_min < clock.toMin(s.dayStart) || f.start_min + f.duration > clock.toMin(s.dayEnd))
      throw bad('start', `sesi mesti berada dalam waktu operasi ${s.dayStart}–${s.dayEnd}`)
    const cls = must(q("SELECT * FROM classes WHERE id=? AND org_id=? AND status='Active'").get(b.classId ?? cur?.class_id, orgId), 'Kelas aktif')
    f.class_id = cls.id
    // subjek + guru datang daripada pautan kelas × subjek (guru boleh ditimpa untuk guru ganti)
    const links = ctx.svc.classSubjects(orgId, { classId: cls.id })
    const want = b.subjectId ?? b.subject
    let link = null
    if (want !== undefined && want !== null && want !== '') {
      link = links.find((l) => l.subjectId === want || l.id === want || l.subject.toLowerCase() === String(want).toLowerCase())
      if (!link) throw bad('subjectId', `${cls.name} tidak mengambil subjek itu. Tetapkan subjek kepada kelas dahulu.`)
    } else if (!cur || cur.class_id !== cls.id) {
      if (links.length === 1) link = links[0]
      else if (links.length > 1) throw bad('subjectId', `pilih subjek untuk ${cls.name}`)
    }
    f.subject = link ? link.subject : cur && cur.class_id === cls.id ? cur.subject : null
    const defaultTeacher = link ? link.teacherId : cur && cur.class_id === cls.id ? cur.teacher_id : cls.teacher_id
    f.teacher_id = b.teacherId !== undefined ? ctx.teacherRef(orgId, b.teacherId, 'teacherId') : defaultTeacher
    f.room_id = b.roomId !== undefined ? ref('rooms', orgId, b.roomId, 'roomId') : cur ? cur.room_id : cls.room_id
    if (f.room_id && q('SELECT status FROM rooms WHERE id=?').get(f.room_id).status === 'Maintenance') throw new HttpError(409, 'ROOM_MAINTENANCE', 'Bilik sedang dalam penyelenggaraan')
    return f
  }
  const refuseConflicts = (orgId, f, excludeId, force) => {
    const conflicts = findConflicts(orgId, f, excludeId)
    if (conflicts.length && !force) throw new HttpError(409, 'CONFLICT', 'Jadual bertembung dengan sesi lain. Gunakan ?force=1 untuk mengatasi.', { conflicts })
    return conflicts
  }

  const addSession = async ({ user, org, body, query }) => {
    const f = sessionFields(await body(), org.id, org)
    const conflicts = refuseConflicts(org.id, f, null, query.get('force') === '1')
    const id = newId()
    q('INSERT INTO sessions (id,org_id,day,start_min,duration,class_id,subject,teacher_id,room_id) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(id, org.id, f.day, f.start_min, f.duration, f.class_id, f.subject ?? null, f.teacher_id ?? null, f.room_id ?? null)
    log(user, `Scheduled ${f.subject ?? 'session'} on ${f.day} ${clock.fmt(f.start_min)}`)
    return created({ ...toSession(q(`${SSQL} WHERE s.id=?`).get(id)), forcedConflicts: conflicts.length })
  }
  const patchSession = async ({ user, org, params, body, query }) => {
    const cur = must(q('SELECT * FROM sessions WHERE id=? AND org_id=?').get(params.id, org.id), 'Sesi')
    const f = sessionFields(await body(), org.id, org, cur)
    const conflicts = refuseConflicts(org.id, f, cur.id, query.get('force') === '1')
    q('UPDATE sessions SET day=?,start_min=?,duration=?,class_id=?,subject=?,teacher_id=?,room_id=? WHERE id=?')
      .run(f.day, f.start_min, f.duration, f.class_id, f.subject ?? null, f.teacher_id ?? null, f.room_id ?? null, cur.id)
    log(user, `Rescheduled ${f.subject ?? 'session'} to ${f.day} ${clock.fmt(f.start_min)}`)
    return { ...toSession(q(`${SSQL} WHERE s.id=?`).get(cur.id)), forcedConflicts: conflicts.length }
  }
  const delSession = ({ user, org, params }) => {
    must(q('SELECT id FROM sessions WHERE id=? AND org_id=?').get(params.id, org.id), 'Sesi')
    q('DELETE FROM sessions WHERE id=?').run(params.id)
    log(user, 'Removed a timetable session')
  }
  const cancelSession = async ({ user, org, params, body }) => {
    const s = must(q('SELECT * FROM sessions WHERE id=? AND org_id=?').get(params.id, org.id), 'Sesi')
    const b = await body()
    const d = date(b.date ?? orgClock(org).date, 'date', { required: true })
    if (dayName(d) !== s.day) throw bad('date', `tarikh itu jatuh pada hari ${dayName(d)}, bukan ${s.day}`)
    q('INSERT OR REPLACE INTO session_cancellations (session_id,date,reason) VALUES (?,?,?)').run(s.id, d, str(b.reason, 'reason', { max: 200 }))
    log(user, `Cancelled a session on ${d}`)
    return { sessionId: s.id, date: d, cancelled: true }
  }
  const restoreSession = ({ user, org, params, query }) => {
    must(q('SELECT id FROM sessions WHERE id=? AND org_id=?').get(params.id, org.id), 'Sesi')
    q('DELETE FROM session_cancellations WHERE session_id=? AND date=?').run(params.id, date(query.get('date'), 'date', { required: true }))
  }

  // ===================== GURU GANTI (RELIEF / SUBSTITUTIONS) =====================
  /** Senarai sesi yang terjejas oleh cuti guru (atau sudah mempunyai guru ganti) pada tarikh tertentu, berserta cadangan guru ganti yang berkelapangan. */
  ctx.svc.substitutionsForDate = (org, d = orgClock(org).date) => {
    const day = dayName(d)
    const onLeaveRows = q(`SELECT l.teacher_id, t.name, l.type, l.from_date, l.to_date FROM leave_requests l
      JOIN teachers t ON t.id=l.teacher_id WHERE l.org_id=? AND l.status='Approved' AND l.from_date<=? AND l.to_date>=?`).all(org.id, d, d)
    const onLeaveMap = new Map(onLeaveRows.map((r) => [r.teacher_id, { id: r.teacher_id, name: r.name, type: r.type, from: r.from_date, to: r.to_date }]))
    const cancelled = new Set(q('SELECT c.session_id FROM session_cancellations c JOIN sessions s ON s.id=c.session_id WHERE s.org_id=? AND c.date=?').all(org.id, d).map((r) => r.session_id))
    const subsRows = q(`SELECT sub.session_id, sub.substitute_teacher_id, t.name substitute_teacher, sub.note
      FROM session_substitutions sub LEFT JOIN teachers t ON t.id=sub.substitute_teacher_id WHERE sub.org_id=? AND sub.date=?`).all(org.id, d)
    const subsMap = new Map(subsRows.map((r) => [r.session_id, r]))
    const daySessions = q(`${SSQL} WHERE s.org_id=? AND s.day=? ORDER BY s.start_min`).all(org.id, day)
    const activeTeachers = ctx.svc.teachers ? ctx.svc.teachers(org.id) : []

    const items = daySessions
      .filter((s) => !cancelled.has(s.id) && ((s.teacher_id && onLeaveMap.has(s.teacher_id)) || subsMap.has(s.id)))
      .map((s) => {
        const sub = subsMap.get(s.id)
        const leaveInfo = s.teacher_id ? onLeaveMap.get(s.teacher_id) : null
        // Cari guru aktif yang: (1) tidak bercuti pada d, (2) tiada kelas bertindih pada hari itu, (3) belum jadi guru ganti sesi lain yang bertindih
        const busyRegular = new Set(daySessions
          .filter((o) => o.id !== s.id && !cancelled.has(o.id) && o.teacher_id && o.start_min < s.start_min + s.duration && s.start_min < o.start_min + o.duration)
          .map((o) => o.teacher_id))
        const busyRelief = new Set(daySessions
          .filter((o) => o.id !== s.id && subsMap.has(o.id) && o.start_min < s.start_min + s.duration && s.start_min < o.start_min + o.duration)
          .map((o) => subsMap.get(o.id).substitute_teacher_id))
        const availableTeachers = activeTeachers
          .filter((t) => t.id !== s.teacher_id && !onLeaveMap.has(t.id) && !busyRegular.has(t.id) && !busyRelief.has(t.id))
          .map((t) => ({ id: t.id, name: t.name, department: t.department, hours: t.hours }))
        return {
          sessionId: s.id, date: d, day: s.day, start: clock.fmt(s.start_min), end: clock.fmt(s.start_min + s.duration), duration: s.duration,
          classId: s.class_id, className: s.class_name, subject: s.subject, room: s.room,
          originalTeacherId: s.teacher_id, originalTeacher: s.teacher,
          reason: leaveInfo ? `${leaveInfo.type} (${leaveInfo.from} – ${leaveInfo.to})` : (sub?.note || 'Relief assigned'),
          substituteTeacherId: sub?.substitute_teacher_id ?? null,
          substituteTeacher: sub?.substitute_teacher ?? null,
          note: sub?.note ?? null,
          status: sub?.substitute_teacher_id ? 'Covered' : 'Needs Relief',
          availableTeachers,
        }
      })
    return {
      date: d, day,
      onLeaveTeachers: [...onLeaveMap.values()],
      items,
      counts: { total: items.length, covered: items.filter((i) => i.status === 'Covered').length, uncovered: items.filter((i) => i.status === 'Needs Relief').length },
    }
  }

  const listSubstitutions = ({ org, query }) => {
    const d = date(query.get('date') ?? orgClock(org).date, 'date', { required: true })
    return ctx.svc.substitutionsForDate(org, d)
  }

  const putSubstitute = async ({ user, org, params, body }) => {
    const s = must(q(`${SSQL} WHERE s.id=? AND s.org_id=?`).get(params.id, org.id), 'Sesi')
    const b = await body()
    const d = date(b.date ?? orgClock(org).date, 'date', { required: true })
    if (dayName(d) !== s.day) throw bad('date', `tarikh itu jatuh pada hari ${dayName(d)}, bukan ${s.day}`)
    const subId = ctx.teacherRef(org.id, b.substituteTeacherId ?? b.teacherId, 'substituteTeacherId')
    if (!subId) throw bad('substituteTeacherId', 'wajib diisi')
    if (subId === s.teacher_id) throw bad('substituteTeacherId', 'guru ganti mesti berbeza daripada guru asal sesi ini')
    const onLeave = q("SELECT 1 FROM leave_requests WHERE org_id=? AND teacher_id=? AND status='Approved' AND from_date<=? AND to_date>=?").get(org.id, subId, d, d)
    if (onLeave) throw new HttpError(409, 'TEACHER_ON_LEAVE', 'Guru ganti yang dipilih sedang bercuti pada tarikh tersebut')
    const clashRegular = q(`SELECT s.*, c.name class_name FROM sessions s JOIN classes c ON c.id=s.class_id
      WHERE s.org_id=? AND s.day=? AND s.teacher_id=? AND s.id<>? AND s.start_min < ? AND ? < s.start_min + s.duration
      AND NOT EXISTS (SELECT 1 FROM session_cancellations sc WHERE sc.session_id=s.id AND sc.date=?)`)
      .get(org.id, s.day, subId, s.id, s.start_min + s.duration, s.start_min, d)
    if (clashRegular) throw new HttpError(409, 'CONFLICT', `Guru ganti sudah mempunyai kelas (${clashRegular.class_name}) pada masa tersebut`)
    const clashSub = q(`SELECT s.*, c.name class_name FROM session_substitutions sub JOIN sessions s ON s.id=sub.session_id JOIN classes c ON c.id=s.class_id
      WHERE sub.org_id=? AND sub.date=? AND sub.substitute_teacher_id=? AND sub.session_id<>? AND s.start_min < ? AND ? < s.start_min + s.duration`)
      .get(org.id, d, subId, s.id, s.start_min + s.duration, s.start_min)
    if (clashSub) throw new HttpError(409, 'CONFLICT', `Guru ganti sudah ditugaskan menggantikan kelas (${clashSub.class_name}) pada masa tersebut`)
    const note = str(b.note, 'note', { max: 200 })
    const subTeacher = q('SELECT name FROM teachers WHERE id=?').get(subId)
    q(`INSERT INTO session_substitutions (session_id,date,org_id,substitute_teacher_id,note,created_by,created_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(session_id,date) DO UPDATE SET substitute_teacher_id=excluded.substitute_teacher_id, note=excluded.note, created_by=excluded.created_by, created_at=excluded.created_at`)
      .run(s.id, d, org.id, subId, note, user.id, Date.now())
    log(user, `Assigned ${subTeacher.name} as relief teacher for ${s.class_name} on ${d}`)
    return { sessionId: s.id, date: d, className: s.class_name, subject: s.subject, originalTeacher: s.teacher, substituteTeacherId: subId, substituteTeacher: subTeacher.name, note }
  }

  const delSubstitute = ({ user, org, params, query }) => {
    const s = must(q('SELECT id FROM sessions WHERE id=? AND org_id=?').get(params.id, org.id), 'Sesi')
    const d = date(query.get('date') ?? orgClock(org).date, 'date', { required: true })
    q('DELETE FROM session_substitutions WHERE session_id=? AND date=?').run(s.id, d)
    log(user, `Removed relief teacher assignment on ${d}`)
  }

  /** Kelas sedang berlangsung / bakal bermula / dibatalkan untuk hari ini. */
  ctx.svc.live = (org, atMs) => {
    const now = orgClock(org, atMs)
    const holiday = settingsOf(org).holidays !== false && ctx.svc.holidayOn ? ctx.svc.holidayOn(org.id, now.date) : null
    const cancelled = new Map(q('SELECT c.session_id, c.reason FROM session_cancellations c JOIN sessions s ON s.id=c.session_id WHERE s.org_id=? AND c.date=?').all(org.id, now.date).map((r) => [r.session_id, r.reason]))
    const subs = new Map(q('SELECT sub.session_id, t.name substitute_teacher FROM session_substitutions sub JOIN teachers t ON t.id=sub.substitute_teacher_id WHERE sub.org_id=? AND sub.date=?').all(org.id, now.date).map((r) => [r.session_id, r.substitute_teacher]))
    const onLeave = new Set(q("SELECT teacher_id FROM leave_requests WHERE org_id=? AND status='Approved' AND from_date<=? AND to_date>=?").all(org.id, now.date, now.date).map((r) => r.teacher_id))
    const today = ctx.svc.sessions(org.id, { day: now.day })
    const items = []
    let remaining = 0
    for (const s of today) {
      const st = clock.toMin(s.start), en = clock.toMin(s.end)
      const isCancelled = cancelled.has(s.id)
      if (en <= now.minutes) continue
      if (!isCancelled && st > now.minutes) remaining++
      const state = isCancelled ? 'cancelled' : st <= now.minutes ? 'in-progress' : st - now.minutes <= 60 ? 'starting' : null
      const subName = subs.get(s.id) ?? null
      const needsRelief = !isCancelled && !!s.teacherId && onLeave.has(s.teacherId) && !subName
      if (state) items.push({
        id: s.id, subject: s.subject, room: s.room, teacher: s.teacher, className: s.className, classId: s.classId, time: `${s.start}–${s.end}`, state,
        ...(isCancelled ? { reason: cancelled.get(s.id) } : {}),
        ...(subName ? { substituteTeacher: subName } : {}),
        ...(needsRelief ? { needsRelief: true } : {}),
      })
    }
    return {
      now: { date: now.date, day: now.day, time: clock.fmt(now.minutes) },
      holiday,
      items,
      counts: { live: items.filter((i) => i.state === 'in-progress').length, soon: items.filter((i) => i.state === 'starting').length, cancelled: items.filter((i) => i.state === 'cancelled').length },
      remainingToday: remaining, totalToday: today.length,
    }
  }
  const live = ({ org, query }) => ctx.svc.live(org, query.get('at') ? Number(query.get('at')) : undefined)

  // ===================== KEHADIRAN =====================
  const counts = (rows) => ({
    present: rows.filter((r) => r.status === 'Present').length, absent: rows.filter((r) => r.status === 'Absent').length,
    late: rows.filter((r) => r.status === 'Late').length, total: rows.length,
  })

  const getAttendance = ({ user, org, params, query }) => {
    const d = date(query.get('date') ?? orgClock(org).date, 'date', { required: true })
    const c = ctx.svc.classAccess(user, params.id, { dateStr: d })
    const roster = q(`SELECT s.id, s.name, s.student_code studentCode, s.guardian_name guardianName, s.guardian_phone guardianPhone, a.status FROM students s LEFT JOIN attendance a ON a.student_id=s.id AND a.class_id=? AND a.date=?
      WHERE s.class_id=? AND s.active=1 ORDER BY s.name`).all(c.id, d, c.id)
    const marked = roster.filter((r) => r.status)
    return {
      classId: c.id, className: c.name, subject: ctx.svc.classSubjects(c.org_id, { classId: c.id }).map((x) => x.subject).join(', ') || null,
      date: d, roster: roster.map((r) => ({ id: r.id, name: r.name, studentCode: r.studentCode ?? null, guardianName: r.guardianName ?? null, guardianPhone: r.guardianPhone ?? null, status: r.status ?? null })),
      counts: counts(marked), marked: marked.length > 0,
    }
  }

  const putAttendance = async ({ user, org, params, body }) => {
    const b = await body()
    const today = orgClock(org).date
    const d = date(b.date ?? today, 'date', { required: true })
    const c = ctx.svc.classAccess(user, params.id, { dateStr: d })
    if (d > today) throw bad('date', 'tidak boleh menandakan kehadiran untuk masa depan')
    if (!can(user.role, 'attendance:any') && d < addDays(today, -7)) throw new HttpError(403, 'TOO_OLD', 'Guru hanya boleh mengemas kini kehadiran sehingga 7 hari ke belakang')
    const def = b.defaultStatus !== undefined ? oneOf(b.defaultStatus, 'defaultStatus', STATUSES, { required: true }) : null
    const records = list(b.records, 'records', { max: 500 }).map((r) => ({ studentId: str(r?.studentId, 'records[].studentId', { required: true, max: 64 }), status: oneOf(r?.status, 'records[].status', STATUSES, { required: true }) }))
    const roster = q('SELECT id FROM students WHERE class_id=? AND active=1').all(c.id).map((r) => r.id)
    const valid = new Set(roster)
    for (const r of records) if (!valid.has(r.studentId)) throw bad('records', `pelajar ${r.studentId} bukan dalam kelas ini`)
    if (!records.length && !def) throw bad('records', 'hantar records atau defaultStatus')
    const final = new Map(records.map((r) => [r.studentId, r.status]))
    if (def) for (const id of roster) if (!final.has(id)) final.set(id, def)
    tx(() => {
      const now = Date.now()
      for (const [sid, status] of final) q('INSERT OR REPLACE INTO attendance (org_id,class_id,student_id,date,status,marked_by,marked_at) VALUES (?,?,?,?,?,?,?)').run(org.id, c.id, sid, d, status, user.id, now)
      log(user, `Marked attendance for ${c.name}`)
    })
    return getAttendance({ user, org, params, query: new URLSearchParams({ date: d }) })
  }

  /** Statistik kehadiran organisasi untuk julat tarikh. */
  ctx.svc.attendanceStats = (org, from, to, { branchId, departmentId } = {}) => {
    const where = ['a.org_id=?', 'a.date>=?', 'a.date<=?'], args = [org.id, from, to]
    if (branchId) { where.push('c.branch_id=?'); args.push(branchId) }
    if (departmentId) { where.push('t.department_id=?'); args.push(departmentId) }
    const base = `FROM attendance a JOIN classes c ON c.id=a.class_id LEFT JOIN teachers t ON t.id=c.teacher_id WHERE ${where.join(' AND ')}`
    const total = q(`SELECT COUNT(*) n, SUM(a.status<>'Absent') att, SUM(a.status='Present') p, SUM(a.status='Absent') ab, SUM(a.status='Late') l ${base}`).get(...args)
    const trend = q(`SELECT a.date, COUNT(*) n, SUM(a.status<>'Absent') att ${base} GROUP BY a.date ORDER BY a.date`).all(...args)
    const perClass = q(`SELECT c.id, c.name, t.name teacher, COUNT(*) n, SUM(a.status<>'Absent') att, SUM(a.status='Absent') ab, SUM(a.status='Late') l ${base} GROUP BY c.id ORDER BY c.name`).all(...args)
    return {
      rate: pct(total.att, total.n), present: total.p ?? 0, absent: total.ab ?? 0, late: total.l ?? 0, records: total.n,
      trend: trend.map((t) => ({ date: t.date, label: dayName(t.date), rate: pct(t.att, t.n) })),
      classes: perClass.map((c) => ({ id: c.id, name: c.name, teacher: c.teacher, rate: pct(c.att, c.n), absent: c.ab, late: c.l })),
    }
  }

  const attendanceOverview = ({ org, query }) => {
    const today = orgClock(org).date
    const to = date(query.get('to') ?? today, 'to', { required: true })
    const from = date(query.get('from') ?? addDays(to, -13), 'from', { required: true })
    if (from > to) throw bad('from', 'mesti sebelum atau sama dengan to')
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) throw bad('from', 'julat maksimum 366 hari')
    const stats = ctx.svc.attendanceStats(org, from, to, { branchId: query.get('branch') ? ref('branches', org.id, query.get('branch'), 'branch') : undefined })
    const dayN = dayName(today)
    const holiday = settingsOf(org).holidays !== false && ctx.svc.holidayOn ? ctx.svc.holidayOn(org.id, today) : null
    const markedToday = new Set(q('SELECT DISTINCT class_id FROM attendance WHERE org_id=? AND date=?').all(org.id, today).map((r) => r.class_id))
    const scheduled = holiday ? [] : q(`SELECT DISTINCT c.id, c.name, t.name teacher FROM sessions s JOIN classes c ON c.id=s.class_id LEFT JOIN teachers t ON t.id=c.teacher_id WHERE s.org_id=? AND s.day=? AND c.status='Active'`).all(org.id, dayN)
    return { from, to, target: settingsOf(org).attendanceTarget, ...stats, holiday, today: { date: today, scheduledClasses: scheduled.length, marked: scheduled.filter((c) => markedToday.has(c.id)).length, pending: scheduled.filter((c) => !markedToday.has(c.id)).map((c) => ({ id: c.id, name: c.name, teacher: c.teacher })) } }
  }

  return [
    ['GET', '/v1/timetable', timetable],
    ['GET', '/v1/timetable/live', live, { perm: 'directory:read' }],
    ['GET', '/v1/timetable/conflicts', ({ org }) => ({ items: ctx.svc.allConflicts(org.id) }), { perm: 'directory:read' }],
    ['GET', '/v1/timetable/substitutions', listSubstitutions, { perm: 'directory:read' }],
    ['PUT', '/v1/timetable/sessions/:id/substitute', putSubstitute, { perm: 'timetable:manage' }],
    ['DELETE', '/v1/timetable/sessions/:id/substitute', delSubstitute, { perm: 'timetable:manage' }],
    ['POST', '/v1/timetable/sessions', addSession, { perm: 'timetable:manage' }],
    ['PATCH', '/v1/timetable/sessions/:id', patchSession, { perm: 'timetable:manage' }],
    ['DELETE', '/v1/timetable/sessions/:id', delSession, { perm: 'timetable:manage' }],
    ['POST', '/v1/timetable/sessions/:id/cancel', cancelSession, { perm: 'timetable:manage' }],
    ['DELETE', '/v1/timetable/sessions/:id/cancel', restoreSession, { perm: 'timetable:manage' }],
    ['GET', '/v1/classes/:id/attendance', getAttendance, { perm: 'attendance:own' }],
    ['PUT', '/v1/classes/:id/attendance', putAttendance, { perm: 'attendance:own' }],
    ['GET', '/v1/attendance/overview', attendanceOverview, { perm: 'directory:read' }],
  ]
}
