# 🤖 V-Ultimate-Bot

[![Version](https://img.shields.io/badge/version-2.4.0-blue.svg)](https://github.com/vazul76/v_bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2018.x-green.svg)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc.6-brightgreen.svg)](https://github.com/WhiskeySockets/Baileys)

**V-Ultimate-Bot** adalah WhatsApp Bot Utility yang dibangun dengan **@whiskeysockets/baileys**. Bot ini menggabungkan berbagai fitur canggih mulai dari Sticker Tools, Social Media Downloader (YT, FB, TikTok, IG, Twitter/X), hingga berbagai utility tools.

> **🔄 Update v2.4.0**:
>
> - ✅ Tambah `/qr` — QR Code Generator
> - ✅ Tambah `/nslookup` — IP & DNS Lookup
> - ✅ Fix `/price` goldprice.org → Yahoo Finance

---

## 🌟 Fitur Unggulan

### 🎨 Sticker & Image Tools

- **Image with Text**: Buat sticker dari gambar lengkap dengan overlay teks otomatis.
- **Sticker Maker**: Ubah gambar apapun menjadi sticker berkualitas tinggi.
- **Sticker to Image**: Konversi kembali sticker (WebP) menjadi gambar (PNG) yang sudah di-trim transparasinya.

### 📥 Social Media Downloader

- **YouTube Downloader**: Download video (MP4) atau audio (MP3) dengan kualitas terbaik.
- **Twitter/X Downloader**: Download video dan foto dari Twitter/X.
- **Instagram Downloader**: Download video dan Reels Instagram (foto belum support).
- **TikTok Downloader**: Download video dan foto/slideshow TikTok (tanpa watermark, auto-detect format).
- **Facebook Downloader**: Download video dan foto dari Facebook.

### 🗣️ Utility & Fun

- **Text-to-Speech (TTS)**: Ubah teks jadi suara Google dengan deteksi bahasa otomatis (Indo, Arab, Jepang).
- **Translate AI (Groq)**: Terjemahkan teks ke berbagai bahasa (Indo, Inggris, Jepang) dengan AI yang natural.
- **Weather Info (BMKG)**: Cek prakiraan cuaca real-time untuk wilayah DI Yogyakarta dengan data resmi BMKG.
- **Market Price**: Cek harga crypto populer, komoditas (Gold/Silver), dan IHSG dengan perubahan 24 jam.
- **QR Code Generator**: Buat QR Code dari teks atau URL apapun, langsung dikirim sebagai gambar.
- **IP & DNS Lookup**: Cek info geolokasi IP, ISP, ASN, dan DNS records (A, MX, NS, TXT, CNAME) untuk IP atau domain.
- **Encode / Decode**: Konversi teks dengan 6 format: Base64, URL, Hex, Binary, ROT13, HTML Entity.
- **WhatsApp Poll**: Buat voting/polling langsung di grup WhatsApp.
- **VirusTotal Scan**: Scan file, URL, atau hash untuk mendeteksi malware menggunakan API VirusTotal.

### 🔧 Smart System

- **Health Monitoring**: Automatic health check setiap hari jam 8 pagi untuk semua service (YouTube, TikTok, Instagram, dll). Bot otomatis kirim laporan WA ke admin setiap hari + command manual `/health`.
- **Offline Filtering**: Bot cerdas yang mengabaikan pesan saat sedang offline untuk mencegah spam penumpukan perintah saat baru startup.
- **Auto Reconnect**: Otomatis reconnect jika koneksi terputus.
- **Multi-File Auth State**: Session management yang lebih aman dengan Baileys.

---

## 🛠️ Technology Stack

- **[@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)** - WhatsApp Web API
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** - Universal Video Downloader (YouTube, TikTok, Instagram, Twitter, Facebook)
- **[BMKG API](https://api.bmkg.go.id/)** - DI Yogyakarta Weather Data (Free, No API Key)
- **[ip-api.com](https://ip-api.com/)** - IP Geolocation & ISP Info (Free, No API Key)
- **[Groq SDK](https://groq.com/)** - AI Translation (Llama 3.3)
- **[wa-sticker-formatter](https://github.com/AlenSaito1/wa-sticker-formatter)** - Sticker Creator
- **[canvas](https://github.com/Automattic/node-canvas)** - Image Processing
- **[sharp](https://github.com/lovell/sharp)** - High Performance Image Processing
- **[qrcode](https://github.com/soldair/node-qrcode)** - QR Code Generator
- **[VirusTotal API](https://www.virustotal.com/)** - Security Scanning Engine

---

## 🚀 Instalasi Cepat

### Prasyarat

- **Node.js** >= 18.x (LTS version direkomendasikan)
- **npm** >= 8.0.0

### Instalasi di Ubuntu/Linux VM

Jika Anda deploy di Ubuntu/Linux VM, install dependencies berikut terlebih dahulu:

```bash
# Install build tools dan library untuk canvas & sharp
sudo apt update
sudo apt install -y \
  build-essential \
  pkg-config \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev

# Install library untuk vips (sharp)
sudo apt install -y \
  libvips-dev \
  libglib2.0-dev \
  libexpat1-dev

# Install Python (diperlukan untuk build native modules)
sudo apt install -y python-is-python3
```

### Langkah-langkah

1. **Clone Repositori**

   ```bash
   git clone https://github.com/vazul76/v_bot.git
   cd v_bot
   ```

2. **Instal Dependensi**

   ```bash
   npm install
   ```

   > [!WARNING]
   > **Troubleshooting untuk Ubuntu VM**: Jika `npm install` gagal dengan error pada modul `sharp` atau `canvas`, pastikan semua dependencies sistem sudah terinstall. Untuk sharp, versi yang digunakan adalah `^0.32.6` yang lebih kompatibel dengan berbagai sistem.

3. **Jalankan Bot**

   ```bash
   npm start
   ```

   Atau untuk development mode dengan auto-reload:

   ```bash
   npm run dev
   ```

### Menjalankan dengan Docker (direkomendasikan untuk konsistensi lingkungan)

Jika Anda ingin menjalankan bot menggunakan Docker (lebih mudah untuk dependency native seperti `canvas`/`sharp`), gunakan `Dockerfile` dan `docker-compose.dev.yml` yang sudah disediakan.

Build & jalankan (development):

```bash
# dari root project
docker compose -f docker-compose.dev.yml up --build
```

Jalankan di background:

```bash
docker compose -f docker-compose.dev.yml up --build -d
```

Lihat log untuk scan QR / status koneksi:

```bash
docker compose -f docker-compose.dev.yml logs -f
```

Jika tidak menggunakan `docker-compose`, contoh manual build & run:

```bash
# build image
docker build --build-arg BUILD_ENV=development -t v-bot:dev .

# run container (development, mount current dir & auth)
docker run --rm -it \\
   -v "%CD%":/usr/src/app \\
   -v "%CD%/auth_baileys":/usr/src/app/auth_baileys \\
   --env-file .env \\
   -e NODE_ENV=development \\
   --name v-bot-dev v-bot:dev
```

Catatan:

- Pastikan `auth_baileys/` ada di root project supaya sesi login tersimpan.
- Jika menggunakan Docker Desktop di Windows, jalankan perintah dari PowerShell/WSL dan pastikan path mount diizinkan.
- Docker image sudah meng-install library native untuk `canvas`/`sharp`, jadi masalah build di host Windows biasanya tidak muncul di container.

4. **Scan QR Code**
   Buka WhatsApp di ponsel Anda, pilih "Perangkat Tertaut" (Linked Devices), dan scan QR code yang muncul di terminal.

   > [!NOTE]
   > Setelah scan QR pertama kali, kredensial akan disimpan di folder `auth_baileys/`. Bot akan otomatis login di startup berikutnya tanpa perlu scan QR lagi.

---

## 🕹️ Cara Penggunaan

Gunakan prefix `/` (slash) diikuti oleh perintah:

| Perintah                  | Deskripsi                                           | Batasan        |
| :------------------------ | :-------------------------------------------------- | :------------- |
| `/s`                      | Gambar → Sticker                                    | -              |
| `/stext [Teks]`           | Gambar → Sticker + Teks                             | -              |
| `/toimg`                  | (Reply Sticker) → Gambar                            | -              |
| `/ytmp3 [Link]`           | Download Audio YouTube (MP3)                        | Max 16MB       |
| `/yt [Link]`              | Download Video YouTube (MP4)                        | Max 100MB      |
| `/fb [Link]`              | Download Media Facebook (Video/Foto)                | Max 100MB      |
| `/tt [Link]`              | Download Media TikTok (Video/Foto)                  | Max 100MB      |
| `/ig [Link]`              | Download Instagram (Video/Reels only)               | Max 100MB      |
| `/twitter` / `/x [Link]`  | Download Media Twitter/X (Video/Foto)               | Max 100MB      |
| `/cuaca [Lokasi]`         | Cek Cuaca BMKG (DI Yogyakarta)                      | 516 lokasi     |
| `/price`                  | Harga crypto populer, komoditas, IHSG (24h change)  | -              |
| `/qr [Teks/URL]`          | Generate QR Code dari teks atau URL                 | Maks 1000 char |
| `/nslookup [IP/Domain]`   | IP Geolocation, ISP, ASN, DNS records               | -              |
| `/encode [format] [Teks]` | Encode teks — base64, url, hex, binary, rot13, html | Maks 2000 char |
| `/decode [format] [Teks]` | Decode teks — format sama dengan encode             | Maks 2000 char |
| `/health`                 | Check health semua service bot                      | -              |
| `/health update`          | Update yt-dlp binary                                | -              |
| `/poll [Tanya],[Opsi]`    | Buat Polling WhatsApp                               | -              |
| `/say [Teks]`             | Text-to-Speech (Auto-Detect)                        | Max 200 char   |
| `/tr [Lang] [Teks]`       | Translate AI (id, en, jp)                           | -              |
| `/scan [File/URL/Hash]`   | VirusTotal Malware Scanner                          | Max 32MB       |

> [!TIP]
> **Fitur Balasan (Reply):** Kamu bisa membalas (reply) pesan yang berisi link atau teks dengan perintah `/yt`, `/tr`, `/say` dll. tanpa perlu mengetik ulang!

---

## 📂 Struktur Proyek

```text
├── src/
│   ├── commands/           # Modul fungsionalitas utama
│   │   ├── sticker.js     # Sticker tools (s, stext, toimg)
│   │   ├── youtube.js     # YouTube downloader (yt, ytmp3)
│   │   ├── twitter.js     # Twitter/X media downloader (video & photo)
│   │   ├── facebook.js    # Facebook media downloader (video & photo)
│   │   ├── tiktok.js      # TikTok media downloader (video & photo)
│   │   ├── instagram.js   # Instagram downloader (video/reels only)
│   │   ├── poll.js        # WhatsApp Poll feature
│   │   ├── tts.js         # Text-to-Speech (Auto-detect language)
│   │   ├── translate.js   # AI Translator
│   │   ├── qr.js          # QR Code Generator
│   │   ├── nslookup.js    # IP/Domain Lookup & DNS Info
│   │   ├── encode.js      # Encode/Decode (base64, url, hex, binary, rot13, html)
│   │   └── scan.js        # VirusTotal Scanner
│   ├── utils/             # Helper & Logger utilities
│   └── bot.js             # Logic utama WhatsApp Bot (Baileys)
├── auth_baileys/          # Session & authentication files (auto-generated)
├── temp/                  # Penyimpanan sementara file download
├── index.js               # Entry point aplikasi
├── package.json           # Dependencies & Scripts
└── .env                   # Environment variables (API Keys)
```

---

## ⚙️ Environment Variables

File `.env` tidak diperlukan untuk fitur dasar. Jika ingin menggunakan fitur tambahan, buat file `.env` di root project:

```env
# VirusTotal API Key (Optional - untuk /scan command)
VT_API_KEY=your_virustotal_api_key_here

# Groq API Key (Optional - untuk /tr translate command)
GROQ_API_KEY=your_groq_api_key_here

# Admin WhatsApp Number for Health Monitoring (Optional)
# Format: 628xxxxxxxxxx@s.whatsapp.net
ADMIN_NUMBER=628xxxxxxxxxx@s.whatsapp.net
```

**Dapatkan API Key gratis:**

- VirusTotal: [https://www.virustotal.com/gui/my-apikey](https://www.virustotal.com/gui/my-apikey)
- Groq: [https://console.groq.com/keys](https://console.groq.com/keys)

### 🍪 Cookies.txt (Optional - untuk stabilitas download)

Cookies.txt dapat meningkatkan stabilitas download YouTube dan TikTok dengan bypass anti-bot:

1. **Install browser extension**: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
2. **Login ke YouTube/TikTok** di browser Anda
3. **Klik extension** dan export cookies
4. **Simpan sebagai `cookies.txt`** di root project (sejajar dengan `package.json`)
5. Bot akan otomatis menggunakan cookies untuk semua download

> [!TIP]
> Cookies.txt **opsional** tapi **sangat direkomendasikan** untuk menghindari error 403 Forbidden pada YouTube dan TikTok.

---

## 🔧 Troubleshooting

### Bot tidak mau login / QR tidak muncul

- Pastikan Node.js versi >= 18.x
- Hapus folder `auth_baileys/` dan restart bot untuk generate QR baru

### Error saat npm install

- Pastikan semua system dependencies sudah terinstall (lihat bagian Instalasi)
- Untuk error pada `sharp`: pastikan `libvips-dev` sudah terinstall
- Untuk error pada `canvas`: pastikan `libcairo2-dev` dan dependencies terkait sudah terinstall

### Bot disconnect terus

- Pastikan koneksi internet stabil
- Jangan scan QR di multiple devices secara bersamaan
- Jika sudah pernah login, jangan scan QR lagi (hapus `auth_baileys/` jika ingin login ulang)

### Download gagal / file corrupt

- Pastikan link yang digunakan valid dan public
- Beberapa video mungkin melebihi batas ukuran file (lihat tabel batasan)
- Pastikan `yt-dlp` terinstall dengan benar

---

## 👤 Author

- **vazul76** - [GitHub](https://github.com/vazul76)

---

## ⭐ Show your support

Give a ⭐️ if this project helped you!

---

## 📜 Lisensi

Proyek ini dilisensikan di bawah **MIT License**. Lihat file [LICENSE](LICENSE) untuk detail lebih lanjut.

---

## 📝 Changelog

### v2.4.0 (March 2026)

- ✅ Tambah command `/qr` — generate QR Code dari teks/URL, dikirim sebagai gambar
- ✅ Tambah command `/nslookup` — IP geolocation, ISP, ASN + full DNS records (A, AAAA, MX, NS, TXT, CNAME)
- ✅ Tambah command `/encode` & `/decode` — 6 format: Base64, URL, Hex, Binary, ROT13, HTML Entity
- ✅ Fix `/price` — migrasi goldprice.org (403) ke Yahoo Finance `GC=F`/`SI=F`
- ✅ Fix `/price` — tampilan IHSG sekarang benar dalam IDR (bukan salah convert ke USD)

### v2.3.2 (February 2026)

- ✅ Prefix diubah dari `.` ke `/` untuk semua command
- ✅ Weather feature dengan BMKG API (516 lokasi DI Yogyakarta)
- ✅ Migrasi TikTok downloader ke yt-dlp (hapus dependency `@tobyg74/tiktok-api-dl`)
- ✅ Health monitoring system: auto-check semua service setiap hari jam 8 pagi
- ✅ WhatsApp laporan harian ke admin untuk monitoring semua service
- ✅ Manual health check command: `/health` dan `/health update`
- ✅ Update yt-dlp binary ke versi terbaru (2026.01.31)

### v2.0.0 (December 2025)

- ✅ Migrasi dari `whatsapp-web.js` ke `@whiskeysockets/baileys`
- ✅ Performa lebih ringan (no Chromium dependency)
- ✅ Improved session management dengan multi-file auth state
- ✅ Auto-reconnect functionality
- ✅ Better error handling dan logging

### v1.1.0

- Initial release dengan whatsapp-web.js
- Basic sticker tools, social media downloader, dan AI features

---

_Made with ❤️ by vazul76_
