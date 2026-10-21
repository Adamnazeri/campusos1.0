# Panduan Pengguna CampusOS

Panduan ringkas ini menerangkan langkah persediaan awal sekolah, tugasan harian guru, dan tugasan pentadbir berdasarkan ciri yang tersedia dalam CampusOS.

## 1. Senarai Semak Persediaan Pertama (*First-Time Setup*)

### A. Daftarkan Sekolah
1. Buka URL CampusOS sekolah anda pada pelayar dan klik **Start onboarding**.
2. Lengkapkan wizard berbilang langkah untuk mencipta organisasi baharu dan akaun pemilik (*Owner*) pertama:
   - Maklumat institusi (nama sekolah, jenis institusi, negara/zon masa, cawangan/kampus).
   - Tahun akademik semasa, penggal (*terms*), dan hari operasi mingguan (cth. Isnin–Jumaat atau Ahad–Khamis).
   - Struktur asas (jabatan, subjek, kelas permulaan, dan bilik).

### B. Tetapkan Tahun Akademik & Kalendar Cuti Sekolah / Umum
1. Log masuk ke konsol pengurusan dan buka **Settings → Academic year**.
2. Semak tarikh mula/tamat tahun akademik, hari operasi (*Operating days*), serta senarai penggal (*Terms*).
3. Di bahagian **School & public holidays**, tambah tarikh cuti sekolah dan cuti umum:
   - Pilih tarikh, nama cuti, dan jenis (**Public Holiday**, **School Holiday**, **Term Break**, atau **Special Event**).
   - Kesan automatik: permohonan cuti guru tidak akan menolak baki cuti tahunan/sakit pada tarikh cuti ini, dan papan pemuka *Overview* / *Attendance* tidak akan mengeluarkan amaran kehadiran belum ditanda pada hari cuti.

### C. Urus Subjek & Import Guru, Kelas, dan Pelajar melalui CSV
Simpan helaian Excel anda sebagai fail `.csv` (UTF-8). Anda boleh memuat turun templat CSV terus daripada tetingkap import pada setiap halaman. Sistem menerima pengepala dalam Bahasa Melayu atau Bahasa Inggeris (maksimum 2,000 baris setiap muat naik; baris yang mengandungi ralat dilaporkan mengikut nombor baris dan dilangkau secara selamat):

1. **Senarai Subjek (`Subjects`)**:
   - Buka halaman **Subjects** untuk menambah subjek sekolah dan menetapkan matriks **Class × Subject** (subjek yang diambil oleh setiap kelas, guru subjek yang mengajar, dan bilangan waktu seminggu).
2. **Import Guru (`Teachers → Import CSV`)**:
   - Lajur disokong: `nama` (`name`), `e-mel` (`email`), `jabatan` (`department`), `subjek` (`subject`), `telefon` (`phone`), `cawangan` (`branch`), `peranan` (`role`), `waktu_maks` (`max_periods`).
3. **Import Kelas (`Classes → Import classes`)**:
   - Lajur disokong: `nama` (`name`), `tingkatan` (`grade`), `subjek` (`subject`), `guru` (`teacher`. Nama atau e-mel guru kelas), `bilik` (`room`), `cawangan` (`branch`), `jadual` (`schedule`).
4. **Import Pelajar & Maklumat Waris (`Classes → Import students` atau tab `Students` dalam butiran kelas)**:
   - Lajur disokong: `nama` (`name`), `kelas` (`class`), `no_matrik` / `no_kp` (`student_code`), `nama_penjaga` (`guardian_name`), `telefon_penjaga` (`guardian_phone`), `emel_penjaga` (`guardian_email`), `catatan` (`notes`).

### D. Jemput Guru & Staf Mengaktifkan Akaun
1. Semasa menambah guru di halaman **Teachers** (atau melalui **Settings → Users & access**), sistem menghantar e-mel jemputan automatik (jika SMTP/webhook telah dikonfigurasi).
2. Jika penghantaran e-mel belum diaktifkan, sistem memaparkan pautan jemputan (`?invite=...`) pada skrin supaya pentadbir boleh menyalinnya dan menghantar secara manual (cth. melalui WhatsApp).
3. Jemputan sah selama 7 hari. Jika tamat tempoh, klik **Resend** di **Settings → Users & access**.
4. Jika sekolah mewajibkan pengesahan dua faktor (**Settings → Security → Require 2FA**), pengguna akan diminta mengimbas kod TOTP (Google Authenticator / Authy / 1Password) dan menyimpan 8 kod pemulihan semasa log masuk pertama.

## 2. Tugasan Harian Guru (*Teacher App*)

Guru yang log masuk akan terus dibawa ke antara muka **Teacher App** (pentadbir juga boleh melihatnya melalui butang **Switch to Teacher View** di bar sisi):

- **Semak Jadual Hari Ini (`Today` & `My Schedule`)**:
  - Melihat senarai waktu mengajar hari ini mengikut urutan masa dan bilik.
  - Jika guru dilantik sebagai **guru ganti (*relief teacher*)** bagi kelas guru lain yang bercuti pada hari tersebut, sesi kelas ganti akan dipaparkan bersama lencana **Relief** pada jadual hari ini.
- **Ambil Kehadiran Kelas (`Attendance` / butang `Take attendance`)**:
  - Pilih kelas (termasuk kelas *relief* yang ditugaskan pada hari berkenaan) dan tandakan status setiap pelajar: **Present** (Hadir), **Late** (Lewat), atau **Absent** (Tidak Hadir).
  - Klik **All present** untuk menandakan semua pelajar hadir dengan pantas, kemudian **Save attendance**.
  - Bagi pelajar yang tidak hadir atau lewat dan mempunyai nombor telefon waris, klik pautan **WhatsApp** di sebelah nama pelajar untuk menghantar makluman terus kepada ibu bapa/penjaga.
- **Beri Tugasan & Semak Penyerahan (`My Classes` & `Assignments`)**:
  - Cipta tugasan baharu untuk kelas yang diajar dengan tarikh akhir (*due date*).
  - Klik senarai semak penyerahan (*Checklist*) pada tugasan untuk menandakan status setiap pelajar (**Submitted**, **Late**, atau **Pending**).
- **Rekod Markah Peperiksaan (`Exams`)**:
  - Masukkan markah dan gred pelajar bagi peperiksaan kelas yang diajar, serta cetak slip keputusan pelajar (*Print / PDF*).
- **Mohon Cuti (`Leave`)**:
  - Pilih jenis cuti (**Annual**, **Sick**, **Medical**, **Emergency**, atau **Unpaid**), tarikh mula dan tamat, serta sebab permohonan.
  - Sistem mengira bilangan hari bekerja secara automatik (tidak menolak baki cuti pada hari rehat mingguan sekolah atau tarikh yang ditandakan dalam kalendar cuti umum/sekolah) dan memaparkan status kelulusan (**Pending**, **Approved**, **Rejected**).
- **Urus Tugas & Pengumuman (`Tasks` & `Announcements`)**:
  - Tandakan tugas (*to-do*) yang selesai dan baca pengumuman sekolah yang disasarkan kepada guru.

## 3. Tugasan Pentadbir & Penyelaras (*Management Console*)

- **Pantau Operasi Harian (`Overview` & `Attendance`)**:
  - Lihat sesi kelas yang sedang berlangsung (*Live now*), kadar kehadiran harian setiap kelas, kelas yang belum menandakan kehadiran, amaran cuti umum/sekolah, dan senarai kelas yang memerlukan guru ganti pada hari ini.
- **Luluskan Cuti & Lantik Guru Ganti (`Leave → Requests` & `Leave → Relief coverage`)**:
  - Pada tab **Requests**, semak permohonan cuti guru (sistem memaparkan amaran jika terdapat guru lain dalam jabatan yang sama bercuti pada tarikh bertindih) dan klik **Approve**, **Reject**, atau **Undo**.
  - Pada tab **Relief coverage**, pilih tarikh untuk melihat semua sesi jadual waktu bagi guru yang bercuti (*Approved leave*).
  - Pilih **guru ganti (*Substitute teacher*)** daripada senarai guru yang berkelapangan (sistem menapis secara automatik guru yang tidak bercuti, tiada kelas lain pada waktu tersebut, dan belum ditugaskan ke kelas ganti lain pada waktu sama).
- **Urus Jadual Waktu & Beban Tugas (`Timetable` & `Workload`)**:
  - Tambah atau ubah sesi jadual waktu dengan pengesanan konflik automatik (pertindihan guru, kelas, atau bilik pada hari dan masa yang sama).
  - Pantau agihan waktu mengajar setiap guru berbanding had waktu maksimum mingguan di halaman **Workload**.
- **Naik Kelas Pukal / Tamat Pengajian Akhir Tahun (`Classes → Promote / Rollover`)**:
  - Buka halaman **Classes**, pilih kelas asal, buka tab **Students**, dan klik **Promote / Rollover**.
  - Pilih sama ada untuk memindahkan semua pelajar aktif ke kelas tingkatan seterusnya (cth. `Form 4A` → `Form 5A`) atau menandakan pelajar tahun akhir sebagai tamat pengajian (**Graduate / Archive**) dalam satu transaksi tanpa kehilangan sejarah kehadiran dan keputusan peperiksaan.
- **Jana Laporan & Eksport CSV (`Reports` & `Analytics`)**:
  - Di halaman **Reports**, pratonton dan muat turun 8 jenis laporan rasmi dalam format CSV:
    1. *Attendance Summary Report*
    2. *Teacher Workload Report*
    3. *Timetable Utilization Report*
    4. *Room Utilization Report*
    5. *Leave & Absence Report*
    6. *Exam Performance Report*
    7. *Assignment Completion Report*
    8. *Executive Operations Pack*
  - Di halaman **Analytics**, pantau trend kehadiran mingguan, taburan gred peperiksaan, beban jabatan, serta senarai pelajar kerap tidak hadir (*Chronic absenteeism*) lengkap dengan nombor telefon waris.
- **Permintaan Data Peribadi Pelajar (`PDPA 2010`)**:
  - **Eksport Data Pelajar**: Buka **Classes → [Pilih Kelas] → Students**, klik ikon tetapan pada baris pelajar, dan pilih **Export PDPA JSON** untuk memuat turun rekod penuh pelajar (profil, maklumat waris, kehadiran, penyerahan tugasan, dan keputusan peperiksaan).
  - **Pemadaman Kekal**: Klik ikon padam (`×`) pada pelajar dan tandakan **Permanently erase all records (PDPA request)** untuk memadam semua rekod pelajar tersebut secara kekal daripada pangkalan data, atau biarkan tidak ditanda untuk sekadar menyahaktifkan pelajar.
  - **Tetap Semula 2FA Staf**: Jika seorang guru kehilangan peranti 2FA dan kod pemulihan, pemilik (*Owner*) boleh menetapkan semula 2FA pengguna tersebut di **Settings → Users & access → Reset 2FA**.
