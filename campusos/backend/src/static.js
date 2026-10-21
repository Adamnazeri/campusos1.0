// Pelayan fail statik untuk frontend yang sudah di-build (frontend/dist). Membolehkan SATU proses Node menghidangkan app dan API,
// berguna untuk pilot percuma di komputer sendiri (dilepaskan melalui satu port) dan hos kecil tanpa nginx.
import { createReadStream, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { extname, join, resolve, sep } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.map'])

// sama dengan frontend/nginx.conf (fon daripada Google Fonts dibenarkan)
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
}

/** Pulangkan fungsi (req,res) => boolean. `true` = permintaan telah dikendalikan. Laluan API (/v1/*, /health) tidak disentuh. */
export function createStatic(dir, { hsts = false } = {}) {
  const root = resolve(dir)
  const cache = new Map() // fail → { mtimeMs, buf, gz }

  function send(req, res, status, file, type, { immutable, extra } = {}) {
    const headers = { ...SECURITY, 'content-type': type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', ...extra }
    if (hsts && req.headers['x-forwarded-proto'] === 'https') headers['strict-transport-security'] = 'max-age=15552000'
    return { status, headers, file }
  }

  async function body(file, ext, wantGzip) {
    const st = statSync(file)
    let e = cache.get(file)
    if (!e || e.mtimeMs !== st.mtimeMs) {
      const buf = await readFile(file)
      e = { mtimeMs: st.mtimeMs, buf, gz: COMPRESSIBLE.has(ext) && buf.length > 512 ? gzipSync(buf) : null }
      cache.set(file, e)
    }
    return wantGzip && e.gz ? { data: e.gz, gz: true } : { data: e.buf, gz: false }
  }

  return function serve(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false
    let pathname
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname) } catch { res.writeHead(400).end(); return true }
    if (pathname.startsWith('/v1/') || pathname === '/v1' || pathname === '/health') return false
    if (pathname.includes('\0') || pathname.split('/').includes('..')) { res.writeHead(404).end(); return true }

    const rel = pathname.replace(/^\/+/, '')
    let file = resolve(join(root, rel))
    const inside = file === root || file.startsWith(root + sep)
    let isFile = false
    try { isFile = inside && statSync(file).isFile() } catch { /* tiada */ }
    let ext = extname(file).toLowerCase()
    if (!isFile) {
      if (ext) { res.writeHead(404, { ...SECURITY, 'content-type': 'text/plain; charset=utf-8' }).end('Not found'); return true } // fail hilang ≠ halaman SPA
      file = join(root, 'index.html'); ext = '.html'
      try { if (!statSync(file).isFile()) throw new Error() } catch { res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' }).end('Frontend belum di-build (jalankan: npm run build)'); return true }
    } else if (!inside) { res.writeHead(404).end(); return true }

    const immutable = pathname.startsWith('/assets/')
    const wantGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
    body(file, ext, wantGzip).then(({ data, gz }) => {
      const m = send(req, res, 200, file, TYPES[ext] ?? 'application/octet-stream', { immutable, extra: { vary: 'Accept-Encoding', ...(gz ? { 'content-encoding': 'gzip' } : {}), 'content-length': String(data.length) } })
      res.writeHead(m.status, m.headers)
      res.end(req.method === 'HEAD' ? undefined : data)
    }).catch(() => { res.writeHead(500).end() })
    return true
  }
}

/** Gabungkan: cuba fail statik dahulu, jika tidak dikendalikan serahkan kepada pengendali API. */
export function withStatic(apiHandler, serve) {
  return (req, res) => { if (!serve(req, res)) return apiHandler(req, res) }
}
