# App mudah alih (PWA) dan alarm kelas

## Pasang sebagai app
CampusOS ialah aplikasi web yang boleh **dipasang pada skrin utama telefon** (PWA). Selepas dipasang ia dibuka sepenuh skrin dengan ikon sendiri, tanpa perlu cari di pelayar.

**Syarat:** laman mesti diakses melalui **HTTPS** (Caddy menyediakannya automatik apabila `DOMAIN` ditetapkan). Pada `http://localhost` pemasangan hanya berfungsi pada komputer yang sama.

**Untuk admin:** *Settings → Mobile app* → salin pautan atau kongsi melalui WhatsApp kepada guru.

**Untuk guru:**
- Android (Chrome): buka pautan → ketik **Pasang app** pada dashboard (atau menu ⋮ → *Install app*).
- iPhone (Safari): ketik butang **Kongsi** → **Tambah ke Skrin Utama**.

Ini bukan app dalam Play Store / App Store. Jika client mahu app berkedai, ia memerlukan pembungkus (cth. Capacitor/TWA) dan akaun pembangun (Google Play / Apple Developer).

## Alarm kelas
Guru hidupkan di dashboard (*Alarm kelas*) atau di halaman **More → Alarm kelas**. Pilihan: alarm bila kelas mula, bila tamat, peringatan 5/10 minit sebelum, bunyi, getaran, notifikasi.

Alarm membaca jadual hari ini (termasuk kelas guru ganti; kelas dibatalkan dilangkau) dan menggunakan jam peranti. Ia tidak berbunyi pada hari cuti.

### Alarm walaupun app ditutup (Web Push)
Di **More → Alarm kelas**, hidupkan **Alarm walaupun app ditutup**. Pelayan kemudian menghantar notifikasi pada masa kelas bermula/tamat (dan peringatan awal jika dipilih) ke telefon, walaupun app ditutup atau skrin terkunci. Ketik notifikasi untuk membuka app.

- Pelayan memeriksa jadual setiap 30 saat menggunakan **zon masa sekolah** (*Settings → Organisation*). Guru yang cuti (diluluskan) tidak menerima alarm kelas sendiri; kelas ganti yang ditugaskan kepadanya diberi alarm; kelas dibatalkan dan hari cuti dilangkau.
- Mesej disulitkan hujung ke hujung (RFC 8291) dan dihantar melalui perkhidmatan push pelayar (Google/Mozilla/Apple). Perkhidmatan itu tidak dapat membaca nama kelas/subjek.
- Kunci VAPID dijana automatik dan disimpan dalam pangkalan data (ikut dalam sandaran). Disyorkan menetapkan `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` dalam `.env` (`npm run vapid`) supaya tidak berubah jika pelayan dipindahkan. Jika kunci bertukar, guru perlu menghidupkan semula alarm latar belakang (app akan cuba mendaftar semula secara automatik apabila dibuka).
- Telefon boleh dikongsi: semasa log keluar, peranti diputuskan daripada akaun itu; ia didaftarkan semula apabila guru log masuk.

### Had yang perlu diketahui
- **Bukan alarm berdering berterusan.** Apabila app ditutup, telefon memaparkan notifikasi sistem dengan bunyi dan getaran notifikasi biasa pengguna (tidak boleh ditukar kepada nada jam loceng oleh web app). Apabila app **dibuka**, alarm penuh (bunyi berulang + getaran + skrin besar) berbunyi.
- **iPhone:** notifikasi push hanya berfungsi jika CampusOS **dipasang ke skrin utama** (iOS 16.4 ke atas). Getaran dalam app web tidak disokong pada iPhone.
- **Android:** penjimat bateri agresif (cth. beberapa Xiaomi/Oppo/Vivo/Huawei) boleh melambatkan notifikasi; minta guru memilih "tiada had bateri" untuk Chrome/CampusOS.
- Perlu **HTTPS** (atau localhost) dan kebenaran notifikasi. Jika guru menyekat notifikasi dalam tetapan pelayar, alarm latar belakang tidak berfungsi.
- Notifikasi dihantar pada masa tepat (±30 saat). Jika telefon tiada internet pada masa itu, perkhidmatan push menyimpannya sehingga 5 minit sahaja, selepas itu dibuang (alarm lapuk tiada gunanya).
- Alarm dalam app (bunyi berulang) tetap memerlukan app dibuka dan satu ketikan skrin sejak app dibuka (syarat pelayar).
