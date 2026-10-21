// Pembaca CSV tulen (tiada import). Diuji dalam tests/csv.test.ts
export type ImportKind = 'teachers' | 'classes' | 'students'

/** Parse CSV: petikan "…", "" untuk petikan dalam teks, baris baharu dalam medan, BOM, pemisah , ; atau tab (Excel mengikut locale). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch: string) => (firstLine.match(new RegExp(ch === '\t' ? '\t' : `\\${ch}`, 'g')) ?? []).length
  const delim = [',', ';', '\t'].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1])[0]
  const sep = delim[1] > 0 ? delim[0] : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ''))
}

const norm = (h: string) => h.toLowerCase().replace(/[\s_\-.]+/g, '')
// pengepala yang diterima (English + Bahasa Melayu) → medan API
const ALIASES: Record<ImportKind, Record<string, string[]>> = {
  teachers: {
    name: ['name', 'fullname', 'teacher', 'teachername', 'nama', 'namaguru'],
    email: ['email', 'emel', 'workemail', 'emailaddress', 'e-mel'],
    phone: ['phone', 'mobile', 'telephone', 'tel', 'telefon', 'notelefon', 'nofon'],
    department: ['department', 'dept', 'jabatan'],
    branch: ['branch', 'campus', 'cawangan'],
    title: ['title', 'role', 'position', 'jawatan'],
    weeklyHours: ['weeklyhours', 'hours', 'hoursperweek', 'jamseminggu', 'jam'],
    subjects: ['subjects', 'subject', 'subjek', 'matapelajaran'],
  },
  classes: {
    name: ['name', 'class', 'classname', 'kelas', 'namakelas'],
    classTeacher: ['classteacher', 'teacher', 'homeroom', 'homeroomteacher', 'gurukelas', 'guru'],
    room: ['room', 'bilik'],
    branch: ['branch', 'campus', 'cawangan'],
  },
  students: {
    name: ['name', 'student', 'studentname', 'fullname', 'nama', 'namapelajar', 'namamurid'],
    class: ['class', 'classname', 'kelas', 'form', 'tingkatan'],
    studentCode: ['studentcode', 'studentid', 'id', 'code', 'matric', 'nomatrik', 'nokp', 'mykid', 'ic', 'idpelajar', 'nopelajar'],
    guardianName: ['guardianname', 'guardian', 'parent', 'parentname', 'namapenjaga', 'penjaga', 'ibubapa', 'waris', 'namawaris'],
    guardianPhone: ['guardianphone', 'parentphone', 'phone', 'telefonpenjaga', 'notelwaris', 'telefonwaris', 'telefon', 'notelefon'],
    guardianEmail: ['guardianemail', 'parentemail', 'emelpenjaga', 'emelwaris'],
  },
}
export const FIELD_LABELS: Record<ImportKind, Record<string, string>> = {
  teachers: { name: 'Name', email: 'Email', phone: 'Phone', department: 'Department', branch: 'Branch', title: 'Title', weeklyHours: 'Weekly hours', subjects: 'Subjects' },
  classes: { name: 'Name', classTeacher: 'Class teacher', room: 'Room', branch: 'Branch' },
  students: { name: 'Name', class: 'Class', studentCode: 'Student ID', guardianName: 'Guardian', guardianPhone: 'Guardian phone', guardianEmail: 'Guardian email' },
}

export type Mapped = { records: Record<string, string>[]; recognized: string[]; ignored: string[]; missing: string[] }
const REQUIRED: Record<ImportKind, string[]> = { teachers: ['name', 'email'], classes: ['name'], students: ['name'] }

/** Baris pertama = pengepala. Lajur yang tidak dikenali diabaikan (dilaporkan). */
export function mapRecords(rows: string[][], kind: ImportKind, opts: { optionalRequired?: string[] } = {}): Mapped {
  if (!rows.length) return { records: [], recognized: [], ignored: [], missing: REQUIRED[kind] }
  const header = rows[0]
  const lookup = new Map<string, string>()
  for (const [field, names] of Object.entries(ALIASES[kind])) for (const n of names) lookup.set(norm(n), field)
  const idxToField = header.map((h) => lookup.get(norm(h)) ?? null)
  const recognized = [...new Set(idxToField.filter((f): f is string => !!f))]
  const ignored = header.filter((_, i) => !idxToField[i] && header[i] !== '')
  const required = REQUIRED[kind].filter((f) => !(opts.optionalRequired ?? []).includes(f))
  const missing = required.filter((f) => !recognized.includes(f))
  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {}
    idxToField.forEach((f, i) => { if (f && r[i] !== undefined && !(f in rec)) rec[f] = r[i] })
    return rec
  })
  return { records, recognized, ignored, missing }
}

export function templateCsv(kind: ImportKind): string {
  const lines: Record<ImportKind, string[]> = {
    teachers: ['name,email,phone,department,branch,title,weeklyHours,subjects', 'Aminah Yusof,aminah@school.edu.my,012-3456789,Languages,,Teacher,20,Bahasa Melayu; English'],
    classes: ['name,classTeacher,room,branch', 'Form 4A,aminah@school.edu.my,Room 204,'],
    students: ['name,class,studentCode,guardianName,guardianPhone', 'Aisyah binti Rahman,Form 4A,SMK-2026-001,Rahman bin Ali,012-3456789'],
  }
  return lines[kind].join('\r\n') + '\r\n'
}

/** Jana CSV (dengan petikan yang betul). Mis. senarai pautan jemputan. */
export function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
