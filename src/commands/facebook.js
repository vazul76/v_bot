const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');

class FacebookDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxVideoSize = 64 * 1024 * 1024; // 64MB for video

        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Download Facebook video
     */
    async downloadVideo(msg, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .fb');

            // Extract URL from message
            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                logger.warn('URL tidak ditemukan');
                return msg.reply('❌ Format: .fb [link facebook]\n\nContoh: .fb https://www.facebook.com/...');
            }

            if (!this.isValidFacebookURL(url)) {
                logger.warn('URL Facebook tidak valid');
                return msg.reply('❌ Link Facebook tidak valid!\n\nGunakan link dari facebook.com atau fb.watch');
            }

            logger.info(`Downloading video from Facebook: ${url}`);
            await msg.reply('⏳ Mendownload video dari Facebook.\n🤬 Nunggu bentar, ribet amat.');

            // Generate temp file path
            const outputTemplate = path.join(this.tempDir, `fb_video_${Date.now()}.%(ext)s`);
            const expectedPath = outputTemplate.replace('.%(ext)s', '.mp4');
            tempFilePath = expectedPath;

            // Download video with yt-dlp
            try {
                await ytdlpExec(url, {
                    format: 'best',
                    output: outputTemplate,
                    noPlaylist: true,
                    noWarnings: true
                });
            } catch (dlError) {
                // Check if file exists even on error
                if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
                    throw dlError;
                }
                logger.warn('yt-dlp exited with error but file was downloaded:', dlError.message);
            }

            // Verify file exists
            if (!fs.existsSync(tempFilePath)) {
                throw new Error('File download gagal');
            }

            // Check file size
            const stats = fs.statSync(tempFilePath);
            logger.info(`Video file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxVideoSize) {
                logger.warn('File terlalu besar untuk WhatsApp');
                return msg.reply(`❌ Video terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\nLimit WhatsApp: 64MB untuk video`);
            }

            // Read file and create MessageMedia
            const videoBuffer = fs.readFileSync(tempFilePath);
            const videoMedia = new MessageMedia(
                'video/mp4',
                videoBuffer.toString('base64'),
                'Vazul-facebook-video.mp4'
            );

            logger.info('Mengirim video sebagai document...');
            await msg.reply(videoMedia, null, {
                sendMediaAsDocument: true
            });

            logger.success('Video Facebook berhasil dikirim!');

        } catch (error) {
            logger.error('Error downloading Facebook video:', error.message);
            logger.error('Stack trace:', error.stack);

            if (error.message.includes('Video unavailable') || error.message.includes('not available')) {
                await msg.reply('❌ Video tidak tersedia atau sudah dihapus!');
            } else if (error.message.includes('Private')) {
                await msg.reply('❌ Video ini bersifat private!');
            } else if (error.message.includes('login') || error.message.includes('Login')) {
                await msg.reply('❌ Video memerlukan login Facebook!\n\nCoba video yang public.');
            } else {
                await msg.reply('❌ Gagal mendownload video dari Facebook!\n\nPastikan link valid dan video public.');
            }
        } finally {
            // Cleanup temp files
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    /**
     * Extract Facebook URL from message
     */
    async extractURL(messageBody, msg) {
        // Remove command prefix
        const text = messageBody.replace(/^\.fb\s+/i, '').trim();

        // Try to find URL in the text
        const urlRegex = /(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch|fb\.com)\/[^\s]+/gi;
        let matches = text.match(urlRegex);

        if (matches) {
            return matches[0];
        }

        // If no URL found in command, check quoted message
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

    /**
     * Validate Facebook URL
     */
    isValidFacebookURL(url) {
        const facebookRegex = /^(https?:\/\/)?(www\.)?(facebook\.com|fb\.watch|fb\.com)\/.+/;
        return facebookRegex.test(url);
    }

    /**
     * Cleanup temporary files
     */
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
