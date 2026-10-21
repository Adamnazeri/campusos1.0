export const ROLES = ['owner', 'admin', 'academic', 'coordinator', 'teacher']
export const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', academic: 'Academic Mgr', coordinator: 'Coordinator', teacher: 'Teacher' }

const MGMT_ACADEMIC = ['owner', 'admin', 'academic']
const MGMT_ALL = ['owner', 'admin', 'academic', 'coordinator']

// permission -> peranan yang dibenarkan (selaras dengan jadual "Roles & permissions" di UI)
export const PERMS = {
  'org:manage': ['owner', 'admin'],
  'billing:manage': ['owner'],
  'users:manage': ['owner', 'admin'],
  'teachers:manage': MGMT_ACADEMIC,
  'classes:manage': MGMT_ACADEMIC,
  'rooms:manage': MGMT_ACADEMIC,
  'timetable:manage': MGMT_ACADEMIC,
  'exams:manage': MGMT_ACADEMIC,
  'leave:decide': MGMT_ACADEMIC,
  'reports:read': MGMT_ALL,
  'tasks:assign': MGMT_ALL,
  'announce:write': MGMT_ALL,
  'directory:read': MGMT_ALL, // senarai guru, beban kerja, analitik, overview
  'attendance:any': MGMT_ALL, // tandakan kehadiran kelas mana pun
  'attendance:own': ROLES, // semua peranan: guru untuk kelas sendiri
}

export const can = (role, perm) => PERMS[perm]?.includes(role) ?? false
export const isMgmt = (role) => role !== 'teacher'
export const permsOf = (role) => Object.keys(PERMS).filter((p) => can(role, p))

// baris yang dipaparkan di Settings > Roles & permissions
export const MATRIX_ROWS = [
  ['Attendance', 'attendance:own'], ['Timetable', 'timetable:manage'], ['Teachers', 'teachers:manage'],
  ['Reports', 'reports:read'], ['Billing', 'billing:manage'], ['Settings', 'org:manage'],
]

export const PLANS = {
  starter: { name: 'Starter', priceCents: 0, limits: { teachers: 10, classes: 25, branches: 1 } },
  growth: { name: 'Growth', priceCents: 14900, limits: { teachers: 100, classes: null, branches: 5 } },
  enterprise: { name: 'Enterprise', priceCents: null, limits: { teachers: null, classes: null, branches: null } },
}
