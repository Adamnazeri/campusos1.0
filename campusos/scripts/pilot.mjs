// Pilot PERCUMA: satu proses Node menghidangkan app (frontend/dist) dan API pada satu port (lalai 8788).
// Penggunaan:  node scripts/pilot.mjs [--url https://nama.tailnet.ts.net] [--port 8788] [--rebuild]
// Rahsia dijana sekali dan disimpan dalam backend/.env.pilot (JANGAN dikongsi atau dimasukkan ke dalam zip).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? (process.argv[i + 1] ?? true) : d }
const port = String(arg('--port', '8788'))
const url = String(arg('--url', '')).replace(/\/+$/, '')
const rebuild = process.argv.includes('--rebuild')

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 5)) { console.error(`Perlukan Node 22.5 atau lebih baru (sekarang ${process.version}).`); process.exit(1) }
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true })

// 1) frontend: pasang dependensi dan build jika perlu
const fe = join(root, 'frontend')
if (!existsSync(join(fe, 'node_modules'))) { console.log('Memasang dependensi frontend (kali pertama, perlukan internet)…'); if (run('npm', ['install'], fe).status !== 0) process.exit(1) }
if (rebuild || !existsSync(join(fe, 'dist', 'index.html'))) { console.log('Membina frontend…'); if (run('npm', ['run', 'build'], fe).status !== 0) process.exit(1) }

// 2) fail persekitaran pilot (rahsia dijana sekali sahaja)
const envFile = join(root, 'backend', '.env.pilot')
const hex = () => randomBytes(32).toString('hex')
const keep = existsSync(envFile) ? readFileSync(envFile, 'utf8') : ''
const get = (k) => new RegExp(`^${k}=(.*)$`, 'm').exec(keep)?.[1]?.trim()
const appUrl = url || get('APP_URL') || `http://localhost:${port}`
const lines = [
  '# Dijana oleh scripts/pilot.mjs. RAHSIA: jangan kongsi, jangan masukkan ke dalam zip/Git.',
  '# Jika JWT_SECRET atau APP_ENCRYPTION_KEY bertukar, semua pengguna dilog keluar dan 2FA mereka rosak. Simpan salinan fail ini.',
  'NODE_ENV=production',
  `PORT=${port}`,
  `JWT_SECRET=${get('JWT_SECRET') || hex()}`,
  `APP_ENCRYPTION_KEY=${get('APP_ENCRYPTION_KEY') || hex()}`,
  `APP_URL=${appUrl}`,
  `CORS_ORIGIN=${new URL(appUrl).origin}`,
  'DB_PATH=./data/pilot.db',
  'BACKUP_DIR=./data/backups',
  'STATIC_DIR=../frontend/dist',
]
// kekalkan tetapan lain yang pengguna tambah (cth. SMTP_*, VAPID_*), selain kunci yang diurus skrip ini
const managed = new Set(lines.filter((l) => !l.startsWith('#')).map((l) => l.split('=')[0]))
for (const l of keep.split(/\r?\n/)) { const k = l.split('=')[0]; if (l.trim() && !l.startsWith('# Dijana') && !l.startsWith('# Jika JWT') && !managed.has(k)) lines.push(l) }
mkdirSync(join(root, 'backend', 'data'), { recursive: true })
writeFileSync(envFile, lines.join('\n') + '\n')

// 3) mulakan pelayan
console.log(`\n  CampusOS pilot berjalan.\n  Di komputer ini : http://localhost:${port}\n  Alamat awam     : ${url || '(belum ditetapkan)'}\n`)
if (!url) console.log(`  Untuk akses dari telefon, lepaskan melalui Tailscale Funnel:\n    tailscale funnel --bg ${port}\n  kemudian mulakan semula skrip ini dengan:  npm run pilot -- --url https://<nama>.ts.net\n`)
console.log('  Tekan Ctrl+C untuk berhenti. Komputer ini mesti kekal hidup supaya guru boleh akses.\n')
const server = spawn(process.execPath, ['--env-file=.env.pilot', '--disable-warning=ExperimentalWarning', 'src/server.js'], { cwd: join(root, 'backend'), stdio: 'inherit' })
const stop = () => { server.kill(); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
server.on('exit', (c) => process.exit(c ?? 0))
