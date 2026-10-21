// Jana pasangan kunci VAPID untuk Web Push. Letak dalam .env pelayan: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (rahsia!), VAPID_SUBJECT.
import { generateVapidKeys } from '../src/webpush.js'
const k = generateVapidKeys()
console.log(`VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}\nVAPID_SUBJECT=mailto:admin@sekolah.edu.my`)
console.error('\nSimpan kunci persendirian dengan selamat dan JANGAN kongsi. Jika kunci bertukar, semua guru perlu hidupkan semula alarm latar belakang.')
