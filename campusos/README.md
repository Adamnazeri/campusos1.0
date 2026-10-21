# CampusOS (frontend + backend)

```
campusos/
├─ frontend/   React 19 + Vite + Tailwind v4. Kini TERSAMBUNG ke API (login sebenar, semua halaman guna data pelayan)
├─ backend/    REST API Node, tanpa dependensi npm (SQLite terbina dalam Node 22.5+)
├─ scripts/    dev.mjs: jalankan kedua-duanya serentak
├─ .vscode/    tasks, debug, sambungan yang disyorkan
└─ requests.http   contoh request (ekstensi REST Client)
```

## Jalankan di VS Code

Syarat: **Node 22.5+** (`node -v`). Buka folder `campusos` (File → Open Folder), kemudian di terminal:

```bash
npm run dev
```

Kali pertama frontend memasang dependensi sendiri (perlu internet). Atau tekan **Ctrl+Shift+B**.

- Frontend: http://localhost:5174 · Backend: http://localhost:8788/health
- Data demo "Greenfield Academy" dibuat automatik **semasa pembangunan sahaja**. Kata laluan akaun demo: `password123` (jangan seed di production)
  - `admin@campusos.io`: owner (semua kebenaran)
  - `grace.b@campusos.io`: coordinator
  - `sarah.m@campusos.io`: teacher (Form 4A & 4C)
- Atau tekan **Start onboarding** untuk mencipta organisasi baharu yang kosong.

| Perintah | Fungsi |
|---|---|
| `npm run dev` | frontend + backend |
| `npm run api` | backend sahaja |
| `npm test` | ujian integrasi backend penuh |
| `npm run seed` | cipta data demo (selamat diulang) |

## Apa yang berfungsi (diuji)

**Backend (102 endpoint, semua ujian integrasi lulus)**. Onboarding berbilang langkah dalam satu transaksi, login + refresh token berputar, lima peranan dengan matriks kebenaran, guru/kelas/pelajar (termasuk ID pelajar & maklumat waris)/bilik, jadual waktu dengan semakan konflik, **sistem guru ganti (*relief teacher*) automatik**, **kalendar cuti sekolah & cuti umum**, **naik kelas pukal / tamat pengajian (*academic year rollover*)**, kelas live, kehadiran, cuti (baki automatik tolak cuti umum, bertindih, lulus/undo), tugasan, peperiksaan & markah, tugas, pengumuman bersasar, 8 laporan (JSON/CSV), analitik, tetapan, bil, **lupa/tetap semula kata laluan, 2FA TOTP (RFC 6238), e-mel melalui peti keluar + SMTP/webhook, webhook pembayaran, serta eksport & pemadaman kekal PDPA lengkap**.

**Frontend (diuji dalam pelayar sebenar dengan backend hidup)**. Log masuk (ralat, 2FA, lupa kata laluan, pautan reset, terima jemputan, Notis Privasi PDPA 2010 dwi-bahasa), onboarding → organisasi baharu, sign out, sesi kekal selepas refresh. Konsol pengurusan: Overview (live ops, amaran cuti umum & keperluan guru ganti, konflik, aktiviti), Timetable (tambah sesi + amaran konflik + "Schedule anyway"), Attendance, Workload, Teachers (tambah guru + jemputan), Classes (termasuk maklumat waris pelajar, eksport JSON PDPA, dan butang **Promote / Rollover**), Rooms, Assignments, Exams, Leave (lulus/tolak/undo + tab **Relief coverage** untuk melantik guru ganti), Tasks, Announcements, Reports (pratonton + CSV), Analytics, Settings (organisasi, tahun akademik + **kalendar cuti sekolah/umum**, struktur, peranan, notifikasi, keselamatan + 2FA), Billing. Aplikasi guru: hari ini (termasuk kelas relief yang ditugaskan), jadual, kelas (+ beri tugasan), tugas, ambil kehadiran, mohon cuti, peperiksaan, pengumuman.

## Ciri Operasi Sekolah Sebenar (Baharu)

### 1. Profil Pelajar, Maklumat Waris & Pematuhan PDPA Lengkap
- Setiap pelajar boleh menyimpan **Student ID / No. Matrik / MyKid (`studentCode`)**, **Nama Ibu Bapa/Penjaga (`guardianName`)**, **No. Telefon / WhatsApp Waris (`guardianPhone`)**, **E-mel Waris (`guardianEmail`)**, dan **Catatan (`notes`)**.
- Nombor telefon waris dipaparkan terus pada senarai kelas dan jadual pelajar kerap tidak hadir (*Analytics*) untuk panggilan pantas.
- Dalam tab **Students** pada butiran kelas:
  - Klik ikon tetapan pelajar → **Export PDPA JSON** untuk memuat turun salinan penuh data pelajar (profil, maklumat waris, kehadiran, tugasan, dan keputusan peperiksaan).
  - Klik ikon padam (`×`) → pilih sama ada nyahaktif biasa atau **Permanently erase all records (PDPA request)** (`?purge=1`).

### 2. Kalendar Cuti Umum & Cuti Sekolah (`Settings → Academic year`)
- Pentadbir boleh menambah tarikh **Public Holiday**, **School Holiday**, **Term Break**, atau **Special Event**.
- Apabila diaktifkan:
  - Permohonan cuti guru (`POST /v1/leave`) secara automatik mengecualikan tarikh cuti umum/sekolah daripada ditolak daripada baki cuti tahunan/sakit guru.
  - Papan pemuka *Overview* dan *Attendance* memaparkan sepanduk cuti sekolah dan tidak mengeluarkan amaran "kehadiran belum ditanda" pada hari cuti.

### 3. Sistem Guru Ganti (*Relief / Substitute Teacher*)
- Di halaman **Leave → Relief coverage** (`GET /v1/timetable/substitutions?date=YYYY-MM-DD`):
  - Sistem mengenal pasti secara automatik semua sesi jadual waktu bagi guru yang sedang bercuti (*Approved leave*) pada tarikh tersebut.
  - Pentadbir boleh memilih guru ganti daripada senarai guru yang berkelapangan (sistem menapis secara automatik guru yang tidak bercuti, tidak mempunyai kelas lain pada waktu sama, dan belum menjadi guru ganti kelas lain pada waktu sama).
  - Guru ganti yang dilantik akan melihat kelas relief tersebut dalam aplikasi guru mereka pada hari berkenaan dan diberi kebenaran menandakan kehadiran kelas tersebut.

### 4. Pertukaran Tahun Akademik & Naik Kelas Pukal (*Promote / Rollover*)
- Dalam halaman **Classes → [Pilih Kelas] → Students → Promote / Rollover** (`POST /v1/classes/promote`):
  - Pindahkan semua pelajar aktif ke kelas tingkatan seterusnya (cth. `Form 4A` → `Form 5A`) atau tandakan pelajar tahun akhir sebagai tamat pengajian (*Graduate*) dalam satu transaksi sambil mengekalkan sejarah kehadiran dan keputusan peperiksaan mereka.

## Konfigurasi (backend/.env: salin daripada .env.example)

| Pemboleh ubah | Fungsi |
|---|---|
| `JWT_SECRET` | **wajib** di production |
| `APP_URL` | URL frontend dalam pautan e-mel |
| `MAIL_WEBHOOK_URL` / `MAIL_WEBHOOK_AUTH` | hantar e-mel sebenar: setiap e-mel di-POST sebagai JSON `{from,to,subject,text}` (cocok dengan Resend/Zapier/n8n). Kosong = hanya direkod; lihat `GET /v1/dev/outbox` |
| `BILLING_WEBHOOK_SECRET` | webhook pembayaran `POST /v1/billing/webhook` (`payment_succeeded` / `payment_failed` / `subscription_cancelled`) |
| `EXPOSE_INVITE_TOKENS`, `DEV_ENDPOINTS` | mati automatik bila `NODE_ENV=production` |

## Production, keselamatan & dokumentasi
- Deploy (Docker + HTTPS): [`docs/DEPLOY.md`](docs/DEPLOY.md) · E-mel: [`docs/EMAIL.md`](docs/EMAIL.md) · Data peribadi/PDPA: [`docs/PDPA.md`](docs/PDPA.md)
- Semakan sebelum hantar: `cd backend && npm test` · `cd frontend && npm run check` (typecheck + ujian + build)
- Ciri keselamatan: kunci akaun selepas kegagalan login, 2FA dengan kod pemulihan & penolakan guna semula kod, rahsia 2FA disulitkan, 2FA boleh diwajibkan seluruh organisasi, pengepala keselamatan (CSP/HSTS/X-Frame), sandaran harian automatik.
- Billing dimatikan secara lalai (`BILLING_ENABLED=1` hanya selepas gateway pembayaran disambungkan).

## Kelas vs Subjek
- **Classes** = kumpulan pelajar (cth. "Form 4A"), dengan *class teacher* (guru kelas), bilik dan cawangan.
- **Subjects** = senarai subjek sekolah (cth. Mathematics). Diurus di halaman **Subjects**.
- **Class × Subject** = kelas mana mengambil subjek apa, siapa yang mengajar dan berapa waktu seminggu (halaman Subjects → jadual matriks, atau tab *Subjects* dalam butiran kelas).
- Jadual, tugasan dan peperiksaan memilih subjek daripada subjek yang diambil kelas itu; guru subjek nampak dan boleh urus kelas yang mereka ajar walaupun bukan guru kelas.

## Import pukal (CSV)
Halaman **Teachers → Import CSV**, **Classes → Import classes / Import students**, dan tab **Students** dalam butiran kelas. Simpan helaian Excel sebagai CSV (pengepala dalam English atau Bahasa Melayu: `nama`, `e-mel`, `kelas`, `jabatan`, `no_kp`/`no_matrik`, `nama_penjaga`, `telefon_penjaga`…; templat boleh dimuat turun). Fail disemak dahulu: baris yang salah dilaporkan dengan nombor baris dan dilangkau, baris yang betul diimport (maksimum 2000 baris sekali).

## Pilot percuma
Tiada VPS atau domain? Lihat `docs/PILOT-PERCUMA.md`: jalankan di komputer sendiri dan lepaskan melalui Tailscale Funnel (`npm run pilot`).
