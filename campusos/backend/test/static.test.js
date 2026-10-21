import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { openDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { seedDemo } from '../src/demo.js'
import { createStatic, withStatic } from '../src/static.js'

let dir, server, base
const big = 'console.log("campusos");\n'.repeat(80)
const get = (path, headers = {}, method = 'GET') => fetch(base + path, { method, headers, redirect: 'manual' })

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'campusos-dist-'))
  mkdirSync(join(dir, 'assets')); mkdirSync(join(dir, 'sub'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>CampusOS</title><div id="root"></div>')
  writeFileSync(join(dir, 'sw.js'), '// sw')
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"CampusOS"}')
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), big)
  writeFileSync(join(dir, 'assets', 'app-abc123.css'), 'body{margin:0}')
  writeFileSync(join(dirname(dir), 'rahsia-luar.txt'), 'JANGAN BOCOR')
  const db = openDb(':memory:'); seedDemo(db)
  const config = { jwtSecret: 'static-test', accessTtlSec: 900, refreshTtlSec: 86400, inviteTtlMs: 86400e3, corsOrigin: '*', authRateMax: 1000, loginFailMax: 50, exposeInviteTokens: false, billingEnabled: false, appUrl: 'http://localhost', mailFrom: 'a@b.c', mailWebhook: '', smtpHost: '', billingSecret: '', resetTtlMs: 3600e3, devEndpoints: false, pushEnabled: false }
  const { handler } = createApp({ db, config })
  server = createServer(withStatic(handler, createStatic(dir, { hsts: true })))
  await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`
})
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); rmSync(join(dirname(dir), 'rahsia-luar.txt'), { force: true }) })

test('halaman utama dan laluan SPA menghidangkan index.html dengan pengepala keselamatan', async () => {
  for (const p of ['/', '/teachers/abc', '/leave?x=1']) {
    const r = await get(p)
    assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/html/)
    assert.equal(r.headers.get('cache-control'), 'no-cache')
    assert.match(await r.text(), /id="root"/)
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.headers.get('x-frame-options'), 'DENY')
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/)
  }
})

test('fail ber-hash: cache setahun & immutable; JS dimampatkan gzip (bait sebenar lebih kecil) dan boleh dinyahmampat; tanpa gzip dihantar penuh', async () => {
  const { request } = await import('node:http')
  const raw = (h) => new Promise((ok, no) => request(base + '/assets/app-abc123.js', { headers: h }, (res) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => ok({ res, body: Buffer.concat(c) })) }).on('error', no).end())
  const z = await raw({ 'accept-encoding': 'gzip' })
  assert.equal(z.res.statusCode, 200); assert.equal(z.res.headers['cache-control'], 'public, max-age=31536000, immutable')
  assert.match(z.res.headers['content-type'], /javascript/); assert.equal(z.res.headers['content-encoding'], 'gzip')
  assert.ok(z.body.length < big.length / 5, 'dimampatkan'); assert.equal(gunzipSync(z.body).toString(), big)
  assert.equal(Number(z.res.headers['content-length']), z.body.length)
  const p = await raw({ 'accept-encoding': 'identity' })
  assert.equal(p.res.headers['content-encoding'], undefined); assert.equal(p.body.toString(), big)
})

test('service worker dan manifest tidak dicache lama; jenis kandungan betul', async () => {
  const sw = await get('/sw.js'); assert.equal(sw.headers.get('cache-control'), 'no-cache'); assert.match(sw.headers.get('content-type'), /javascript/)
  const mf = await get('/manifest.webmanifest'); assert.match(mf.headers.get('content-type'), /manifest\+json/)
  assert.equal((await get('/assets/app-abc123.css')).headers.get('content-type').startsWith('text/css'), true)
})

test('fail yang tiada: 404 biasa (bukan HTML SPA) supaya import skrip yang hilang kelihatan sebagai ralat; HEAD tiada badan', async () => {
  const r = await get('/assets/tiada.js'); assert.equal(r.status, 404); assert.doesNotMatch(await r.text(), /id="root"/)
  const h = await get('/', {}, 'HEAD'); assert.equal(h.status, 200); assert.equal(await h.text(), '')
})

test('keselamatan: tidak boleh keluar dari folder dist (../, %2e%2e, null byte, laluan mutlak)', async () => {
  for (const p of ['/../rahsia-luar.txt', '/%2e%2e/rahsia-luar.txt', '/assets/..%2f..%2frahsia-luar.txt', '/%00', '/..%5crahsia-luar.txt']) {
    const r = await get(p)
    const t = await r.text()
    assert.ok(!t.includes('JANGAN BOCOR'), `bocor melalui ${p}`)
  }
  const raw = await new Promise((ok) => { import('node:net').then(({ default: net }) => { const s = net.connect(server.address().port, 'localhost', () => s.write('GET /../rahsia-luar.txt HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')); let d = ''; s.on('data', (c) => (d += c)); s.on('end', () => ok(d)) }) })
  assert.ok(!raw.includes('JANGAN BOCOR'))
})

test('laluan API tidak terjejas: /health dan /v1/* dikendalikan API; kaedah bukan GET tidak dihidangkan sebagai fail', async () => {
  const h = await get('/health'); assert.equal(h.status, 200); const hj = await h.json(); assert.equal(hj.status ?? hj.data?.status, 'ok')
  const nf = await get('/v1/tiada'); assert.equal(nf.status, 404)
  const j = await nf.json(); assert.equal(j.error?.code ?? j.code, 'NOT_FOUND')
  const post = await fetch(base + '/teachers', { method: 'POST' }); assert.equal(post.status, 404)
  assert.match(post.headers.get('content-type'), /json/)
})

test('HSTS hanya apabila di belakang proksi HTTPS (x-forwarded-proto)', async () => {
  assert.equal((await get('/')).headers.get('strict-transport-security'), null)
  assert.match((await get('/', { 'x-forwarded-proto': 'https' })).headers.get('strict-transport-security'), /max-age=/)
})
