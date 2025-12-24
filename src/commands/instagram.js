const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class InstagramDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 64 * 1024 * 1024; // 64MB

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadMedia(msg, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .ig');

            // React: Command received
            await helpers.reactCommandReceived(msg);

            const url = await this.extractURL(messageBody, msg);

            if (! url) {
                logger.warn('URL tidak ditemukan');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Format:  .ig [link instagram]\n\n💡 Contoh:\n.ig https://www.instagram.com/p/xxxxx\n\nAtau reply pesan yang ada link Instagram dengan .ig');
            }

            if (!this.isValidInstagramURL(url)) {
                logger.warn('URL Instagram tidak valid');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Link Instagram tidak valid!\n\n✅ Gunakan link dari instagram.com');
            }

            logger.info(`Downloading media from: ${url}`);
            
            // React: Processing
            await helpers.reactProcessing(msg);
            await helpers.replyWithTyping(msg, msg.client, '⏳ Mendownload dari Instagram...\n🤬*Lagi proses, SABAR!*', 1500);

            const outputTemplate = path.join(this.tempDir, `ig_media_${Date.now()}.%(ext)s`);

            try {
                await ytdlpExec(url, {
                    format: 'best',
                    output: outputTemplate,
                    noWarnings: true
                });
            } catch (dlError) {
                logger.warn('yt-dlp error:', dlError.message);
            }

            // Find downloaded file (could be .mp4 or .jpg)
            const files = fs.readdirSync(this.tempDir).filter(f => f.startsWith(`ig_media_`));
            if (files.length === 0) {
                throw new Error('File download gagal');
            }

            tempFilePath = path.join(this.tempDir, files[files.length - 1]);
            
            const stats = fs.statSync(tempFilePath);
            logger.info(`Media file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxMediaSize) {
                logger.warn('File terlalu besar untuk WhatsApp');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, `❌ Media terlalu besar!  (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\n⚠️ Limit WhatsApp: 64MB`);
            }

            const mediaBuffer = fs.readFileSync(tempFilePath);
            const ext = path.extname(tempFilePath).toLowerCase();
            
            let mimetype = 'image/jpeg';
            if (ext === '.mp4') mimetype = 'video/mp4';
            else if (ext === '.png') mimetype = 'image/png';

            const media = new MessageMedia(
                mimetype,
                mediaBuffer.toString('base64'),
                `Vazul-instagram${ext}`
            );

            logger.info('Mengirim media...');
            await helpers.simulateTyping(msg, msg.client, 1500);
            await msg.reply(media, null, {
                sendMediaAsDocument: true
            });

            // React: Success
            await helpers.reactSuccess(msg);
            logger.success('Media Instagram berhasil dikirim!');

        } catch (error) {
            logger.error('Error downloading Instagram media:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(msg);

            if (error.message.includes('not available') || error.message.includes('unavailable')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Media tidak tersedia atau sudah dihapus!');
            } else if (error.message.includes('Private')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Akun atau post ini bersifat private!');
            } else {
                await helpers.replyWithTyping(msg, msg.client, '❌ Gagal mendownload dari Instagram!\n\n💡 Pastikan link valid dan media tersedia.');
            }
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^\.ig\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/[^\s]+/gi;
        let matches = text.match(urlRegex);

        if (matches) {
            return matches[0];
        }

        if (msg.hasQuotedMsg) {
            try {
                const quotedMsg = await msg.getQuotedMessage();
                const quotedText = quotedMsg.body || '';
                matches = quotedText.match(urlRegex);
                if (matches) {
                    logger.info('URL found in quoted message');
                    return matches[0];
                }
            } catch (error) {
                logger.warn('Error getting quoted message:', error.message);
            }
        }

        return null;
    }

    isValidInstagramURL(url) {
        const instagramRegex = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/(p|reel|tv)\/[a-zA-Z0-9_-]+/;
        return instagramRegex.test(url);
    }

    cleanupTempFiles(files) {
        files.forEach(file => {
            if (file && fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                    logger.info('Cleaned up temp file:', file);
                } catch (error) {
                    logger.warn('Failed to cleanup temp file:', file, error.message);
                }
            }
        });
    }
}

module.exports = new InstagramDownloader();