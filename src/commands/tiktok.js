const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class TikTokDownloader {
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
            logger.info('Memproses command .tiktok');

            // React:  Command received
            await helpers.reactCommandReceived(msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                logger.warn('URL tidak ditemukan');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Format: .tiktok [link] atau .tt [link]\n\n💡 Contoh:\n.tt https://vt.tiktok.com/xxxxx\n\nAtau reply pesan yang ada link TikTok dengan .tt');
            }

            if (! this.isValidTikTokURL(url)) {
                logger.warn('URL TikTok tidak valid');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Link TikTok tidak valid!\n\n✅ Gunakan link dari tiktok.com atau vt.tiktok.com');
            }

            logger.info(`Downloading video from: ${url}`);
            
            // React: Processing
            await helpers.reactProcessing(msg);
            await helpers.replyWithTyping(msg, msg.client, '⏳ Mendownload video dari TikTok...\n🤬*Lagi proses, SABAR!*', 1500);

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
                return helpers.replyWithTyping(msg, msg.client, `❌ Video terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\n⚠️ Limit WhatsApp:  64MB untuk video`);
            }

            const videoBuffer = fs.readFileSync(tempFilePath);
            const videoMedia = new MessageMedia(
                'video/mp4',
                videoBuffer.toString('base64'),
                'Vazul-tiktok-video.mp4'
            );

            logger.info('Mengirim video...');
            await helpers.simulateTyping(msg, msg.client, 1500);
            await msg.reply(videoMedia, null, {
                sendMediaAsDocument: true
            });

            // React: Success
            await helpers.reactSuccess(msg);
            logger.success('Video TikTok berhasil dikirim!');

        } catch (error) {
            logger.error('Error downloading TikTok video:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(msg);

            if (error.message.includes('Video unavailable') || error.message.includes('not available')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Video tidak tersedia atau sudah dihapus! ');
            } else if (error.message.includes('Private video')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Video ini bersifat private!');
            } else {
                await helpers.replyWithTyping(msg, msg.client, '❌ Gagal mendownload video dari TikTok!\n\n💡 Pastikan link valid dan video tersedia.');
            }
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^\.(tiktok|tt)\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)\/[^\s]+/gi;
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

    isValidTikTokURL(url) {
        const tiktokRegex = /^(https?:\/\/)?(www\.)?(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)\/.+/;
        return tiktokRegex.test(url);
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

module.exports = new TikTokDownloader();