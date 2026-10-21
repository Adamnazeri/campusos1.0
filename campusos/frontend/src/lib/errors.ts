// Pelayan mengembalikan mesej Bahasa Melayu. Padankan KOD ralat → mesej yang konsisten dalam bahasa UI (English / Bahasa Melayu melalui t()).
// Fungsi tulen (hanya bergantung pada lib/i18n, juga tulen). Diuji dalam tests/errors.test.ts
import { t } from './i18n.ts'
const BY_CODE: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  TOTP_REQUIRED: 'Enter the 6-digit code from your authenticator app (or a recovery code).',
  INVALID_TOTP: 'That verification code is not correct.',
  ACCOUNT_LOCKED: 'Too many failed attempts. Please try again in a few minutes.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  TWO_FACTOR_REQUIRED: 'Your organization requires two-factor authentication. Set it up to continue.',
  ALREADY_ENABLED: 'Two-factor authentication is already enabled.',
  NOT_ENABLED: 'Two-factor authentication is not enabled.',
  NO_SETUP: 'Start the two-factor setup first.',
  EMAIL_TAKEN: 'That email is already in use.',
  CODE_TAKEN: 'That student ID is already in use.',
  TEACHER_ON_LEAVE: 'That teacher is on approved leave on the selected date.',
  ALREADY_EXISTS: 'An item with that name already exists.',
  FORBIDDEN: 'You do not have permission to do that.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  INVALID_REFRESH: 'Your session has expired. Please sign in again.',
  INVALID_INVITE: 'This invitation is invalid or has expired.',
  INVALID_RESET: 'This reset link is invalid or has expired.',
  NOT_FOUND: 'We could not find that item. It may have been removed.',
  HAS_CLASSES: 'This teacher still has active classes. Reassign those classes first.',
  IN_USE: 'This item is still in use and cannot be removed.',
  CONFLICT: 'This clashes with something already scheduled.',
  OVERLAP: 'These dates overlap with an existing leave request.',
  PLAN_LIMIT: 'Your plan limit has been reached.',
  LAST_OWNER: 'There must be at least one active owner.',
  SELF_DEACTIVATE: 'You cannot deactivate your own account.',
  SELF_RESET: 'Use your own account settings to change your two-factor setup.',
  SELF_APPROVAL: 'You cannot approve your own leave request.',
  TOO_OLD: 'Teachers can only update attendance up to 7 days back.',
  PAYLOAD_TOO_LARGE: 'That request is too large.',
  INVALID_JSON: 'The request could not be understood.',
  INTERNAL: 'Something went wrong on the server. Please try again.',
  DB_UNAVAILABLE: 'The service is temporarily unavailable. Please try again shortly.',
  ALREADY_DECIDED: 'This request has already been decided.',
  INSUFFICIENT_BALANCE: 'Not enough leave balance for this request.',
  NOT_PUBLISHED: 'This assignment is still a draft.',
  ROOM_MAINTENANCE: 'That room is under maintenance.',
  SESSION_IDLE: 'Your session ended due to inactivity. Please sign in again.',
}

// "campo: wajib diisi" → "campo is required" dsb.
const VALIDATION: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/wajib diisi/, () => t('is required')],
  [/format tidak sah/, () => t('is not valid')],
  [/minimum (\d+) aksara/, (m) => t('must be at least {n} characters', { n: m[1] })],
  [/maksimum (\d+) aksara/, (m) => t('must be at most {n} characters', { n: m[1] })],
  [/terlalu panjang/, () => t('is too long')],
  [/mesti nombor bulat/, () => t('must be a whole number')],
  [/mesti antara (-?\d+) dan (-?\d+)/, (m) => t('must be between {a} and {b}', { a: m[1], b: m[2] })],
  [/format mesti YYYY-MM-DD/, () => t('must be a date (YYYY-MM-DD)')],
  [/format mesti HH:MM/, () => t('must be a time (HH:MM)')],
  [/mesti string/, () => t('must be text')],
]
const FIELD_LABELS: Record<string, string> = {
  name: 'Name', email: 'Email', password: 'Password', next: 'New password', orgName: 'Organization name', title: 'Title',
  capacity: 'Capacity', subject: 'Subject', date: 'Date', start: 'Start time', duration: 'Duration', names: 'Student names',
}

export function friendlyError(code: string, serverMessage: string, status = 0): string {
  if (code === 'VALIDATION_ERROR') {
    const m = /^([\w.[\]]+): (.*)$/.exec(serverMessage)
    if (m) {
      const rule = VALIDATION.find(([re]) => re.test(m[2]))
      const field = t(FIELD_LABELS[m[1]] ?? m[1])
      return rule ? `${field} ${rule[1](m[2].match(rule[0])!)}.` : `${field}: ${m[2]}`
    }
    return serverMessage
  }
  return code in BY_CODE ? t(BY_CODE[code]) : status >= 500 ? t(BY_CODE.INTERNAL) : serverMessage || t('Something went wrong.')
}
