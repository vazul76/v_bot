const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class TwitterDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 100 * 1024 * 1024; // 100MB

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadMedia(msg, sock, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command /twitter');

            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /x [link] atau /twitter [link]\n\n💡 Contoh:\n/x https://x.com/user/status/123456789');
            }

            if (!this.isValidTwitterURL(url)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link Twitter/X tidak valid! ');
            }

            logger.info(`Downloading from: ${url}`);
            
            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Mendownload dari Twitter/X...', 1500);

            const outputTemplate = path.join(this.tempDir, `twitter_media_${Date.now()}.%(ext)s`);

            try {
                await ytdlpExec(url, {
                    format: 'best',
                    output: outputTemplate,
                    noWarnings: true
                });
            } catch (dlError) {
                logger.warn('yt-dlp error:', dlError.message);
            }

            // Find downloaded file
            const files = fs.readdirSync(this.tempDir).filter(f => f.startsWith(`twitter_media_`));
            if (files.length === 0) {
                throw new Error('Download gagal');
            }

            tempFilePath = path.join(this.tempDir, files[files.length - 1]);

            const stats = fs.statSync(tempFilePath);
            logger.info(`Media size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxMediaSize) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, `❌ Media terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            }

            const mediaBuffer = fs.readFileSync(tempFilePath);
            const ext = path.extname(tempFilePath).toLowerCase();

            logger.info('Mengirim media...');
            await helpers.simulateTyping(sock, msg, 1500);
            
            if (ext === '.mp4') {
                await helpers.replyVideoWithTyping(sock, msg, mediaBuffer);
            } else {
                await helpers.replyImageWithTyping(sock, msg, mediaBuffer);
            }

            await helpers.reactSuccess(sock, msg);
            logger.success('Media berhasil dikirim!');

        } catch (error) {
            logger.error('Error:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari Twitter! Pastikan link benar.');
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^[\.\/](x|twitter)\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/[^\s]+/gi;
        let matches = text.match(urlRegex);

        if (matches) return matches[0];

        const quoted = await helpers.getQuotedMessage(msg);
        if (quoted) {
            const quotedText = this.getTextFromMessage(quoted.message);
            matches = quotedText?.match(urlRegex);
            if (matches) {
                logger.info('URL found in quoted');
                return matches[0];
            }
        }

        return null;
    }

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        return '';
    }

    isValidTwitterURL(url) {
        const regex = /^(https?:\/\/)?(www\.)?(twitter\.com|x\.com)\/.+/;
        return regex.test(url);
    }

    cleanupTempFiles(files) {
        files.forEach(file => {
            if (file && fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                } catch (error) {
                    // Ignore
                }
            }
        });
    }
}

module.exports = new TwitterDownloader();
