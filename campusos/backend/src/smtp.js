import net from 'node:net'
import tls from 'node:tls'
import { randomBytes } from 'node:crypto'

/**
 * Klien SMTP minimum tanpa dependency: sambungan TLS tersirat (port 465) atau STARTTLS (587), AUTH PLAIN/LOGIN,
 * mesej teks UTF-8 (base64). Kata laluan TIDAK PERNAH dihantar tanpa penyulitan.
 */
const clean = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim() // elak suntikan header
export const bareAddress = (s) => { const m = /<([^<>\s]+)>/.exec(String(s)); return clean(m ? m[1] : s) }
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`)

export function buildMessage({ from, to, subject, text, date = new Date(), domain = 'campusos.local' }) {
  const fromHdr = (() => { const m = /^(.*?)\s*<([^<>]+)>$/.exec(clean(from)); return m && m[1] ? `${encHeader(m[1].replace(/^"|"$/g, ''))} <${m[2]}>` : clean(from) })()
  const body = Buffer.from(String(text ?? '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}(?=.)/g, '$&\r\n')
  return [
    `From: ${fromHdr}`, `To: ${clean(to)}`, `Subject: ${encHeader(clean(subject))}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`, `Message-ID: <${randomBytes(12).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', body, '',
  ].join('\r\n')
}

export function sendSmtp(opts, { from, to, subject, text }) {
  const { host, port = 587, secure = false, user = '', pass = '', rejectUnauthorized = true, timeoutMs = 20_000 } = opts
  return new Promise((resolve, reject) => {
    let sock, buf = '', waiting = null, done = false
    const fail = (e) => { if (done) return; done = true; try { sock?.destroy() } catch { /* sudah ditutup */ } reject(e instanceof Error ? e : new Error(String(e))) }
    const timer = setTimeout(() => fail(new Error('SMTP timeout')), timeoutMs)
    const finish = () => { if (done) return; done = true; clearTimeout(timer); try { sock.end() } catch { /* */ } resolve() }

    function onData(d) {
      buf += d.toString('utf8')
      // balasan lengkap = baris terakhir berbentuk "250 ..." (tanpa '-' selepas kod)
      const lines = buf.split('\r\n')
      if (lines.length < 2) return
      const complete = lines.slice(0, -1)
      const last = complete[complete.length - 1]
      if (!/^\d{3} /.test(last) && !/^\d{3}$/.test(last)) return
      const reply = { code: Number(last.slice(0, 3)), lines: complete }
      buf = ''
      const w = waiting; waiting = null; w?.(reply)
    }
    const read = () => new Promise((res) => { waiting = res })
    const cmd = async (line, ok) => {
      sock.write(line + '\r\n')
      const r = await read()
      if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code} ${r.lines.at(-1).slice(4)}`.slice(0, 200))
      return r
    }
    const attach = (s) => { sock = s; s.on('data', onData); s.on('error', fail); s.on('close', () => !done && fail(new Error('SMTP connection closed'))) }

    ;(async () => {
      const connected = new Promise((res, rej) => {
        const s = secure
          ? tls.connect({ host, port, servername: host, rejectUnauthorized }, () => res(s))
          : net.connect({ host, port }, () => res(s))
        s.once('error', rej)
        attach(s)
      })
      await connected
      let r = await read(); if (r.code !== 220) throw new Error(`SMTP greeting ${r.code}`)
      const hello = async () => cmd('EHLO campusos', [250])
      let caps = (await hello()).lines.join(' ').toUpperCase()

      if (!secure && /STARTTLS/.test(caps)) {
        await cmd('STARTTLS', [220])
        sock.removeAllListeners('data'); sock.removeAllListeners('close'); sock.removeAllListeners('error')
        const upgraded = await new Promise((res, rej) => { const t = tls.connect({ socket: sock, servername: host, rejectUnauthorized }, () => res(t)); t.once('error', rej) })
        buf = ''; attach(upgraded)
        caps = (await hello()).lines.join(' ').toUpperCase()
      } else if (!secure && user) {
        throw new Error('Pelayan SMTP tidak menyokong STARTTLS. Kata laluan tidak dihantar tanpa penyulitan')
      }

      if (user) {
        if (/AUTH[^\r\n]*PLAIN/.test(caps)) await cmd('AUTH PLAIN ' + Buffer.from(`\0${user}\0${pass}`).toString('base64'), [235])
        else if (/AUTH[^\r\n]*LOGIN/.test(caps)) {
          await cmd('AUTH LOGIN', [334]); await cmd(Buffer.from(user).toString('base64'), [334]); await cmd(Buffer.from(pass).toString('base64'), [235])
        } else throw new Error('Pelayan SMTP tidak menawarkan AUTH PLAIN/LOGIN')
      }
      const fromAddr = bareAddress(from)
      await cmd(`MAIL FROM:<${fromAddr}>`, [250])
      await cmd(`RCPT TO:<${bareAddress(to)}>`, [250, 251])
      await cmd('DATA', [354])
      const msg = buildMessage({ from, to, subject, text, domain: fromAddr.split('@')[1] })
      sock.write(msg.replace(/^\./gm, '..') + '\r\n.\r\n') // dot-stuffing
      r = await read(); if (r.code !== 250) throw new Error(`SMTP ${r.code} ${r.lines.at(-1).slice(4)}`.slice(0, 200))
      try { sock.write('QUIT\r\n') } catch { /* */ }
      finish()
    })().catch(fail)
  })
}
