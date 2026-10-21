// Web Push: langganan peranti + penjadual alarm kelas (hantar notifikasi pada masa mula/tamat walaupun app ditutup).
import { HttpError } from '../http.js'
import { clock } from '../validate.js'
import { orgClock } from '../lib.js'
import { newId } from '../security.js'
import { generateVapidKeys, isAllowedEndpoint, sendPush, b64u } from '../webpush.js'

const GRACE_MIN = 2
const MAX_SUBS_PER_USER = 10
const DEFAULT_PREFS = { enabled: true, start: true, end: true, leadMin: 0 }

const TEXT = {
  start: { en: 'Class starts now', ms: 'Kelas bermula sekarang' },
  end: { en: 'Class has ended', ms: 'Kelas telah tamat' },
  soon: { en: 'Class starts in {n} min', ms: 'Kelas bermula dalam {n} minit' },
  test: { en: 'Test notification', ms: 'Notifikasi ujian' },
  testBody: { en: 'Alarm notifications are working on this device.', ms: 'Notifikasi alarm berfungsi pada peranti ini.' },
}
const tr = (k, lang, n) => (TEXT[k][lang === 'en' ? 'en' : 'ms']).replace('{n}', String(n ?? ''))

export function normalizePrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const b = (k) => (typeof r[k] === 'boolean' ? r[k] : DEFAULT_PREFS[k])
  return { enabled: b('enabled'), start: b('start'), end: b('end'), leadMin: r.leadMin === 5 || r.leadMin === 10 ? r.leadMin : 0 }
}
const parsePrefs = (s) => { try { return normalizePrefs(JSON.parse(s)) } catch { return { ...DEFAULT_PREFS } } }

/** Cipta perkhidmatan push (dilekatkan pada ctx.push). `deps.fetch` boleh diganti dalam ujian. */
export function createPush(ctx, deps = {}) {
  const { q, config } = ctx
  const fetchFn = deps.fetch ?? fetch
  const enabled = config.pushEnabled !== false

  // ---- kunci VAPID: env > pangkalan data > jana baharu ----
  function loadKeys() {
    if (config.vapidPublicKey && config.vapidPrivateKey) return { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey }
    const row = q("SELECT v FROM app_kv WHERE k='vapid'").get()
    if (row) { try { return JSON.parse(row.v) } catch { /* jana semula */ } }
    const keys = generateVapidKeys()
    q("INSERT OR REPLACE INTO app_kv (k,v) VALUES ('vapid',?)").run(JSON.stringify(keys))
    return keys
  }
  const keys = enabled ? loadKeys() : null
  const subject = config.vapidSubject || `mailto:${(/<([^>]+)>/.exec(config.mailFrom ?? '')?.[1] ?? config.mailFrom ?? 'admin@localhost').trim()}`
  const hostOpts = { allowAnyHost: !!config.pushAllowAnyHost, ...(config.pushAllowedHosts ? { allowedHosts: config.pushAllowedHosts } : {}) }

  async function deliver(sub, payload) {
    try {
      const r = await sendPush(sub, payload, { keys, subject, fetchFn, nowMs: deps.now?.() ?? Date.now() })
      if (r.ok) q('UPDATE push_subscriptions SET last_ok_at=?, fail_count=0 WHERE id=?').run(Date.now(), sub.id)
      else if (r.gone) q('DELETE FROM push_subscriptions WHERE id=?').run(sub.id)
      else {
        q('UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=?').run(sub.id)
        q('DELETE FROM push_subscriptions WHERE id=? AND fail_count>=20').run(sub.id)
        console.error(`[push] ${r.status} untuk langganan ${sub.id}`)
      }
      return r
    } catch (e) {
      q('UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=?').run(sub.id)
      console.error('[push] gagal:', e.message)
      return { status: 0, ok: false, gone: false }
    }
  }

  // ---- sesi guru pada hari ini (sama seperti dashboard guru) ----
  function daySessions(org, user, clk) {
    const t = ctx.teacherOf(user)
    if (!t) return []
    const cancelled = new Set(q('SELECT session_id FROM session_cancellations WHERE date=?').all(clk.date).map((r) => r.session_id))
    // guru yang cuti (diluluskan) tidak diberi alarm untuk kelas sendiri; kelas ganti yang ditugaskan kepadanya tetap dihantar
    const onLeave = !!q("SELECT 1 FROM leave_requests WHERE teacher_id=? AND status='Approved' AND from_date<=? AND to_date>=?").get(t.id, clk.date, clk.date)
    const own = onLeave ? [] : ctx.svc.sessions(org.id, { teacherId: t.id, day: clk.day })
    const relief = q(`SELECT s.* FROM session_substitutions sub JOIN sessions s ON s.id=sub.session_id
      WHERE sub.org_id=? AND sub.date=? AND sub.substitute_teacher_id=?`).all(org.id, clk.date, t.id)
      .map((s) => ({ id: s.id, start: clock.fmt(s.start_min), end: clock.fmt(s.start_min + s.duration) }))
    const detail = new Map(ctx.svc.sessions(org.id, { day: clk.day }).map((s) => [s.id, s]))
    return [...own, ...relief].filter((s) => !cancelled.has(s.id)).map((s) => {
      const d = detail.get(s.id) ?? s
      return { id: s.id, start: s.start, end: s.end, className: d.className ?? '', subject: d.subject ?? '', room: d.room ?? '' }
    })
  }

  /** Acara yang patut dihantar pada minit ini bagi satu peranti. */
  function dueFor(sessions, nowMin, p) {
    if (!p.enabled) return []
    const out = []
    for (const s of sessions) {
      const st = clock.toMin(s.start), en = clock.toMin(s.end)
      if (!Number.isFinite(st) || !Number.isFinite(en)) continue
      for (const [kind, at, on] of [['soon', st - p.leadMin, p.start && p.leadMin > 0], ['start', st, p.start], ['end', en, p.end]]) {
        if (on && at >= 0 && nowMin >= at && nowMin - at <= GRACE_MIN) out.push({ kind, at, s })
      }
    }
    return out.sort((a, b) => a.at - b.at)
  }

  /** Dipanggil berkala (setiap ~30s). Mengembalikan bilangan push yang dihantar. */
  async function tick(nowMs = Date.now()) {
    if (!enabled) return 0
    const subs = q('SELECT s.* FROM push_subscriptions s JOIN users u ON u.id=s.user_id AND u.active=1').all()
    if (!subs.length) return 0
    q('DELETE FROM push_sent WHERE sent_at<?').run(nowMs - 3 * 24 * 3600_000)
    const orgs = new Map(), users = new Map(), days = new Map()
    const jobs = []
    for (const sub of subs) {
      if (!orgs.has(sub.org_id)) orgs.set(sub.org_id, q('SELECT * FROM organizations WHERE id=?').get(sub.org_id))
      const org = orgs.get(sub.org_id); if (!org) continue
      const clk = orgClock(org, nowMs)
      if (ctx.settingsOf(org).holidays !== false && ctx.svc.holidayOn?.(org.id, clk.date)) continue
      if (!users.has(sub.user_id)) users.set(sub.user_id, q('SELECT * FROM users WHERE id=?').get(sub.user_id))
      const dk = `${sub.user_id}|${clk.date}`
      if (!days.has(dk)) days.set(dk, daySessions(org, users.get(sub.user_id), clk))
      for (const ev of dueFor(days.get(dk), clk.minutes, parsePrefs(sub.prefs))) {
        const key = `${clk.date}|${ev.s.id}|${ev.kind}|${sub.id}`
        if (q('INSERT OR IGNORE INTO push_sent (key,sent_at) VALUES (?,?)').run(key, nowMs).changes === 0) continue // sudah dihantar
        const p = parsePrefs(sub.prefs)
        const n = ev.kind === 'soon' ? p.leadMin : undefined
        const body = [ev.s.className, ev.s.subject, ev.s.room].filter(Boolean).join(' · ') + ` (${ev.s.start}–${ev.s.end})`
        jobs.push([sub, { title: tr(ev.kind, sub.lang, n), body, tag: key, kind: ev.kind, url: '/' }])
      }
    }
    for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map(([sub, payload]) => deliver(sub, payload)))
    return jobs.length
  }

  async function sendTest(user, lang) {
    const subs = q('SELECT * FROM push_subscriptions WHERE user_id=?').all(user.id)
    const l = lang === 'en' ? 'en' : 'ms'
    const rs = await Promise.all(subs.map((s) => deliver(s, { title: tr('test', s.lang ?? l), body: tr('testBody', s.lang ?? l), tag: `test-${Date.now()}`, kind: 'test', url: '/' })))
    return { devices: subs.length, sent: rs.filter((r) => r.ok).length }
  }

  return { enabled, publicKey: keys?.publicKey ?? null, tick, sendTest, hostOpts, subject }
}

export function pushRoutes(ctx) {
  const { q } = ctx
  const bad400 = (msg) => new HttpError(400, 'VALIDATION', msg)
  const lastTest = new Map()

  const config = ({ }) => ({ enabled: ctx.push.enabled, publicKey: ctx.push.publicKey })

  function parseSub(body) {
    const sub = body?.subscription ?? {}
    const endpoint = typeof sub.endpoint === 'string' ? sub.endpoint : ''
    if (!isAllowedEndpoint(endpoint, ctx.push.hostOpts)) throw bad400('endpoint push tidak sah atau tidak dibenarkan')
    const p256dh = sub.keys?.p256dh, auth = sub.keys?.auth
    const pk = b64u.dec(p256dh)
    if (pk.length !== 65 || pk[0] !== 4) throw bad400('kunci p256dh tidak sah')
    if (b64u.dec(auth).length !== 16) throw bad400('kunci auth tidak sah')
    return { endpoint, p256dh, auth }
  }
  const langOf = (v) => (v === 'en' ? 'en' : 'ms')

  const subscribe = async ({ user, org, req, body }) => {
    if (!ctx.push.enabled) throw new HttpError(503, 'PUSH_DISABLED', 'Notifikasi push dimatikan pada pelayan ini')
    const b = await body()
    const s = parseSub(b)
    const prefs = JSON.stringify(normalizePrefs(b.prefs))
    const ua = String(req.headers['user-agent'] ?? '').slice(0, 200)
    const now = Date.now()
    // endpoint yang sama = peranti yang sama: dipindahkan kepada pengguna semasa (cth. telefon dikongsi)
    q(`INSERT INTO push_subscriptions (id,org_id,user_id,endpoint,p256dh,auth,prefs,lang,user_agent,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET org_id=excluded.org_id, user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth,
         prefs=excluded.prefs, lang=excluded.lang, user_agent=excluded.user_agent, updated_at=excluded.updated_at, fail_count=0`)
      .run(newId(), org.id, user.id, s.endpoint, s.p256dh, s.auth, prefs, langOf(b.lang), ua, now, now)
    q(`DELETE FROM push_subscriptions WHERE user_id=? AND id NOT IN (SELECT id FROM push_subscriptions WHERE user_id=? ORDER BY updated_at DESC LIMIT ?)`).run(user.id, user.id, MAX_SUBS_PER_USER)
    return { __status: 201, data: { subscribed: true } }
  }

  const unsubscribe = async ({ user, body }) => {
    const b = await body()
    if (typeof b?.endpoint !== 'string') throw bad400('endpoint diperlukan')
    q('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').run(b.endpoint, user.id)
    return undefined
  }

  const patchPrefs = async ({ user, body }) => {
    const b = await body()
    if (typeof b?.endpoint !== 'string') throw bad400('endpoint diperlukan')
    const r = q('UPDATE push_subscriptions SET prefs=?, lang=?, updated_at=? WHERE endpoint=? AND user_id=?')
      .run(JSON.stringify(normalizePrefs(b.prefs)), langOf(b.lang), Date.now(), b.endpoint, user.id)
    if (!r.changes) throw new HttpError(404, 'NOT_FOUND', 'Langganan tidak ditemui; sila hidupkan semula alarm latar belakang')
    return { ok: true }
  }

  const test = async ({ user, body }) => {
    const b = await body().catch(() => ({}))
    const last = lastTest.get(user.id) ?? 0
    if (Date.now() - last < (ctx.config.pushTestIntervalMs ?? 5000)) throw new HttpError(429, 'RATE_LIMITED', 'Cuba lagi sebentar')
    lastTest.set(user.id, Date.now())
    return ctx.push.sendTest(user, b?.lang)
  }

  return [
    ['GET', '/v1/push/config', config],
    ['POST', '/v1/push/subscribe', subscribe],
    ['POST', '/v1/push/unsubscribe', unsubscribe],
    ['PATCH', '/v1/push/prefs', patchPrefs],
    ['POST', '/v1/push/test', test],
  ]
}
