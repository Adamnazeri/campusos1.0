# Sistem rupa CampusOS ("hijau papan", kotak serong)

Arah rupa: alat kerja sekolah. Krim kapur, hijau papan hitam, dan kuning kapur sebagai aksen. Kotak bersudut dengan dua sudut dipotong serong macam tiket (kanan atas dan kiri bawah), garis nipis menggantikan bayang, bar sisi hijau penuh. Tiada kecerunan, kaca, bulatan atau animasi hiasan.

## Kotak serong
Semua jejari (`--radius-*`) ialah 0 dan `rounded-full` juga 0, jadi tag, titik dan suis berbentuk segi empat. Kad, butang, dialog, toast dan avatar menggunakan kelas `.chamfer` (`src/index.css`):
- `clip-path` memotong dua sudut; `::after` melukis sempadan mengikut bentuk yang sama (polygon `evenodd`), jadi garis nipis kekal pada sudut serong. Ketebalan sama pada garis lurus dan serong (disahkan secara matematik).
- Pembolehubah: `--c` (saiz potongan; `.chamfer-sm` 6px, `.chamfer-lg` 16px), `--line` (warna garis; lalai lutsinar), `--b` (tebal garis).
- Elemen mesti `relative`. Menukar warna garis semasa hover: `hover:[--line:var(--border-strong)]`.
- Penanda fokus butang ialah `outline` di dalam elemen (`-outline-offset-4`) kerana `clip-path` memotong apa sahaja di luar bentuk.
- Input, select dan textarea kekal segi empat biasa (elemen ini tidak menyokong `::after`).

## Token (src/index.css)
| | Cerah | Gelap |
|---|---|---|
| Latar / permukaan | `#f6f3e8` / `#fffdf6` | `#0f1a15` / `#16241d` |
| Teks utama | `#1a2a22` | `#f3efe0` |
| Teks sekunder | `#3f5046` (≥ 7:1) | `#b5c2b8` (≥ 8:1) |
| Butang utama | hijau `#1b5740`, hover `#134432` | hijau muda `#8fd6b0` |
| Aksen (kuning kapur) | `#f2d45c` (teks `#2f2600`) | `#f2d45c` |
| Bar sisi | `#123b2d`, menu aktif kuning kapur | `#0a120e` |

Fon: **Lexend** (tajuk, dibina untuk bacaan mudah), **Nunito Sans** (teks), **IBM Plex Mono** (masa dan nombor). Ikon: set sendiri 45 ikon (`src/lib/icons.tsx`). Logo: papan jadual 3x3 hijau dengan satu sel kuning kapur = "sekarang".

Mengubah palet: ubah token dalam `index.css`, kemudian jalankan `npm test`. `tests/contrast.test.ts` gagal jika mana-mana pasangan teks/latar jatuh di bawah WCAG (teks biasa ≥ 7:1, kawalan ≥ 3:1) dalam mod cerah atau gelap. Warna bar sisi dan hero ialah token (`sidebar-*`), jadi tema baharu hanya perlu menukar token.

## Graf (src/components/Charts.tsx)
Graf garis ialah komponen sebenar, bukan hiasan: kotak plot bersempadan, grid mendatar dan menegak, tanda paksi utama dan kecil, label berangka, garis tebal dengan titik, dan garis sasaran. Ia dilukis pada saiz piksel sebenar (ResizeObserver) supaya titik kekal bulat.
- **Data sebenar:** tren kehadiran (`/v1/analytics`, `/v1/attendance/overview`) dan purata markah setiap peperiksaan (`examTrend`, dikira daripada `exam_results`). Tiada data contoh dalam kod.
- **Skala:** paksi menegak "cantik" (1, 2, 5 × 10^n) dan bilangan tanda ikut tinggi graf; paksi tarikh mengikut masa sebenar (hujung minggu = jurang), bukan jarak sama.
- **Interaksi:** tooltip dengan tetikus dan sentuh; papan kekunci (←, →, Home, End, Esc) apabila graf difokus; jadual data tersembunyi untuk pembaca skrin.
- Logik skala berada dalam `src/lib/chartScale.ts` dan diuji dalam `tests/chart.test.ts`.

## Corak "dihasilkan AI" yang telah dibuang
| # | Corak | Status |
|---|---|---|
| 1 | Kecerunan ungu ke biru | Dibuang (kecerunan pada log masuk, onboarding, kad guru); kini hijau rata |
| 2 | Teks tajuk berkecerunan | Tiada; dikawal oleh ujian |
| 3 | Emoji dalam tajuk | Satu emoji dibuang; dikawal |
| 4 | Fon Inter di mana-mana | Diganti (Lexend + Nunito Sans) |
| 5 | Kad bergaris warna di sisi | Dibuang; diganti penanda segi empat kecil |
| 6 | Kad kaca (glassmorphism) | Semua `backdrop-blur` dibuang |
| 7 | Mod gelap kontras rendah | Palet baharu; kontras dikunci oleh ujian |
| 8 | Tiga kotak ikon berbaris | Dibuang (log masuk, kad statistik, semua petak ikon) |
| 9 | Label kecil di atas tajuk | Dibuang |
| 10 | Ikon Lucide | Diganti set ikon sendiri |
| 11 | shadcn tanpa ubah suai | Komponen direka semula: rata, sudut serong, butang hijau, tag segi empat |
| 12 | Fade-in semasa skrol | Tiada pada skrol; fade peralihan halaman dibuang |
| 13 | Sinar mengikut kursor | Tiada; dikawal |
| 14 | Butang pudar semasa hover | Tiada transisi; tukar warna serta-merta + kesan tekan |
| 15 | Jarak tidak konsisten | 210 nilai separuh-langkah diselaraskan ke skala 4px; dikawal |
| 16 | Sempang em di mana-mana | Dibuang daripada ayat (UI, kamus, mesej pelayan, e-mel) |
| 17 | Salinan generik | Teks log masuk, onboarding dan tetapan ditulis semula |
| 18 | Aksen serif italik | Tiada; dikawal |
| 19 | Space Grotesk + Instrument Serif | Tiada; dikawal |
| 20 | Grain atas kecerunan | Tiada; dikawal |

Penanda sel atau medan kosong ialah satu pemalar (`EMPTY` dalam `src/lib/empty.ts`, tanda sengkang biasa), bukan sempang em. Julat masa seperti `08:00–09:00` menggunakan sempang en.

`tests/design-tells.test.ts` mengimbas kod dan gagal jika mana-mana corak di atas kembali.
