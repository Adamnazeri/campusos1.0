import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createECDH, createDecipheriv, createPublicKey, verify, hkdfSync, randomBytes } from 'node:crypto'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo, DEMO } from '../src/demo.js'
import { addDays, dayName, orgClock } from '../src/lib.js'
import { b64u, encryptPayload, generateVapidKeys, isAllowedEndpoint, vapidAuthorization } from '../src/webpush.js'

/** Sisi penerima (pelayar) bagi RFC 8291. Terbitan kunci bebas daripada kod penghantar. */
function makeDevice() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys()
  const auth = randomBytes(16)
  return { ecdh, auth, sub: { p256dh: b64u.enc(ecdh.getPublicKey()), auth: b64u.enc(auth) } }
}
function decrypt(body, dev) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), data = body.subarray(21 + idlen)
  assert.equal(body.readUInt32BE(16), 4096)
  const shared = dev.ecdh.computeSecret(asPub)
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), dev.ecdh.getPublicKey(), asPub])
  const ikm = Buffer.from(hkdfSync('sha256', shared, dev.auth, info, 32))
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const d = createDecipheriv('aes-128-gcm', cek, nonce)
  d.setAuthTag(data.subarray(data.length - 16))
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()])
  assert.equal(plain[plain.length - 1], 2, 'penanda rekod terakhir')
  return plain.subarray(0, plain.length - 1).toString('utf8')
}

test('RFC 8291 §5: vektor ujian rasmi menghasilkan badan sulit yang sama', () => {
  const out = encryptPayload('When I grow up, I want to be a watermelon',
    { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
    { asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw' })
  assert.equal(b64u.enc(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN')
})

test('penyulitan: pergi-balik dengan kunci rawak (termasuk muatan UTF-8 panjang); kunci rosak ditolak', () => {
  const dev = makeDevice()
  const msg = JSON.stringify({ title: 'Kelas bermula sekarang', body: 'Matematik Tingkatan 4A · Bilik 204. ' + 'x'.repeat(1500) })
  assert.equal(decrypt(encryptPayload(msg, dev.sub), dev), msg)
  assert.throws(() => encryptPayload('x', { p256dh: 'abc', auth: dev.sub.auth }))
  assert.throws(() => encryptPayload('x', { p256dh: dev.sub.p256dh, auth: 'abc' }))
})

test('VAPID: JWT ES256 sah, aud = asal endpoint, kunci awam dalam pengepala', () => {
  const k = generateVapidKeys()
  assert.equal(b64u.dec(k.publicKey).length, 65)
  const h = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', k, 'mailto:a@b.my', 1_800_000_000_000)
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h)
  assert.ok(m)
  assert.equal(m[4], k.publicKey)
  const claims = JSON.parse(b64u.dec(m[2]).toString())
  assert.equal(claims.aud, 'https://fcm.googleapis.com'); assert.equal(claims.sub, 'mailto:a@b.my'); assert.equal(claims.exp, 1_800_000_000 + 43200)
  const pub = b64u.dec(k.publicKey)
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.subarray(1, 33)), y: b64u.enc(pub.subarray(33)) } })
  assert.ok(verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key, dsaEncoding: 'ieee-p1363' }, b64u.dec(m[3])))
})

test('endpoint: hanya HTTPS daripada perkhidmatan push yang dikenali (cegah SSRF)', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/x']) assert.equal(isAllowedEndpoint(ok), true, ok)
  for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://127.0.0.1/x', 'http://localhost:8788/v1/x', 'https://user:pw@fcm.googleapis.com/x', 'javascript:alert(1)', '', 'bukan url']) assert.equal(isAllowedEndpoint(bad), false, bad)
})

// ---------------- integrasi: langganan + penjadual ----------------
let pushSrv, pushBase, received, nextStatus, server, base, db, ctx, org, teacherTok, adminTok, sess, classDate, seeded

const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
/** ms bagi tarikh + minit mengikut jam organisasi */
const atMs = (date, minutes) => {
  const off = orgClock(org, Date.parse(date + 'T12:00:00Z')).minutes - 720
  return Date.parse(date + 'T00:00:00Z') + (minutes - off) * 60_000
}
async function subscribe(token, dev, prefs, lang = 'ms') {
  const endpoint = `${pushBase}/push/${b64u.enc(randomBytes(8))}`
  const r = await call('POST', '/v1/push/subscribe', { token, body: { subscription: { endpoint, keys: dev.sub }, prefs, lang } })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  return endpoint
}

before(async () => {
  received = []; nextStatus = 201
  pushSrv = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => { received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.statusCode = nextStatus; res.end() })
  })
  await new Promise((r) => pushSrv.listen(0, '127.0.0.1', r))
  pushBase = `http://127.0.0.1:${pushSrv.address().port}`
  const config = {
    jwtSecret: 'push-test', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3, corsOrigin: '*', authRateMax: 1000, loginFailMax: 50,
    exposeInviteTokens: false, billingEnabled: false, appUrl: 'http://localhost:5174', mailFrom: 'CampusOS <no-reply@sekolah.test>', mailWebhook: '', smtpHost: '',
    billingSecret: '', resetTtlMs: 3600e3, devEndpoints: false, pushEnabled: true, pushAllowAnyHost: true, pushTestIntervalMs: 0, vapidSubject: 'mailto:admin@sekolah.test',
  }
  db = openDb(':memory:'); seeded = seedDemo(db)
  const app = createApp({ db, config }); ctx = app.ctx
  server = createServer(app.handler); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
  org = db.prepare('SELECT * FROM organizations LIMIT 1').get()
  teacherTok = (await call('POST', '/v1/auth/login', { body: { email: DEMO.teacher, password: DEMO.password } })).body.accessToken
  adminTok = (await call('POST', '/v1/auth/login', { body: { email: DEMO.admin, password: DEMO.password } })).body.accessToken
  // sesi Sarah (guru demo) + tarikh akan datang yang sepadan dengan harinya (bukan cuti/hari kelepasan)
  const t = db.prepare('SELECT id FROM teachers WHERE email=?').get(DEMO.teacher)
  sess = db.prepare('SELECT * FROM sessions WHERE teacher_id=? ORDER BY start_min LIMIT 1').get(t.id)
  classDate = addDays(seeded.today, 8)
  while (dayName(classDate) !== sess.day || ctx.svc.holidayOn?.(org.id, classDate)) classDate = addDays(classDate, 1)
})
after(() => { server.close(); pushSrv.close() })

test('API: konfigurasi awam VAPID; langganan memerlukan log masuk; endpoint/kunci tidak sah ditolak', async () => {
  assert.equal((await call('GET', '/v1/push/config')).status, 401)
  const cfg = await call('GET', '/v1/push/config', { token: teacherTok })
  assert.equal(cfg.body.enabled, true); assert.equal(b64u.dec(cfg.body.publicKey).length, 65)
  const dev = makeDevice()
  const post = (sub) => call('POST', '/v1/push/subscribe', { token: teacherTok, body: { subscription: sub } })
  ctx.push.hostOpts.allowAnyHost = false
  try {
    assert.equal((await post({ endpoint: `${pushBase}/x`, keys: dev.sub })).status, 400, 'http/localhost ditolak')
    assert.equal((await post({ endpoint: 'https://evil.example/x', keys: dev.sub })).status, 400)
  } finally { ctx.push.hostOpts.allowAnyHost = true }
  assert.equal((await post({ endpoint: `${pushBase}/x`, keys: { p256dh: 'abc', auth: dev.sub.auth } })).status, 400)
  assert.equal((await post({ endpoint: `${pushBase}/x`, keys: { p256dh: dev.sub.p256dh, auth: 'abc' } })).status, 400)
})

test('penjadual: push dihantar tepat pada masa mula, tersulit & bertandatangan VAPID, dalam BM, dan tidak berulang', async () => {
  received.length = 0
  const dev = makeDevice()
  const endpoint = await subscribe(teacherTok, dev, { enabled: true, start: true, end: true, leadMin: 0 }, 'ms')
  const t0 = atMs(classDate, sess.start_min)
  assert.equal(await ctx.push.tick(t0 - 60_000), 0, 'belum masanya')
  assert.equal(await ctx.push.tick(t0 + 5_000), 1)
  assert.equal(received.length, 1)
  const r = received[0]
  assert.equal(r.url, new URL(endpoint).pathname)
  assert.equal(r.headers['content-encoding'], 'aes128gcm'); assert.equal(r.headers.urgency, 'high'); assert.ok(Number(r.headers.ttl) > 0)
  const m = /^vapid t=([\w-]+\.[\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(r.headers.authorization)
  assert.ok(m)
  assert.equal(m[3], (await call('GET', '/v1/push/config', { token: teacherTok })).body.publicKey)
  assert.equal(JSON.parse(b64u.dec(m[1].split('.')[1]).toString()).aud, pushBase)
  const msg = JSON.parse(decrypt(r.body, dev))
  assert.equal(msg.kind, 'start'); assert.equal(msg.title, 'Kelas bermula sekarang')
  assert.ok(msg.body.includes(db.prepare('SELECT name FROM classes WHERE id=?').get(sess.class_id).name))
  assert.equal(await ctx.push.tick(t0 + 35_000), 0, 'tidak berulang pada minit yang sama')
  assert.equal(await ctx.push.tick(t0 + 90_000), 0, 'tidak berulang pada minit berikutnya')
  // tamat kelas
  received.length = 0
  assert.equal(await ctx.push.tick(atMs(classDate, sess.start_min + sess.duration) + 2_000), 1)
  assert.equal(JSON.parse(decrypt(received[0].body, dev)).title, 'Kelas telah tamat')
  await call('POST', '/v1/push/unsubscribe', { token: teacherTok, body: { endpoint } })
})

test('penjadual: bahasa English, peringatan awal 5 minit, tempoh lewat >2 minit dilangkau', async () => {
  received.length = 0
  const dev = makeDevice()
  const endpoint = await subscribe(teacherTok, dev, { enabled: true, start: true, end: false, leadMin: 5 }, 'en')
  const t0 = atMs(classDate, sess.start_min)
  assert.equal(await ctx.push.tick(t0 - 5 * 60_000 + 1000), 1)
  const soon = JSON.parse(decrypt(received[0].body, dev))
  assert.equal(soon.kind, 'soon'); assert.equal(soon.title, 'Class starts in 5 min')
  received.length = 0
  assert.equal(await ctx.push.tick(t0 + 1000), 1)
  assert.equal(JSON.parse(decrypt(received[0].body, dev)).title, 'Class starts now')
  received.length = 0
  assert.equal(await ctx.push.tick(atMs(classDate, sess.start_min + sess.duration)), 0, 'tamat dimatikan')
  const dev2 = makeDevice(); const ep2 = await subscribe(teacherTok, dev2, { enabled: true, start: true, end: true, leadMin: 0 })
  assert.equal(await ctx.push.tick(t0 + 4 * 60_000), 0, 'sudah lewat >2 minit')
  for (const e of [endpoint, ep2]) await call('POST', '/v1/push/unsubscribe', { token: teacherTok, body: { endpoint: e } })
})

test('penjadual: pref dimatikan, kelas dibatalkan, guru bercuti dan pengguna tanpa profil guru tidak menerima apa-apa', async () => {
  received.length = 0
  const dev = makeDevice()
  const ep = await subscribe(teacherTok, dev, { enabled: true, start: true, end: true, leadMin: 0 })
  const t0 = atMs(classDate, sess.start_min)
  // pref dimatikan melalui PATCH
  assert.equal((await call('PATCH', '/v1/push/prefs', { token: teacherTok, body: { endpoint: ep, prefs: { enabled: false } } })).status, 200)
  assert.equal(await ctx.push.tick(t0 + 1000), 0)
  await call('PATCH', '/v1/push/prefs', { token: teacherTok, body: { endpoint: ep, prefs: { enabled: true, start: true, end: true, leadMin: 0 } } })
  // kelas dibatalkan
  db.prepare('INSERT INTO session_cancellations (session_id,date,reason) VALUES (?,?,?)').run(sess.id, classDate, 'ujian')
  assert.equal(await ctx.push.tick(t0 + 1000), 0)
  db.prepare('DELETE FROM session_cancellations WHERE session_id=? AND date=?').run(sess.id, classDate)
  // guru bercuti (diluluskan)
  const tid = db.prepare('SELECT id FROM teachers WHERE email=?').get(DEMO.teacher).id
  db.prepare("INSERT INTO leave_requests (id,org_id,teacher_id,type,from_date,to_date,days,reason,status,created_at) VALUES ('lv-x',?,?,'Casual leave',?,?,1,'ujian','Approved',?)").run(org.id, tid, classDate, classDate, Date.now())
  assert.equal(await ctx.push.tick(t0 + 1000), 0)
  db.prepare("DELETE FROM leave_requests WHERE id='lv-x'").run()
  // admin tanpa profil guru
  const adminDev = makeDevice(); const adminEp = await subscribe(adminTok, adminDev, {})
  received.length = 0
  await ctx.push.tick(t0 + 1000)
  assert.ok(!received.some((x) => x.url === new URL(adminEp).pathname))
  await call('POST', '/v1/push/unsubscribe', { token: teacherTok, body: { endpoint: ep } })
  await call('POST', '/v1/push/unsubscribe', { token: adminTok, body: { endpoint: adminEp } })
})

test('penjadual: hari cuti umum sekolah tidak menghantar alarm', async () => {
  received.length = 0
  const dev = makeDevice(); const ep = await subscribe(teacherTok, dev, {})
  db.prepare("INSERT INTO holidays (id,org_id,title,start_date,end_date,type,created_at) VALUES ('h-x',?,?,?,?,'Public Holiday',?)").run(org.id, 'Cuti ujian', classDate, classDate, Date.now())
  assert.equal(await ctx.push.tick(atMs(classDate, sess.start_min) + 1000), 0)
  db.prepare("DELETE FROM holidays WHERE id='h-x'").run()
  assert.equal(await ctx.push.tick(atMs(classDate, sess.start_min) + 1000), 1, 'selepas cuti dipadam, alarm dihantar semula')
  await call('POST', '/v1/push/unsubscribe', { token: teacherTok, body: { endpoint: ep } })
})

test('penghantaran: 410 memadam langganan; ralat sementara dikira tanpa memadam; pengguna lain tidak boleh padam langganan orang lain', async () => {
  const dev = makeDevice(); const ep = await subscribe(teacherTok, dev, {})
  const count = () => db.prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE endpoint=?').get(ep).c
  nextStatus = 503
  assert.equal((await call('POST', '/v1/push/test', { token: teacherTok })).body.sent, 0)
  assert.equal(count(), 1); assert.equal(db.prepare('SELECT fail_count f FROM push_subscriptions WHERE endpoint=?').get(ep).f, 1)
  await call('POST', '/v1/push/unsubscribe', { token: adminTok, body: { endpoint: ep } }) // admin cuba padam langganan guru
  assert.equal(count(), 1)
  nextStatus = 410
  assert.equal((await call('POST', '/v1/push/test', { token: teacherTok })).status, 200)
  assert.equal(count(), 0, '410 Gone → langganan dipadam')
  nextStatus = 201
})

test('ujian push: notifikasi ujian sampai ke semua peranti pengguna dan boleh dinyahsulit; langganan dipindah apabila pengguna lain log masuk pada peranti sama', async () => {
  received.length = 0
  const dev = makeDevice(); const ep = await subscribe(teacherTok, dev, {}, 'en')
  const r = await call('POST', '/v1/push/test', { token: teacherTok })
  assert.deepEqual(r.body, { devices: 1, sent: 1 })
  assert.equal(JSON.parse(decrypt(received.at(-1).body, dev)).title, 'Test notification')
  // peranti sama, pengguna lain log masuk & melanggan → endpoint berpindah milik (guru tidak lagi menerima alarm pada telefon itu)
  const teacherId = db.prepare("SELECT id FROM users WHERE email=?").get(DEMO.teacher).id
  const adminId = db.prepare("SELECT id FROM users WHERE email=?").get(DEMO.admin).id
  assert.equal(db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint=?').get(ep).user_id, teacherId)
  const re = await call('POST', '/v1/push/subscribe', { token: adminTok, body: { subscription: { endpoint: ep, keys: dev.sub }, prefs: {} } })
  assert.equal(re.status, 201)
  assert.equal(db.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint=?').get(ep).user_id, adminId)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM push_subscriptions WHERE endpoint=?').get(ep).c, 1, 'tiada pendua')
  await call('POST', '/v1/push/unsubscribe', { token: adminTok, body: { endpoint: ep } })
})
