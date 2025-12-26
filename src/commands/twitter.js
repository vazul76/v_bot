const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class TwitterDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxVideoSize = 100 * 1024 * 1024; // 100MB

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadVideo(msg, sock, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .twitter');

            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: .x [link] atau .twitter [link]\n\n💡 Contoh:\n.x https://x.com/user/status/123456789');
            }

            if (!this.isValidTwitterURL(url)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link Twitter/X tidak valid! ');
            }

            logger.info(`Downloading from: ${url}`);
            
            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Mendownload video dari Twitter/X...', 1500);

            const outputTemplate = path.join(this.tempDir, `twitter_video_${Date.now()}.%(ext)s`);
            const expectedPath = outputTemplate.replace('.%(ext)s', '.mp4');
            tempFilePath = expectedPath;

            try {
                await ytdlpExec(url, {
                    format: 'best[ext=mp4]/best',
                    output: outputTemplate,
                    noWarnings: true
                });
            } catch (dlError) {
                // Check if file exists despite error (common with yt-dlp warnings)
                if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
                    throw dlError;
                }
            }

            if (!fs.existsSync(tempFilePath)) {
                throw new Error('Download gagal');
            }

            const stats = fs.statSync(tempFilePath);
            logger.info(`Video size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxVideoSize) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, `❌ Video terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            }

            const videoBuffer = fs.readFileSync(tempFilePath);

            logger.info('Mengirim video...');
            await helpers.simulateTyping(sock, msg, 1500);
            
            // Twitter videos sometimes are small, so sending as video message is fine
            await helpers.replyVideoWithTyping(sock, msg, videoBuffer);

            await helpers.reactSuccess(sock, msg);
            logger.success('Video berhasil dikirim!');

        } catch (error) {
            logger.error('Error:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari Twitter! Pastikan link benar dan berisi video.');
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^\.(x|twitter)\s+/i, '').trim();
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
