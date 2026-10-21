// Salinan sandaran manual:  npm run backup   (guna BACKUP_DIR, lalai ./backups)
import { config } from '../src/config.js'
import { openDb } from '../src/db.js'
import { backupDb } from '../src/backup.js'

const db = openDb(config.dbPath)
const r = backupDb(db, config.backupDir || './backups', config.backupKeep)
console.log(`Sandaran dicipta: ${r.file} (${(r.bytes / 1024).toFixed(0)} KB). Disimpan ${r.kept} salinan terkini.`)
db.close()
