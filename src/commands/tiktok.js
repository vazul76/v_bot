const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class TikTokDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxVideoSize = 100 * 1024 * 1024;

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadVideo(msg, sock, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .tiktok');

            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: .tiktok [link] atau .tt [link]\n\n💡 Contoh:\n.tt https://vt.tiktok.com/xxxxx');
            }

            if (!this.isValidTikTokURL(url)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link TikTok tidak valid! ');
            }

            logger.info(`Downloading from: ${url}`);
            
            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Mendownload video dari TikTok...', 1500);

            const outputTemplate = path.join(this.tempDir, `tiktok_video_${Date.now()}.%(ext)s`);
            const expectedPath = outputTemplate.replace('.%(ext)s', '.mp4');
            tempFilePath = expectedPath;

            try {
                await ytdlpExec(url, {
                    format: 'best[ext=mp4]/best',
                    output: outputTemplate,
                    noWarnings: true
                });
            } catch (dlError) {
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
            
            await helpers.replyVideoWithTyping(sock, msg, videoBuffer);

            await helpers.reactSuccess(sock, msg);
            logger.success('Video berhasil dikirim!');

        } catch (error) {
            logger.error('Error:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari TikTok! ');
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^\.(tiktok|tt)\s+/i, '').trim();
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