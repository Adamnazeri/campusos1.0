import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setLang } from '../src/lib/i18n.ts'
import { activityText, conflictText } from '../src/lib/activity.ts'

test('suapan aktiviti: English kekal, BM diterjemah, ayat tidak dikenali kekal asal', () => {
  setLang('en')
  assert.equal(activityText('Added branch East'), 'Added branch East')
  setLang('ms')
  assert.equal(activityText('Added branch East'), 'Menambah cawangan East')
  assert.equal(activityText('Added holiday "Hari Raya" (2026-03-30 to 2026-04-01)'), 'Menambah cuti "Hari Raya" (2026-03-30 hingga 2026-04-01)')
  assert.equal(activityText('Imported 12 students from CSV'), 'Mengimport 12 pelajar daripada CSV')
  assert.equal(activityText('Scheduled Maths on Mon 08:00'), 'Menjadualkan Maths pada Isn 08:00')
  assert.equal(activityText('Requested medical leave (3 days)'), 'Memohon cuti sakit (3 hari)')
  assert.equal(activityText('Entered marks for Mid-Term (Form 4A)'), 'Memasukkan markah untuk Mid-Term (Form 4A)')
  assert.equal(activityText('Resolved schedule conflict in Room 204'), 'Menyelesaikan konflik jadual di Room 204')
  assert.equal(activityText('Promoted 15 student(s) from Form 4A to Form 5A'), 'Menaikkan kelas 15 pelajar dari Form 4A ke Form 5A')
  assert.equal(activityText('Graduated 20 student(s) from Form 5A'), 'Menamatkan persekolahan 20 pelajar dari Form 5A')
  assert.equal(activityText('Sesuatu yang lain'), 'Sesuatu yang lain')
  assert.equal(conflictText('Room 204 double-booked Mon 09:00'), 'Room 204 ditempah bertindih pada Isn 09:00')
  setLang('en')
})
