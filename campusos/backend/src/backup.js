import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Salinan konsisten pangkalan data SQLite yang sedang berjalan (VACUUM INTO. Selamat walaupun ada penulisan).
 * Fail: <dir>/campusos-YYYYMMDD-HHMMSS.db ; yang lama dibuang, simpan `keep` terkini.
 */
export function backupDb(db, dir, keep = 14, now = new Date()) {
  mkdirSync(dir, { recursive: true })
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const file = join(dir, `campusos-${stamp}.db`)
  rmSync(file, { force: true })
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`)
  const all = readdirSync(dir).filter((f) => /^campusos-\d{8}-\d{6}\.db$/.test(f)).sort()
  for (const old of all.slice(0, Math.max(0, all.length - keep))) rmSync(join(dir, old), { force: true })
  return { file, bytes: statSync(file).size, kept: Math.min(all.length, keep) }
}
