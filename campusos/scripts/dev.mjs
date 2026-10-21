// Menjalankan backend (http://localhost:8788) dan frontend (http://localhost:5174) serentak.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sh = (args, opts = {}) => spawn('npm', args, { cwd: root, stdio: 'inherit', shell: true, ...opts })

const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`Perlukan Node 22.5 atau lebih baru (sekarang ${process.version}).`)
  process.exit(1)
}
if (!existsSync(join(root, 'frontend', 'node_modules'))) {
  console.log('Kali pertama: memasang dependensi frontend…')
  const r = spawnSync('npm', ['--prefix', 'frontend', 'install'], { cwd: root, stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
spawnSync('npm', ['--prefix', 'backend', 'run', 'seed'], { cwd: root, stdio: 'inherit', shell: true })

const api = sh(['--prefix', 'backend', 'run', 'dev'], { env: { ...process.env, PORT: '8788' } })
const web = sh(['--prefix', 'frontend', 'run', 'dev'], { env: { ...process.env, PORT: '5174' } })

console.log('\n  Frontend : http://localhost:5174')
console.log('  Backend  : http://localhost:8788/health')
console.log('  Akaun demo (kata laluan password123): admin@campusos.io · sarah.m@campusos.io · grace.b@campusos.io\n')

const stop = () => { api.kill(); web.kill(); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
api.on('exit', (c) => c && (console.error(`Backend berhenti (kod ${c})`), stop()))
web.on('exit', (c) => c && (console.error(`Frontend berhenti (kod ${c})`), stop()))
