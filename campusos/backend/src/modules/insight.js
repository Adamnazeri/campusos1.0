import { HttpError, toCsv } from '../http.js'
import { oneOf, date, bad, clock } from '../validate.js'
import { csvReply, orgClock, addDays, pct, round1, workloadStatus, dayName } from '../lib.js'

const REPORTS = [
  { id: 'att', title: 'Attendance Report', desc: 'Student & class attendance by period' },
  { id: 'wl', title: 'Teacher Workload Report', desc: 'Hours and class load per teacher' },
  { id: 'cls', title: 'Class Activity Report', desc: 'Assignments, exams and engagement' },
  { id: 'tt', title: 'Timetable Report', desc: 'Full schedule by teacher/room/class' },
  { id: 'room', title: 'Room Utilization Report', desc: 'Capacity and usage per space' },
  { id: 'leave', title: 'Leave Report', desc: 'Requests, approvals and balances' },
  { id: 'asg', title: 'Assignment Report', desc: 'Submission rates and outstanding work' },
  { id: 'exam', title: 'Exam Report', desc: 'Exam schedule and grading progress' },
]
const RANGE_DAYS = { week: 7, month: 30, term: 90 }

export function insightRoutes(ctx) {
  const { q, ref, settingsOf, teacherOf } = ctx

  // ---- beban kerja ------------------------------------------------------
  const scheduledHours = (orgId) => new Map(q('SELECT teacher_id, SUM(duration)/60.0 h FROM sessions WHERE org_id=? AND teacher_id IS NOT NULL GROUP BY teacher_id').all(orgId).map((r) => [r.teacher_id, round1(r.h)]))
  const workload = ({ org }) => {
    const sched = scheduledHours(org.id)
    const items = ctx.svc.teachers(org.id).map((t) => ({ id: t.id, name: t.name, department: t.department, branch: t.branch, hours: t.hours, scheduledHours: sched.get(t.id) ?? 0, classes: t.classes, status: t.status }))
    const mix = { Light: 0, Healthy: 0, Heavy: 0, Overloaded: 0 }
    items.forEach((t) => mix[t.status]++)
    const dept = new Map()
    items.forEach((t) => dept.set(t.department ?? 'Unassigned', (dept.get(t.department ?? 'Unassigned') ?? 0) + t.hours))
    return { items, summary: { total: items.length, avgHours: items.length ? round1(items.reduce((a, t) => a + t.hours, 0) / items.length) : 0, ...mix }, byDepartment: [...dept].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }
  }

  // ---- analitik -----------------------------------------------------------
  const rangeFor = (org, query) => {
    const range = oneOf(query.get('range') ?? 'term', 'range', Object.keys(RANGE_DAYS))
    const to = orgClock(org).date
    return { range, to, from: addDays(to, -(RANGE_DAYS[range] - 1)), days: RANGE_DAYS[range] }
  }
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  /** Pecahan sebenar daripada jadual kehadiran, tugasan, jadual & cuti. Tiada nilai tetap. */
  const breakdowns = (org, from, to, cur, asg) => {
    const byWeekday = q(`SELECT CAST(strftime('%w', date) AS INTEGER) d, COUNT(*) n, SUM(status<>'Absent') att FROM attendance WHERE org_id=? AND date>=? AND date<=? GROUP BY d`).all(org.id, from, to)
    const wk = new Map(byWeekday.map((r) => [r.d, pct(r.att, r.n)]))
    const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => wk.has(d))
    const completion = (rows, key) => {
      const m = new Map()
      for (const a of rows) { const k = key(a); const v = m.get(k) ?? { sub: 0, tot: 0 }; v.sub += a.submitted; v.tot += a.total; m.set(k, v) }
      return [...m].filter(([, v]) => v.tot > 0).map(([label, v]) => ({ label, value: pct(v.sub, v.tot) }))
    }
    const leave = q(`SELECT type label, SUM(days) value FROM leave_requests WHERE org_id=? AND status='Approved' AND to_date>=? AND from_date<=? GROUP BY type ORDER BY value DESC`).all(org.id, from, to)
    return {
      attendanceByWeekday: order.map((d) => ({ label: WEEKDAYS[d], value: wk.get(d) })),
      classesNeedingAttention: cur.classes.filter((c) => c.rate !== null).sort((a, b) => a.rate - b.rate || b.absent - a.absent).slice(0, 8),
      frequentAbsentees: q(`SELECT s.id, s.name, s.student_code studentCode, s.guardian_name guardianName, s.guardian_phone guardianPhone, c.name class_name, COUNT(*) n, SUM(a.status='Absent') ab, SUM(a.status='Late') late
        FROM attendance a JOIN students s ON s.id=a.student_id LEFT JOIN classes c ON c.id=s.class_id
        WHERE a.org_id=? AND a.date>=? AND a.date<=? AND s.active=1 GROUP BY s.id HAVING n>=3 AND ab>0 ORDER BY ab DESC, (ab*1.0/n) DESC, s.name LIMIT 10`)
        .all(org.id, from, to).map((r) => ({ id: r.id, name: r.name, class: r.class_name, absent: r.ab, late: r.late, records: r.n, rate: pct(r.n - r.ab, r.n), ...(r.studentCode ? { studentCode: r.studentCode } : {}), ...(r.guardianName ? { guardianName: r.guardianName } : {}), ...(r.guardianPhone ? { guardianPhone: r.guardianPhone } : {}) })),
      completionBySubject: completion(asg, (a) => a.subject || 'No subject').sort((x, y) => x.value - y.value),
      completionByClass: completion(asg, (a) => a.className).sort((x, y) => x.value - y.value).slice(0, 8),
      hoursBySubject: q(`SELECT subject label, SUM(duration) m FROM sessions WHERE org_id=? AND subject IS NOT NULL AND subject<>'' GROUP BY subject ORDER BY m DESC, subject`).all(org.id).map((r) => ({ label: r.label, value: round1(r.m / 60) })),
      leaveDaysByType: leave.map((r) => ({ label: r.label, value: r.value })),
      ...examStats(org, from, to),
      totals: {
        students: q('SELECT COUNT(*) c FROM students WHERE org_id=? AND active=1').get(org.id).c,
        attendanceRecords: cur.records,
        subjectsWithoutTeacher: q('SELECT COUNT(*) c FROM class_subjects WHERE org_id=? AND teacher_id IS NULL').get(org.id).c,
        classesWithoutSubjects: q("SELECT COUNT(*) c FROM classes c WHERE c.org_id=? AND c.status='Active' AND NOT EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id=c.id)").get(org.id).c,
      },
    }
  }
  /** Prestasi peperiksaan sebenar daripada markah yang dimasukkan (peperiksaan dalam tempoh). */
  const examStats = (org, from, to) => {
    const base = `FROM exam_results er JOIN exams e ON e.id=er.exam_id WHERE e.org_id=? AND e.date>=? AND e.date<=? AND er.mark IS NOT NULL`
    const bySubject = q(`SELECT e.subject label, AVG(er.mark*100.0/e.max_mark) v ${base} AND e.subject IS NOT NULL GROUP BY e.subject ORDER BY v`).all(org.id, from, to)
    const byClass = q(`SELECT c.name label, SUM(er.mark*100.0/e.max_mark>=e.pass_pct) p, COUNT(*) n ${base.replace('WHERE', 'JOIN classes c ON c.id=e.class_id WHERE')} GROUP BY c.id ORDER BY (p*1.0/n), c.name LIMIT 8`).all(org.id, from, to)
    const all = q(`SELECT SUM(er.mark*100.0/e.max_mark>=e.pass_pct) p, COUNT(*) n ${base}`).get(org.id, from, to)
    // purata markah setiap peperiksaan mengikut tarikh (untuk graf garis)
    const byExam = q(`SELECT e.id, e.date, e.title, e.subject, AVG(er.mark*100.0/e.max_mark) v, COUNT(*) n ${base} GROUP BY e.id ORDER BY e.date, e.title`).all(org.id, from, to)
    return {
      examAverageBySubject: bySubject.map((r) => ({ label: r.label, value: round1(r.v) })),
      examTrend: byExam.map((r) => ({ id: r.id, date: r.date, title: r.title, subject: r.subject, value: round1(r.v), marks: r.n })),
      examPassRateByClass: byClass.map((r) => ({ label: r.label, value: pct(r.p, r.n) })),
      examPassRate: pct(all.p ?? 0, all.n),
      examTotals: {
        marksEntered: all.n,
        examsWithMarks: q(`SELECT COUNT(DISTINCT e.id) c ${base}`).get(org.id, from, to).c,
        examsAwaitingMarks: q(`SELECT COUNT(*) c FROM exams e WHERE e.org_id=? AND e.date>=? AND e.date<=? AND e.date<=? AND NOT EXISTS (SELECT 1 FROM exam_results er WHERE er.exam_id=e.id AND er.mark IS NOT NULL)`).get(org.id, from, to, orgClock(org).date).c,
      },
    }
  }
  const analytics = ({ org, query }) => {
    const { range, from, to, days } = rangeFor(org, query)
    const cur = ctx.svc.attendanceStats(org, from, to)
    const prevTo = addDays(from, -1), prev = ctx.svc.attendanceStats(org, addDays(prevTo, -(days - 1)), prevTo)
    const rooms = ctx.svc.rooms(org)
    const asg = ctx.svc.assignments(org.id, { from, to }).filter((a) => a.status !== 'Draft')
    const sub = asg.reduce((a, x) => a + x.submitted, 0), tot = asg.reduce((a, x) => a + x.total, 0)
    const wl = workload({ org })
    return {
      range, from, to,
      attendance: { rate: cur.rate, previous: prev.rate, delta: cur.rate !== null && prev.rate !== null ? round1(cur.rate - prev.rate) : null, target: settingsOf(org).attendanceTarget },
      roomUtilization: rooms.length ? Math.round(rooms.reduce((a, r) => a + r.utilization, 0) / rooms.length) : 0,
      assignmentCompletion: pct(sub, tot),
      avgWorkload: wl.summary.avgHours,
      attendanceTrend: cur.trend,
      ...breakdowns(org, from, to, cur, asg),
      teacherStatusMix: { Healthy: wl.summary.Healthy, Heavy: wl.summary.Heavy, Overloaded: wl.summary.Overloaded, Light: wl.summary.Light, total: wl.summary.total },
      hoursByDepartment: wl.byDepartment,
    }
  }

  // ---- overview pengurusan --------------------------------------------------
  const overview = ({ user, org }) => {
    const clock0 = orgClock(org)
    const live = ctx.svc.live(org)
    const teachers = ctx.svc.teachers(org.id)
    const onLeave = new Set(q("SELECT teacher_id FROM leave_requests WHERE org_id=? AND status='Approved' AND from_date<=? AND to_date>=?").all(org.id, clock0.date, clock0.date).map((r) => r.teacher_id))
    const week = ctx.svc.attendanceStats(org, addDays(clock0.date, -6), clock0.date)
    const today = ctx.svc.attendanceStats(org, clock0.date, clock0.date)
    const classes = ctx.svc.classes(org)
    const markedToday = new Set(q('SELECT DISTINCT class_id FROM attendance WHERE org_id=? AND date=?').all(org.id, clock0.date).map((r) => r.class_id))
    const holiday = live.holiday ?? null
    const scheduled = holiday ? [] : q("SELECT DISTINCT c.id, c.name FROM sessions s JOIN classes c ON c.id=s.class_id WHERE s.org_id=? AND s.day=? AND c.status='Active'").all(org.id, clock0.day)
    const subsToday = ctx.svc.substitutionsForDate ? ctx.svc.substitutionsForDate(org, clock0.date) : { counts: { uncovered: 0, covered: 0 }, items: [] }
    return {
      date: clock0.date, day: clock0.day, holiday, user: { name: user.name, role: user.role },
      stats: {
        activeClasses: classes.length, branches: q('SELECT COUNT(*) c FROM branches WHERE org_id=?').get(org.id).c,
        teachers: teachers.length, teachersPresent: teachers.length - teachers.filter((t) => onLeave.has(t.id)).length, teachersOnLeave: onLeave.size,
        todaysClasses: live.totalToday, remainingToday: live.remainingToday,
        reliefNeeded: subsToday.counts.uncovered,
        attendance: { today: today.rate, week: week.rate, target: settingsOf(org).attendanceTarget },
      },
      live,
      conflicts: ctx.svc.allConflicts(org.id),
      attendancePending: scheduled.filter((c) => !markedToday.has(c.id)),
      workloadAlerts: teachers.filter((t) => t.status === 'Overloaded').map((t) => ({ id: t.id, name: t.name, hours: t.hours })),
      pendingLeave: q("SELECT COUNT(*) c FROM leave_requests WHERE org_id=? AND status='Pending'").get(org.id).c,
      tasksDueSoon: q("SELECT COUNT(*) c FROM tasks WHERE org_id=? AND status<>'Completed' AND due_date<=?").get(org.id, addDays(clock0.date, 2)).c,
      activity: q('SELECT actor, text, at FROM activity WHERE org_id=? ORDER BY at DESC LIMIT 10').all(org.id),
    }
  }
  const activity = ({ org, query }) => {
    const limit = Math.min(Math.max(Number(query.get('limit') ?? 30) || 30, 1), 200)
    return { items: q('SELECT actor, text, at FROM activity WHERE org_id=? ORDER BY at DESC LIMIT ?').all(org.id, limit) }
  }

  // ---- dashboard guru -------------------------------------------------------
  const myDashboard = ({ user, org }) => {
    const t = teacherOf(user)
    const now = orgClock(org)
    if (!t) return { teacher: null, today: { date: now.date, day: now.day, sessions: [] }, tasks: [], unreadAnnouncements: 0, leaveBalances: [], pendingLeave: 0 }
    const cancelled = new Set(q('SELECT session_id FROM session_cancellations WHERE date=?').all(now.date).map((r) => r.session_id))
    const marked = new Set(q('SELECT DISTINCT class_id FROM attendance WHERE org_id=? AND date=?').all(org.id, now.date).map((r) => r.class_id))
    const ownSessions = ctx.svc.sessions(org.id, { teacherId: t.id, day: now.day })
    // Sesi guru ganti (relief) yang ditugaskan kepada guru ini pada hari ini
    const reliefRows = q(`SELECT s.*, c.name class_name, orig.name original_teacher, r.name room
      FROM session_substitutions sub JOIN sessions s ON s.id=sub.session_id
      JOIN classes c ON c.id=s.class_id LEFT JOIN teachers orig ON orig.id=s.teacher_id LEFT JOIN rooms r ON r.id=s.room_id
      WHERE sub.org_id=? AND sub.date=? AND sub.substitute_teacher_id=? ORDER BY s.start_min`).all(org.id, now.date, t.id)
    const reliefSessions = reliefRows.map((s) => ({
      id: s.id, day: s.day, start: clock.fmt(s.start_min), end: clock.fmt(s.start_min + s.duration), duration: s.duration,
      classId: s.class_id, className: s.class_name, subject: s.subject, teacherId: t.id, teacher: t.name,
      roomId: s.room_id, room: s.room, isRelief: true, originalTeacher: s.original_teacher,
    }))
    const merged = [...ownSessions, ...reliefSessions].sort((a, b) => a.start.localeCompare(b.start))
    const sessions = merged.map((s) => {
      const st = clock.toMin(s.start), en = clock.toMin(s.end)
      const state = cancelled.has(s.id) ? 'cancelled' : en <= now.minutes ? 'done' : st <= now.minutes ? 'in-progress' : 'upcoming'
      return { ...s, state, attendanceMarked: marked.has(s.classId) }
    })
    const next = sessions.find((s) => s.state === 'in-progress') ?? sessions.find((s) => s.state === 'upcoming') ?? null
    const holiday = settingsOf(org).holidays !== false && ctx.svc.holidayOn ? ctx.svc.holidayOn(org.id, now.date) : null
    return {
      teacher: { id: t.id, name: t.name }, today: { date: now.date, day: now.day, holiday, sessions }, nextClass: next,
      classes: ctx.svc.classes(org, { teacherId: t.id }).map((c) => ({ id: c.id, name: c.name, subject: c.subject, students: c.students, attendance: c.attendance })),
      tasks: ctx.svc.tasks(org.id, { assigneeId: t.id }).filter((k) => k.status !== 'Completed').slice(0, 5),
      unreadAnnouncements: ctx.svc.announcementsFor(user).filter((a) => !a.read && a.status === 'Published').length,
      leaveBalances: ctx.svc.leaveBalances(org, t.id),
      pendingLeave: q("SELECT COUNT(*) c FROM leave_requests WHERE teacher_id=? AND status='Pending'").get(t.id).c,
    }
  }

  // ---- laporan ----------------------------------------------------------------
  const REPORT_BUILDERS = {
    att: ({ org, from, to, okClass, flt }) => {
      const s = ctx.svc.attendanceStats(org, from, to, flt)
      return { columns: [['class', 'Class'], ['teacher', 'Teacher'], ['rate', 'Attendance %'], ['absent', 'Absences'], ['late', 'Late']], rows: s.classes.filter(okClass).map((c) => ({ class: c.name, teacher: c.teacher, rate: c.rate, absent: c.absent, late: c.late })), summary: { rate: s.rate, present: s.present, absent: s.absent, late: s.late } }
    },
    wl: ({ org, okTeacher }) => {
      const w = workload({ org })
      return { columns: [['name', 'Teacher'], ['department', 'Department'], ['branch', 'Branch'], ['hours', 'Weekly hours'], ['scheduledHours', 'Scheduled hours'], ['classes', 'Classes'], ['status', 'Status']], rows: w.items.filter(okTeacher) }
    },
    cls: ({ org, from, to, okClass }) => {
      const asg = ctx.svc.assignments(org.id, { from, to }), exams = ctx.svc.exams(org.id, { from, to })
      return { columns: [['class', 'Class'], ['teacher', 'Teacher'], ['students', 'Students'], ['assignments', 'Assignments'], ['submissionRate', 'Submission %'], ['exams', 'Exams']], rows: ctx.svc.classes(org).filter((c) => okClass({ id: c.id })).map((c) => {
        const a = asg.filter((x) => x.classId === c.id && x.status !== 'Draft'), sub = a.reduce((n, x) => n + x.submitted, 0), tot = a.reduce((n, x) => n + x.total, 0)
        return { class: c.name, teacher: c.teacher, students: c.students, assignments: asg.filter((x) => x.classId === c.id).length, submissionRate: pct(sub, tot), exams: exams.filter((e) => e.classId === c.id).length }
      }) }
    },
    tt: ({ org, okClass }) => ({ columns: [['day', 'Day'], ['start', 'Start'], ['end', 'End'], ['className', 'Class'], ['subject', 'Subject'], ['teacher', 'Teacher'], ['room', 'Room']], rows: ctx.svc.sessions(org.id).filter((s) => okClass({ id: s.classId })) }),
    room: ({ org }) => ({ columns: [['name', 'Room'], ['building', 'Building'], ['type', 'Type'], ['capacity', 'Capacity'], ['utilization', 'Utilization %'], ['status', 'Status now']], rows: ctx.svc.rooms(org) }),
    leave: ({ org, from, to, okTeacher }) => ({ columns: [['teacher', 'Teacher'], ['type', 'Type'], ['from', 'From'], ['to', 'To'], ['days', 'Days'], ['status', 'Status'], ['reason', 'Reason']], rows: ctx.svc.leaveList(org.id, { from, to, limit: 5000 }).filter((l) => okTeacher({ id: l.teacherId })) }),
    asg: ({ org, from, to, okClass }) => ({ columns: [['title', 'Assignment'], ['className', 'Class'], ['teacher', 'Teacher'], ['due', 'Due'], ['submitted', 'Submitted'], ['total', 'Total'], ['rate', 'Submission %'], ['status', 'Status']], rows: ctx.svc.assignments(org.id, { from, to }).filter((a) => okClass({ id: a.classId })).map((a) => ({ ...a, rate: pct(a.submitted, a.total) })) }),
    exam: ({ org, from, to, okClass }) => ({ columns: [['title', 'Exam'], ['className', 'Class'], ['subject', 'Subject'], ['date', 'Date'], ['time', 'Time'], ['room', 'Room'], ['invigilator', 'Invigilator'], ['status', 'Status']], rows: ctx.svc.exams(org.id, { from, to }).filter((e) => okClass({ id: e.classId })) }),
  }

  const reportList = () => ({ items: REPORTS })
  const report = ({ org, params, query }) => {
    const meta = REPORTS.find((r) => r.id === params.type)
    if (!meta) throw new HttpError(404, 'NOT_FOUND', 'Jenis laporan tidak dikenali')
    const today = orgClock(org).date
    const from = date(query.get('from') ?? addDays(today, -30), 'from', { required: true })
    const to = date(query.get('to') ?? addDays(today, 30), 'to', { required: true })
    if (from > to) throw bad('from', 'mesti sebelum atau sama dengan to')
    const format = oneOf(query.get('format') ?? 'json', 'format', ['json', 'csv'])
    const branchId = query.get('branch') ? ref('branches', org.id, query.get('branch'), 'branch') : undefined
    const departmentId = query.get('department') ? ref('departments', org.id, query.get('department'), 'department') : undefined
    const tInfo = new Map(q('SELECT id, branch_id, department_id FROM teachers WHERE org_id=?').all(org.id).map((t) => [t.id, t]))
    const cInfo = new Map(q('SELECT id, branch_id, teacher_id FROM classes WHERE org_id=?').all(org.id).map((c) => [c.id, c]))
    const teacherPass = (t) => t && (!branchId || t.branch_id === branchId) && (!departmentId || t.department_id === departmentId)
    const okTeacher = (x) => (!branchId && !departmentId) || teacherPass(tInfo.get(x.id))
    const okClass = (x) => { if (!branchId && !departmentId) return true; const c = cInfo.get(x.id); return !!c && (!branchId || c.branch_id === branchId) && (!departmentId || teacherPass(tInfo.get(c.teacher_id))) }
    const built = REPORT_BUILDERS[meta.id]({ org, from, to, okTeacher, okClass, flt: { branchId, departmentId } })
    const columns = built.columns.map(([key, label]) => ({ key, label }))
    if (format === 'csv') return csvReply(`${meta.id}-report-${from}_${to}`, toCsv(columns, built.rows))
    return { id: meta.id, title: meta.title, from, to, generatedAt: Date.now(), columns, rows: built.rows, summary: built.summary ?? null, total: built.rows.length }
  }

  return [
    ['GET', '/v1/teachers/workload', workload, { perm: 'directory:read' }],
    ['GET', '/v1/analytics', analytics, { perm: 'directory:read' }],
    ['GET', '/v1/overview', overview, { perm: 'directory:read' }],
    ['GET', '/v1/activity', activity, { perm: 'directory:read' }],
    ['GET', '/v1/me/dashboard', myDashboard],
    ['GET', '/v1/reports', reportList, { perm: 'reports:read' }],
    ['GET', '/v1/reports/:type', report, { perm: 'reports:read' }],
  ]
}
