// Jenis data yang dipakai UI. (Data contoh/mock telah dibuang: semua data datang dari API.)
export type WorkloadStatus = 'Healthy' | 'Heavy' | 'Overloaded' | 'Light'

export type Teacher = {
  id: string
  name: string
  email: string
  department: string
  subjects: string[]
  branch: string
  hours: number
  classes: number
  status: WorkloadStatus
  attendanceRate: number
  role: string
  phone: string
  joined: string
}

/** Satu subjek yang diambil sebuah kelas, dan siapa yang mengajarnya */
export type ClassSubject = { id: string; classId: string; subjectId: string; subject: string; teacherId: string | null; teacher: string | null; periodsPerWeek: number }
export type SubjectRow = { id: string; name: string; code: string | null; classes: number; teachers: string[] }

export type ClassRow = {
  /** subjek yang diambil kelas ini (kelas ≠ subjek: lihat halaman Subjects) */
  subjects: ClassSubject[]
  id: string
  name: string
  teacher: string
  students: number
  schedule: string
  room: string
  attendance: number
  status: 'Active' | 'Archived'
  subject: string
  branch: string
}

export type Room = { id: string; name: string; capacity: number; status: 'Occupied' | 'Available' | 'Maintenance'; building: string; type: string; utilization: number }

export type LeaveReq = { id: string; teacher: string; type: string; from: string; to: string; days: number; reason: string; status: 'Pending' | 'Approved' | 'Rejected' }

export type Task = { id: string; title: string; assignee: string; due: string; priority: 'High' | 'Medium' | 'Low'; status: 'To Do' | 'In Progress' | 'Completed' }

export type Announce = { id: string; title: string; body: string; audience: string; author: string; time: string; tag: 'General' | 'Schedule' | 'Emergency' | 'Meeting'; read: boolean }

export type Assignment = { id: string; title: string; className: string; teacher: string; subject: string; due: string; submitted: number; total: number; status: 'Draft' | 'Published' | 'Completed' }

export type Exam = { id: string; title: string; classId: string; className: string; subject: string; date: string; time: string; room: string; invigilator: string; status: 'Scheduled' | 'Grading' | 'Completed'; maxMark: number; passPct: number; resultsEntered: number; classStudents: number }

/* Keputusan peperiksaan */
export type ResultRow = { studentId: string; name: string; mark: number | null; absent: boolean; remarks: string; pct: number | null; grade: string | null; passed: boolean | null }
export type ExamResults = {
  exam: { id: string; title: string; className: string; classId: string; subject: string | null; date: string; status: 'Scheduled' | 'Grading' | 'Completed'; maxMark: number; passPct: number }
  canEdit: boolean; scale: { grade: string; min: number }[]; students: ResultRow[]
  stats: { total: number; graded: number; absent: number; pending: number; average: number | null; highest: number | null; lowest: number | null; passRate: number | null; distribution: { grade: string; count: number }[] }
}
export type ClassResultsReport = {
  class: { id: string; name: string }; scale: { grade: string; min: number }[]
  exams: { id: string; title: string; subject: string | null; date: string; maxMark: number; status: string }[]
  students: { studentId: string; name: string; average: number | null; grade: string | null; cells: { examId: string; mark: number | null; absent: boolean; pct: number | null; grade: string | null }[] }[]
}
export type StudentReport = {
  student: { id: string; name: string; class: string | null }; scale: { grade: string; min: number }[]
  items: { examId: string; title: string; subject: string | null; date: string; mark: number | null; maxMark: number; absent: boolean; remarks: string | null; pct: number | null; grade: string | null; passed: boolean | null; rank: number | null; outOf: number; classAverage: number | null }[]
  summary: { exams: number; average: number | null; grade: string | null; subjects: { subject: string; average: number; grade: string | null }[] }
}

/* Kalendar cuti sekolah & cuti umum */
export type Holiday = { id: string; title: string; startDate: string; endDate: string; type: 'Public Holiday' | 'School Holiday' | 'Term Break' | 'Special Event'; days: number }

/* Sistem guru ganti (relief) */
export type SubstitutionItem = {
  sessionId: string; date: string; day: string; start: string; end: string; duration: number
  classId: string; className: string; subject: string | null; room: string | null
  originalTeacherId: string | null; originalTeacher: string | null; reason: string
  substituteTeacherId: string | null; substituteTeacher: string | null; note: string | null
  status: 'Covered' | 'Needs Relief'
  availableTeachers: { id: string; name: string; department: string | null; hours: number }[]
}

/* Live operations for management dashboard */
export type LiveClass = { id: string; subject: string; room: string; teacher: string; className: string; time: string; state: 'in-progress' | 'starting' | 'cancelled'; substituteTeacher?: string | null; needsRelief?: boolean }

/* Timetable grid */
export type Session = { id: string; day: string; slot: string; subject: string; className: string; teacher: string; room: string; span?: number; classId?: string; roomId?: string; duration?: number }

export type Student = {
  id: string; name: string; status: 'Present' | 'Absent' | 'Late' | null
  studentCode?: string | null; guardianName?: string | null; guardianPhone?: string | null; guardianEmail?: string | null; notes?: string | null
}
