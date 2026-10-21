// Ayat suapan aktiviti dijana backend dalam English dan disimpan dalam DB; di sini ia diterjemah ke BM semasa paparan.
// Ayat yang tidak dikenali dipaparkan seperti asal. Fungsi tulen (bergantung pada lib/i18n sahaja).
import { getLang, t } from './i18n.ts'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const day = (s: string) => s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, (d) => t(d))
const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Created organization (.+)$/, (m) => `Mencipta organisasi ${m[1]}`],
  [/^Accepted invitation \((.+)\)$/, (m) => `Menerima jemputan (${t(m[1])})`],
  [/^Imported (\d+) (\w+) from CSV$/, (m) => `Mengimport ${m[1]} ${t(m[2])} daripada CSV`],
  [/^Updated organization settings$/, () => 'Mengemas kini tetapan organisasi'],
  [/^Updated school settings$/, () => 'Mengemas kini tetapan sekolah'],
  [/^Added holiday "(.+)" \((.+)\)$/, (m) => `Menambah cuti "${m[1]}" (${m[2].replace(' to ', ' hingga ')})`],
  [/^Removed holiday "(.+)"$/, (m) => `Membuang cuti "${m[1]}"`],
  [/^Added branch (.+)$/, (m) => `Menambah cawangan ${m[1]}`],
  [/^Removed branch (.+)$/, (m) => `Membuang cawangan ${m[1]}`],
  [/^Added department (.+)$/, (m) => `Menambah jabatan ${m[1]}`],
  [/^Added room (.+)$/, (m) => `Menambah bilik ${m[1]}`],
  [/^Removed room (.+)$/, (m) => `Membuang bilik ${m[1]}`],
  [/^Updated room (.+)$/, (m) => `Mengemas kini bilik ${m[1]}`],
  [/^Added subject (.+)$/, (m) => `Menambah subjek ${m[1]}`],
  [/^Updated subject (.+)$/, (m) => `Mengemas kini subjek ${m[1]}`],
  [/^Deleted subject (.+)$/, (m) => `Memadam subjek ${m[1]}`],
  [/^Added teacher (.+)$/, (m) => `Menambah guru ${m[1]}`],
  [/^Updated teacher (.+)$/, (m) => `Mengemas kini guru ${m[1]}`],
  [/^Archived teacher (.+)$/, (m) => `Mengarkibkan guru ${m[1]}`],
  [/^Added (\d+) student\(s\)$/, (m) => `Menambah ${m[1]} pelajar`],
  [/^Graduated (\d+) student\(s\) from (.+)$/, (m) => `Menamatkan persekolahan ${m[1]} pelajar dari ${m[2]}`],
  [/^Promoted (\d+) student\(s\) from (.+) to (.+)$/, (m) => `Menaikkan kelas ${m[1]} pelajar dari ${m[2]} ke ${m[3]}`],
  [/^Created class (.+)$/, (m) => `Mencipta kelas ${m[1]}`],
  [/^Updated class (.+)$/, (m) => `Mengemas kini kelas ${m[1]}`],
  [/^Archived class (.+)$/, (m) => `Mengarkibkan kelas ${m[1]}`],
  [/^Assigned (.+) to (.+)$/, (m) => `Menetapkan ${m[1]} kepada ${m[2]}`],
  [/^Assigned (.+) as relief teacher for (.+) on (.+)$/, (m) => `Menetapkan ${m[1]} sebagai guru ganti untuk ${m[2]} pada ${m[3]}`],
  [/^Removed relief teacher assignment on (.+)$/, (m) => `Membuang penetapan guru ganti pada ${m[1]}`],
  [/^Removed (.+) from a class$/, (m) => `Mengeluarkan ${m[1]} daripada kelas`],
  [/^Updated (.+) teacher for a class$/, (m) => `Mengemas kini guru ${m[1]} untuk sebuah kelas`],
  [/^Cancelled a session on (.+)$/, (m) => `Membatalkan sesi pada ${m[1]}`],
  [/^Removed a timetable session$/, () => 'Mengeluarkan satu sesi jadual waktu'],
  [/^Resolved schedule conflict in (.+)$/, (m) => `Menyelesaikan konflik jadual di ${m[1]}`],
  [/^Scheduled (.+) on (.+)$/, (m) => `Menjadualkan ${m[1]} pada ${day(m[2])}`],
  [/^Rescheduled (.+) to (.+)$/, (m) => `Menjadual semula ${m[1]} ke ${day(m[2])}`],
  [/^Scheduled exam (.+)$/, (m) => `Menjadualkan peperiksaan ${m[1]}`],
  [/^Changed plan to (.+)$/, (m) => `Menukar pelan kepada ${m[1]}`],
  [/^Completed task "(.+)"$/, (m) => `Menyiapkan tugas "${m[1]}"`],
  [/^Created task "(.+)"$/, (m) => `Mencipta tugas "${m[1]}"`],
  [/^Created assignment (.+)$/, (m) => `Mencipta tugasan ${m[1]}`],
  [/^Published assignment(?: \u2014|:) (.+)$/, (m) => `Menerbitkan tugasan: ${m[1]}`],
  [/^Published announcement "(.+)"$/, (m) => `Menerbitkan pengumuman "${m[1]}"`],
  [/^Entered marks for (.+)$/, (m) => `Memasukkan markah untuk ${m[1]}`],
  [/^Finalized results for (.+)$/, (m) => `Memuktamadkan keputusan untuk ${m[1]}`],
  [/^Reopened results for (.+)$/, (m) => `Membuka semula keputusan untuk ${m[1]}`],
  [/^Marked attendance for (.+)$/, (m) => `Merekod kehadiran untuk ${m[1]}`],
  [/^Invited (\S+) as (.+)$/, (m) => `Menjemput ${m[1]} sebagai ${t(m[2])}`],
  [/^Updated account (.+)$/, (m) => `Mengemas kini akaun ${m[1]}`],
  [/^Reset two-factor for (.+)$/, (m) => `Menetapkan semula dua faktor untuk ${m[1]}`],
  [/^Requested (.+) \((\d+) days?\)$/, (m) => `Memohon ${t(cap(m[1])).toLowerCase()} (${m[2]} hari)`],
  [/^Approved leave request for (.+)$/, (m) => `Meluluskan permohonan cuti untuk ${m[1]}`],
  [/^Rejected leave request for (.+)$/, (m) => `Menolak permohonan cuti untuk ${m[1]}`],
  [/^Reopened a leave request$/, () => 'Membuka semula permohonan cuti'],
  [/^Permanently erased a student record$/, () => 'Memadam rekod pelajar secara kekal'],
]

export function activityText(text: string): string {
  if (getLang() !== 'ms') return text
  for (const [re, fn] of RULES) { const m = text.match(re); if (m) return fn(m) }
  return text
}

/** Mesej konflik jadual dari backend: "<nama> double-booked Mon 08:00". */
export function conflictText(message: string): string {
  if (getLang() !== 'ms') return message
  const m = message.match(/^(.+) double-booked (\w{3}) (\d\d:\d\d)$/)
  return m ? `${m[1]} ditempah bertindih pada ${t(m[2])} ${m[3]}` : message
}
