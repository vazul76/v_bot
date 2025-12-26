# 🤖 V-Ultimate-Bot

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/vazul76/v_bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2018.x-green.svg)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-7.0.0--rc.6-brightgreen.svg)](https://github.com/WhiskeySockets/Baileys)

**V-Ultimate-Bot** adalah WhatsApp Bot Utility & AI yang dibangun dengan **@whiskeysockets/baileys**. Bot ini menggabungkan berbagai fitur canggih mulai dari Sticker Tools, Social Media Downloader (YT, FB, TikTok, IG), hingga Motivasi Cerdas berbasis AI (Groq).

> **🔄 Update v2.0.0**: Bot telah bermigrasi dari `whatsapp-web.js` ke `@whiskeysockets/baileys` untuk performa yang lebih baik dan konsumsi resource yang lebih ringan (tidak memerlukan Chromium/browser).

---

## 🌟 Fitur Unggulan

### 🎨 Sticker & Image Tools
- **Image with Text**: Buat sticker dari gambar lengkap dengan overlay teks otomatis.
- **Sticker Maker**: Ubah gambar apapun menjadi sticker berkualitas tinggi.
- **Sticker to Image**: Konversi kembali sticker (WebP) menjadi gambar (PNG) yang sudah di-trim transparasinya.

### 🤖 AI Features
- **Smart Motivation (Groq AI)**: Kirim motivasi cerdas yang dibuat oleh AI. Mendukung konteks balasan (reply) pesan untuk memberikan semangat yang relevan.
- **AI Image Generator**: Generate gambar dari teks menggunakan Pollinations AI.

### 📥 Social Media Downloader
- **YouTube Downloader**: Download video (MP4) atau audio (MP3) dengan kualitas terbaik.
- **Instagram Downloader**: Simpan Foto, Video, Reels, dan Postingan IG secara instan.
- **TikTok Downloader**: Download video TikTok tanpa watermark.
- **Facebook Downloader**: Download video dari Facebook dengan mudah.

### ️ Smart System
- **Offline Filtering**: Bot cerdas yang mengabaikan pesan saat sedang offline untuk mencegah spam penumpukan perintah saat baru startup.
- **Auto Reconnect**: Otomatis reconnect jika koneksi terputus.
- **Multi-File Auth State**: Session management yang lebih aman dengan Baileys.

---

## 🛠️ Technology Stack

- **[@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)** - WhatsApp Web API
- **[Groq SDK](https://groq.com/)** - AI API untuk motivational quotes (Llama 3.3)
- **[Pollinations AI](https://pollinations.ai/)** - AI Image Generator
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** - YouTube & Social Media Downloader
- **[wa-sticker-formatter](https://github.com/AlenSaito1/wa-sticker-formatter)** - Sticker Creator
- **[canvas](https://github.com/Automattic/node-canvas)** - Image Processing
- **[sharp](https://github.com/lovell/sharp)** - High Performance Image Processing

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

3. **Konfigurasi API Key**
   Copy file `.env.example` menjadi `.env` dan isi dengan API Key Groq kamu:
   ```bash
   cp .env.example .env
   ```
   Lalu buka file `.env` dan ganti isinya:
   ```text
   GROQ_API_KEY=gsk_xxxx...
   ```

4. **Jalankan Bot**
   ```bash
   npm start
   ```
   
   Atau untuk development mode dengan auto-reload:
   ```bash
   npm run dev
   ```

5. **Scan QR Code**
   Buka WhatsApp di ponsel Anda, pilih "Perangkat Tertaut" (Linked Devices), dan scan QR code yang muncul di terminal.
   
   > [!NOTE]
   > Setelah scan QR pertama kali, kredensial akan disimpan di folder `auth_baileys/`. Bot akan otomatis login di startup berikutnya tanpa perlu scan QR lagi.

---

## 🕹️ Cara Penggunaan

Gunakan prefix `.` (titik) diikuti oleh perintah:

| Perintah | Deskripsi | Batasan |
| :--- | :--- | :--- |
| `.s` | Gambar → Sticker | - |
| `.stext [Teks]` | Gambar → Sticker + Teks | - |
| `.toimg` | (Reply Sticker) → Gambar | - |
| `.ytmp3 [Link]` | Download Lagu YouTube | Max 16MB |
| `.yt [Link]` | Download Video YouTube | Max 64MB |
| `.fb [Link]` | Download Video Facebook | Max 64MB |
| `.tt [Link]` | Download Video TikTok | Max 64MB |
| `.ig [Link]` | Download Media Instagram | Max 64MB |
| `.quote [Teks]` | Motivasi AI (Llama 3.3) | - |
| `.image [Prompt]` | Generate Image AI | - |

> [!TIP]
> **Fitur Balasan (Reply):** Kamu bisa membalas (reply) pesan yang berisi link dengan perintah `.yt`, `.ig`, dll. tanpa perlu mengetik ulang linknya!

---

## 📂 Struktur Proyek

```text
├── src/
│   ├── commands/           # Modul fungsionalitas utama
│   │   ├── sticker.js     # Sticker tools (s, stext, toimg)
│   │   ├── youtube.js     # YouTube downloader (yt, ytmp3)
│   │   ├── facebook.js    # Facebook downloader
│   │   ├── tiktok.js      # TikTok downloader
│   │   ├── instagram.js   # Instagram downloader
│   │   ├── quote.js       # AI Quote generator
│   │   └── image.js       # AI Image generator
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

Buat file `.env` di root project dengan konfigurasi berikut:

```env
# Groq API Key (Required untuk .quote command)
GROQ_API_KEY=your_groq_api_key_here
```

Dapatkan Groq API Key gratis di: [https://console.groq.com/keys](https://console.groq.com/keys)

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

*Made with ❤️ by vazul76*
