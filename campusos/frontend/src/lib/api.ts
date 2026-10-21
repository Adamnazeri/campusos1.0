import type {
  ExamResults, ClassResultsReport, StudentReport, ClassSubject, SubjectRow, Teacher, ClassRow, Room, LeaveReq, Task, Announce, Assignment, Exam, LiveClass, Session, Student, Holiday, SubstitutionItem,
} from './data'
import { ago, fmtDay, fmtMonYear, fmtSchedule } from './format'
import { t } from './i18n'
import { friendlyError } from './errors'
import { EMPTY } from './empty.ts'

/** Dalam development, Vite mem-proxy /v1 ke backend (lihat vite.config.ts). */
const BASE: string = import.meta.env.VITE_API_URL ?? ''
const KEY = 'campusos.session'

export type ApiUser = {
  id: string; email: string; name: string
  role: 'owner' | 'admin' | 'academic' | 'coordinator' | 'teacher'
  roleLabel: string; teacherId: string | null; permissions: string[]; twoFactor: boolean
  /** organisasi mewajibkan 2FA dan akaun ini belum menyediakannya */
  twoFactorRequired?: boolean
  features?: { billing: boolean; mail?: boolean }
  org: { id: string; name: string; type: string; plan: string; planName: string; timezone: string }
}
export type Session_ = { user: ApiUser; accessToken: string; refreshToken: string }

export class ApiError extends Error {
  status: number
  code: string
  extra: Record<string, unknown>
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

// ---- sesi ------------------------------------------------------------------
let session: Session_ | null = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Session_ | null } catch { return null }
})()
export const getSession = () => session
export function setSession(s: Session_ | null) {
  session = s
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY) } catch { /* storan diblokir */ }
}
export type ImportResult = {
  kind: string; dryRun: boolean; total: number; ok: number; errors: number; created: number
  results: { line: number; status: 'ok' | 'error'; message?: string; note?: string }[]
  emailed?: boolean; emailError?: string; invites?: { email: string; name: string; token: string }[]
}
export const isManagement = (u: ApiUser | null) => !!u && u.role !== 'teacher'

// ---- request -----------------------------------------------------------------
let refreshing: Promise<boolean> | null = null
async function refresh(): Promise<boolean> {
  if (!session) return false
  refreshing ??= (async () => {
    try {
      const r = await fetch(`${BASE}/v1/auth/refresh`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: session!.refreshToken }),
      })
      if (!r.ok) return false
      setSession((await r.json()) as Session_)
      return true
    } catch { return false } finally { refreshing = null }
  })()
  return refreshing
}

export async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'NETWORK', t('Cannot reach the server. Check your connection and try again.'))
  }
  if (res.status === 401 && retry && session && (await refresh())) return request<T>(method, path, body, false)
  if (res.status === 401 && session && retry) { setSession(null); window.dispatchEvent(new Event('campusos:signout')) }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error ?? {}
    throw new ApiError(res.status, e.code ?? 'ERROR', friendlyError(e.code ?? 'ERROR', e.message ?? '', res.status), e)
  }
  return data as T
}
const get = <T,>(p: string) => request<T>('GET', p)
const post = <T,>(p: string, b?: unknown) => request<T>('POST', p, b ?? {})
const patch = <T,>(p: string, b: unknown) => request<T>('PATCH', p, b)
const del = <T,>(p: string) => request<T>('DELETE', p)
const put = <T,>(p: string, b: unknown) => request<T>('PUT', p, b)

// ---- pemformatan untuk UI: lihat format.ts ----
export { fmtDay, fmtMonYear, fmtSchedule, monthOf, ago, hhmm, whatsappUrl } from './format'

// ---- adapter: bentuk API → jenis dalam data.ts ------------------------------------
// Bentuk respons API tidak ditaip secara terperinci; `any` supaya pemanggil boleh menganotasi item (mis. (b: {id: string}) => …)
type R = any // eslint-disable-line @typescript-eslint/no-explicit-any
export const toTeacher = (t: R): Teacher => ({
  id: t.id, name: t.name, email: t.email, department: t.department ?? EMPTY, subjects: t.subjects ?? [], branch: t.branch ?? EMPTY,
  hours: t.hours, classes: t.classes, status: t.status, attendanceRate: t.attendanceRate, role: t.role,
  phone: t.phone ?? EMPTY, joined: fmtMonYear(t.joined),
})
export const toClass = (c: R): ClassRow => ({
  subjects: (c.subjects ?? []) as ClassSubject[],
  id: c.id, name: c.name, teacher: c.teacher ?? EMPTY, students: c.students, schedule: fmtSchedule(c.schedule), room: c.room ?? EMPTY,
  attendance: c.attendance ?? 0, status: c.status, subject: c.subject ?? EMPTY, branch: c.branch ?? EMPTY,
})
export const toRoom = (r: R): Room => ({ id: r.id, name: r.name, capacity: r.capacity, status: r.status, building: r.building ?? EMPTY, type: r.type, utilization: r.utilization })
export const toLeave = (l: R): LeaveReq => ({ id: l.id, teacher: l.teacher, type: l.type, from: fmtDay(l.from), to: fmtDay(l.to), days: l.days, reason: l.reason ?? '', status: l.status })
export const toTask = (tr_: R): Task => ({ id: tr_.id, title: tr_.title, assignee: tr_.assignee ?? t('Unassigned'), due: fmtDay(tr_.due), priority: tr_.priority, status: tr_.status })
export const toAnnounce = (a: R): Announce => ({ id: a.id, title: a.title, body: a.body, audience: a.audience, author: a.author, time: ago(a.createdAt), tag: a.tag, read: a.read })
export const toAssignment = (a: R): Assignment => ({ id: a.id, title: a.title, className: a.className, teacher: a.teacher ?? EMPTY, subject: a.subject ?? EMPTY, due: fmtDay(a.due), submitted: a.submitted, total: a.total, status: a.status })
export const toExam = (e: R): Exam & { rawDate: string } => ({ id: e.id, title: e.title, classId: e.classId, className: e.className, subject: e.subject ?? EMPTY, date: fmtDay(e.date), rawDate: e.date, time: e.time, room: e.room ?? EMPTY, invigilator: e.invigilator ?? EMPTY, status: e.status, maxMark: e.maxMark ?? 100, passPct: e.passPct ?? 40, resultsEntered: e.resultsEntered ?? 0, classStudents: e.classStudents ?? 0 })
export const toLive = (i: R): LiveClass => ({ id: i.id, subject: i.subject ?? EMPTY, room: i.room ?? EMPTY, teacher: i.teacher ?? EMPTY, className: i.className, time: i.time, state: i.state, substituteTeacher: i.substituteTeacher ?? null, needsRelief: !!i.needsRelief })
export const toSession = (s: R): Session => ({ id: s.id, day: s.day, slot: s.start, subject: s.subject ?? EMPTY, className: s.className, teacher: s.teacher ?? EMPTY, room: s.room ?? EMPTY, span: Math.max(1, Math.round(s.duration / 60)), classId: s.classId, roomId: s.roomId, duration: s.duration })
export const toStudent = (s: R): Student => ({ id: s.id, name: s.name, status: s.status ?? null, studentCode: s.studentCode ?? null, guardianName: s.guardianName ?? null, guardianPhone: s.guardianPhone ?? null, guardianEmail: s.guardianEmail ?? null, notes: s.notes ?? null })

// ---- endpoint -------------------------------------------------------------------------
export const api = {
  login: (email: string, password: string, code?: string) => post<Session_>('/v1/auth/login', { email, password, code }),
  signupOrg: (b: unknown) => post<Session_ & { invites: { email: string; role: string; token?: string }[] }>('/v1/auth/signup-org', b),
  acceptInvite: (token: string, password: string, name?: string) => post<Session_>('/v1/auth/accept-invite', { token, password, name }),
  forgotPassword: (email: string) => post<{ message: string }>('/v1/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) => post<{ ok: true }>('/v1/auth/reset-password', { token, password }),
  logout: () => post<void>('/v1/auth/logout', { refreshToken: session?.refreshToken }).catch(() => undefined),
  me: () => get<ApiUser>('/v1/me'),
  pushConfig: () => get<{ enabled: boolean; publicKey: string | null }>('/v1/push/config'),
  pushSubscribe: (b: unknown) => post<{ subscribed: boolean }>('/v1/push/subscribe', b),
  pushUnsubscribe: (endpoint: string) => post<void>('/v1/push/unsubscribe', { endpoint }),
  pushPrefs: (b: unknown) => patch<{ ok: boolean }>('/v1/push/prefs', b),
  pushTest: (lang: string) => post<{ devices: number; sent: number }>('/v1/push/test', { lang }),

  overview: () => get<R>('/v1/overview'),
  live: () => get<R>('/v1/timetable/live'),
  timetable: () => get<R>('/v1/timetable'),
  substitutions: (date?: string) => get<{ date: string; day: string; onLeaveTeachers: R[]; items: SubstitutionItem[]; counts: { total: number; covered: number; uncovered: number } }>(`/v1/timetable/substitutions${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  assignSubstitute: (sessionId: string, b: { date: string; substituteTeacherId: string; note?: string }) => put<R>(`/v1/timetable/sessions/${sessionId}/substitute`, b),
  removeSubstitute: (sessionId: string, date: string) => del<void>(`/v1/timetable/sessions/${sessionId}/substitute?date=${encodeURIComponent(date)}`),
  addSession: (b: unknown, force = false) => post<R>(`/v1/timetable/sessions${force ? '?force=1' : ''}`, b),
  patchSession: (id: string, b: unknown, force = false) => patch<R>(`/v1/timetable/sessions/${id}${force ? '?force=1' : ''}`, b),
  deleteSession: (id: string) => del<void>(`/v1/timetable/sessions/${id}`),
  cancelSession: (id: string, date?: string, reason?: string) => post<R>(`/v1/timetable/sessions/${id}/cancel`, { date, reason }),
  attendanceOverview: () => get<R>('/v1/attendance/overview'),
  classAttendance: (id: string, date?: string) => get<R>(`/v1/classes/${id}/attendance${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  putAttendance: (id: string, b: unknown) => request<R>('PUT', `/v1/classes/${id}/attendance`, b),
  workload: () => get<R>('/v1/teachers/workload'),
  analytics: (range: string) => get<R>(`/v1/analytics?range=${range}`),
  activity: () => get<{ items: R[] }>('/v1/activity?limit=30'),

  teachers: () => get<{ items: R[] }>('/v1/teachers?limit=500'),
  addTeacher: (b: unknown) => post<R>('/v1/teachers', b),
  patchTeacher: (id: string, b: unknown) => patch<R>(`/v1/teachers/${id}`, b),
  archiveTeacher: (id: string) => del<void>(`/v1/teachers/${id}`),
  teacher: (id: string) => get<R>(`/v1/teachers/${id}`),
  classes: () => get<{ items: R[] }>('/v1/classes'),
  addClass: (b: unknown) => post<R>('/v1/classes', b),
  patchClass: (id: string, b: unknown) => patch<R>(`/v1/classes/${id}`, b),
  archiveClass: (id: string) => del<void>(`/v1/classes/${id}`),
  classDetail: (id: string) => get<R>(`/v1/classes/${id}`),
  promoteStudents: (b: { fromClassId: string; toClassId?: string; studentIds?: string[]; graduate?: boolean; academicYear?: string; term?: string }) =>
    post<{ moved: number; graduated: boolean; fromClassId: string; fromClassName: string; toClassId: string | null; toClassName: string | null }>('/v1/classes/promote', b),
  addStudents: (classId: string, names: string[], students?: { name: string; studentCode?: string; guardianName?: string; guardianPhone?: string; guardianEmail?: string; notes?: string }[]) =>
    post<R>('/v1/students', students ? { classId, students } : { classId, names }),
  patchStudent: (id: string, b: unknown) => patch<R>(`/v1/students/${id}`, b),
  removeStudent: (id: string, purge = false) => del<void>(`/v1/students/${id}${purge ? '?purge=1' : ''}`),
  exportStudent: (id: string) => get<R>(`/v1/students/${id}/export`),
  rooms: () => get<{ items: R[] }>('/v1/rooms'),
  addRoom: (b: unknown) => post<R>('/v1/rooms', b),
  patchRoom: (id: string, b: unknown) => patch<R>(`/v1/rooms/${id}`, b),
  deleteRoom: (id: string) => del<void>(`/v1/rooms/${id}`),

  assignments: () => get<{ items: R[] }>('/v1/assignments'),
  addAssignment: (b: unknown) => post<R>('/v1/assignments', b),
  patchAssignment: (id: string, b: unknown) => patch<R>(`/v1/assignments/${id}`, b),
  deleteAssignment: (id: string) => del<void>(`/v1/assignments/${id}`),
  assignmentSubmissions: (id: string) => get<{ assignment: R; students: { id: string; name: string; studentCode: string | null; submitted: boolean; submittedAt: number | null }[] }>(`/v1/assignments/${id}/submissions`),
  saveSubmissions: (id: string, studentIds: string[], replace = true) => post<R>(`/v1/assignments/${id}/submissions`, { studentIds, replace }),
  exams: () => get<{ items: R[] }>('/v1/exams'),
  addExam: (b: unknown, force = false) => post<R>(`/v1/exams${force ? '?force=1' : ''}`, b),
  leave: () => get<{ items: R[] }>('/v1/leave'),
  leaveBalance: () => get<{ balances: R[] }>('/v1/leave/balance'),
  requestLeave: (b: unknown) => post<R>('/v1/leave', b),
  decideLeave: (id: string, status: 'Approved' | 'Rejected', note?: string) => post<R>(`/v1/leave/${id}/decide`, { status, note }),
  reopenLeave: (id: string) => post<R>(`/v1/leave/${id}/reopen`),
  tasks: () => get<{ items: R[] }>('/v1/tasks'),
  addTask: (b: unknown) => post<R>('/v1/tasks', b),
  advanceTask: (id: string) => post<R>(`/v1/tasks/${id}/advance`),
  announcements: () => get<{ items: R[]; unread: number }>('/v1/announcements'),
  announcementReach: () => get<{ items: { label: string; count: number }[] }>('/v1/announcements/reach'),
  addAnnouncement: (b: unknown) => post<R>('/v1/announcements', b),
  readAnnouncement: (id: string) => post<R>(`/v1/announcements/${id}/read`),
  reports: () => get<{ items: { id: string; title: string; desc: string }[] }>('/v1/reports'),
  reportJson: (id: string, params: Record<string, string> = {}) => get<R>(`/v1/reports/${id}?${new URLSearchParams(params)}`),
  settings: () => get<R>('/v1/org/settings'),
  patchSettings: (b: unknown) => patch<R>('/v1/org/settings', b),
  patchOrg: (b: unknown) => patch<R>('/v1/org', b),
  org: () => get<R>('/v1/org'),
  roles: () => get<R>('/v1/org/roles'),
  holidays: () => get<{ items: Holiday[] }>('/v1/holidays'),
  addHoliday: (b: { title: string; startDate: string; endDate?: string; type?: string }) => post<Holiday>('/v1/holidays', b),
  deleteHoliday: (id: string) => del<void>(`/v1/holidays/${id}`),
  addBranch: (name: string) => post<R>('/v1/branches', { name }),
  addDepartment: (name: string, branch?: string) => post<R>('/v1/departments', { name, branch }),
  billing: () => get<R>('/v1/billing'),
  changePlan: (plan: string) => post<R>('/v1/billing/plan', { plan }),
  twoFaSetup: () => post<{ secret: string; otpauthUrl: string }>('/v1/me/2fa/setup'),
  twoFaEnable: (code: string) => post<ApiUser & { recoveryCodes: string[] }>('/v1/me/2fa/enable', { code }),
  twoFaRecoveryCodes: (password: string, code: string) => post<{ recoveryCodes: string[] }>('/v1/me/2fa/recovery-codes', { password, code }),
  twoFaDisable: (password: string, code: string) => post<ApiUser>('/v1/me/2fa/disable', { password, code }),
  myDashboard: () => get<R>('/v1/me/dashboard'),
  users: () => get<{ items: { id: string; email: string; name: string; role: string; roleLabel: string; active: boolean; lastLoginAt: number | null }[] }>('/v1/users'),
  patchUser: (id: string, b: unknown) => patch<R>(`/v1/users/${id}`, b),
  resetUser2fa: (id: string) => post<void>(`/v1/users/${id}/reset-2fa`),
  invites: () => get<{ items: { id: string; email: string; role: string; expiresAt: number; emailStatus?: string | null; emailError?: string | null }[] }>('/v1/invites'),
  invite: (b: { email: string; role: string }) => post<{ email: string; role: string; emailed?: boolean; emailError?: string; token?: string }>('/v1/invites', b),
  deleteInvite: (id: string) => del<void>(`/v1/invites/${id}`),
  importRows: (kind: 'teachers' | 'classes' | 'students', body: { rows: Record<string, string>[]; dryRun?: boolean; invite?: boolean; classId?: string }) =>
    post<ImportResult>(`/v1/import/${kind}`, body),
  examResults: (id: string) => get<ExamResults>(`/v1/exams/${id}/results`),
  saveExamResults: (id: string, results: { studentId: string; mark: number | null; absent: boolean; remarks?: string }[]) => put<ExamResults>(`/v1/exams/${id}/results`, { results }),
  completeExam: (id: string) => post<ExamResults>(`/v1/exams/${id}/complete`),
  reopenExam: (id: string) => post<ExamResults>(`/v1/exams/${id}/reopen`),
  classResults: (id: string) => get<ClassResultsReport>(`/v1/classes/${id}/results`),
  studentReport: (id: string) => get<StudentReport>(`/v1/students/${id}/results`),
  subjects: () => get<{ items: SubjectRow[] }>('/v1/subjects'),
  addSubject: (b: { name: string; code?: string }) => post<SubjectRow>('/v1/subjects', b),
  patchSubject: (id: string, b: { name?: string; code?: string }) => patch<SubjectRow>(`/v1/subjects/${id}`, b),
  deleteSubject: (id: string) => del<void>(`/v1/subjects/${id}`),
  assignSubject: (classId: string, b: { subject: string; teacher?: string | null; periodsPerWeek?: number }) => post<ClassSubject>(`/v1/classes/${classId}/subjects`, b),
  patchClassSubject: (id: string, b: { teacher?: string | null; periodsPerWeek?: number }) => patch<ClassSubject>(`/v1/class-subjects/${id}`, b),
  removeClassSubject: (id: string) => del<void>(`/v1/class-subjects/${id}`),
  branches: () => get<{ items: R[] }>('/v1/branches'),
  departments: () => get<{ items: R[] }>('/v1/departments'),
}

/** Muat turun laporan CSV (perlu header Authorization, jadi tidak boleh pakai <a href>). */
export async function downloadReport(id: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, format: 'csv' })
  const res = await fetch(`${BASE}/v1/reports/${id}?${qs}`, { headers: { authorization: `Bearer ${session?.accessToken ?? ''}` } })
  if (!res.ok) throw new ApiError(res.status, 'ERROR', t('Could not generate the report'))
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: `${id}-report.csv` })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
