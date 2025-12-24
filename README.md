# 🤖 V-Ultimate-Bot

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/vazul76/wa-sticker-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2016.x-green.svg)](https://nodejs.org/)

**V-Ultimate-Bot** adalah WhatsApp Bot Utility & AI yang dibangun dengan **whatsapp-web.js**. Bot ini menggabungkan berbagai fitur canggih mulai dari Sticker Tools, Social Media Downloader (YT, FB, TikTok, IG), hingga Motivasi Cerdas berbasis AI (Groq).

---

## 🌟 Fitur Unggulan

### 🎨 Sticker & Image Tools
- **Image with Text**: Buat sticker dari gambar lengkap dengan overlay teks otomatis.
- **Sticker Maker**: Ubah gambar apapun menjadi sticker berkualitas tinggi.
- **Sticker to Image**: Konversi kembali sticker (WebP) menjadi gambar (PNG) yang sudah di-trim transparasinya.

### 🤖 AI Features
- **Smart Motivation (Groq AI)**: Kirim motivasi cerdas yang dibuat oleh AI. Mendukung konteks balasan (reply) pesan untuk memberikan semangat yang relevan.

### 📥 Social Media Downloader
- **YouTube Downloader**: Download video (MP4) atau audio (MP3) dengan kualitas terbaik.
- **Instagram Downloader**: Simpan Foto, Video, Reels, dan Postingan IG secara instan.
- **TikTok Downloader**: Download video TikTok tanpa watermark.
- **Facebook Downloader**: Download video dari Facebook dengan mudah.

### ️ Smart System
- **Offline Filtering**: Bot cerdas yang mengabaikan pesan saat sedang offline untuk mencegah spam penumpukan perintah saat baru startup.

---

## 🚀 Instalasi Cepat

### Prasyarat
- **Node.js** (LTS version rekomendasikan)

### Langkah-langkah
1. **Clone Repositori**
   ```bash
   git clone https://github.com/vazul76/wa-sticker-bot.git
   cd wa-sticker-bot
   ```

2. **Instal Dependensi**
   ```bash
   npm install
   ```

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

4. **Scan QR Code**
   Buka WhatsApp di ponsel Anda, pilih "Perangkat Tertaut", dan scan QR code yang muncul di terminal.

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
| `.quote` | Motivasi AI (Llama 3.3) | - |

> [!TIP]
> **Fitur Balasan (Reply):** Kamu bisa membalas (reply) pesan yang berisi link dengan perintah `.yt`, `.ig`, dll. tanpa perlu mengetik ulang linknya!

---

## 📂 Struktur Proyek

```text
├── src/
│   ├── commands/       # Modul fungsionalitas utama
│   ├── utils/          # Helper & Logger
│   └── bot.js          # Logic utama WhatsApp Client
├── temp/               # Penyimpanan sementara file download
├── index.js            # Entry point aplikasi
└── package.json        # Dependensi & Scripts
```

---

## 👤 Author

- **vazul76** - [GitHub](https://github.com/vazul76)

---

## 📜 Lisensi

Proyek ini dilisensikan di bawah **MIT License**. Lihat file [LICENSE](LICENSE) untuk detail lebih lanjut.

---

*Made with ❤️ by vazul.*
