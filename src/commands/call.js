const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class CallCommand {
    constructor() {
        this.commands = [
            { name: 'call', method: 'execute', description: 'Panggilan otomatis ke nomor (notifikasi WhatsApp)' }
        ];
        this.activeCallJobs = new Map();
    }

    async execute(msg, sock, messageBody) {
        try {
            logger.info('Memproses command /call');
            await helpers.reactCommandReceived(sock, msg);

            const args = messageBody.replace(/^[\.\/]call\s+/i, '').trim().split(/\s+/);

            if (args.length < 2 || !args[0] || !args[1]) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Format: /call <nomor_hp> <jumlah_kali>\n\n' +
                    '💡 Contoh:\n' +
                    '/call 628123456789 3\n' +
                    '/call 628987654321 5\n\n' +
                    '⏱️ Setiap panggilan di-delay 5 detik');
            }

            const phoneNumber = args[0];
            const callCount = parseInt(args[1]);

            // Validasi nomor
            if (!/^62\d{9,12}$/.test(phoneNumber)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Nomor tidak valid!\n\n' +
                    '💡 Format: 62xxxxxxxxxx (dimulai 62, 9-12 angka)\n' +
                    'Contoh: 628123456789');
            }

            // Validasi jumlah
            if (isNaN(callCount) || callCount < 1 || callCount > 20) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Jumlah panggilan tidak valid!\n\n' +
                    '💡 Gunakan angka 1-20');
            }

            await helpers.reactProcessing(sock, msg);

            // Format nomor WhatsApp
            const jid = phoneNumber + '@s.whatsapp.net';
            const senderId = msg.key.remoteJid;

            // Mulai proses panggilan
            await this.startCalling(sock, jid, callCount, phoneNumber, senderId, msg);

        } catch (error) {
            logger.error('Error di command /call:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Terjadi error: ' + error.message);
        }
    }

    async startCalling(sock, jid, callCount, phoneNumber, senderId, originalMsg) {
        try {
            const callId = `${jid}_${Date.now()}`;
            
            await helpers.replyWithTyping(sock, originalMsg,
                `📞 Memulai panggilan otomatis ke: ${phoneNumber}\n` +
                `📊 Total panggilan: ${callCount}x\n` +
                `⏱️ Delay: 5 detik per panggilan\n` +
                `⏳ Sedang memproses...`);

            let successCount = 0;
            let failCount = 0;

            for (let i = 1; i <= callCount; i++) {
                try {
                    // Kirim notifikasi panggilan
                    const timestamp = new Date().toLocaleTimeString('id-ID');
                    
                    await sock.sendMessage(jid, {
                        text: `📞 *PANGGILAN OTOMATIS*\n\n` +
                              `Panggilan #${i} dari Bot WhatsApp\n` +
                              `Jam: ${timestamp}\n` +
                              `Status: ${i}/${callCount}`,
                        mentions: []
                    });

                    successCount++;
                    logger.info(`Panggilan ${i}/${callCount} terkirim ke ${phoneNumber}`);

                    // Delay 5 detik sebelum panggilan berikutnya (kecuali yang terakhir)
                    if (i < callCount) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }

                } catch (error) {
                    logger.error(`Gagal mengirim panggilan ${i}:`, error);
                    failCount++;
                    
                    // Tetap lanjut ke panggilan berikutnya
                    if (i < callCount) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }

            // Laporan akhir
            const report = `✅ *PANGGILAN SELESAI*\n\n` +
                          `Nomor: ${phoneNumber}\n` +
                          `✓ Berhasil: ${successCount}/${callCount}\n` +
                          `✗ Gagal: ${failCount}/${callCount}\n` +
                          `⏱️ Total durasi: ${(callCount * 5) / 60} menit`;

            await sock.sendMessage(originalMsg.key.remoteJid, { text: report });
            await helpers.reactSuccess(sock, originalMsg);

            logger.info(`Panggilan selesai: ${successCount} berhasil, ${failCount} gagal`);

        } catch (error) {
            logger.error('Error saat memproses panggilan:', error);
            await helpers.reactError(sock, originalMsg);
        }
    }
}

module.exports = new CallCommand();
