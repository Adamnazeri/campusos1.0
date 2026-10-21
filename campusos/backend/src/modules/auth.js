import { HttpError, createFailureLimiter, createLimiter } from '../http.js'
import { signJwt, hashPassword, checkPassword, newToken, sha256, newId, newTotpSecret, totpMatchStep, sealSecret, openSecret, newRecoveryCodes, normalizeRecovery, looksLikeRecovery } from '../security.js'
import { str, int, oneOf, email as vEmail, password as vPassword, list, time, bad } from '../validate.js'
import { ROLES, ROLE_LABELS, permsOf, PLANS } from '../perms.js'
import { created, DAYS } from '../lib.js'
import { checkLimit, createInvite, insertTeacher, defaultSettings } from '../services.js'
import { ensureSubject, migrateLegacyClassSubjects } from '../curriculum.js'

const DUMMY_HASH = hashPassword('dummy-password-for-timing')
export const ORG_TYPES = ['School', 'University', 'College', 'Tuition Centre', 'Training Centre', 'Academy']
export const INVITE_ROLES = ROLES.filter((r) => r !== 'owner')

export function authRoutes(ctx) {
  const { q, tx, config } = ctx
  const authLimit = createLimiter(config.authRateMax, 60_000)
  const loginFails = createFailureLimiter(config.loginFailMax ?? 8, 15 * 60_000) // per akaun, bukan per IP
  const totpFails = createFailureLimiter(config.loginFailMax ?? 8, 15 * 60_000)
  const encKey = config.encryptionKey ?? config.jwtSecret

  const publicUser = (u) => {
    const org = q('SELECT * FROM organizations WHERE id=?').get(u.org_id)
    const t = q('SELECT id FROM teachers WHERE user_id=? AND active=1').get(u.id)
    return {
      id: u.id, email: u.email, name: u.name, role: u.role, roleLabel: ROLE_LABELS[u.role],
      teacherId: t?.id ?? null, permissions: permsOf(u.role), twoFactor: !!u.totp_enabled,
      twoFactorRequired: !u.totp_enabled && !!ctx.settingsOf(org).security.twoFactor,
      features: { billing: !!config.billingEnabled, mail: ctx.mail.configured() },
      org: { id: org.id, name: org.name, type: org.type, plan: org.plan, planName: PLANS[org.plan]?.name, timezone: org.timezone },
    }
  }
  ctx.svc.publicUser = publicUser

  function issueTokens(u) {
    const refreshToken = newToken()
    q('INSERT INTO refresh_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)')
      .run(newId(), u.id, sha256(refreshToken), Date.now() + config.refreshTtlSec * 1000)
    q('UPDATE users SET last_login_at=? WHERE id=?').run(Date.now(), u.id)
    return { user: publicUser(u), accessToken: signJwt({ sub: u.id }, config.jwtSecret, config.accessTtlSec), refreshToken, expiresIn: config.accessTtlSec }
  }

  // ---- pengesahan kod 2FA: TOTP (tanpa guna semula) atau kod pemulihan sekali guna ----
  const totpSecretOf = (u) => openSecret(u.totp_secret, encKey)
  /** true jika kod sah. TOTP: ditolak jika langkah 30s itu sudah digunakan. Kod pemulihan: ditandakan terpakai. */
  function checkSecondFactor(u, code) {
    if (looksLikeRecovery(code)) {
      const h = sha256(normalizeRecovery(code))
      const rc = q('SELECT id FROM recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL').get(u.id, h)
      if (!rc) return false
      q('UPDATE recovery_codes SET used_at=? WHERE id=?').run(Date.now(), rc.id)
      return true
    }
    const secret = totpSecretOf(u)
    const step = secret ? totpMatchStep(secret, code) : null
    if (step === null || step <= (u.totp_last_step ?? 0)) return false
    q('UPDATE users SET totp_last_step=? WHERE id=?').run(step, u.id)
    return true
  }
  function makeRecoveryCodes(userId) {
    const codes = newRecoveryCodes(8)
    tx(() => {
      q('DELETE FROM recovery_codes WHERE user_id=?').run(userId)
      for (const c of codes) q('INSERT INTO recovery_codes (id,user_id,code_hash) VALUES (?,?,?)').run(newId(), userId, sha256(c))
    })
    return codes
  }

  const newUser = (orgId, email, name, password, role) => {
    const id = newId()
    q('INSERT INTO users (id,org_id,email,name,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(id, orgId, email, name, hashPassword(password), role, Date.now())
    return id
  }

  // ---- Onboarding (9 langkah) → satu transaksi ------------------------------
  const signupOrg = async ({ body, ip }) => {
    authLimit(ip)
    const b = await body()
    const orgName = str(b.orgName, 'orgName', { required: true, max: 120 })
    const orgType = oneOf(b.orgType, 'orgType', ORG_TYPES, { fallback: 'School' })
    const contactEmail = vEmail(b.contactEmail ?? b.email, 'contactEmail', false)
    const timezone = str(b.timezone, 'timezone', { max: 40 }) ?? 'GMT (UTC+0)'
    const name = str(b.name, 'name', { required: true, max: 80 })
    const email = vEmail(b.email)
    const password = vPassword(b.password)
    const setup = b.setup ?? {}
    if (typeof setup !== 'object' || Array.isArray(setup)) throw bad('setup', 'mesti object')
    if (q('SELECT 1 FROM users WHERE email=?').get(email)) throw new HttpError(409, 'EMAIL_TAKEN', 'E-mel sudah didaftarkan')

    const branches = list(setup.branches, 'setup.branches', { max: 50 }).map((n) => str(n, 'setup.branches[]', { required: true, max: 80 }))
    const departments = list(setup.departments, 'setup.departments', { max: 100 }).map((n) => str(n, 'setup.departments[]', { required: true, max: 80 }))
    const teachers = list(setup.teachers, 'setup.teachers', { max: 500 }).map((t) => ({ name: str(t?.name, 'setup.teachers[].name', { required: true, max: 80 }), email: vEmail(t?.email, 'setup.teachers[].email') }))
    const subjectNames = list(setup.subjects, 'setup.subjects', { max: 200 }).map((n) => str(n, 'setup.subjects[]', { required: true, max: 80 }))
    const classes = list(setup.classes, 'setup.classes', { max: 500 }).map((c) => ({ name: str(c?.name, 'setup.classes[].name', { required: true, max: 80 }), subject: str(c?.subject, 'setup.classes[].subject', { max: 80 }) }))
    const rooms = list(setup.rooms, 'setup.rooms', { max: 500 }).map((r) => ({ name: str(r?.name, 'setup.rooms[].name', { required: true, max: 80 }), capacity: int(r?.capacity ?? 30, 'setup.rooms[].capacity', { min: 1, max: 5000 }) }))
    const invites = list(setup.invites, 'setup.invites', { max: 100 }).map((i) => ({ email: vEmail(i?.email, 'setup.invites[].email'), role: oneOf(i?.role ?? 'admin', 'setup.invites[].role', INVITE_ROLES) }))
    const tt = setup.timetable ?? {}
    const operatingDays = list(tt.operatingDays, 'setup.timetable.operatingDays', { max: 7 }).map((d) => oneOf(d, 'operatingDays[]', DAYS, { required: true }))
    const dayStart = time(tt.dayStart, 'setup.timetable.dayStart'), dayEnd = time(tt.dayEnd, 'setup.timetable.dayEnd')
    if (dayStart && dayEnd && dayStart >= dayEnd) throw bad('setup.timetable', 'dayEnd mesti selepas dayStart')
    for (const [what, arr] of [['branches', branches], ['departments', departments], ['rooms', rooms.map((r) => r.name)], ['classes', classes.map((c) => c.name)], ['teachers', teachers.map((t) => t.email)]])
      if (new Set(arr.map((x) => x.toLowerCase())).size !== arr.length) throw bad(`setup.${what}`, 'mengandungi duplikasi')

    const result = tx(() => {
      const orgId = newId()
      const settings = defaultSettings()
      if (operatingDays.length) settings.operatingDays = DAYS.filter((d) => operatingDays.includes(d))
      if (dayStart) settings.dayStart = dayStart
      if (dayEnd) settings.dayEnd = dayEnd
      q('INSERT INTO organizations (id,name,type,contact_email,timezone,plan,settings,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(orgId, orgName, orgType, contactEmail ?? email, timezone, 'starter', JSON.stringify(settings), Date.now())
      // had pelan Starter dikuatkuasakan semasa onboarding hanya bila billing dihidupkan
      const lim = PLANS.starter.limits
      if (config.billingEnabled) for (const [kind, n] of [['branches', branches.length], ['teachers', teachers.length], ['classes', classes.length]])
        if (lim[kind] !== null && n > lim[kind]) throw new HttpError(402, 'PLAN_LIMIT', `Pelan Starter hanya membenarkan ${lim[kind]} ${kind} (anda memasukkan ${n}). Kurangkan atau naik taraf kemudian.`, { kind, limit: lim[kind] })
      const userId = newUser(orgId, email, name, password, 'owner')
      const branchIds = branches.map((n) => { const id = newId(); q('INSERT INTO branches (id,org_id,name) VALUES (?,?,?)').run(id, orgId, n); return id })
      departments.forEach((n) => q('INSERT INTO departments (id,org_id,name) VALUES (?,?,?)').run(newId(), orgId, n))
      rooms.forEach((r) => q('INSERT INTO rooms (id,org_id,name,capacity) VALUES (?,?,?,?)').run(newId(), orgId, r.name, r.capacity))
      classes.forEach((c) => q('INSERT INTO classes (id,org_id,name,subject,branch_id,created_at) VALUES (?,?,?,?,?,?)').run(newId(), orgId, c.name, c.subject, branchIds[0] ?? null, Date.now()))
      subjectNames.forEach((n) => ensureSubject(ctx.db, orgId, n))
      migrateLegacyClassSubjects(ctx.db, orgId) // onboarding: kelas + subjek yang ditaip → senarai subjek + pautan kelas × subjek
      const sent = []
      for (const t of teachers) {
        const tid = insertTeacher(ctx, orgId, { name: t.name, email: t.email, branch_id: branchIds[0] ?? null })
        sent.push({ email: t.email, role: 'teacher', token: createInvite(ctx, { orgId, email: t.email, role: 'teacher', teacherId: tid, createdBy: userId }) })
      }
      for (const i of invites) {
        if (i.email === email || sent.some((s) => s.email === i.email)) continue
        sent.push({ email: i.email, role: i.role, token: createInvite(ctx, { orgId, email: i.email, role: i.role, createdBy: userId }) })
      }
      ctx.log({ org_id: orgId, id: userId, name }, `Created organization ${orgName}`)
      return { userId, sent }
    })
    const user = q('SELECT * FROM users WHERE id=?').get(result.userId)
    return created({ ...issueTokens(user), invites: result.sent.map((s) => ({ email: s.email, role: s.role, ...(ctx.exposeInviteLinks() ? { token: s.token } : {}) })) })
  }

  const login = async ({ body, ip }) => {
    authLimit(ip)
    const b = await body()
    const em = vEmail(b.email)
    loginFails.check(em.toLowerCase()) // kunci akaun sementara selepas terlalu banyak kegagalan
    const u = q('SELECT * FROM users WHERE email=?').get(em)
    const ok = checkPassword(String(b.password ?? ''), u?.password_hash ?? DUMMY_HASH)
    if (!u || !ok || !u.active) { loginFails.fail(em.toLowerCase()); throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mel atau kata laluan salah') }
    if (u.totp_enabled) {
      if (!b.code) throw new HttpError(401, 'TOTP_REQUIRED', 'Masukkan kod 6 digit daripada aplikasi pengesah anda (atau kod pemulihan)')
      totpFails.check(u.id)
      if (!checkSecondFactor(u, b.code)) { totpFails.fail(u.id); loginFails.fail(em.toLowerCase()); throw new HttpError(401, 'INVALID_TOTP', 'Kod pengesahan tidak betul') }
      totpFails.reset(u.id)
    }
    loginFails.reset(em.toLowerCase())
    return issueTokens(q('SELECT * FROM users WHERE id=?').get(u.id))
  }

  const refresh = async ({ body, ip }) => {
    authLimit(ip)
    const b = await body()
    const rt = q('SELECT * FROM refresh_tokens WHERE token_hash=?').get(sha256(String(b.refreshToken ?? '')))
    if (!rt) throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token tidak sah')
    if (rt.revoked) { // token lama digunakan semula → kemungkinan dicuri; batalkan semua sesi
      q('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?').run(rt.user_id)
      throw new HttpError(401, 'INVALID_REFRESH', 'Sesi dibatalkan, sila log masuk semula')
    }
    if (rt.expires_at < Date.now()) throw new HttpError(401, 'INVALID_REFRESH', 'Refresh token telah tamat tempoh')
    const u = q('SELECT * FROM users WHERE id=? AND active=1').get(rt.user_id)
    if (!u) throw new HttpError(401, 'INVALID_REFRESH', 'Akaun tidak aktif')
    // tamat sesi jika tidak aktif: token dikeluarkan semula setiap kali access token tamat (accessTtl) semasa pengguna aktif,
    // jadi umur token = masa sejak aktiviti terakhir + paling lama accessTtl. Pengguna aktif tidak pernah dilog keluar.
    const org = q('SELECT * FROM organizations WHERE id=?').get(u.org_id)
    const idleMin = org ? ctx.settingsOf(org).security.sessionTimeoutMin : 0
    const ageMs = Date.now() - (rt.expires_at - config.refreshTtlSec * 1000)
    if (idleMin > 0 && ageMs > idleMin * 60_000 + config.accessTtlSec * 1000) {
      q('UPDATE refresh_tokens SET revoked=1 WHERE id=?').run(rt.id)
      throw new HttpError(401, 'SESSION_IDLE', 'Sesi tamat kerana tidak aktif, sila log masuk semula')
    }
    q('UPDATE refresh_tokens SET revoked=1 WHERE id=?').run(rt.id)
    return issueTokens(u)
  }

  const logout = async ({ body }) => {
    const b = await body()
    if (b.refreshToken) q('UPDATE refresh_tokens SET revoked=1 WHERE token_hash=?').run(sha256(String(b.refreshToken)))
  }

  const acceptInvite = async ({ body, ip }) => {
    authLimit(ip)
    const b = await body()
    const inv = q('SELECT * FROM invites WHERE token_hash=?').get(sha256(String(b.token ?? '')))
    if (!inv || inv.accepted_at || inv.expires_at < Date.now()) throw new HttpError(400, 'INVALID_INVITE', 'Jemputan tidak sah atau telah tamat tempoh')
    const password = vPassword(b.password)
    if (q('SELECT 1 FROM users WHERE email=?').get(inv.email)) throw new HttpError(409, 'EMAIL_TAKEN', 'Akaun untuk e-mel ini sudah wujud')
    const t = inv.teacher_id ? q('SELECT * FROM teachers WHERE id=?').get(inv.teacher_id) : null
    const name = t?.name ?? str(b.name, 'name', { required: true, max: 80 })
    const uid = tx(() => {
      const id = newUser(inv.org_id, inv.email, name, password, inv.role)
      if (t) q('UPDATE teachers SET user_id=? WHERE id=?').run(id, t.id)
      q('UPDATE invites SET accepted_at=? WHERE id=?').run(Date.now(), inv.id)
      ctx.log({ org_id: inv.org_id, id, name }, `Accepted invitation (${ROLE_LABELS[inv.role]})`)
      return id
    })
    return created(issueTokens(q('SELECT * FROM users WHERE id=?').get(uid)))
  }

  const me = ({ user }) => publicUser(user)
  const patchMe = async ({ user, body }) => {
    const b = await body()
    const name = str(b.name, 'name', { required: true, max: 80 })
    q('UPDATE users SET name=? WHERE id=?').run(name, user.id)
    return publicUser(q('SELECT * FROM users WHERE id=?').get(user.id))
  }
  const changePassword = async ({ user, body, ip }) => {
    authLimit(ip)
    const b = await body()
    if (!checkPassword(String(b.current ?? ''), user.password_hash)) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Kata laluan semasa salah')
    q('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(vPassword(b.next, 'next')), user.id)
    q('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?').run(user.id) // log keluar semua peranti
    return issueTokens(q('SELECT * FROM users WHERE id=?').get(user.id))
  }


  // ---- lupa / tetap semula kata laluan -------------------------------------
  const forgot = async ({ body, ip }) => {
    authLimit(ip)
    const em = vEmail((await body()).email)
    const u = q('SELECT * FROM users WHERE email=? AND active=1').get(em)
    if (u) {
      const token = newToken()
      q('DELETE FROM password_resets WHERE user_id=? AND used_at IS NULL').run(u.id)
      q('INSERT INTO password_resets (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)').run(newId(), u.id, sha256(token), Date.now() + config.resetTtlMs)
      ctx.mail.send({ orgId: u.org_id, to: u.email, subject: 'Reset your CampusOS password',
        text: `We received a request to reset your CampusOS password.\n\n${config.appUrl}/?reset=${token}\n\nThis link is valid for 1 hour. If you did not request this, ignore this email. Your password stays the same.\n\n(Pautan menetapkan semula kata laluan; sah selama 1 jam. Abaikan jika bukan anda yang meminta.)` })
    }
    // jawapan sama sama ada akaun wujud atau tidak (elak penghitungan akaun)
    return { __status: 202, data: { ok: true, message: 'Jika e-mel itu berdaftar, pautan tetapan semula telah dihantar.' } }
  }
  const reset = async ({ body, ip }) => {
    authLimit(ip)
    const b = await body()
    const r = q('SELECT * FROM password_resets WHERE token_hash=?').get(sha256(String(b.token ?? '')))
    if (!r || r.used_at || r.expires_at < Date.now()) throw new HttpError(400, 'INVALID_RESET', 'Pautan tidak sah atau telah tamat tempoh')
    const pw = vPassword(b.password)
    tx(() => {
      q('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(pw), r.user_id)
      q('UPDATE password_resets SET used_at=? WHERE id=?').run(Date.now(), r.id)
      q('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?').run(r.user_id) // log keluar semua peranti
    })
    return { ok: true }
  }

  // ---- 2FA (TOTP) ----------------------------------------------------------
  const twoFaSetup = ({ user }) => {
    if (user.totp_enabled) throw new HttpError(409, 'ALREADY_ENABLED', '2FA sudah diaktifkan')
    const secret = newTotpSecret()
    q('UPDATE users SET totp_secret=?, totp_last_step=0 WHERE id=?').run(sealSecret(secret, encKey), user.id)
    const issuer = encodeURIComponent('CampusOS')
    return { secret, otpauthUrl: `otpauth://totp/${issuer}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30` }
  }
  const twoFaEnable = async ({ user, body, ip }) => {
    authLimit(ip)
    if (user.totp_enabled) throw new HttpError(409, 'ALREADY_ENABLED', '2FA sudah diaktifkan')
    if (!user.totp_secret) throw new HttpError(400, 'NO_SETUP', 'Mulakan persediaan 2FA dahulu')
    totpFails.check(user.id)
    const code = (await body()).code
    const step = totpMatchStep(totpSecretOf(user), code)
    if (step === null) { totpFails.fail(user.id); throw new HttpError(400, 'INVALID_TOTP', 'Kod pengesahan tidak betul') }
    q('UPDATE users SET totp_enabled=1, totp_last_step=? WHERE id=?').run(step, user.id)
    totpFails.reset(user.id)
    const recoveryCodes = makeRecoveryCodes(user.id) // dipaparkan SEKALI sahaja
    return { ...publicUser(q('SELECT * FROM users WHERE id=?').get(user.id)), recoveryCodes }
  }
  const twoFaDisable = async ({ user, body, ip }) => {
    authLimit(ip)
    const b = await body()
    if (!user.totp_enabled) throw new HttpError(409, 'NOT_ENABLED', '2FA belum diaktifkan')
    if (!checkPassword(String(b.password ?? ''), user.password_hash)) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Kata laluan salah')
    totpFails.check(user.id)
    if (!checkSecondFactor(user, b.code)) { totpFails.fail(user.id); throw new HttpError(400, 'INVALID_TOTP', 'Kod pengesahan tidak betul') }
    q('UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_last_step=0 WHERE id=?').run(user.id)
    q('DELETE FROM recovery_codes WHERE user_id=?').run(user.id)
    return publicUser(q('SELECT * FROM users WHERE id=?').get(user.id))
  }
  /** Jana semula kod pemulihan (kod lama terbatal). Perlu kata laluan + kod semasa. */
  const twoFaRecovery = async ({ user, body, ip }) => {
    authLimit(ip)
    const b = await body()
    if (!user.totp_enabled) throw new HttpError(409, 'NOT_ENABLED', '2FA belum diaktifkan')
    if (!checkPassword(String(b.password ?? ''), user.password_hash)) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Kata laluan salah')
    totpFails.check(user.id)
    if (!checkSecondFactor(user, b.code)) { totpFails.fail(user.id); throw new HttpError(400, 'INVALID_TOTP', 'Kod pengesahan tidak betul') }
    return { recoveryCodes: makeRecoveryCodes(user.id) }
  }

  return [
    ['POST', '/v1/auth/forgot-password', forgot, { auth: false }],
    ['POST', '/v1/auth/reset-password', reset, { auth: false }],
    ['POST', '/v1/me/2fa/setup', twoFaSetup, { gate: true }],
    ['POST', '/v1/me/2fa/enable', twoFaEnable, { gate: true }],
    ['POST', '/v1/me/2fa/disable', twoFaDisable],
    ['POST', '/v1/me/2fa/recovery-codes', twoFaRecovery],
    ['POST', '/v1/auth/signup-org', signupOrg, { auth: false }],
    ['POST', '/v1/auth/login', login, { auth: false }],
    ['POST', '/v1/auth/refresh', refresh, { auth: false }],
    ['POST', '/v1/auth/logout', logout, { auth: false }],
    ['POST', '/v1/auth/accept-invite', acceptInvite, { auth: false }],
    ['GET', '/v1/me', me, { gate: true }],
    ['PATCH', '/v1/me', patchMe],
    ['POST', '/v1/me/password', changePassword],
  ]
}
