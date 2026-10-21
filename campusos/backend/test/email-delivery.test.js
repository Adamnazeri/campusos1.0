import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { createServer } from 'node:http'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo, DEMO } from '../src/demo.js'

/** Pelayan SMTP tiruan (tanpa TLS/AUTH). Merekod mesej yang diterima; `rejectRcpt` = balas 550. */
function fakeSmtp() {
  const state = { messages: [], rejectRcpt: false }
  const server = net.createServer((sock) => {
    let data = false, raw = '', rcpt = ''
    sock.write('220 fake ESMTP\r\n')
    sock.on('data', (d) => {
      raw += d.toString('utf8')
      for (;;) {
        if (data) {
          const end = raw.indexOf('\r\n.\r\n'); if (end < 0) return
          state.messages.push({ to: rcpt, raw: raw.slice(0, end) }); raw = raw.slice(end + 5); data = false
          sock.write('250 queued\r\n'); continue
        }
        const nl = raw.indexOf('\r\n'); if (nl < 0) return
        const line = raw.slice(0, nl); raw = raw.slice(nl + 2)
        const c = line.toUpperCase()
        if (c.startsWith('EHLO')) sock.write('250-fake\r\n250 8BITMIME\r\n')
        else if (c.startsWith('MAIL FROM')) sock.write('250 ok\r\n')
        else if (c.startsWith('RCPT TO')) { rcpt = line.slice(8); sock.write(state.rejectRcpt ? '550 mailbox unavailable\r\n' : '250 ok\r\n') }
        else if (c === 'DATA') { data = true; sock.write('354 go\r\n') }
        else if (c === 'QUIT') { sock.write('221 bye\r\n'); sock.end() }
        else sock.write('250 ok\r\n')
      }
    })
    sock.on('error', () => {})
  })
  return { state, server }
}
const bodyText = (raw) => Buffer.from(raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8')

let smtp, server, base, db, admin
const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

before(async () => {
  smtp = fakeSmtp(); await new Promise((r) => smtp.server.listen(0, '127.0.0.1', r))
  const config = {
    jwtSecret: 'mail-test', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3, corsOrigin: '*', authRateMax: 1000, loginFailMax: 50,
    exposeInviteTokens: false, billingEnabled: false, appUrl: 'https://campusos.sekolah.test', mailFrom: 'CampusOS <no-reply@sekolah.test>', mailWebhook: '',
    smtpHost: '127.0.0.1', smtpPort: smtp.server.address().port, smtpSecure: false, smtpUser: '', smtpPass: '', smtpRejectUnauthorized: true,
    billingSecret: '', resetTtlMs: 3600e3, devEndpoints: false,
  }
  db = openDb(':memory:'); seedDemo(db)
  server = createServer(createApp({ db, config }).handler)
  await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
  admin = (await call('POST', '/v1/auth/login', { body: { email: DEMO.admin, password: DEMO.password } })).body.accessToken
})
after(() => { server.close(); smtp.server.close() })

test('jemputan: e-mel BENAR-BENAR sampai ke pelayan SMTP dengan pautan yang boleh digunakan', async () => {
  const r = await call('POST', '/v1/invites', { token: admin, body: { email: 'cikgu.baru@sekolah.test', role: 'teacher' } })
  assert.equal(r.status, 201)
  assert.equal(r.body.emailed, true)
  assert.equal(r.body.token, undefined, 'pautan tidak didedahkan jika e-mel berjaya dihantar')
  const m = smtp.state.messages.find((x) => x.to.includes('cikgu.baru@sekolah.test'))
  assert.ok(m, 'pelayan SMTP menerima mesej')
  const text = bodyText(m.raw)
  assert.match(text, /https:\/\/campusos\.sekolah\.test\/\?invite=[A-Za-z0-9_-]+/)
  assert.match(m.raw, /^Subject: You're invited/m)
  // pautan itu sah: terima jemputan → boleh log masuk
  const token = /invite=([A-Za-z0-9_-]+)/.exec(text)[1]
  const acc = await call('POST', '/v1/auth/accept-invite', { body: { token, name: 'Cikgu Baru', password: 'KataLaluan#2026' } })
  assert.ok([200, 201].includes(acc.status), JSON.stringify(acc.body))
  const list = await call('GET', '/v1/invites', { token: admin })
  assert.ok(!list.body.items.some((i) => i.email === 'cikgu.baru@sekolah.test'))
})

test('tambah guru: jemputan dihantar sebenar dan dilaporkan emailed=true', async () => {
  const r = await call('POST', '/v1/teachers', { token: admin, body: { name: 'Puan Rohana', email: 'rohana@sekolah.test', title: 'Teacher', weeklyHours: 18 } })
  assert.equal(r.status, 201)
  assert.equal(r.body.emailed, true)
  assert.ok(smtp.state.messages.some((x) => x.to.includes('rohana@sekolah.test')))
})

test('SMTP menolak penerima: emailed=false, ralat dipaparkan, pautan manual diberi, status dalam senarai jemputan', async () => {
  smtp.state.rejectRcpt = true
  const r = await call('POST', '/v1/invites', { token: admin, body: { email: 'salah@sekolah.test', role: 'teacher' } })
  assert.equal(r.status, 201)
  assert.equal(r.body.emailed, false)
  assert.match(r.body.emailError, /550/)
  assert.ok(r.body.token, 'admin diberi pautan untuk dikongsi manual')
  const list = (await call('GET', '/v1/invites', { token: admin })).body.items.find((i) => i.email === 'salah@sekolah.test')
  assert.equal(list.emailStatus, 'failed')
  assert.match(list.emailError, /550/)
  smtp.state.rejectRcpt = false
})
