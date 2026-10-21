const prod = process.env.NODE_ENV === 'production'
const rawEncKey = process.env.APP_ENCRYPTION_KEY ?? ''

export const config = {
  port: Number(process.env.PORT ?? 8788),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  // kunci penyulitan rahsia 2FA semasa disimpan; wajib ditetapkan di production, atau diterbitkan daripada JWT_SECRET semasa pembangunan
  encryptionKey: rawEncKey || process.env.JWT_SECRET || 'dev-only-secret-change-me',
  accessTtlSec: 15 * 60,
  refreshTtlSec: 30 * 24 * 3600,
  inviteTtlMs: 7 * 24 * 3600_000,
  dbPath: process.env.DB_PATH ?? './data/campusos.db',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  devEndpoints: !prod && process.env.DEV_ENDPOINTS !== '0',
  authRateMax: Number(process.env.AUTH_RATE_MAX ?? 30), // percubaan auth / minit / IP
  loginFailMax: Number(process.env.LOGIN_FAIL_MAX ?? 8), // kegagalan login / 15 min / akaun
  trustProxy: Number(process.env.TRUST_PROXY ?? 0), // bilangan reverse proxy di hadapan API (0 = tiada)
  appUrl: (process.env.APP_URL ?? 'http://localhost:5174').replace(/\/$/, ''),
  // SMTP (disyorkan): Gmail/Google Workspace, Brevo, Mailgun, hosting cPanel dsb. Jika SMTP_HOST ditetapkan ia diutamakan atas webhook.
  smtpHost: process.env.SMTP_HOST ?? '',
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === '1', // 1 = TLS tersirat (port 465); 0 = STARTTLS (port 587)
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  smtpRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== '0',
  mailFrom: process.env.MAIL_FROM ?? 'CampusOS <no-reply@campusos.local>',
  mailWebhook: process.env.MAIL_WEBHOOK_URL ?? '', // POST JSON {from,to,subject,text}: cocok dengan Resend/Zapier/n8n dsb.
  mailWebhookAuth: process.env.MAIL_WEBHOOK_AUTH ?? '',
  // Web Push (alarm kelas walaupun app ditutup). Kunci VAPID: jalankan `npm run vapid` dan letak dalam .env.
  // Jika tidak ditetapkan, kunci dijana automatik dan disimpan dalam pangkalan data (ikut dalam sandaran).
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? '', // mailto:admin@sekolah.edu.my (lalai: daripada MAIL_FROM)
  pushEnabled: process.env.PUSH_ENABLED !== '0',
  pushTickMs: Number(process.env.PUSH_TICK_MS ?? 30_000),
  billingSecret: process.env.BILLING_WEBHOOK_SECRET ?? '',
  billingEnabled: process.env.BILLING_ENABLED === '1', // mati melainkan gateway pembayaran sudah disambungkan
  resetTtlMs: 60 * 60_000,
  exposeInviteTokens: !prod && process.env.EXPOSE_INVITE_TOKENS !== '0',
  hsts: prod && process.env.HSTS !== '0',
  staticDir: process.env.STATIC_DIR ?? '', // jika ditetapkan (cth. ../frontend/dist) pelayan ini juga menghidangkan app
  backupDir: process.env.BACKUP_DIR ?? '',
  backupKeep: Number(process.env.BACKUP_KEEP ?? 14),
}

if (prod) {
  const problems = []
  if (config.jwtSecret.startsWith('dev-only') || config.jwtSecret === 'change-me') problems.push('JWT_SECRET mesti ditetapkan (openssl rand -hex 32)')
  else if (config.jwtSecret.length < 32) problems.push('JWT_SECRET terlalu pendek (minimum 32 aksara)')
  if (!rawEncKey || rawEncKey.startsWith('dev-only') || rawEncKey === 'change-me') problems.push('APP_ENCRYPTION_KEY mesti ditetapkan (openssl rand -hex 32)')
  else if (rawEncKey.length < 32) problems.push('APP_ENCRYPTION_KEY terlalu pendek (minimum 32 aksara)')
  if (config.corsOrigin.split(',').some((o) => o.trim() === '*')) problems.push('CORS_ORIGIN mesti ditetapkan kepada domain frontend sebenar (bukan *)')
  if (!config.smtpHost && !config.mailWebhook) console.warn('[amaran] Tiada SMTP_HOST / MAIL_WEBHOOK_URL: e-mel jemputan & reset kata laluan TIDAK akan dihantar (pautan jemputan dipaparkan kepada admin sebagai ganti).')
  if (problems.length) throw new Error('Konfigurasi production tidak selamat:\n - ' + problems.join('\n - '))
}
