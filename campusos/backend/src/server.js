import { createServer } from 'node:http'
import { config } from './config.js'
import { openDb } from './db.js'
import { createApp } from './app.js'
import { backupDb } from './backup.js'
import { createStatic, withStatic } from './static.js'

const db = openDb(config.dbPath)
const { handler, ctx } = createApp({ db, config })
const server = createServer(config.staticDir ? withStatic(handler, createStatic(config.staticDir, { hsts: config.hsts })) : handler)
server.listen(config.port, () => console.log(config.staticDir ? `CampusOS (app + API) berjalan di http://localhost:${config.port}` : `CampusOS API berjalan di http://localhost:${config.port}`))

// cuba semula e-mel yang gagal setiap minit
const mailTimer = setInterval(() => ctx.mail.flush().catch(() => {}), 60_000)

// alarm kelas: hantar notifikasi push pada masa kelas bermula/tamat
const pushTimer = config.pushEnabled ? setInterval(() => ctx.push.tick().catch((e) => console.error('[push] tick gagal:', e.message)), config.pushTickMs) : null

// sandaran automatik harian jika BACKUP_DIR ditetapkan
let backupTimer
if (config.backupDir) {
  const run = () => { try { const r = backupDb(db, config.backupDir, config.backupKeep); console.log(`[backup] ${r.file}`) } catch (e) { console.error('[backup] gagal:', e.message) } }
  run()
  backupTimer = setInterval(run, 24 * 3600_000)
}

const shutdown = () => {
  clearInterval(mailTimer); if (pushTimer) clearInterval(pushTimer); if (backupTimer) clearInterval(backupTimer)
  server.close(() => { db.close(); process.exit(0) })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
