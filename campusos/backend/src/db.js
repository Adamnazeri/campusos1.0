import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrateLegacyClassSubjects } from './curriculum.js'

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(`
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'School',
    contact_email TEXT, timezone TEXT NOT NULL DEFAULT 'GMT (UTC+0)',
    plan TEXT NOT NULL DEFAULT 'starter', settings TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, UNIQUE(org_id, name)
  );
  CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL, UNIQUE(org_id, name)
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
    role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_login_at INTEGER, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL COLLATE NOCASE, role TEXT NOT NULL, teacher_id TEXT, token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL, accepted_at INTEGER, created_by TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE, phone TEXT,
    department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'Teacher', subjects TEXT NOT NULL DEFAULT '[]',
    weekly_hours INTEGER NOT NULL DEFAULT 0, attendance_rate REAL NOT NULL DEFAULT 100,
    joined_at TEXT, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
    UNIQUE(org_id, email)
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 30, building TEXT, type TEXT NOT NULL DEFAULT 'Classroom',
    status TEXT NOT NULL DEFAULT 'Available', UNIQUE(org_id, name)
  );
  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL, subject TEXT, teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
    branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL, room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Active', created_at INTEGER NOT NULL, UNIQUE(org_id, name)
  );
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    class_id TEXT REFERENCES classes(id) ON DELETE SET NULL, name TEXT NOT NULL,
    student_code TEXT, guardian_name TEXT, guardian_phone TEXT, guardian_email TEXT, notes TEXT,
    active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    day TEXT NOT NULL, start_min INTEGER NOT NULL, duration INTEGER NOT NULL DEFAULT 60,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, subject TEXT,
    teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL, room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_day ON sessions(org_id, day, start_min);
  CREATE TABLE IF NOT EXISTS session_cancellations (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, date TEXT NOT NULL, reason TEXT,
    PRIMARY KEY (session_id, date)
  );
  CREATE TABLE IF NOT EXISTS session_substitutions (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, date TEXT NOT NULL,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    substitute_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
    note TEXT, created_by TEXT, created_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_subs_org_date ON session_substitutions(org_id, date);
  CREATE TABLE IF NOT EXISTS holidays (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Public Holiday', created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_holidays_org_dates ON holidays(org_id, start_date, end_date);
  CREATE TABLE IF NOT EXISTS attendance (
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL, status TEXT NOT NULL, marked_by TEXT, marked_at INTEGER NOT NULL,
    PRIMARY KEY (class_id, student_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(org_id, date);
  CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL, subject TEXT, due_date TEXT,
    status TEXT NOT NULL DEFAULT 'Draft', created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS submissions (
    assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    submitted_at INTEGER NOT NULL, PRIMARY KEY (assignment_id, student_id)
  );
  CREATE TABLE IF NOT EXISTS exams (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE, subject TEXT,
    date TEXT NOT NULL, time TEXT NOT NULL, room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    invigilator_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Scheduled', created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS leave_requests (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE, type TEXT NOT NULL,
    from_date TEXT NOT NULL, to_date TEXT NOT NULL, days INTEGER NOT NULL, reason TEXT,
    status TEXT NOT NULL DEFAULT 'Pending', decided_by TEXT, decided_at INTEGER, note TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL, assignee_id TEXT REFERENCES teachers(id) ON DELETE SET NULL, due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'Medium', status TEXT NOT NULL DEFAULT 'To Do',
    created_by TEXT, created_at INTEGER NOT NULL, completed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL, body TEXT NOT NULL, audience_type TEXT NOT NULL DEFAULT 'all', audience_value TEXT,
    tag TEXT NOT NULL DEFAULT 'General', status TEXT NOT NULL DEFAULT 'Published',
    author_id TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, read_at INTEGER NOT NULL,
    PRIMARY KEY (announcement_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT, actor TEXT, text TEXT NOT NULL, at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity ON activity(org_id, at);
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL, status TEXT NOT NULL, plan TEXT NOT NULL, issued_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY, org_id TEXT, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', error TEXT, created_at INTEGER NOT NULL, sent_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status, created_at);
  CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE, code TEXT, created_at INTEGER NOT NULL, UNIQUE(org_id, name)
  );
  CREATE TABLE IF NOT EXISTS class_subjects (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
    periods_per_week INTEGER NOT NULL DEFAULT 0, UNIQUE(class_id, subject_id)
  );
  CREATE INDEX IF NOT EXISTS idx_cs_class ON class_subjects(class_id);
  CREATE INDEX IF NOT EXISTS idx_cs_teacher ON class_subjects(teacher_id);
  CREATE TABLE IF NOT EXISTS exam_results (
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    mark REAL, absent INTEGER NOT NULL DEFAULT 0, remarks TEXT,
    entered_by TEXT, entered_at INTEGER NOT NULL, PRIMARY KEY (exam_id, student_id)
  );
  CREATE INDEX IF NOT EXISTS idx_results_student ON exam_results(student_id);
  CREATE TABLE IF NOT EXISTS recovery_codes (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL, used_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);
  CREATE TABLE IF NOT EXISTS app_kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    prefs TEXT NOT NULL DEFAULT '{}', lang TEXT NOT NULL DEFAULT 'ms', user_agent TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_ok_at INTEGER, fail_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);
  CREATE TABLE IF NOT EXISTS push_sent (key TEXT PRIMARY KEY, sent_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY, received_at INTEGER NOT NULL
  );
  `)
  // migrasi ringan untuk pangkalan data sedia ada
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
  if (!cols.includes('totp_secret')) db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT')
  if (!cols.includes('totp_enabled')) db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0')
  if (!cols.includes('totp_last_step')) db.exec('ALTER TABLE users ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0')
  const xcols = db.prepare('PRAGMA table_info(exams)').all().map((c) => c.name)
  if (!xcols.includes('max_mark')) db.exec('ALTER TABLE exams ADD COLUMN max_mark INTEGER NOT NULL DEFAULT 100')
  if (!xcols.includes('pass_pct')) db.exec('ALTER TABLE exams ADD COLUMN pass_pct INTEGER NOT NULL DEFAULT 40')
  const ecols = db.prepare('PRAGMA table_info(emails)').all().map((c) => c.name)
  if (!ecols.includes('attempts')) db.exec('ALTER TABLE emails ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0')
  const scols = db.prepare('PRAGMA table_info(students)').all().map((c) => c.name)
  if (!scols.includes('student_code')) db.exec('ALTER TABLE students ADD COLUMN student_code TEXT')
  if (!scols.includes('guardian_name')) db.exec('ALTER TABLE students ADD COLUMN guardian_name TEXT')
  if (!scols.includes('guardian_phone')) db.exec('ALTER TABLE students ADD COLUMN guardian_phone TEXT')
  if (!scols.includes('guardian_email')) db.exec('ALTER TABLE students ADD COLUMN guardian_email TEXT')
  if (!scols.includes('notes')) db.exec('ALTER TABLE students ADD COLUMN notes TEXT')
  migrateLegacyClassSubjects(db)
  return db
}
