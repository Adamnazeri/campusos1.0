import { newId } from './security.js'
import { sendSmtp } from './smtp.js'

/**
 * E-mel dimasukkan ke peti keluar (jadual `emails`) dalam transaksi yang sama dengan tindakan,
 * kemudian dihantar selepas respons (flush). Pengangkutan: SMTP_HOST (disyorkan) → MAIL_WEBHOOK_URL (POST JSON
 * {from,to,subject,text}) → jika tiada, hanya direkod/dilog (status "logged").
 */
export function createMailer(ctx, doFetch = globalThis.fetch, smtp = sendSmtp) {
  const { q, config } = ctx
  const configured = () => !!(config.smtpHost || config.mailWebhook)
  let running = null
  let again = false

  function send({ orgId = null, to, subject, text }) {
    const id = newId()
    q('INSERT INTO emails (id,org_id,to_email,subject,body,created_at) VALUES (?,?,?,?,?,?)').run(id, orgId, to, subject, text, Date.now())
    return id
  }

  /** Status e-mel terkini ke alamat ini (sent | failed | queued | logged). Supaya admin tahu sama ada e-mel BENAR-BENAR dihantar. */
  function deliveryOf(orgId, to, subjectLike = '%') {
    return q('SELECT status, error, attempts FROM emails WHERE org_id=? AND to_email=? AND subject LIKE ? ORDER BY created_at DESC LIMIT 1').get(orgId, to, subjectLike) ?? null
  }

  /** Jika flush sedang berjalan, tunggu ia selesai kemudian jalankan sekali lagi (supaya e-mel baharu turut dicuba). */
  function flush() {
    if (running) { again = true; return running }
    running = (async () => { do { again = false; await runOnce() } while (again) })().finally(() => { running = null })
    return running
  }

  async function runOnce() {
    {
      // 'queued' = baru; 'failed' dicuba semula sehingga 5 kali
      const rows = q("SELECT * FROM emails WHERE status='queued' OR (status='failed' AND attempts<5) ORDER BY created_at LIMIT 50").all()
      for (const m of rows) {
        if (!configured()) {
          console.log(`[mail] → ${m.to_email}: ${m.subject}`)
          q("UPDATE emails SET status='logged', sent_at=? WHERE id=?").run(Date.now(), m.id)
          continue
        }
        try {
          if (config.smtpHost) {
            await smtp({ host: config.smtpHost, port: config.smtpPort, secure: config.smtpSecure, user: config.smtpUser, pass: config.smtpPass, rejectUnauthorized: config.smtpRejectUnauthorized },
              { from: config.mailFrom, to: m.to_email, subject: m.subject, text: m.body })
          } else {
          const r = await doFetch(config.mailWebhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...(config.mailWebhookAuth ? { authorization: config.mailWebhookAuth } : {}) },
            body: JSON.stringify({ from: config.mailFrom, to: m.to_email, subject: m.subject, text: m.body }),
          })
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          }
          q("UPDATE emails SET status='sent', sent_at=?, attempts=attempts+1, error=NULL, body='[dihantar; kandungan dibuang]' WHERE id=?").run(Date.now(), m.id)
        } catch (e) {
          q("UPDATE emails SET status='failed', attempts=attempts+1, error=? WHERE id=?").run(String(e.message).slice(0, 200), m.id)
        }
      }
    }
  }

  return { send, flush, configured, deliveryOf }
}
