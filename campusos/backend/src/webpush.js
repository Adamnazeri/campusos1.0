// Web Push tanpa dependensi: penyulitan mesej (RFC 8291, aes128gcm) + pengesahan pelayan VAPID (RFC 8292) menggunakan node:crypto sahaja.
import { createECDH, createCipheriv, createPrivateKey, generateKeyPairSync, hkdfSync, randomBytes, sign } from 'node:crypto'

export const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64url'),
  dec: (s) => Buffer.from(String(s ?? ''), 'base64url'),
}

/** Pasangan kunci VAPID (P-256): awam = 65 bait tidak dimampatkan, persendirian = 32 bait; kedua-duanya base64url. */
export function generateVapidKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })
  const pub = Buffer.concat([Buffer.from([4]), b64u.dec(jwk.x), b64u.dec(jwk.y)])
  return { publicKey: b64u.enc(pub), privateKey: jwk.d }
}

function privateKeyObject({ publicKey, privateKey }) {
  const pub = b64u.dec(publicKey)
  return createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u.enc(pub.subarray(1, 33)), y: b64u.enc(pub.subarray(33, 65)) } })
}

/** Pengepala Authorization VAPID untuk satu endpoint (aud = asal endpoint). */
export function vapidAuthorization(endpoint, keys, subject, nowMs = Date.now()) {
  const aud = new URL(endpoint).origin
  const head = b64u.enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = b64u.enc(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: subject }))
  const input = `${head}.${claims}`
  const sig = sign('sha256', Buffer.from(input), { key: privateKeyObject(keys), dsaEncoding: 'ieee-p1363' })
  return `vapid t=${input}.${b64u.enc(sig)}, k=${keys.publicKey}`
}

/**
 * Sulitkan muatan untuk satu langganan (RFC 8291). Pulangkan badan (Buffer) bagi POST dengan `Content-Encoding: aes128gcm`.
 * `opts.asPrivate` / `opts.salt` hanya untuk ujian (vektor RFC); biasanya dijana rawak.
 */
export function encryptPayload(plaintext, sub, opts = {}) {
  const uaPublic = b64u.dec(sub.p256dh)
  const authSecret = b64u.dec(sub.auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh tidak sah')
  if (authSecret.length !== 16) throw new Error('auth tidak sah')
  const ecdh = createECDH('prime256v1')
  if (opts.asPrivate) ecdh.setPrivateKey(b64u.dec(opts.asPrivate)); else ecdh.generateKeys()
  const asPublic = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(uaPublic)
  const salt = opts.salt ? b64u.dec(opts.salt) : randomBytes(16)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic])
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32))
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16))
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12))
  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]) // 0x02 = penanda rekod terakhir
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()])
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096)
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body])
}

const DEFAULT_HOSTS = [
  'fcm.googleapis.com', 'android.googleapis.com', // Chrome/Edge/Android
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari / iOS
  'notify.windows.com', 'wns.windows.com', // Windows (Edge lama)
]
/** Hanya endpoint HTTPS daripada perkhidmatan push yang dikenali (mencegah SSRF melalui langganan palsu). */
export function isAllowedEndpoint(endpoint, { allowAnyHost = false, allowedHosts = DEFAULT_HOSTS } = {}) {
  let u
  try { u = new URL(endpoint) } catch { return false }
  if (endpoint.length > 1000) return false
  if (allowAnyHost) return u.protocol === 'https:' || u.protocol === 'http:'
  if (u.protocol !== 'https:' || u.username || u.password) return false
  const h = u.hostname.toLowerCase()
  return allowedHosts.some((a) => h === a || h.endsWith('.' + a))
}

/** Hantar satu mesej push. `gone` = langganan sudah tamat (404/410) dan patut dipadam. */
export async function sendPush(sub, payload, { keys, subject, fetchFn = fetch, ttl = 300, urgency = 'high', nowMs = Date.now(), timeoutMs = 15_000 }) {
  const body = encryptPayload(typeof payload === 'string' ? payload : JSON.stringify(payload), sub)
  const res = await fetchFn(sub.endpoint, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: String(ttl), urgency, authorization: vapidAuthorization(sub.endpoint, keys, subject, nowMs) },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, ok: res.status >= 200 && res.status < 300, gone: res.status === 404 || res.status === 410 }
}
