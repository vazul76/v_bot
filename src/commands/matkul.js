const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

const MATKUL_DB_PATH = path.join(__dirname, '../../data/matkul.json');

class MatkulCommand {
    constructor() {
        this.commands = [
            { name: 'addmatkul', method: 'addMatkul', description: 'Tambah jadwal matkul' },
            { name: 'listmatkul', method: 'listMatkul', description: 'Lihat daftar matkul' },
            { name: 'deletematkul', method: 'deleteMatkul', description: 'Hapus jadwal matkul' },
            { name: 'deleteallmatkul', method: 'deleteAllMatkul', description: 'Hapus semua matkul' },
            { name: 'matkul', method: 'showHelp', description: 'Bantuan command matkul' }
        ];
        this.sortedIndexMap = {}; // Track sorted positions to original indexes
    }

    loadMatkul() {
        try {
            if (!fs.existsSync(MATKUL_DB_PATH)) {
                fs.writeFileSync(MATKUL_DB_PATH, '[]', 'utf8');
                return [];
            }
            const data = fs.readFileSync(MATKUL_DB_PATH, 'utf8');
            return JSON.parse(data || '[]');
        } catch (error) {
            logger.error('Error loading matkul database:', error);
            return [];
        }
    }

    saveMatkul(data) {
        try {
            fs.writeFileSync(MATKUL_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            logger.error('Error saving matkul database:', error);
            return false;
        }
    }

    getDayOrderValue(dayName) {
        // Map hari to order value for sorting
        const dayOrder = {
            'Senin': 1,
            'Selasa': 2,
            'Rabu': 3,
            'Kamis': 4,
            'Jumat': 5,
            'Sabtu': 6,
            'Minggu': 7
        };
        return dayOrder[dayName] || 8;
    }

    sortMatkulWithIndex(matkulList) {
        // Create array with original indexes
        const indexed = matkulList.map((matkul, idx) => ({
            originalIndex: idx,
            matkul: matkul
        }));

        // Sort by day first, then by time
        indexed.sort((a, b) => {
            const dayCompare = this.getDayOrderValue(a.matkul.hari) - this.getDayOrderValue(b.matkul.hari);
            if (dayCompare !== 0) return dayCompare;

            // If same day, sort by time
            const timeA = a.matkul.jam.split('-')[0].replace('.', ':');
            const timeB = b.matkul.jam.split('-')[0].replace('.', ':');
            return timeA.localeCompare(timeB);
        });

        // Create mapping of display index to original index
        this.sortedIndexMap = {};
        indexed.forEach((item, displayIdx) => {
            this.sortedIndexMap[displayIdx] = item.originalIndex;
        });

        return indexed;
    }

    async addMatkul(msg, sock, messageBody) {
        try {
            logger.info('Processing /addmatkul command');
            await helpers.reactCommandReceived(sock, msg);

            // Parse command: /addmatkul "Nama Matkul" "Hari" "07.00-08.45" "Tempat"
            const args = this.parseQuotedArgs(messageBody);

            if (args.length < 4) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Format salah!\n\n' +
                    '📝 Gunakan:\n' +
                    '/addmatkul "Nama Matkul" "Hari" "Jam" "Tempat"\n\n' +
                    '💡 Contoh:\n' +
                    '/addmatkul "Algoritma Pemrograman" "Senin" "07.00-08.45" "Ruang 101"'
                );
            }

            const nama = args[0].trim();
            const hari = args[1].trim();
            const jam = args[2].trim();
            const tempat = args[3].trim();

            // Validate format jam (XX.XX-XX.XX)
            if (!/^\d{2}\.\d{2}-\d{2}\.\d{2}$/.test(jam)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Format jam salah!\n\n' +
                    'Gunakan format: HH.MM-HH.MM\n\n' +
                    'Contoh: 07.00-08.45'
                );
            }

            const hariValid = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
            if (!hariValid.includes(hari)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Hari tidak valid!\n\n' +
                    'Hari yang valid:\n' +
                    'Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu'
                );
            }

            const matkulList = this.loadMatkul();
            const newMatkul = {
                nama,
                hari,
                jam,
                tempat
            };

            matkulList.push(newMatkul);
            this.saveMatkul(matkulList);

            await helpers.reactSuccess(sock, msg);
            const responseText = `✅ Matkul berhasil ditambahkan!\n\n` +
                `Nama Matkul: ${nama}\n` +
                `Hari: ${hari}\n` +
                `Jam: ${jam}\n` +
                `Tempat: ${tempat}`;
            
            await helpers.replyWithTyping(sock, msg, responseText);
            logger.info(`Matkul added: ${nama} (${hari})`);

        } catch (error) {
            logger.error('Error in addMatkul:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Terjadi kesalahan saat menambah matkul');
        }
    }

    async listMatkul(msg, sock, messageBody) {
        try {
            logger.info('Processing /listmatkul command');
            await helpers.reactCommandReceived(sock, msg);

            const matkulList = this.loadMatkul();

            if (matkulList.length === 0) {
                await helpers.reactSuccess(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '📭 Belum ada jadwal matkul.\n\n' +
                    'Gunakan /addmatkul untuk menambah jadwal.'
                );
            }

            // Sort matkul with index tracking
            const sortedMatkul = this.sortMatkulWithIndex(matkulList);

            let response = '*LIST MATKUL*\n\n';
            
            sortedMatkul.forEach((item, index) => {
                const matkul = item.matkul;
                response += `${index + 1}. *${matkul.nama}*\n`;
                response += `*Hari :* ${matkul.hari}\n`;
                response += `*Jam :* ${matkul.jam}\n`;
                response += `*Tempat :* ${matkul.tempat}\n`;
                response += '\n';
            });

            await helpers.reactSuccess(sock, msg);
            await helpers.replyWithTyping(sock, msg, response);
            logger.info(`Listed ${matkulList.length} matkul (sorted)`);

        } catch (error) {
            logger.error('Error in listMatkul:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Terjadi kesalahan saat menampilkan daftar matkul');
        }
    }

    async deleteMatkul(msg, sock, messageBody) {
        try {
            logger.info('Processing /deletematkul command');
            await helpers.reactCommandReceived(sock, msg);

            const match = messageBody.match(/\/deletematkul\s+(\d+)/i);
            
            if (!match || !match[1]) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Format salah!\n\n' +
                    'Gunakan: /deletematkul [nomor]\n\n' +
                    'Contoh: /deletematkul 1'
                );
            }

            const displayIndex = parseInt(match[1]) - 1; // Convert to 0-based display index
            const matkulList = this.loadMatkul();

            // Rebuild sorted index map to get actual index to delete
            this.sortMatkulWithIndex(matkulList);

            if (displayIndex < 0 || displayIndex >= matkulList.length) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    `❌ Nomor matkul tidak valid!\n\n` +
                    `📊 Tersedia 1-${matkulList.length}`
                );
            }

            // Get original index from mapping
            const originalIndex = this.sortedIndexMap[displayIndex];
            const deletedMatkul = matkulList[originalIndex];
            
            matkulList.splice(originalIndex, 1);
            this.saveMatkul(matkulList);

            await helpers.reactSuccess(sock, msg);
            const responseText = `✅ Matkul berhasil dihapus!\n\n` +
                `${deletedMatkul.nama}`;
            
            await helpers.replyWithTyping(sock, msg, responseText);
            logger.info(`Matkul deleted: ${deletedMatkul.nama}`);

        } catch (error) {
            logger.error('Error in deleteMatkul:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Terjadi kesalahan saat menghapus matkul');
        }
    }

    async deleteAllMatkul(msg, sock, messageBody) {
        try {
            logger.info('Processing /deleteallmatkul command');
            await helpers.reactCommandReceived(sock, msg);

            const matkulList = this.loadMatkul();

            if (matkulList.length === 0) {
                await helpers.reactSuccess(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    'Tidak ada matkul yang perlu dihapus.'
                );
            }

            const count = matkulList.length;
            this.saveMatkul([]);

            await helpers.reactSuccess(sock, msg);
            const responseText = `✅ Semua matkul berhasil dihapus!\n\n` +
                `Total: ${count} matkul dihapus`;
            
            await helpers.replyWithTyping(sock, msg, responseText);
            logger.info(`All matkul deleted. Total: ${count}`);

        } catch (error) {
            logger.error('Error in deleteAllMatkul:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Terjadi kesalahan saat menghapus semua matkul');
        }
    }

    async showHelp(msg, sock, messageBody) {
        try {
            logger.info('Processing /matkul command');
            await helpers.reactCommandReceived(sock, msg);

            const helpText = `*📚 BANTUAN COMMAND MATKUL*\n\n` +
                `*1. /addmatkul* "Nama Matkul" "Hari" "Jam" "Tempat"\n` +
                `    Menambah jadwal matkul baru\n` +
                `    Contoh: /addmatkul "Algoritma" "Senin" "07.00-08.45" "Ruang 101"\n\n` +
                
                `*2. /listmatkul*\n` +
                `    Menampilkan daftar semua matkul\n\n` +
                
                `*3. /deletematkul* [nomor]\n` +
                `    Menghapus matkul berdasarkan nomor\n` +
                `    Contoh: /deletematkul 1\n\n` +
                
                `*4. /deleteallmatkul*\n` +
                `    Menghapus semua jadwal matkul\n\n` +
                
                `*5. /matkul*\n` +
                `    Menampilkan bantuan ini\n\n`;

            await helpers.reactSuccess(sock, msg);
            await helpers.replyWithTyping(sock, msg, helpText);

        } catch (error) {
            logger.error('Error in showHelp:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Terjadi kesalahan');
        }
    }

    parseQuotedArgs(messageBody) {
        // Remove /addmatkul from the beginning
        let text = messageBody.replace(/^\/addmatkul\s+/i, '').trim();
        
        const args = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ' ' && !inQuotes) {
                if (current.trim()) {
                    args.push(current.trim());
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current.trim()) {
            args.push(current.trim());
        }

        return args;
    }
}

module.exports = new MatkulCommand();
