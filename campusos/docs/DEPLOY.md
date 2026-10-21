# Deploy ke production

Susunan: **Caddy (HTTPS automatik)** → `web` (nginx, frontend) + `backend` (API, SQLite pada volume). E-mel: lihat `docs/EMAIL.md`.

## Langkah
1. Pelayan Linux dengan Docker + Docker Compose; DNS domain (cth. `campusos.sekolah.edu.my`) menuding ke pelayan; port 80/443 terbuka.
2. `cp .env.production.example .env` dan isi:
   - `DOMAIN` (cth. `campusos.sekolah.edu.my`)
   - `JWT_SECRET` (`openssl rand -hex 32`)
   - `APP_ENCRYPTION_KEY` (`openssl rand -hex 32`). **wajib di production**
   - Tetapan e-mel SMTP/webhook (lihat `docs/EMAIL.md`)
3. Cipta folder sandaran dengan pemilik UID/GID `1000:1000` (kontena `backend` berjalan sebagai user `node` bukan-root, jadi tanpa langkah ini bind mount `./backups` akan dimiliki `root` dan sandaran akan gagal dengan *permission denied*):
   ```bash
   mkdir -p backups && sudo chown 1000:1000 backups && chmod 700 backups
   ```
4. Jalankan kontena:
   ```bash
   docker compose up -d --build
   ```
5. **Sahkan sandaran berfungsi** serta-merta selepas kontena hidup:
   ```bash
   docker compose exec backend node scripts/backup.js
   ls -la backups/
   ```
   Pastikan fail `campusos-YYYYMMDD-HHMMSS.db` terhasil dalam `./backups` tanpa ralat.
6. Buka `https://<domain>` → **"Start onboarding"** untuk mencipta akaun *Owner* pertama. **Jangan jalankan seed demo di production.**

Backend enggan bermula di production jika `JWT_SECRET` atau `APP_ENCRYPTION_KEY` lemah/tidak ditetapkan (kurang 32 aksara) atau `CORS_ORIGIN` ialah `*`. Itu disengajakan.

## Amaran Penting: `APP_ENCRYPTION_KEY` & 2FA
- `APP_ENCRYPTION_KEY` digunakan untuk menyulitkan rahsia TOTP 2FA pengguna (`enc:v1:...`) di dalam pangkalan data SQLite.
- **JANGAN sesekali menukar `APP_ENCRYPTION_KEY` selepas pengguna menyediakan 2FA.** Jika kunci ini ditukar atau hilang, backend tidak lagi dapat menyahsulit rahsia 2FA sedia ada dan semua pengguna yang mengaktifkan 2FA akan gagal log masuk sehingga 2FA mereka ditetapkan semula. Simpan salinan `.env` di pengurus kata laluan organisasi yang selamat.

## Apa yang sudah ditetapkan untuk anda
- Kontena berjalan bukan-root (`node`, UID 1000), ada healthcheck; HTTPS + HSTS (Caddy); CSP, X-Frame-Options dsb. (nginx & API).
- `TRUST_PROXY=1` supaya had percubaan login mengira IP pengguna sebenar (Caddy ialah satu-satunya proxy).
- Sandaran harian automatik ke `./backups` (simpan 14 salinan; ubah `BACKUP_KEEP`).
- Sandaran manual: `docker compose exec backend node scripts/backup.js`

## Sandaran Luar Pelayan & Pematuhan PDPA (Wajib Disulitkan)

> **Amaran PDPA 2010:** Fail pangkalan data SQLite (`campusos-*.db`) mengandungi data peribadi sensitif pelajar dan waris (nama, ID pelajar/MyKid, nombor telefon ibu bapa, rekod kehadiran, dan keputusan peperiksaan). **Semua salinan sandaran yang dihantar ke luar pelayan (S3, Google Drive, Backblaze B2, atau pelayan lain) MESTI disulitkan terlebih dahulu.**

Skrip `scripts/offsite-backup.sh` disediakan untuk menyulitkan setiap fail `.db` menggunakan [`age`](https://github.com/FiloSottile/age) (atau menyalin terus ke remote `rclone crypt`) sebelum memuat naik ke storan awan.

### 1. Persediaan (`age` + `rclone`)
```bash
sudo apt update && sudo apt install -y age rclone
# Jana pasangan kunci age (simpan key.txt di peti besi kata laluan luar pelayan. Diperlukan untuk restore!):
age-keygen -o ~/campusos-backup-key.txt
# Konfigurasi storan awan (S3 / B2 / Drive):
rclone config
```

### 2. Jadualkan Cron Harian di Host
Jalankan `crontab -e` pada pelayan dan tambah baris berikut (berjalan setiap hari jam 03:30 pagi):
```cron
30 3 * * * AGE_RECIPIENT="age1..." RCLONE_REMOTE="offsite:campusos-backups" /laluan/penuh/campusos/scripts/offsite-backup.sh >> /var/log/campusos-backup.log 2>&1
```
*(Jika anda menggunakan remote berjenis `rclone crypt`, gantikan `AGE_RECIPIENT="age1..."` dengan `USE_RCLONE_CRYPT=1`.)*

### 3. Cara Pulih (Restore) daripada Sandaran
1. Muat turun dan nyahsulit fail sandaran (jika dari luar pelayan):
   ```bash
   rclone copy offsite:campusos-backups/campusos-20261014-030000.db.age ./
   age -d -i ~/campusos-backup-key.txt -o ./pulih.db ./campusos-20261014-030000.db.age
   ```
   *(Jika pulih daripada `./backups/campusos-YYYYMMDD-HHMMSS.db` tempatan, terus gunakan fail tersebut sebagai `./pulih.db`.)*
2. Hentikan kontena `backend` supaya tiada transaksi aktif:
   ```bash
   docker compose stop backend
   ```
3. Salin fail pangkalan data yang dipulihkan ke dalam volume `/data/campusos.db` dan tetapkan pemilikan `node:node` (`1000:1000`):
   ```bash
   docker compose run --rm --entrypoint sh -u 0 -v "$(pwd)/pulih.db:/tmp/pulih.db:ro" backend \
     -c "rm -f /data/campusos.db-wal /data/campusos.db-shm && cp /tmp/pulih.db /data/campusos.db && chown 1000:1000 /data/campusos.db"
   rm -f ./pulih.db
   ```
4. Mulakan semula `backend` dan sahkan kesihatan sistem:
   ```bash
   docker compose start backend
   docker compose exec backend node -e "fetch('http://127.0.0.1:8788/health').then(r=>r.json()).then(console.log)"
   ```

## Kenaikan taraf
Ambil sandaran dahulu: `docker compose exec backend node scripts/backup.js`. Kemudian `git pull && docker compose up -d --build`. Migrasi pangkalan data berjalan automatik semasa bermula (termasuk pemisahan kelas/subjek: subjek yang tersimpan pada kelas dipindahkan ke senarai Subjects).

## Had yang perlu diketahui
- SQLite = **satu instance backend sahaja** (jangan skala ke beberapa replika). Memadai untuk satu sekolah/beberapa cawangan; untuk jumlah besar, tukar ke PostgreSQL.
- Fon dimuat daripada Google Fonts (CSP membenarkannya). Untuk elak permintaan ke pihak ketiga, host sendiri fon dan buang dua sumber Google dalam `frontend/nginx.conf`.
- Pembayaran/billing dimatikan (`BILLING_ENABLED=0`) sehingga gateway sebenar disambungkan.
- Jangan tukar `APP_ENCRYPTION_KEY` (atau `JWT_SECRET`) selepas pengguna menyediakan 2FA.
