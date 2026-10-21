# Pilot percuma (RM0): komputer sendiri + Tailscale Funnel

Tujuan: guru boleh membuka CampusOS di telefon melalui alamat HTTPS tetap **tanpa membayar VPS atau domain**. Komputer anda menjadi pelayan; Tailscale Funnel memberi alamat awam `https://nama.tailxxxx.ts.net` secara percuma (akaun Tailscale Personal tidak memerlukan kad).

Sesuai untuk **pilot kecil** (satu sekolah, beberapa guru, sebulan dua). Bukan untuk kegunaan jangka panjang atau banyak sekolah.

## Syarat
- Komputer (Windows/Mac/Linux) yang **kekal hidup dan bersambung internet** semasa waktu sekolah.
- Node.js 22.5 atau lebih baru.
- Akaun Tailscale percuma (log masuk dengan Google/Microsoft).

## Langkah
1. **Pasang Tailscale** (tailscale.com/download) dan log masuk.
2. Di konsol admin Tailscale (login.tailscale.com/admin/dns), hidupkan **MagicDNS** dan **HTTPS Certificates**. Funnel memerlukan sijil HTTPS untuk nama tailnet anda.
3. Buka terminal dan jalankan: `tailscale funnel --bg 8788`
   Kali pertama ia meminta kelulusan Funnel (ikut pautan yang dipaparkan). Selepas itu ia mencetak alamat anda, contohnya `https://komputer-saya.tail1234.ts.net`. **Salin alamat itu.**
4. Dalam folder `campusos`, jalankan (Windows: Command Prompt):
   ```
   npm run pilot -- --url https://komputer-saya.tail1234.ts.net
   ```
   Kali pertama ia memasang dan membina frontend (perlukan internet, beberapa minit), menjana rahsia, dan memulakan pelayan. Pada kali seterusnya, dwiklik `Mula-Pilot.bat` (alamat diingat).
5. Buka alamat tadi di telefon. Daftar sekolah (*Start onboarding*), tambah guru, dan hantar jemputan.
6. Guru membuka pautan jemputan, menetapkan kata laluan, dan memasang app (kad *Pasang CampusOS pada telefon anda*).

## E-mel jemputan (percuma)
Buka `backend/.env.pilot` dan tambah tetapan SMTP anda (contoh Gmail dengan App Password):
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=emel@gmail.com
SMTP_PASS=kodAppPassword
MAIL_FROM=CampusOS <emel@gmail.com>
```
Mulakan semula pelayan. Skrip pilot **mengekalkan** baris tambahan anda. Tanpa SMTP, pautan jemputan dipaparkan kepada admin untuk dikongsi melalui WhatsApp.

## Jaga data
- Data: `backend/data/pilot.db`. Sandaran harian automatik: `backend/data/backups/` (14 salinan terakhir). Salin folder `data` ke USB atau Google Drive sekurang-kurangnya seminggu sekali.
- `backend/.env.pilot` mengandungi rahsia. **Simpan salinan** (jika `JWT_SECRET` atau `APP_ENCRYPTION_KEY` hilang, semua pengguna dilog keluar dan 2FA rosak). Jangan kongsi atau masukkan ke dalam zip.
- Admin: gunakan kata laluan kuat dan hidupkan 2FA, kerana alamat awam boleh dicapai sesiapa yang tahu pautannya.

## Supaya komputer tidak tidur (Windows)
```
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```
Tutup penutup komputer riba tidak boleh dibenarkan menidurkannya (Control Panel → Power Options → "Choose what closing the lid does" → Do nothing).

## Had yang perlu diterima
- Komputer mati atau tidur, atau internet putus, bermakna sistem tidak boleh diakses. Notifikasi alarm juga tidak dihantar pada masa itu.
- Funnel mempunyai had lebar jalur yang tidak boleh ditetapkan (Tailscale tidak menerbitkan angkanya). Memadai untuk pilot kecil.
- Tiada jaminan masa operasi. Bukan pelayan sebenar.

## Alternatif: Cloudflare Quick Tunnel (hanya untuk ujian cepat)
`cloudflared tunnel --url http://localhost:8788` memberi alamat `trycloudflare.com` tanpa akaun, tetapi **alamat bertukar setiap kali dimulakan** dan tiada jaminan operasi. App yang telah dipasang dan langganan notifikasi terikat pada alamat, jadi ia akan rosak apabila alamat bertukar. Jangan gunakan untuk guru sebenar.

## Mengemas kini versi
Gantikan folder `campusos` dengan versi baharu (kekalkan `backend/data` dan `backend/.env.pilot`), kemudian `npm run pilot -- --rebuild`.

## Pindah ke pelayan sebenar kemudian
Salin `backend/data/pilot.db` ke volum data pelayan baharu dan guna nilai `JWT_SECRET`/`APP_ENCRYPTION_KEY` yang sama dalam `.env` (lihat `docs/DEPLOY.md`). Data sekolah dan akaun guru dibawa bersama.
