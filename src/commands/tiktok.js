const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class TikTokDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 100 * 1024 * 1024;

        this.commands = [
            { name: 'tiktok', method: 'downloadMedia', description: 'TikTok Video' },
            { name: 'tt', method: 'downloadMedia', description: 'TikTok Video (Alias)' }
        ];

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    getYtDlpCommonOptions() {
        return {
            noPlaylist: true,
            noWarnings: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            referer: 'https://www.tiktok.com/'
        };
    }

    async downloadMedia(msg, sock, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command /tiktok');

            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /tiktok [link] atau /tt [link]\n\n💡 Contoh:\n/tt https://vt.tiktok.com/xxxxx');
            }

            if (!this.isValidTikTokURL(url)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link TikTok tidak valid! ');
            }

            logger.info(`Downloading from: ${url}`);

            await helpers.reactProcessing(sock, msg);

            const timestamp = Date.now();
            const outputTemplate = path.join(this.tempDir, `tiktok_${timestamp}.%(ext)s`);

            await ytdlpExec(url, {
                ...this.getYtDlpCommonOptions(),
                format: 'best[ext=mp4]/best',
                output: outputTemplate
            });

            tempFilePath = this.findDownloadedFile(outputTemplate);
            if (!tempFilePath) {
                throw new Error('File download gagal');
            }

            const stats = fs.statSync(tempFilePath);
            logger.info(`Media size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxMediaSize) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, `❌ Media terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            }

            logger.info('Mengirim media...');
            await helpers.simulateTyping(sock, msg, 1500);

            const mediaBuffer = fs.readFileSync(tempFilePath);
            await helpers.replyVideoWithTyping(sock, msg, mediaBuffer);

            await helpers.reactSuccess(sock, msg);
            logger.success('Media berhasil dikirim!');

        } catch (error) {
            logger.error('Error:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari TikTok! ');
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^[\.\/](tiktok|tt)\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)\/[^\s]+/gi;
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

    isValidTikTokURL(url) {
        const regex = /^(https?:\/\/)?(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)\/.+/;
        return regex.test(url);
    }

    findDownloadedFile(outputTemplate) {
        const baseName = path.basename(outputTemplate).replace('.%(ext)s', '');
        const files = fs.readdirSync(this.tempDir);
        const match = files.find(file => file.startsWith(baseName + '.'));
        return match ? path.join(this.tempDir, match) : null;
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

module.exports = new TikTokDownloader();