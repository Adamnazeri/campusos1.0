// Mencipta organisasi demo "Greenfield Academy". Selamat dijalankan berulang.
import { config } from '../src/config.js'
import { openDb } from '../src/db.js'
import { seedDemo, DEMO } from '../src/demo.js'

const db = openDb(config.dbPath)
const r = seedDemo(db)
if (!r) console.log('[seed] data demo sudah wujud, dilangkau')
else console.log(`[seed] siap. Log masuk: ${DEMO.admin} (owner), ${DEMO.teacher} (teacher), ${DEMO.coordinator} (coordinator). Kata laluan: ${DEMO.password}`)
