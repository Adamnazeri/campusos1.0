export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message ?? code)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export function compileRoutes(defs) {
  return defs.map(([method, path, handler, opts = {}]) => {
    const keys = []
    const re = new RegExp('^' + path.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$')
    return { method, re, keys, handler, auth: opts.auth !== false, perm: opts.perm, gate: !!opts.gate }
  })
}

export function matchRoute(routes, method, pathname) {
  let pathMatched = false
  for (const r of routes) {
    const m = r.re.exec(pathname)
    if (!m) continue
    pathMatched = true
    if (r.method !== method) continue
    const params = {}
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])))
    return { route: r, params }
  }
  return { route: null, pathMatched }
}

export async function readBody(req, limit = 1_000_000) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > limit) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Body terlalu besar')
    chunks.push(c)
  }
  return Buffer.concat(chunks)
}

export async function readJson(req, limit = 2_000_000) {
  const buf = await readBody(req, limit)
  if (!buf.length) return {}
  try {
    const v = JSON.parse(buf.toString('utf8'))
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error()
    return v
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Body mesti berupa JSON object')
  }
}

export function send(res, status, data, headers = {}) {
  if (res.headersSent) return
  const isText = typeof data === 'string'
  const body = data === undefined ? '' : isText ? data : JSON.stringify(data)
  res.writeHead(status, {
    'content-type': isText ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  })
  res.end(body)
}

export function createLimiter(max, windowMs) {
  const hits = new Map()
  return (key) => {
    const now = Date.now()
    const h = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
    h.push(now)
    hits.set(key, h)
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
    if (h.length > max) throw new HttpError(429, 'RATE_LIMITED', 'Terlalu banyak percubaan, cuba sebentar lagi')
  }
}

export function toCsv(columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    // cegah CSV/formula injection di Excel
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n')
}

/** Had KEGAGALAN (mis. salah kata laluan) bagi satu kunci (akaun). Tidak mengira percubaan yang berjaya. */
export function createFailureLimiter(max, windowMs) {
  const fails = new Map()
  const recent = (key, now) => (fails.get(key) ?? []).filter((t) => now - t < windowMs)
  return {
    check(key) {
      if (recent(key, Date.now()).length >= max) throw new HttpError(429, 'ACCOUNT_LOCKED', 'Terlalu banyak percubaan gagal. Cuba lagi dalam beberapa minit.')
    },
    fail(key) {
      const now = Date.now()
      const h = recent(key, now); h.push(now); fails.set(key, h)
      if (fails.size > 5000) for (const [k] of fails) if (!recent(k, now).length) fails.delete(k)
    },
    reset(key) { fails.delete(key) },
  }
}

/**
 * IP klien. Jika backend di belakang reverse proxy, tetapkan TRUST_PROXY=<bilangan proxy>;
 * kita ambil entri ke-N dari KANAN X-Forwarded-For (yang ditambah proxy kita, bukan yang dipalsukan klien).
 * Tanpa TRUST_PROXY, header itu diabaikan sepenuhnya.
 */
export function clientIp(req, trustProxy = 0) {
  const direct = req.socket?.remoteAddress ?? 'unknown'
  const hops = Number(trustProxy) || 0
  if (!hops) return direct
  const parts = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return parts[parts.length - hops] ?? direct
}
