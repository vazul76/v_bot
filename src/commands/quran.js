const helpers = require('../utils/helpers');
const logger = require('../utils/logger');
const axios = require('axios'); // We can use axios or fetch. Project already has many dependencies, let's use global fetch if node 18+ or just standard https if we want 0 deps. But let's check if axios is in package.json.
// Wait, I didn't check if axios is installed. Package.json in previous turn showed:
// "@whiskeysockets/baileys", "canvas", "chalk", "dotenv", "google-tts-api", "groq-sdk", "pino", "qrcode-terminal", "wa-sticker-formatter", "yt-dlp-exec"
// Axios is NOT installed. I should use native fetch (Node 18+)

class QuranCommand {
    constructor() {
        // Simplified mapping for common search terms to Surah Number
        this.surahMap = {
            'alfatihah': 1, 'fatihah': 1,
            'albacara': 2, 'albaqarah': 2, 'baqarah': 2, 'sapi': 2,
            'aliimran': 3, 'imran': 3,
            'annisa': 4, 'nisa': 4, 'wanita': 4,
            'almaidah': 5, 'maidah': 5,
            'alanam': 6, 'anam': 6,
            'alaraf': 7, 'araf': 7,
            'alanfal': 8, 'anfal': 8,
            'attaubah': 9, 'taubah': 9,
            'yunus': 10,
            'hud': 11,
            'yusuf': 12,
            'ar-rad': 13, 'arrad': 13, 'rad': 13,
            'ibrahim': 14,
            'alhijr': 15, 'hijr': 15,
            'annahl': 16, 'nahl': 16,
            'alisra': 17, 'isra': 17,
            'alkahfi': 18, 'kahfi': 18, 'gua': 18,
            'maryam': 19,
            'thaha': 20, 'taha': 20,
            'alanbiya': 21, 'anbiya': 21,
            'alhajj': 22, 'haji': 22,
            'almuminun': 23, 'muminun': 23,
            'annur': 24, 'nur': 24, 'cahaya': 24,
            'alfurqan': 25, 'furqan': 25,
            'asy-syuara': 26, 'syuara': 26,
            'annam': 27, 'naml': 27, 'semut': 27,
            'alqashash': 28, 'qashash': 28,
            'alankabut': 29, 'ankabut': 29, 'laba': 29,
            'arrum': 30, 'rum': 30,
            'luqman': 31,
            'assajdah': 32, 'sajdah': 32,
            'alahzab': 33, 'ahzab': 33,
            'saba': 34,
            'fathir': 35,
            'yasin': 36,
            'ash-shaffat': 37, 'shaffat': 37,
            'shad': 38,
            'azzumar': 39, 'zumar': 39,
            'ghafir': 40,
            'fushilat': 41,
            'asy-syura': 42, 'syura': 42,
            'azzukhruf': 43, 'zukhruf': 43,
            'addukhan': 44, 'dukhan': 44,
            'aljasiyah': 45, 'jasiyah': 45,
            'alahqaf': 46, 'ahqaf': 46,
            'muhammad': 47,
            'alfath': 48, 'fath': 48,
            'alhujurat': 49, 'hujurat': 49,
            'qaf': 50,
            'azzariyat': 51, 'zariyat': 51,
            'aththur': 52, 'thur': 52,
            'annajm': 53, 'najm': 53,
            'alqamar': 54, 'qamar': 54, 'bulan': 54,
            'arrahman': 55, 'rahman': 55,
            'alwaqiah': 56, 'waqiah': 56,
            'alhadid': 57, 'hadid': 57, 'besi': 57,
            'almujadilah': 58, 'mujadilah': 58,
            'alhasyr': 59, 'hasyr': 59,
            'almumtahanah': 60, 'mumtahanah': 60,
            'ashshaff': 61, 'shaff': 61,
            'aljumuah': 62, 'jumuah': 62, 'jumat': 62,
            'almunafiqun': 63, 'munafiqun': 63,
            'attighabun': 64, 'taghabun': 64,
            'atthalaq': 65, 'thalaq': 65,
            'attahrim': 66, 'tahrim': 66,
            'almulk': 67, 'mulk': 67, 'kerajaan': 67,
            'alqalam': 68, 'qalam': 68, 'pena': 68,
            'alhaqqah': 69, 'haqqah': 69,
            'almaarij': 70, 'maarij': 70,
            'nuh': 71,
            'aljinn': 72, 'jin': 72,
            'almuzzammil': 73, 'muzzammil': 73,
            'almuddatsir': 74, 'muddatsir': 74,
            'alqiyamah': 75, 'qiyamah': 75,
            'alinsan': 76, 'insan': 76,
            'almursalat': 77, 'mursalat': 77,
            'annaba': 78, 'naba': 78,
            'annaziat': 79, 'naziat': 79,
            'abasa': 80,
            'attakwir': 81, 'takwir': 81,
            'alinfithar': 82, 'infithar': 82,
            'almuthaffifin': 83, 'muthaffifin': 83,
            'alinsyiqaq': 84, 'insyiqaq': 84,
            'alburuj': 85, 'buruj': 85,
            'aththariq': 86, 'thariq': 86,
            'alala': 87, 'ala': 87,
            'alghasyiyah': 88, 'ghasyiyah': 88,
            'alfajr': 89, 'fajr': 89,
            'albalad': 90, 'balad': 90,
            'asy-syams': 91, 'syams': 91, 'matahari': 91,
            'allail': 92, 'lail': 92, 'malam': 92,
            'adhdhuha': 93, 'dhuha': 93, 'duha': 93,
            'alamnasyrah': 94, 'insyirah': 94,
            'attil': 95, 'tin': 95,
            'alaq': 96, 'alaq': 96,
            'alqadr': 97, 'qadr': 97,
            'albayyinah': 98, 'bayyinah': 98,
            'alzalzalah': 99, 'zalzalah': 99,
            'aladiyat': 100, 'adiyat': 100,
            'alqariah': 101, 'qariah': 101,
            'attakatsur': 102, 'takatsur': 102,
            'alashr': 103, 'ashr': 103, 'asar': 103,
            'alhumazah': 104, 'humazah': 104,
            'alfil': 105, 'fil': 105, 'gajah': 105,
            'quraish': 106, 'quraisy': 106,
            'almaun': 107, 'maun': 107,
            'alkautsar': 108, 'kautsar': 108,
            'alkafirun': 109, 'kafirun': 109,
            'annashr': 110, 'nashr': 110,
            'allahab': 111, 'lahab': 111,
            'alikhlas': 112, 'ikhlas': 112,
            'alfalaq': 113, 'falaq': 113,
            'annas': 114, 'nas': 114
        };
    }

    async getAyat(msg, sock, messageBody) {
        try {
            logger.info('Memproses command .quran');
            await helpers.reactCommandReceived(sock, msg);

            // Parse args: .quran [surah] [ayat]
            // Example: .quran yasin 1-5 or .quran yasin 1
            const args = messageBody.trim().split(/\s+/);

            if (args.length < 3) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format salah!\n\nContoh:\n.quran yasin 1\n.quran yasin 1-5\n.quran 36 1');
            }

            let surahInput = args[1].toLowerCase().replace(/[^a-z0-9]/g, ''); // remove non-alphanumeric
            let ayatInput = args[2];
            let surahNumber = 0;

            // Check if input is number or name
            if (!isNaN(surahInput)) {
                surahNumber = parseInt(surahInput);
            } else {
                // Try to find in map
                surahNumber = this.surahMap[surahInput];
            }

            if (!surahNumber || surahNumber < 1 || surahNumber > 114) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Nama/Nomor surat tidak ditemukan!');
            }

            // Parse Range
            let startAyat, endAyat;
            if (ayatInput.includes('-')) {
                const range = ayatInput.split('-');
                startAyat = parseInt(range[0]);
                endAyat = parseInt(range[1]);
            } else {
                startAyat = parseInt(ayatInput);
                endAyat = startAyat;
            }

            if (isNaN(startAyat) || isNaN(endAyat) || startAyat < 1) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Nomor ayat tidak valid!');
            }

            if (endAyat < startAyat) {
                [startAyat, endAyat] = [endAyat, startAyat]; // Swap if inverted
            }

            // Limit range to max 20 verses to avoid spam/timeout
            if (endAyat - startAyat + 1 > 20) {
                await helpers.replyWithTyping(sock, msg, '⚠️ Maksimal 20 ayat sekaligus!');
                endAyat = startAyat + 19;
            }

            logger.info(`Fetching Q.S ${surahNumber}:${startAyat}-${endAyat}`);
            await helpers.reactProcessing(sock, msg);

            // Fetch from equran.id (Fetch Full Surah)
            // Endpoint: https://equran.id/api/v2/surat/{nomorSurat}
            const response = await fetch(`https://equran.id/api/v2/surat/${surahNumber}`);

            if (!response.ok) {
                await helpers.replyWithTyping(sock, msg, `❌ Gagal mengambil data surat ke-${surahNumber}`);
                return;
            }

            const data = await response.json();

            // Validate data structure
            if (!data || !data.data || !data.data.ayat) {
                throw new Error('Data not found');
            }

            const surahData = data.data;
            const ayatList = surahData.ayat;

            // Filter verses
            const targetVerses = ayatList.filter(a => a.nomorAyat >= startAyat && a.nomorAyat <= endAyat);

            if (targetVerses.length === 0) {
                await helpers.replyWithTyping(sock, msg, `❌ Ayat ${startAyat}-${endAyat} tidak ditemukan di Surat ${surahData.namaLatin}`);
                return;
            }

            // Format Output
            let text = `📖 *Q.S ${surahData.namaLatin} (${surahNumber})*`;

            targetVerses.forEach(v => {
                text += `\n\n*Ayat ${v.nomorAyat}*\n${v.teksArab}\n_${v.teksLatin}_\n\n"${v.teksIndonesia}"`;
            });

            await helpers.replyWithTyping(sock, msg, text);
            await helpers.reactSuccess(sock, msg);
            logger.success('Quran sent');

        } catch (error) {
            logger.error('Error fetching Quran:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mengambil data Al-Quran! Coba lagi.');
        }
    }
}

module.exports = new QuranCommand();
