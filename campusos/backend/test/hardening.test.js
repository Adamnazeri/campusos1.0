import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo, DEMO } from '../src/demo.js'
import { totpCode, sealSecret, openSecret, newRecoveryCodes, safeEqual } from '../src/security.js'
import { clientIp, createFailureLimiter } from '../src/http.js'
import { backupDb } from '../src/backup.js'

const mk = (extra = {}) => ({ jwtSecret: 't', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3, corsOrigin: '*', authRateMax: 1000, loginFailMax: 5,
  exposeInviteTokens: true, billingEnabled: true, appUrl: 'http://app.test', mailFrom: 'x@y', mailWebhook: '', billingSecret: 'whsec', resetTtlMs: 3600e3, devEndpoints: true, ...extra })

let server, base, db
async function boot(config) {
  db = openDb(':memory:'); seedDemo(db)
  server = createServer(createApp({ db, config }).handler)
  await new Promise((r) => server.listen(0, r))
  base = `http://localhost:${server.address().port}`
}
const call = async (method, path, { body, token, headers = {} } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, body: res.headers.get('content-type')?.includes('json') && text ? JSON.parse(text) : text, headers: res.headers }
}
const login = async (email, extra = {}) => call('POST', '/v1/auth/login', { body: { email, password: DEMO.password, ...extra } })

before(() => boot(mk()))
after(() => server.close())

test('pengepala keselamatan pada setiap respons API + health memeriksa DB', async () => {
  const h = await call('GET', '/health')
  assert.equal(h.status, 200)
  assert.equal(h.headers.get('x-frame-options'), 'DENY')
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(h.headers.get('referrer-policy'), 'no-referrer')
  assert.match(h.headers.get('content-security-policy'), /default-src 'none'/)
  assert.equal(h.headers.get('cache-control'), 'no-store')
})

test('rahsia TOTP disulitkan dalam pangkalan data, bukan plaintext', async () => {
  const s = (await login(DEMO.grace ?? DEMO.coordinator)).body
  const setup = await call('POST', '/v1/me/2fa/setup', { token: s.accessToken })
  const row = db.prepare('SELECT totp_secret FROM users WHERE id=?').get(s.user.id)
  assert.ok(row.totp_secret.startsWith('enc:v1:'))
  assert.ok(!row.totp_secret.includes(setup.body.secret))
  assert.equal(openSecret(row.totp_secret, 't'), setup.body.secret)
  assert.throws(() => openSecret(row.totp_secret, 'kunci-salah'))
  assert.equal(openSecret('PLAINTEXTLAMA', 't'), 'PLAINTEXTLAMA') // nilai lama (sebelum penyulitan) masih boleh dibaca
  assert.equal(openSecret(sealSecret('abc', 'k'), 'k'), 'abc')
})

test('kod pemulihan: sekali guna, boleh jana semula, pentadbir boleh tetap semula 2FA', async () => {
  const email = DEMO.teacher
  const s = (await login(email)).body
  const setup = await call('POST', '/v1/me/2fa/setup', { token: s.accessToken })
  const t0 = Date.now()
  const en = await call('POST', '/v1/me/2fa/enable', { token: s.accessToken, body: { code: totpCode(setup.body.secret, t0) } })
  const [c1, c2] = en.body.recoveryCodes
  assert.match(c1, /^[a-z0-9]{4}-[a-z0-9]{4}$/)
  // kod pemulihan menggantikan TOTP semasa login. Sekali sahaja
  const viaRecovery = await login(email, { code: c1 })
  assert.equal(viaRecovery.status, 200)
  assert.equal((await login(email, { code: c1 })).body.error.code, 'INVALID_TOTP')
  // hash disimpan, bukan kod
  assert.equal(db.prepare('SELECT COUNT(*) c FROM recovery_codes WHERE user_id=? AND code_hash=?').get(s.user.id, c2).c, 0)
  // jana semula: kod lama terbatal
  const regen = await call('POST', '/v1/me/2fa/recovery-codes', { token: viaRecovery.body.accessToken, body: { password: DEMO.password, code: c2 } })
  assert.equal(regen.status, 200); assert.equal(regen.body.recoveryCodes.length, 8)
  assert.equal((await login(email, { code: c2 })).status, 401)
  // owner menetap semula 2FA guru yang hilang telefon
  const admin = (await login(DEMO.admin)).body.accessToken
  const reset = await call('POST', `/v1/users/${s.user.id}/reset-2fa`, { token: admin })
  assert.equal(reset.status, 204)
  assert.equal((await login(email)).status, 200)
  // guru tidak boleh menetap semula 2FA orang lain
  const t = (await login(email)).body.accessToken
  assert.equal((await call('POST', `/v1/users/${s.user.id}/reset-2fa`, { token: t })).status, 403)
})

test('organisasi mewajibkan 2FA: akaun tanpa 2FA disekat kecuali untuk menyediakannya', async () => {
  const admin = (await login(DEMO.admin)).body
  const on = await call('PATCH', '/v1/org/settings', { token: admin.accessToken, body: { security: { twoFactor: true } } })
  assert.equal(on.status, 200)
  try {
    const me = await call('GET', '/v1/me', { token: admin.accessToken })
    assert.equal(me.status, 200); assert.equal(me.body.twoFactorRequired, true)
    const blocked = await call('GET', '/v1/teachers', { token: admin.accessToken })
    assert.equal(blocked.status, 403); assert.equal(blocked.body.error.code, 'TWO_FACTOR_REQUIRED')
    const setup = await call('POST', '/v1/me/2fa/setup', { token: admin.accessToken })
    assert.equal(setup.status, 200)
    const en = await call('POST', '/v1/me/2fa/enable', { token: admin.accessToken, body: { code: totpCode(setup.body.secret) } })
    assert.equal(en.status, 200)
    assert.equal((await call('GET', '/v1/teachers', { token: admin.accessToken })).status, 200)
  } finally {
    db.exec("UPDATE users SET totp_enabled=0, totp_secret=NULL WHERE email='" + DEMO.admin + "'")
    db.exec("UPDATE organizations SET settings=json_set(settings,'$.security.twoFactor',json('false'))")
  }
})

test('akaun dikunci sementara selepas terlalu banyak kegagalan login (bukan berdasarkan IP)', async () => {
  const email = DEMO.coordinator
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/v1/auth/login', { body: { email, password: 'salah-salah' } })).status, 401)
  const locked = await call('POST', '/v1/auth/login', { body: { email, password: DEMO.password } })
  assert.equal(locked.status, 429); assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED')
  // akaun lain dari IP yang sama tidak terjejas
  assert.equal((await login(DEMO.teacher)).status, 200)
})

test('IP klien: X-Forwarded-For hanya dipercayai bila TRUST_PROXY ditetapkan, entri dari kanan', () => {
  const req = (xff) => ({ socket: { remoteAddress: '10.0.0.1' }, headers: xff ? { 'x-forwarded-for': xff } : {} })
  assert.equal(clientIp(req('1.2.3.4'), 0), '10.0.0.1') // diabaikan tanpa proxy dipercayai
  assert.equal(clientIp(req('9.9.9.9, 1.2.3.4'), 1), '1.2.3.4') // palsuan klien (9.9.9.9) di kiri tidak dipakai
  assert.equal(clientIp(req('9.9.9.9, 1.2.3.4, 10.1.1.1'), 2), '1.2.3.4')
  assert.equal(clientIp(req(), 1), '10.0.0.1')
})

test('had kegagalan: tetingkap bergerak dan reset', () => {
  const l = createFailureLimiter(2, 1000)
  l.check('a'); l.fail('a'); l.check('a'); l.fail('a')
  assert.throws(() => l.check('a'), /percubaan gagal/)
  l.check('b'); l.reset('a'); l.check('a')
})

test('webhook bil: perbandingan rahsia selamat + idempotensi eventId', async () => {
  const r = await call('POST', '/v1/auth/signup-org', { body: { orgName: 'Hook Co', name: 'H', email: 'h@hook.io', password: 'password123' } })
  const t = r.body.accessToken, orgId = r.body.user.org.id
  await call('POST', '/v1/billing/plan', { token: t, body: { plan: 'growth' } })
  const hook = (body, auth = 'Bearer whsec') => call('POST', '/v1/billing/webhook', { body, headers: { authorization: auth } })
  assert.equal((await hook({ orgId, event: 'payment_succeeded' }, 'Bearer whsec-')).status, 401)
  assert.equal((await hook({ orgId, event: 'payment_succeeded' }, '')).status, 401)
  const first = await hook({ orgId, event: 'payment_succeeded', eventId: 'evt_1' })
  assert.deepEqual(first.body, { ok: true })
  const dup = await hook({ orgId, event: 'subscription_cancelled', eventId: 'evt_1' }) // event_id sama: diabaikan
  assert.equal(dup.body.duplicate, true)
  assert.equal((await call('GET', '/v1/billing', { token: t })).body.plan.id, 'growth')
  assert.ok(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('abc', 'abcd'))
})

test('bil dimatikan secara lalai: laluan tidak wujud & UI dimaklumkan melalui /me', async () => {
  const saved = [server, base, db]
  server.close()
  await boot(mk({ billingEnabled: false }))
  try {
    const a = (await login(DEMO.admin)).body
    assert.equal(a.user.features.billing, false)
    assert.equal((await call('GET', '/v1/billing', { token: a.accessToken })).status, 404)
    assert.equal((await call('POST', '/v1/billing/webhook', { body: {}, headers: { authorization: 'Bearer whsec' } })).status, 404)
  } finally { server.close(); [server, base, db] = saved; await boot(mk()) }
})

test('e-mel gagal dicuba semula; kandungan (pautan token) dibuang selepas berjaya dihantar', async () => {
  server.close()
  let fail = true, calls = 0
  db = openDb(':memory:'); seedDemo(db)
  const app = createApp({ db, config: mk({ mailWebhook: 'http://mail.test/send' }), deps: { fetch: async () => { calls++; return { ok: !fail, status: fail ? 503 : 200 } } } })
  server = createServer(app.handler); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
  try {
    const a = (await login(DEMO.admin)).body
    const inv = await call('POST', '/v1/invites', { token: a.accessToken, body: { email: 'baru@retry.io', role: 'teacher' } })
    assert.equal(inv.status, 201)
    await app.ctx.mail.flush()
    assert.equal(db.prepare("SELECT status FROM emails WHERE to_email='baru@retry.io'").get().status, 'failed')
    fail = false
    await app.ctx.mail.flush()
    const m = db.prepare("SELECT status, attempts, body FROM emails WHERE to_email='baru@retry.io'").get()
    assert.equal(m.status, 'sent'); assert.ok(m.attempts >= 2); assert.ok(!m.body.includes('invite='))
    assert.ok(calls >= 2)
  } finally { server.close(); await boot(mk()) }
})

test('sandaran SQLite: salinan konsisten + hanya N terkini disimpan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-bk-'))
  try {
    for (let i = 0; i < 4; i++) backupDb(db, dir, 2, new Date(Date.UTC(2026, 9, 1 + i, 3, 0, 0)))
    const files = readdirSync(dir).sort()
    assert.deepEqual(files, ['campusos-20261003-030000.db', 'campusos-20261004-030000.db'])
    const copy = openDb(join(dir, files[1]))
    assert.ok(copy.prepare('SELECT COUNT(*) c FROM users').get().c > 0)
    copy.close()
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('kod pemulihan dijana unik dan berformat betul', () => {
  const codes = newRecoveryCodes(8)
  assert.equal(new Set(codes).size, 8)
  codes.forEach((c) => assert.match(c, /^[a-z2-9]{4}-[a-z2-9]{4}$/))
})

test('PDPA: eksport data pelajar & pemadaman kekal (termasuk kehadiran)', async () => {
  const a = (await login(DEMO.admin)).body.accessToken
  const cl = (await call('GET', '/v1/classes', { token: a })).body.items[0]
  const add = await call('POST', '/v1/students', { token: a, body: { classId: cl.id, names: ['Pelajar Ujian PDPA'] } })
  const sid = add.body.items[0].id
  await call('PUT', `/v1/classes/${cl.id}/attendance`, { token: a, body: { date: new Date().toISOString().slice(0, 10), records: [{ studentId: sid, status: 'Present' }] } })
  const ex = await call('GET', `/v1/students/${sid}/export`, { token: a })
  assert.equal(ex.status, 200); assert.equal(ex.body.student.name, 'Pelajar Ujian PDPA')
  assert.ok(Array.isArray(ex.body.attendance))
  const soft = await call('DELETE', `/v1/students/${sid}`, { token: a })
  assert.equal(soft.status, 204)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM students WHERE id=?').get(sid).c, 1) // nyahaktif sahaja
  assert.equal((await call('DELETE', `/v1/students/${sid}?purge=1`, { token: a })).status, 204)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM students WHERE id=?').get(sid).c, 0)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM attendance WHERE student_id=?').get(sid).c, 0)
  assert.equal((await call('GET', `/v1/students/${sid}/export`, { token: a })).status, 404)
  const t = (await login(DEMO.teacher)).body.accessToken
  assert.equal((await call('GET', `/v1/students/${sid}/export`, { token: t })).status, 403)
})

// ---------------- SMTP ----------------
import net from 'node:net'
import tls from 'node:tls'
import { execFileSync } from 'node:child_process'
import { sendSmtp, buildMessage, bareAddress } from '../src/smtp.js'

/** Pelayan SMTP palsu: merekod arahan; menyokong STARTTLS (cert layan-tandatangan) dan AUTH PLAIN. */
function fakeSmtp({ starttls = true, cert, key, rejectRcpt = false } = {}) {
  const log = [], mails = []
  const server = net.createServer((raw) => {
    let sock = raw, inData = false, data = '', buf = ''
    const w = (s) => sock.write(s + '\r\n')
    const bind = (s) => {
      s.on('data', (d) => {
        buf += d.toString()
        let i
        while ((i = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2)
          if (inData) { if (line === '.') { inData = false; mails.push(data); w('250 queued'); data = '' } else data += line + '\r\n'; continue }
          log.push(line.startsWith('AUTH PLAIN') ? 'AUTH PLAIN <redacted>' : line)
          if (/^EHLO/.test(line)) { sock.write(`250-fake\r\n${starttls && !sock.encrypted ? '250-STARTTLS\r\n' : ''}250 AUTH PLAIN LOGIN\r\n`); (sock.__ehlo = (sock.__ehlo ?? 0) + 1) }
          else if (line === 'STARTTLS') { w('220 go'); const t = new tls.TLSSocket(sock, { isServer: true, cert, key }); sock = t; buf = ''; bind(t); return }
          else if (line.startsWith('AUTH PLAIN')) { const [, u, p] = Buffer.from(line.slice(11), 'base64').toString().split('\0'); log.push(`creds:${u}:${p}`); w(u === 'user' && p === 'pass' ? '235 ok' : '535 bad') }
          else if (/^MAIL FROM/.test(line)) w('250 ok')
          else if (/^RCPT TO/.test(line)) w(rejectRcpt ? '550 no such user' : '250 ok')
          else if (line === 'DATA') { inData = true; w('354 go') }
          else if (line === 'QUIT') { w('221 bye'); sock.end() }
        }
      })
      s.on('error', () => {})
    }
    bind(raw); w('220 fake ready')
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, log, mails })))
}

test('SMTP: STARTTLS → AUTH → mesej UTF-8 sampai ke penerima (kata laluan hanya selepas TLS)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cos-tls-'))
  try { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' }) }
  catch { t.skip('openssl tidak tersedia'); return }
  const { readFileSync } = await import('node:fs')
  const s = await fakeSmtp({ cert: readFileSync(join(dir, 'c.pem')), key: readFileSync(join(dir, 'k.pem')) })
  try {
    await sendSmtp({ host: '127.0.0.1', port: s.port, user: 'user', pass: 'pass', rejectUnauthorized: false },
      { from: 'CampusOS <no-reply@sekolah.edu.my>', to: 'cikgu@sekolah.edu.my', subject: 'Jemputan: Sekolah Kebangsaan Ñandú', text: 'Salam!\nPautan: http://x/?invite=abc\n.titik di awal baris' })
    assert.ok(s.log.indexOf('STARTTLS') < s.log.findIndex((l) => l.startsWith('AUTH PLAIN')), 'AUTH mesti selepas STARTTLS')
    assert.ok(s.log.includes('creds:user:pass'))
    assert.ok(s.log.includes('MAIL FROM:<no-reply@sekolah.edu.my>') && s.log.includes('RCPT TO:<cikgu@sekolah.edu.my>'))
    const raw = s.mails[0]
    assert.match(raw, /^From: CampusOS <no-reply@sekolah.edu.my>/m)
    assert.match(raw, /^Subject: =\?UTF-8\?B\?/m)
    const b64 = raw.split('\r\n\r\n')[1].replace(/\r\n/g, '')
    assert.match(Buffer.from(b64, 'base64').toString('utf8'), /\?invite=abc[\s\S]*\.titik di awal baris/)
    // pelayan menolak penerima → ralat jelas (supaya mailer menandakan "failed" dan mencuba semula)
    s.server.close()
    const bad = await fakeSmtp({ cert: readFileSync(join(dir, 'c.pem')), key: readFileSync(join(dir, 'k.pem')), rejectRcpt: true })
    await assert.rejects(sendSmtp({ host: '127.0.0.1', port: bad.port, rejectUnauthorized: false }, { from: 'a@b.c', to: 'x@y.z', subject: 's', text: 't' }), /SMTP 550/)
    bad.server.close()
  } finally { s.server.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('SMTP: enggan hantar kata laluan tanpa STARTTLS/TLS; suntikan header dibersihkan', async () => {
  const s = await fakeSmtp({ starttls: false })
  try {
    await assert.rejects(sendSmtp({ host: '127.0.0.1', port: s.port, user: 'user', pass: 'pass' }, { from: 'a@b.c', to: 'x@y.z', subject: 's', text: 't' }), /STARTTLS/)
    assert.ok(!s.log.some((l) => l.startsWith('AUTH')))
    // tanpa auth (relay dalaman) dibenarkan
    await sendSmtp({ host: '127.0.0.1', port: s.port }, { from: 'a@b.c', to: 'x@y.z', subject: 's', text: 't' })
    assert.equal(s.mails.length, 1)
  } finally { s.server.close() }
  const msg = buildMessage({ from: 'a@b.c', to: 'x@y.z\r\nBcc: spy@evil.io', subject: 'Hi\r\nBcc: spy@evil.io', text: 't' })
  assert.ok(!/^Bcc:/mi.test(msg))
  assert.equal(bareAddress('CampusOS <no-reply@x.my>'), 'no-reply@x.my')
})

test('jemputan guru dihantar melalui SMTP; tanpa SMTP/webhook pautan dipulangkan kepada admin', async () => {
  server.close()
  const sent = []
  db = openDb(':memory:'); seedDemo(db)
  const app = createApp({ db, config: mk({ smtpHost: 'smtp.test', smtpPort: 587, smtpUser: 'u', smtpPass: 'p', exposeInviteTokens: false }), deps: { smtp: async (o, m) => { sent.push({ o, m }) } } })
  server = createServer(app.handler); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
  try {
    const a = (await login(DEMO.admin)).body
    assert.equal(a.user.features.mail, true)
    const r = await call('POST', '/v1/teachers', { token: a.accessToken, body: { name: 'Cikgu Baru', email: 'cikgu.baru@sekolah.edu.my', department: 'Sciences' } })
    assert.equal(r.status, 201); assert.equal(r.body.emailed, true); assert.equal(r.body.inviteToken, undefined) // e-mel dihantar → token tidak didedahkan
    await app.ctx.mail.flush()
    assert.equal(sent.length, 1)
    assert.equal(sent[0].m.to, 'cikgu.baru@sekolah.edu.my'); assert.match(sent[0].m.text, /\/\?invite=[A-Za-z0-9_-]{20,}/)
    assert.match(sent[0].m.subject, /invited to join/)
    assert.equal(sent[0].o.host, 'smtp.test')
    // tiada pengangkutan e-mel → pautan jemputan didedahkan kepada admin sebagai ganti
    server.close(); db = openDb(':memory:'); seedDemo(db)
    const app2 = createApp({ db, config: mk({ exposeInviteTokens: false }) })
    server = createServer(app2.handler); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
    const a2 = (await login(DEMO.admin)).body
    assert.equal(a2.user.features.mail, false)
    const r2 = await call('POST', '/v1/invites', { token: a2.accessToken, body: { email: 'x@sekolah.edu.my', role: 'teacher' } })
    assert.equal(r2.body.emailed, false); assert.ok(r2.body.token)
  } finally { server.close(); await boot(mk()) }
})

test('konfigurasi production enggan bermula tanpa JWT_SECRET, APP_ENCRYPTION_KEY, atau CORS_ORIGIN sah', () => {
  const validKey = 'a'.repeat(64)
  const runCfg = (env) => execFileSync(process.execPath, ['-e', "import('./src/config.js')"], {
    cwd: new URL('..', import.meta.url),
    env: { PATH: process.env.PATH, NODE_ENV: 'production', ...env },
    stdio: 'pipe',
  })
  // gagal jika APP_ENCRYPTION_KEY tidak ditetapkan walaupun JWT_SECRET & CORS_ORIGIN sah
  assert.throws(() => runCfg({ JWT_SECRET: validKey, CORS_ORIGIN: 'https://campusos.sekolah.edu.my' }), /APP_ENCRYPTION_KEY mesti ditetapkan/)
  // gagal jika APP_ENCRYPTION_KEY terlalu pendek
  assert.throws(() => runCfg({ JWT_SECRET: validKey, APP_ENCRYPTION_KEY: 'pendek', CORS_ORIGIN: 'https://campusos.sekolah.edu.my' }), /APP_ENCRYPTION_KEY terlalu pendek/)
  // berjaya jika ketiga-tiganya sah
  assert.doesNotThrow(() => runCfg({ JWT_SECRET: validKey, APP_ENCRYPTION_KEY: validKey, CORS_ORIGIN: 'https://campusos.sekolah.edu.my', SMTP_HOST: 'smtp.sekolah.edu.my' }))
})

test('sesi tidak aktif tamat mengikut sessionTimeoutMin; pengguna aktif tidak dilog keluar', async () => {
  const a = (await login(DEMO.admin)).body
  assert.equal((await call('PATCH', '/v1/org/settings', { token: a.accessToken, body: { security: { sessionTimeoutMin: 30 } } })).status, 200)
  // aktif: token baru dikeluarkan 20 min lalu (dalam had 30 min + 15 min accessTtl) → masih boleh refresh
  const active = (await login(DEMO.admin)).body
  db.prepare('UPDATE refresh_tokens SET expires_at = expires_at - ? WHERE revoked=0').run(20 * 60_000)
  const ok = await call('POST', '/v1/auth/refresh', { body: { refreshToken: active.refreshToken } })
  assert.equal(ok.status, 200)
  // tidak aktif: token berumur 50 min (> 30 + 15) → ditolak
  db.prepare('UPDATE refresh_tokens SET expires_at = expires_at - ? WHERE revoked=0').run(50 * 60_000)
  const idle = await call('POST', '/v1/auth/refresh', { body: { refreshToken: ok.body.refreshToken } })
  assert.equal(idle.status, 401); assert.equal(idle.body.error.code, 'SESSION_IDLE')
  // tetapan tak dikenali (sso/audit) kini ditolak
  assert.equal((await call('PATCH', '/v1/org/settings', { token: a.accessToken, body: { security: { sso: true } } })).status, 400)
})

test('had pelan Starter tidak dikuatkuasakan bila billing dimatikan (sekolah tunggal)', async () => {
  const saved = [server, base, db]
  server.close()
  await boot(mk({ billingEnabled: false }))
  try {
    const r = await call('POST', '/v1/auth/signup-org', { body: { orgName: 'Sekolah Besar', name: 'Pn Aminah', email: 'aminah@besar.edu.my', password: 'password123',
      setup: { branches: ['A', 'B'], classes: Array.from({ length: 30 }, (_, i) => ({ name: `Kelas ${i + 1}`, subject: 'Matematik' })) } } })
    assert.equal(r.status, 201)
  } finally { server.close(); [server, base, db] = saved; await boot(mk()) }
})
