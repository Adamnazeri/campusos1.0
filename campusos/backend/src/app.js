import { HttpError, clientIp, compileRoutes, matchRoute, readJson, send } from './http.js'
import { verifyJwt } from './security.js'
import { can } from './perms.js'
import { makeCtx } from './lib.js'
import { createMailer } from './mailer.js'
import { authRoutes } from './modules/auth.js'
import { orgRoutes } from './modules/org.js'
import { peopleRoutes } from './modules/people.js'
import { scheduleRoutes } from './modules/schedule.js'
import { subjectRoutes } from './modules/subjects.js'
import { importRoutes } from './modules/import.js'
import { resultRoutes } from './modules/results.js'
import { workRoutes } from './modules/work.js'
import { insightRoutes } from './modules/insight.js'
import { createPush, pushRoutes } from './modules/push.js'

export function createApp({ db, config, deps = {} }) {
  const ctx = makeCtx(db, config)
  ctx.mail = createMailer(ctx, deps.fetch, deps.smtp)
  ctx.push = createPush(ctx, { fetch: deps.pushFetch, now: deps.now })
  // pautan jemputan dipulangkan kepada admin hanya jika e-mel tidak boleh dihantar (supaya mereka boleh kongsi secara manual), atau dalam dev
  ctx.exposeInviteLinks = () => !!config.exposeInviteTokens || !ctx.mail.configured()
  const defs = [
    ['GET', '/health', () => {
      try { ctx.q('SELECT 1').get() } catch { throw new HttpError(503, 'DB_UNAVAILABLE', 'Pangkalan data tidak tersedia') }
      return { status: 'ok', time: Date.now() }
    }, { auth: false }],
    ...authRoutes(ctx), ...orgRoutes(ctx), ...insightRoutes(ctx), ...peopleRoutes(ctx), // insight dahulu: /teachers/workload mesti menang atas /teachers/:id
    ...subjectRoutes(ctx), ...importRoutes(ctx), ...resultRoutes(ctx), ...scheduleRoutes(ctx), ...workRoutes(ctx), ...pushRoutes(ctx),
  ]
  const routes = compileRoutes(defs)
  const allowed = config.corsOrigin.split(',').map((s) => s.trim())

  function authenticate(req) {
    const h = req.headers.authorization ?? ''
    const p = h.startsWith('Bearer ') ? verifyJwt(h.slice(7), config.jwtSecret) : null
    const user = p && ctx.q('SELECT * FROM users WHERE id=? AND active=1').get(p.sub)
    if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Token tidak sah atau telah tamat tempoh')
    return user
  }

  async function handler(req, res) {
    const origin = req.headers.origin
    const cors = {
      'access-control-allow-origin': allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0],
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-max-age': '86400',
      vary: 'Origin',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-site',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'cache-control': 'no-store',
      ...(config.hsts ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
    }
    try {
      if (req.method === 'OPTIONS') return send(res, 204, undefined, cors)
      const url = new URL(req.url, 'http://localhost')
      const { route, params, pathMatched } = matchRoute(routes, req.method, url.pathname)
      if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND', 'Endpoint tidak ditemui')
      const c = {
        req, res, params, query: url.searchParams, ip: clientIp(req, config.trustProxy),
        body: () => readJson(req), user: null, org: null,
      }
      if (route.auth) {
        c.user = authenticate(req)
        c.org = ctx.q('SELECT * FROM organizations WHERE id=?').get(c.user.org_id)
        // organisasi mewajibkan 2FA: akaun tanpa 2FA hanya boleh menyediakannya (route bertanda gate)
        if (!route.gate && !c.user.totp_enabled && ctx.settingsOf(c.org).security.twoFactor)
          throw new HttpError(403, 'TWO_FACTOR_REQUIRED', 'Organisasi anda mewajibkan pengesahan dua faktor. Sediakan 2FA untuk meneruskan.')
        if (route.perm && !can(c.user.role, route.perm))
          throw new HttpError(403, 'FORBIDDEN', 'Anda tidak mempunyai kebenaran untuk tindakan ini', { required: route.perm })
      }
      const out = await route.handler(c)
      setImmediate(() => ctx.mail.flush().catch(() => {}))
      if (out === undefined) return send(res, 204, undefined, cors)
      if (out.__raw) return send(res, out.__raw.status, out.__raw.body, { ...cors, ...out.__raw.headers })
      if (out.__status) return send(res, out.__status, out.data, cors)
      send(res, 200, out, cors)
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: { code: e.code, message: e.message, ...e.extra } }, cors)
      console.error(e)
      send(res, 500, { error: { code: 'INTERNAL', message: 'Ralat dalaman pada pelayan' } }, cors)
    }
  }

  return { handler, ctx }
}
