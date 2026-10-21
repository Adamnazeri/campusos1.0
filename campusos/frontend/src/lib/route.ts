// Penghalaan berasaskan hash (#/teachers, #/class-detail/abc). Supaya refresh, butang Back dan bookmark berfungsi.
// Fungsi tulen (tiada import). Diuji dalam tests/route.test.ts

export const MANAGEMENT_ROUTES = [
  'overview', 'timetable', 'attendance', 'workload', 'teachers', 'teacher-profile', 'classes', 'class-detail', 'subjects', 'rooms',
  'assignments', 'exams', 'leave', 'tasks', 'announcements', 'reports', 'analytics', 'settings', 'billing',
]
export const TEACHER_ROUTES = ['home', 'schedule', 'classes', 'tasks', 'more', 'exams', 'announcements', 'attendance', 'leave']

export type RouteState = { route: string; param?: string }

export const routesFor = (role: 'management' | 'teacher') => (role === 'management' ? MANAGEMENT_ROUTES : TEACHER_ROUTES)
export const homeFor = (role: 'management' | 'teacher') => (role === 'management' ? 'overview' : 'home')

export function buildHash(route: string, param?: string) {
  return `#/${route}${param ? `/${encodeURIComponent(param)}` : ''}`
}

/** Hash → laluan. Laluan yang tidak sah untuk peranan ini jatuh ke halaman utama. */
export function parseHash(hash: string, role: 'management' | 'teacher'): RouteState {
  const m = /^#\/([a-z-]+)(?:\/([^/?#]+))?/.exec(hash ?? '')
  if (!m || !routesFor(role).includes(m[1])) return { route: homeFor(role) }
  let param: string | undefined
  try { param = m[2] ? decodeURIComponent(m[2]) : undefined } catch { param = undefined }
  return { route: m[1], param }
}
