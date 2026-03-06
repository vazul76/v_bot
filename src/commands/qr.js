const QRCode = require('qrcode');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class QRCommand {
    constructor() {
        this.commands = [
            { name: 'qr', method: 'generate', description: 'Generate QR Code dari teks/URL' }
        ];
    }

    async generate(msg, sock, messageBody) {
        try {
            logger.info('Memproses command /qr');
            await helpers.reactCommandReceived(sock, msg);

            // Extract teks — bisa dari arg langsung atau quoted message
            let text = messageBody.replace(/^\/qr\s*/i, '').trim();

            if (!text) {
                // Coba ambil dari quoted message
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    text = this.getTextFromQuoted(quoted);
                }
            }

            if (!text) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    '❌ Format: `/qr [teks atau URL]`\n\n💡 Contoh:\n`/qr https://github.com/vazul76`\n`/qr Halo, ini teks QR!`\n\nAtau reply pesan teks dengan `/qr`'
                );
            }

            if (text.length > 1000) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Teks terlalu panjang! Maksimal 1000 karakter.');
            }

            await helpers.reactProcessing(sock, msg);
            logger.info(`Generating QR for: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);

            // Generate QR sebagai PNG buffer
            const qrBuffer = await QRCode.toBuffer(text, {
                type: 'png',
                width: 512,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                },
                errorCorrectionLevel: 'M'
            });

            // Kirim sebagai gambar
            await sock.sendMessage(msg.key.remoteJid, {
                image: qrBuffer,
                caption: `✅ *QR Code Generated*`,
                mimetype: 'image/png'
            }, { quoted: msg });

            await helpers.reactSuccess(sock, msg);
            logger.success('QR Code berhasil dikirim');

        } catch (error) {
            logger.error('Error in /qr:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal membuat QR Code. Coba lagi nanti.');
        }
    }

    getTextFromQuoted(quoted) {
        const m = quoted?.message;
        if (!m) return null;
        return m.conversation
            || m.extendedTextMessage?.text
            || m.imageMessage?.caption
            || m.videoMessage?.caption
            || null;
    }
}

module.exports = new QRCommand();
