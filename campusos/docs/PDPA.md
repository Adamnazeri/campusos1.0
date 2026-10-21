# Data peribadi pelajar: senarai semak PDPA 2010 (bukan nasihat undang-undang)

CampusOS menyimpan nama pelajar, ID pelajar (No. Matrik / MyKid), maklumat hubungan ibu bapa/penjaga, kehadiran, penyerahan tugasan, dan keputusan peperiksaan. Di Malaysia ini tertakluk kepada Akta Perlindungan Data Peribadi 2010 (PDPA); sahkan keperluan sebenar dengan penasihat undang-undang institusi anda.

Yang sudah ada dalam produk:
- **Notis Privasi Dwi-Bahasa (BM & EN)**: Tersedia terus pada skrin log masuk/onboarding (`Auth.tsx`) untuk ketelusan pemprosesan data.
- **Akses data lengkap (`Right of Access`)**: `GET /v1/students/:id/export` (atau butang **Export PDPA JSON** dalam modal Edit Student di UI). Memuat turun JSON lengkap seorang pelajar merangkumi profil, maklumat waris, rekod kehadiran, penyerahan tugasan, dan **keputusan peperiksaan (`examResults`)**.
- **Pemadaman kekal (`Right to Erasure`)**: `DELETE /v1/students/:id?purge=1` (atau kotak semak **Permanently erase all records (PDPA request)** dalam modal Remove Student). Memadam rekod pelajar serta semua rekod kehadiran, penyerahan tugasan, dan markah peperiksaan secara kekal. Pilihan "Remove" biasa hanya menyahaktifkan pelajar (supaya sejarah laporan kelas kekal).
- **Keselamatan akses**: Kawalan peranan 5 tahap (RBAC), log audit aktiviti, rahsia 2FA TOTP disulitkan (AES-GCM), HTTPS automatik melalui Caddy, dan kunci akaun sementara selepas percubaan log masuk gagal berulang.

Perlu diputuskan oleh pihak sekolah / penyelenggara:
- Borang persetujuan ibu bapa/waris semasa pendaftaran pelajar; tempoh simpanan data selepas pelajar tamat pengajian; pelantikan pegawai perlindungan data.
- Sandaran (`./backups`) mengandungi data peribadi. Simpan di lokasi luar pelayan yang disulitkan dan padam salinan lama mengikut polisi.
