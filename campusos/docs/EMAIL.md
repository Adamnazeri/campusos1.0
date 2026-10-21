# E-mel (jemputan guru, reset kata laluan)

Selepas anda tambah guru atau jemput pengguna, backend menghantar e-mel berpautan kepada alamat itu. Pilih **satu** kaedah penghantaran dalam `.env`.

## Pilihan A: SMTP (disyorkan, tiada perantara)

### Gmail / Google Workspace (paling cepat)
1. Akaun Google mesti ada **pengesahan 2 langkah**. Buka <https://myaccount.google.com/apppasswords> → cipta **App Password** (16 aksara).
2. Isi:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=0
SMTP_USER=sekolah@gmail.com
SMTP_PASS=abcdefghijklmnop
MAIL_FROM=CampusOS <sekolah@gmail.com>      # mesti sama dengan SMTP_USER (atau alias yang sah)
```
Had Gmail percuma ≈ 500 e-mel/hari; akaun Google Workspace lebih tinggi. Memadai untuk jemputan guru.

### Penyedia lain
Brevo (`smtp-relay.brevo.com:587`), Mailgun, SendGrid, atau SMTP hosting (cPanel: `mail.domain-anda.com`, port 587 atau 465 dengan `SMTP_SECURE=1`). Gunakan alamat pengirim pada domain anda dan sahkan SPF/DKIM di penyedia, supaya tidak masuk spam.

Keselamatan: kata laluan SMTP **tidak pernah dihantar tanpa penyulitan**. Jika pelayan tidak menawarkan STARTTLS/TLS, penghantaran gagal dengan mesej jelas.

## Pilihan B: Webhook
Isi `MAIL_WEBHOOK_URL` (+ `MAIL_WEBHOOK_AUTH`). Backend POST JSON `{from,to,subject,text}`. Format ini sepadan dengan API Resend (`https://api.resend.com/emails` + `Bearer re_…`), tetapi **belum diuji terhadap Resend sebenar**. Jika `SMTP_HOST` ditetapkan, SMTP diutamakan.

## Uji SEBELUM serah kepada client
```
cd backend && npm run mail:test -- emel-anda@contoh.com
```
Cetak `BERJAYA` atau sebab kegagalan (login salah, port disekat, dsb.). Kemudian tambah satu guru dengan e-mel anda sendiri dan pastikan jemputan sampai (semak folder spam).

## Perilaku
- **Status hantar sebenar (v9):** semasa admin menjemput pengguna / menambah guru, sistem cuba menghantar e-mel serta-merta dan melaporkan keputusan sebenar. "Invitation emailed" hanya dipaparkan jika pelayan SMTP **menerima** mesej. Jika gagal (kata laluan salah, port disekat, penerima ditolak), admin nampak sebab ralat dan diberi pautan untuk dikongsi manual. Di *Settings → Users & access*, setiap jemputan yang belum diterima menunjukkan status **Email sent / Email failed / Not emailed**.
- Perhatian: "diterima oleh pelayan SMTP" bukan jaminan sampai ke peti masuk (boleh masuk spam). Sebab itu SPF/DKIM dan ujian dengan e-mel sebenar (di atas) tetap wajib.
- E-mel yang gagal dicuba semula setiap minit (sehingga 5 kali). Selepas berjaya, kandungan (yang mengandungi pautan token) dibuang daripada pangkalan data.
- Jika **tiada** SMTP/webhook dikonfigurasi, e-mel tidak dihantar. Sebagai ganti, pautan jemputan dipaparkan kepada admin dalam UI supaya boleh dikongsi secara manual (WhatsApp dll.), dan amaran dicetak semasa backend bermula.
- Jemputan sah 7 hari; butang **Resend** ada di *Settings → Users & access*.
- Docker: pastikan pelayan membenarkan sambungan keluar ke port SMTP (587/465); sesetengah hos awan menyekat port 25.
