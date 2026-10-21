import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto'

const b64u = (b) => Buffer.from(b).toString('base64url')

export function signJwt(payload, secret, ttlSec) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }))
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

export function verifyJwt(token, secret) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return null
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest()
  const given = Buffer.from(parts[2], 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    return p.exp > Math.floor(Date.now() / 1000) ? p : null
  } catch {
    return null
  }
}

export function hashPassword(pw) {
  const salt = randomBytes(16)
  const hash = scryptSync(pw, salt, 64)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored ?? '').split('$')
  if (alg !== 'scrypt') return false
  const expected = Buffer.from(hash, 'base64')
  const actual = scryptSync(pw, Buffer.from(salt, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}

export const newToken = () => randomBytes(32).toString('base64url')
export const sha256 = (s) => createHash('sha256').update(s).digest('hex')
export const newId = () => randomBytes(8).toString('hex')

// ---- TOTP (RFC 6238, SHA-1, 6 digit, 30s). Serasi Google Authenticator / Authy ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export function base32(buf) {
  let bits = '', out = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]
  return out
}
function unbase32(str) {
  let bits = ''
  for (const c of str.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
export const newTotpSecret = () => base32(randomBytes(20))
export function totpCode(secret, atMs = Date.now()) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)))
  const h = createHmac('sha1', unbase32(secret)).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}
export function verifyTotp(secret, code, atMs = Date.now()) {
  if (!/^\d{6}$/.test(String(code ?? ''))) return false
  return [-1, 0, 1].some((w) => {
    const expected = Buffer.from(totpCode(secret, atMs + w * 30_000))
    const given = Buffer.from(String(code))
    return expected.length === given.length && timingSafeEqual(expected, given)
  })
}


/** Banding rahsia dengan masa tetap (elak serangan masa). */
export function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a ?? '')).digest()
  const y = createHash('sha256').update(String(b ?? '')).digest()
  return timingSafeEqual(x, y)
}

// ---- penyulitan rahsia semasa disimpan (AES-256-GCM). Dipakai untuk rahsia TOTP ----
const SEAL_PREFIX = 'enc:v1:'
const sealKey = (secret) => scryptSync(String(secret), 'campusos-at-rest', 32)
export function sealSecret(plain, secret) {
  if (plain === null || plain === undefined) return plain
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', sealKey(secret), iv)
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return SEAL_PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}
/** Terima nilai lama (plaintext) juga, supaya data sedia ada tidak rosak; ia disulitkan semula bila disimpan seterusnya. */
export function openSecret(stored, secret) {
  if (typeof stored !== 'string' || !stored.startsWith(SEAL_PREFIX)) return stored ?? null
  const raw = Buffer.from(stored.slice(SEAL_PREFIX.length), 'base64')
  const d = createDecipheriv('aes-256-gcm', sealKey(secret), raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
}

/** Kod pemulihan 2FA: 8 kod, format xxxx-xxxx (huruf kecil + digit tanpa aksara mengelirukan). */
const RC_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const b = randomBytes(8)
    const ch = Array.from(b, (x) => RC_ALPHABET[x % RC_ALPHABET.length]).join('')
    return `${ch.slice(0, 4)}-${ch.slice(4)}`
  })
}
export const normalizeRecovery = (c) => String(c ?? '').trim().toLowerCase()
export const looksLikeRecovery = (c) => /^[a-z0-9]{4}-[a-z0-9]{4}$/.test(normalizeRecovery(c))

/** Langkah TOTP (30s) yang sepadan dengan kod, atau null. Untuk menolak penggunaan semula kod yang sama. */
export function totpMatchStep(secret, code, atMs = Date.now()) {
  if (!/^\d{6}$/.test(String(code ?? ''))) return null
  for (const w of [-1, 0, 1]) {
    const expected = Buffer.from(totpCode(secret, atMs + w * 30_000))
    const given = Buffer.from(String(code))
    if (expected.length === given.length && timingSafeEqual(expected, given)) return Math.floor((atMs + w * 30_000) / 30_000)
  }
  return null
}
