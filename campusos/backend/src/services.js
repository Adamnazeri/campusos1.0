import { HttpError } from './http.js'
import { newId, newToken, sha256 } from './security.js'
import { PLANS } from './perms.js'
import { DEFAULT_SETTINGS } from './lib.js'

export function usage(ctx, orgId) {
  const c = (sql) => ctx.q(sql).get(orgId).c
  return {
    teachers: c('SELECT COUNT(*) c FROM teachers WHERE org_id=? AND active=1'),
    classes: c("SELECT COUNT(*) c FROM classes WHERE org_id=? AND status='Active'"),
    branches: c('SELECT COUNT(*) c FROM branches WHERE org_id=?'),
  }
}

/** Lempar 402 jika menambah `adding` item akan melebihi had pelan (hanya bila BILLING_ENABLED=1). */
export function checkLimit(ctx, orgId, plan, kind, adding = 1) {
  if (!ctx.config.billingEnabled) return // had pelan hanya terpakai bila billing dihidupkan (satu sekolah = tiada had)
  const limit = PLANS[plan]?.limits[kind]
  if (limit === null || limit === undefined) return
  const used = usage(ctx, orgId)[kind]
  if (used + adding > limit)
    throw new HttpError(402, 'PLAN_LIMIT', `Pelan ${PLANS[plan].name} hanya membenarkan ${limit} ${kind}. Naik taraf pelan untuk menambah lagi.`, { kind, limit, used })
}

export function createInvite(ctx, { orgId, email, role, teacherId = null, createdBy = null }) {
  if (ctx.q('SELECT 1 FROM users WHERE email=?').get(email))
    throw new HttpError(409, 'EMAIL_TAKEN', `${email} sudah mempunyai akaun`)
  ctx.q('DELETE FROM invites WHERE org_id=? AND email=? AND accepted_at IS NULL').run(orgId, email)
  const token = newToken()
  ctx.q('INSERT INTO invites (id,org_id,email,role,teacher_id,token_hash,expires_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(newId(), orgId, email, role, teacherId, sha256(token), Date.now() + ctx.config.inviteTtlMs, createdBy, Date.now())
  const org = ctx.q('SELECT name FROM organizations WHERE id=?').get(orgId)
  ctx.mail.send({ orgId, to: email, subject: `You're invited to join ${org.name} on CampusOS`,
    text: `Hello,\n\nYou have been invited to join ${org.name} on CampusOS as ${role}.\n\nAccept the invitation and set your password:\n${ctx.config.appUrl}/?invite=${token}\n\nThis link is valid for 7 days. If you were not expecting this invitation you can ignore this email.\n\n(Anda dijemput menyertai ${org.name} di CampusOS. Klik pautan di atas untuk menetapkan kata laluan; sah selama 7 hari.)` })
  return token
}

/** Cuba hantar e-mel jemputan SEKARANG dan pulangkan keputusan sebenar (bukan sekadar "SMTP dikonfigurasi"). */
export const INVITE_SUBJECT_LIKE = "You're invited to join %"
export async function deliverInvite(ctx, orgId, email) {
  if (!ctx.mail.configured()) return { emailed: false, emailError: null }
  await ctx.mail.flush().catch(() => {})
  const d = ctx.mail.deliveryOf(orgId, email, INVITE_SUBJECT_LIKE)
  return { emailed: d?.status === 'sent', emailError: d?.status === 'failed' ? (d.error ?? 'Penghantaran gagal') : null }
}

export function insertTeacher(ctx, orgId, t) {
  const id = newId()
  try {
    ctx.q(`INSERT INTO teachers (id,org_id,name,email,phone,department_id,branch_id,title,subjects,weekly_hours,attendance_rate,joined_at,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, orgId, t.name, t.email, t.phone ?? null, t.department_id ?? null, t.branch_id ?? null,
      t.title ?? 'Teacher', JSON.stringify(t.subjects ?? []), t.weekly_hours ?? 0, t.attendance_rate ?? 100,
      t.joined_at ?? new Date().toISOString().slice(0, 10), Date.now())
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'EMAIL_TAKEN', `Guru dengan e-mel ${t.email} sudah wujud`)
    throw e
  }
  return id
}

export const defaultSettings = () => structuredClone(DEFAULT_SETTINGS)
