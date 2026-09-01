# 📚 Sistem Jadwal Matkul & Reminder Auto

Sistem untuk mengelola jadwal mata kuliah dengan fitur reminder otomatis setiap pagi.

## 📋 Daftar Command

### 1. `/addmatkul` - Tambah Jadwal Matkul
**Format:**
```
/addmatkul "Nama Matkul" "Hari" "Jam" "Tempat"
```

**Contoh:**
```
/addmatkul "Algoritma Pemrograman" "Senin" "07.00-08.45" "Ruang 101"
/addmatkul "Basis Data" "Rabu" "09.00-10.45" "Lab Komputer"
/addmatkul "Web Development" "Jumat" "13.00-14.45" "Ruang 304"
```

**Ketentuan:**
- Nama matkul bisa berisi spasi, gunakan tanda kutip (")
- Hari harus valid: Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu
- Format jam: HH.MM-HH.MM (gunakan titik, bukan colon)
- Tempat bisa berisi spasi, gunakan tanda kutip (")

**Response:**
```
✅ Matkul berhasil ditambahkan!

📚 Algoritma Pemrograman
📅 Senin
🕐 07.00-08.45
📍 Ruang 101
```

---

### 2. `/listmatkul` - Lihat Daftar Matkul
**Format:**
```
/listmatkul
```

**Response Contoh:**
```
📚 LIST MATKUL

1. *Algoritma Pemrograman*
*Hari :* Senin
*Jam :* 07.00-08.45
*Tempat :* Ruang 101

2. *Basis Data*
*Hari :* Rabu
*Jam :* 09.00-10.45
*Tempat :* Lab Komputer

3. *Web Development*
*Hari :* Jumat
*Jam :* 13.00-14.45
*Tempat :* Ruang 304

_Gunakan /deletematkul [nomor] untuk menghapus_
```

**Catatan:**
- Nomor akan otomatis urut dari 1-N
- Ketika item dihapus, nomor item di bawahnya akan otomatis naik

---

### 3. `/deletematkul` - Hapus Jadwal Matkul
**Format:**
```
/deletematkul [nomor]
```

**Contoh:**
```
/deletematkul 2
```

**Response:**
```
✅ Matkul berhasil dihapus!

🗑️ Basis Data
```

**Catatan:**
- Nomor harus valid (1-N sesuai jumlah matkul)
- Setelah penghapusan, list akan otomatis di-reorder
- Contoh: jika ada 3 item dan Anda delete item 2, item 3 akan menjadi item 2

---

### 4. `/deleteallmatkul` - Hapus Semua Matkul
**Format:**
```
/deleteallmatkul
```

**Response:**
```
✅ Semua matkul berhasil dihapus!

🗑️ Total: 3 matkul dihapus
```

**Catatan:**
- Aksi ini tidak bisa dibatalkan, gunakan dengan hati-hati

---

### 5. `/matkul` - Bantuan Command Matkul
**Format:**
```
/matkul
```

**Response:**
Menampilkan panduan lengkap semua command matkul

---

## 🔔 Fitur Auto-Reminder

**Cara Kerja:**
- Bot akan otomatis mengirim reminder **setiap jam 5 pagi (05:00)**
- Reminder hanya dikirim untuk matkul yang **ada di hari itu**
- Reminder dikirim ke nomor **admin** (dari variabel `ADMIN_NUMBER` di `.env`)

**Contoh Message Reminder:**
```
🔔 REMINDER MATKUL HARI INI
📅 Senin, 1 September 2026

1. *Algoritma Pemrograman*
🕐 Jam: 07.00-08.45
📍 Tempat: Ruang 101

2. *Web Development*
🕐 Jam: 13.00-14.45
📍 Tempat: Ruang 304

_Jangan lupa siapkan diri! 💪_
```

**Konfigurasi:**
- Pastikan variabel `ADMIN_NUMBER` di `.env` sudah diisi dengan format: `628xxxxxxxxxx@s.whatsapp.net`
- Contoh: `ADMIN_NUMBER=6285133749372@s.whatsapp.net`

---

## 📂 Struktur Database

**File:** `data/matkul.json`

**Format:**
```json
[
  {
    "nama": "Algoritma Pemrograman",
    "hari": "Senin",
    "jam": "07.00-08.45",
    "tempat": "Ruang 101"
  },
  {
    "nama": "Basis Data",
    "hari": "Rabu",
    "jam": "09.00-10.45",
    "tempat": "Lab Komputer"
  }
]
```

**Catatan:**
- Database disimpan dalam format JSON sederhana
- Data dipersisten ke file, tidak hilang meski bot di-restart
- Ketika Anda melakukan delete, item akan benar-benar dihapus dari array
- Nomor urut di `/listmatkul` adalah index array + 1

---

## 🛠️ Troubleshooting

### Admin tidak menerima reminder
**Solusi:**
1. Pastikan `ADMIN_NUMBER` di `.env` sudah diisi dengan format yang benar
2. Format harus: `628xxxxxxxxxx@s.whatsapp.net` (nomor WhatsApp recipient di akhir)
3. Pastikan bot sedang online saat jam 5 pagi
4. Pastikan ada matkul yang jadwalnya di hari itu

### Format command error
**Pastikan:**
- Gunakan tanda kutip (") untuk argument yang berisi spasi
- Hari harus salah satu dari: Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu
- Format jam: HH.MM-HH.MM (titik, bukan titik dua)

### Nomor tidak sesuai saat delete
**Ingat:**
- Jalankan `/listmatkul` untuk melihat nomor terkini
- Nomor akan berubah setiap kali ada item yang dihapus

---

## 📝 Contoh Penggunaan Lengkap

**Scenario: Menambah 3 matkul**
```
User: /addmatkul "Algoritma Pemrograman" "Senin" "07.00-08.45" "Ruang 101"
Bot: ✅ Matkul berhasil ditambahkan!

User: /addmatkul "Basis Data" "Rabu" "09.00-10.45" "Lab Komputer"
Bot: ✅ Matkul berhasil ditambahkan!

User: /addmatkul "Web Development" "Senin" "13.00-14.45" "Ruang 304"
Bot: ✅ Matkul berhasil ditambahkan!
```

**List matkul:**
```
User: /listmatkul
Bot: 
📚 LIST MATKUL

1. *Algoritma Pemrograman*
*Hari :* Senin
*Jam :* 07.00-08.45
*Tempat :* Ruang 101

2. *Basis Data*
*Hari :* Rabu
*Jam :* 09.00-10.45
*Tempat :* Lab Komputer

3. *Web Development*
*Hari :* Senin
*Jam :* 13.00-14.45
*Tempat :* Ruang 304
```

**Delete item 2:**
```
User: /deletematkul 2
Bot: ✅ Matkul berhasil dihapus!
🗑️ Basis Data
```

**List setelah delete:**
```
User: /listmatkul
Bot:
📚 LIST MATKUL

1. *Algoritma Pemrograman*
*Hari :* Senin
*Jam :* 07.00-08.45
*Tempat :* Ruang 101

2. *Web Development*
*Hari :* Senin
*Jam :* 13.00-14.45
*Tempat :* Ruang 304
```

**Auto reminder Senin jam 5 pagi:**
```
Bot → Admin:
🔔 REMINDER MATKUL HARI INI
📅 Senin, 1 September 2026

1. *Algoritma Pemrograman*
🕐 Jam: 07.00-08.45
📍 Tempat: Ruang 101

2. *Web Development*
🕐 Jam: 13.00-14.45
📍 Tempat: Ruang 304

_Jangan lupa siapkan diri! 💪_
```

---

## 🔧 File yang Ditambahkan/Dimodifikasi

### File Baru:
- `src/commands/matkul.js` - Command handler untuk semua perintah matkul
- `src/utils/matkulScheduler.js` - Scheduler untuk auto reminder
- `data/matkul.json` - Database jadwal matkul

### File Dimodifikasi:
- `src/bot.js` - Register command dan scheduler, update help menu

---

Semoga sistem ini membantu Anda mengelola jadwal matkul dengan lebih efisien! 📚✨
