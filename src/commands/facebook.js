const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class FacebookDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxVideoSize = 64 * 1024 * 1024; // 64MB

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadVideo(msg, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .fb');

            // React: Command received
            await helpers.reactCommandReceived(msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                logger.warn('URL tidak ditemukan');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Format: .fb [link facebook]\n\n💡 Contoh:\n.fb https://www.facebook.com/watch?v=xxxxx\n\nAtau reply pesan yang ada link Facebook dengan .fb');
            }

            if (!this.isValidFacebookURL(url)) {
                logger.warn('URL Facebook tidak valid');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Link Facebook tidak valid!\n\n✅ Gunakan link dari facebook.com atau fb.watch');
            }

            logger.info(`Downloading video from: ${url}`);
            
            // React: Processing
            await helpers.reactProcessing(msg);
            await helpers.replyWithTyping(msg, msg.client, '⏳ Mendownload video dari Facebook...\n🤬*Lagi proses, SABAR!*', 1500);

            const outputTemplate = path.join(this.tempDir, `fb_video_${Date.now()}.%(ext)s`);
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
                logger.warn('yt-dlp exited with error but file was downloaded');
            }

            if (!fs.existsSync(tempFilePath)) {
                throw new Error('File download gagal');
            }

            const stats = fs.statSync(tempFilePath);
            logger.info(`Video file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxVideoSize) {
                logger.warn('File terlalu besar untuk WhatsApp');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, `❌ Video terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\n⚠️ Limit WhatsApp: 64MB untuk video`);
            }

            const videoBuffer = fs.readFileSync(tempFilePath);
            const videoMedia = new MessageMedia(
                'video/mp4',
                videoBuffer.toString('base64'),
                'Vazul-facebook-video.mp4'
            );

            logger.info('Mengirim video...');
            await helpers.simulateTyping(msg, msg.client, 1500);
            await msg.reply(videoMedia, null, {
                sendMediaAsDocument: true
            });

            // React: Success
            await helpers.reactSuccess(msg);
            logger.success('Video Facebook berhasil dikirim!');

        } catch (error) {
            logger.error('Error downloading Facebook video:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(msg);

            if (error.message.includes('Video unavailable') || error.message.includes('not available')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Video tidak tersedia atau sudah dihapus!');
            } else if (error.message.includes('Private video')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Video ini bersifat private!');
            } else {
                await helpers.replyWithTyping(msg, msg.client, '❌ Gagal mendownload video dari Facebook!\n\n💡 Pastikan link valid dan video tersedia.');
            }
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^\.fb\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch|fb\.com)\/[^\s]+/gi;
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

    isValidFacebookURL(url) {
        const facebookRegex = /^(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch|fb\.com)\/.+/;
        return facebookRegex.test(url);
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

module.exports = new FacebookDownloader();