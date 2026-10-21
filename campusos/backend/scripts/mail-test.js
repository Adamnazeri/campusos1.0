// Uji penghantaran e-mel sebenar:  npm run mail:test -- anda@contoh.com
// Guna tetapan dalam backend/.env: SMTP_HOST (disyorkan) atau MAIL_WEBHOOK_URL.
import { config } from '../src/config.js'
import { sendSmtp } from '../src/smtp.js'

const to = process.argv[2]
if (!to) { console.error('Guna: npm run mail:test -- alamat@contoh.com'); process.exit(1) }
const msg = { from: config.mailFrom, to, subject: 'CampusOS email test', text: 'If you received this email, CampusOS can send invitations and password resets.\n\n(Jika anda menerima e-mel ini, penghantaran e-mel CampusOS berfungsi.)' }

try {
  if (config.smtpHost) {
    console.log(`Menghantar melalui SMTP ${config.smtpHost}:${config.smtpPort} (${config.smtpSecure ? 'TLS' : 'STARTTLS'}) sebagai ${config.smtpUser || '(tanpa login)'} …`)
    await sendSmtp({ host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure, user: config.smtpUser, pass: config.smtpPass, rejectUnauthorized: config.smtpRejectUnauthorized }, msg)
    console.log(`BERJAYA: e-mel ujian diserahkan kepada pelayan SMTP untuk ${to}. Semak peti masuk (dan spam).`)
  } else if (config.mailWebhook) {
    const r = await fetch(config.mailWebhook, { method: 'POST', headers: { 'content-type': 'application/json', ...(config.mailWebhookAuth ? { authorization: config.mailWebhookAuth } : {}) }, body: JSON.stringify(msg) })
    console.log(`${r.ok ? 'BERJAYA' : 'GAGAL'}. HTTP ${r.status}\n${(await r.text()).slice(0, 500)}`)
    process.exit(r.ok ? 0 : 1)
  } else {
    console.error('Tiada SMTP_HOST atau MAIL_WEBHOOK_URL dalam .env. E-mel tidak akan dihantar. Lihat docs/EMAIL.md.'); process.exit(1)
  }
} catch (e) { console.error('GAGAL:', e.message); process.exit(1) }
