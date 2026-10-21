import { newId } from './security.js'

/**
 * Model kurikulum:
 *   classes        = kumpulan pelajar (cth. "Form 4A"); `teacher_id` = guru kelas (homeroom)
 *   subjects       = senarai subjek sekolah (cth. "Mathematics")
 *   class_subjects = kelas mana mengambil subjek apa, siapa yang mengajar, dan berapa waktu seminggu
 * Sesi jadual, tugasan & peperiksaan menyimpan nama subjek sebagai salinan (disegerakkan bila subjek dinamakan semula).
 */
export const cleanName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ')

export function ensureSubject(db, orgId, name) {
  const n = cleanName(name)
  const found = db.prepare('SELECT id FROM subjects WHERE org_id=? AND name=?').get(orgId, n)
  if (found) return found.id
  const id = newId()
  db.prepare('INSERT INTO subjects (id,org_id,name,created_at) VALUES (?,?,?,?)').run(id, orgId, n, Date.now())
  return id
}

export function linkClassSubject(db, { orgId, classId, subjectId, teacherId = null, periods = 0 }) {
  const id = newId()
  db.prepare('INSERT OR IGNORE INTO class_subjects (id,org_id,class_id,subject_id,teacher_id,periods_per_week) VALUES (?,?,?,?,?,?)')
    .run(id, orgId, classId, subjectId, teacherId, periods)
  return id
}

/**
 * Data lama menyimpan satu subjek terus pada kelas (classes.subject). Pindahkan ke subjects + class_subjects
 * (guru kelas lama menjadi guru subjek itu) dan kosongkan lajur lama supaya penghijrahan hanya berlaku sekali.
 */
export function migrateLegacyClassSubjects(db, orgId = null) {
  const rows = db.prepare(`SELECT id, org_id, subject, teacher_id FROM classes WHERE subject IS NOT NULL AND TRIM(subject)<>''${orgId ? ' AND org_id=?' : ''}`).all(...(orgId ? [orgId] : []))
  for (const c of rows) {
    const subjectId = ensureSubject(db, c.org_id, c.subject)
    linkClassSubject(db, { orgId: c.org_id, classId: c.id, subjectId, teacherId: c.teacher_id })
    db.prepare('UPDATE classes SET subject=NULL WHERE id=?').run(c.id)
  }
  return rows.length
}
