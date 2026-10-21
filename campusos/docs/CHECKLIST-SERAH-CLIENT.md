# Senarai Semak Serah-Terima Client (Production Handover Checklist)

Gunakan senarai semak ini sebelum menyerahkan sistem **CampusOS** kepada pihak sekolah / client untuk kegunaan sebenar.

## 1. Keselamatan & Konfigurasi Persekitaran (`.env`)
- [ ] **Kunci Rahsia Dijana & Disimpan Selamat**:
  - `JWT_SECRET` telah dijana menggunakan `openssl rand -hex 32` (minimum 32 aksara).
  - `APP_ENCRYPTION_KEY` telah dijana secara berasingan menggunakan `openssl rand -hex 32` (wajib di production untuk menyulitkan rahsia 2FA TOTP).
  - Salinan kedua-dua kunci telah disimpan di dalam pengurus kata laluan rasmi client. **Pentadbir telah dimaklumkan supaya TIDAK menukar `APP_ENCRYPTION_KEY` selepas pengguna mengaktifkan 2FA.**
- [ ] **Tiada Data Demo di Production**:
  - Skrip `npm run seed` **TIDAK** dijalankan pada pangkalan data production.
  - Akaun pemilik (*Owner*) pertama dicipta sendiri oleh pihak sekolah melalui skrin **Start onboarding**.
- [ ] **Billing Dimatikan**:
  - `BILLING_ENABLED=0` ditetapkan dalam `.env` (kerana tiada gateway pembayaran luaran disambungkan secara lalai).

## 2. Domain, Rangkaian & HTTPS
- [ ] **DNS & Sijil TLS/HTTPS Aktif**:
  - Rekod DNS `A`/`AAAA` domain sekolah (cth. `campusos.sekolah.edu.my`) menuding ke IP pelayan, dan port `80` serta `443` dibenarkan pada firewall.
  - Pemboleh ubah `DOMAIN` dalam `.env` ditetapkan dengan betul supaya Caddy mendapatkan sijil HTTPS Let's Encrypt secara automatik dan menetapkan `CORS_ORIGIN=https://<DOMAIN>`.
- [ ] **Semakan Kesihatan Kontena**:
  - `docker compose ps` menunjukkan kontena `caddy`, `web`, dan `backend` berada dalam keadaan `healthy` / `running`.
  - `https://<DOMAIN>/health` memulangkan JSON yang mengandungi `"status":"ok"` (cth. `{"status":"ok","time":1760000000000}`). Jika pangkalan data tidak tersedia ia memulangkan 503.

## 3. Penghantaran E-mel (SMTP)
- [ ] **SMTP Dikonfigurasi & Diuji**:
  - Tetapan `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, dan `MAIL_FROM` telah diisi dalam `.env` (rujuk [`docs/EMAIL.md`](EMAIL.md)).
  - Ujian penghantaran e-mel telah dijalankan dan mencetak `BERJAYA`:
    ```bash
    docker compose exec backend npm run mail:test -- emel-admin@sekolah.edu.my
    ```
  - Satu jemputan pengguna sebenar telah diuji dan disahkan sampai ke peti masuk (termasuk semakan SPF/DKIM supaya tidak masuk ke folder Spam). Di *Settings → Users & access*, status jemputan mesti menunjukkan **Email sent**, bukan *Email failed*.

## 4. Sandaran Tempatan & Luar Pelayan (Offsite Backup)
- [ ] **Kebenaran Folder Sandaran & Ujian Sandaran Tempatan**:
  - Folder `./backups` pada host dimiliki oleh UID/GID `1000:1000` (`mkdir -p backups && sudo chown 1000:1000 backups && chmod 700 backups`).
  - Perintah ujian sandaran manual berjaya menghasilkan fail `.db` di dalam `./backups`:
    ```bash
    docker compose exec backend node scripts/backup.js
    ```
- [ ] **Sandaran Luar Pelayan Tersulit & Ujian Pulih (Restore)**:
  - `scripts/offsite-backup.sh` telah dikonfigurasi dengan penyulitan (`age` atau `rclone crypt`) dan dijadualkan melalui `cron` harian pada pelayan (rujuk [`docs/DEPLOY.md`](DEPLOY.md)).
  - Kunci penyahsulitan (`age` secret key atau kata laluan `rclone crypt`) disimpan di lokasi berasingan di luar pelayan.
  - Sekurang-kurangnya satu ujian pulih (*restore*) telah dilakukan untuk mengesahkan fail sandaran boleh dinyahsulit dan dibuka oleh SQLite.

## 5. Pematuhan PDPA 2010 & Tadbir Urus Sekolah
- [ ] **Semakan Notis Privasi oleh Penasihat Undang-Undang**:
  - Notis Privasi dwi-bahasa (Bahasa Melayu & Bahasa Inggeris) pada skrin log masuk/pendaftaran telah disemak dan diluluskan oleh penasihat undang-undang institusi (rujuk [`docs/PDPA.md`](PDPA.md)).
- [ ] **Borang Persetujuan Waris & Polisi Simpanan Data**:
  - Pihak sekolah telah menyediakan proses pengumpulan persetujuan bertulis/digital daripada ibu bapa atau penjaga semasa pendaftaran pelajar.
  - Pihak sekolah telah menetapkan tempoh simpanan data pelajar selepas tamat pengajian/berhenti dan melantik pegawai bertanggungjawab untuk mengendalikan permintaan eksport (`Export PDPA JSON`) atau pemadaman kekal (`?purge=1`).

## 6. Had Seni Bina yang Perlu Difahami Client
- [ ] **Had SQLite (Satu Instance Sahaja)**:
  - Pihak teknikal client maklum bahawa backend menggunakan SQLite terbina dalam Node 22.5+ pada volume `/data/campusos.db` dan **hanya menyokong satu instance kontena `backend`** pada satu masa (jangan skala mendatar ke berbilang replika `backend`).

## 7. Tamat Sesi Tidak Aktif
- [ ] Pentadbir telah memilih tempoh tamat sesi di **Settings → Security → Sign out inactive users after** (lalai 30 minit). Pengguna aktif tidak dilog keluar; sesi yang tidak aktif ditolak pada percubaan refresh seterusnya (`SESSION_IDLE`).
- [ ] Had pelan Starter (10 guru / 25 kelas) **tidak** dikuatkuasakan selagi `BILLING_ENABLED=0` (sekolah tunggal tiada had).

## 8. Bahasa (English / Bahasa Melayu)
- [ ] Pilihan **EN | BM** wujud di skrin log masuk, onboarding, menu profil konsol pengurusan dan halaman *More* aplikasi guru. Menukar bahasa memuat semula halaman (laluan dan sesi kekal). Pilihan disimpan per pelayar (`campusos.lang`). Lalai: BM jika bahasa pelayar Melayu, selain itu English.
- [ ] Diterjemah: log masuk, 2FA, aplikasi guru, konsol pengurusan, onboarding, mesej ralat, tarikh/masa. Slip keputusan peperiksaan sengaja kekal dwibahasa. Kandungan yang dimasukkan pengguna (nama kelas, tajuk tugasan) tidak diterjemah.
- [ ] Tambah terjemahan baharu dalam `frontend/src/lib/i18n-ms.ts` / `i18n-ms-admin.ts` (kunci = teks English dalam `t('…')`). Ujian `tests/i18n-coverage.test.ts` gagal jika ada teks `t()` tanpa terjemahan.
- [ ] Kekurangan diketahui: ayat e-mel dari backend (jemputan, set semula kata laluan) dan mesej validasi mentah dari pelayan masih Bahasa Melayu sahaja.

## Alarm kelas & app mudah alih
- [ ] Laman diakses melalui HTTPS (tanpa itu app tidak boleh dipasang dan push tidak berfungsi).
- [ ] (Disyorkan) Jana kunci Web Push: `docker compose run --rm backend npm run vapid` → letak `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` dalam `.env`; simpan kunci persendirian bersama kunci rahsia lain.
- [ ] Zon masa sekolah ditetapkan dengan betul (*Settings → Organisation*) kerana alarm push mengikutnya.
- [ ] Uji pada telefon sebenar: pasang app → *More → Alarm kelas* → hidupkan *Alarm walaupun app ditutup* → *Send test notification* → tutup app dan pastikan notifikasi tiba.
- [ ] Terangkan kepada guru: app ditutup = notifikasi sistem (bunyi biasa telefon); app dibuka = alarm penuh. iPhone: pasang ke skrin utama dahulu.
