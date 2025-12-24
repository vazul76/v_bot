const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');

class InstagramDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 64 * 1024 * 1024; // 64MB

        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Download Instagram media (video/photo)
     */
    async downloadMedia(msg, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .ig');

            // Extract URL from message
            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                logger.warn('URL tidak ditemukan');
                return msg.reply('❌ Format: .ig [link instagram]\n\nContoh: .ig https://www.instagram.com/p/xxxxx');
            }

            if (!this.isValidInstagramURL(url)) {
                logger.warn('URL Instagram tidak valid');
                return msg.reply('❌ Link Instagram tidak valid!\n\nGunakan link dari instagram.com');
            }

            logger.info(`Downloading media from Instagram: ${url}`);
            await msg.reply('⏳ Mendownload dari Instagram.\n🤬 Nunggu bentar, ribet amat.');

            // Generate temp file path
            const outputTemplate = path.join(this.tempDir, `ig_media_${Date.now()}.%(ext)s`);
            const expectedPathMp4 = outputTemplate.replace('.%(ext)s', '.mp4');
            const expectedPathJpg = outputTemplate.replace('.%(ext)s', '.jpg');
            tempFilePath = expectedPathMp4; // Default to mp4

            // Download media with yt-dlp
            try {
                await ytdlpExec(url, {
                    format: 'best',
                    output: outputTemplate,
                    noPlaylist: true,
                    noWarnings: true
                });
            } catch (dlError) {
                // Check if file exists even on error
                if ((!fs.existsSync(expectedPathMp4) || fs.statSync(expectedPathMp4).size === 0) &&
                    (!fs.existsSync(expectedPathJpg) || fs.statSync(expectedPathJpg).size === 0)) {
                    throw dlError;
                }
                logger.warn('yt-dlp exited with error but file was downloaded:', dlError.message);
            }

            // Determine which file was downloaded
            if (fs.existsSync(expectedPathMp4)) {
                tempFilePath = expectedPathMp4;
            } else if (fs.existsSync(expectedPathJpg)) {
                tempFilePath = expectedPathJpg;
            } else {
                throw new Error('File download gagal');
            }

            // Check file size
            const stats = fs.statSync(tempFilePath);
            logger.info(`Media file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxMediaSize) {
                logger.warn('File terlalu besar untuk WhatsApp');
                return msg.reply(`❌ File terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\nLimit WhatsApp: 64MB`);
            }

            // Determine file type
            const isVideo = tempFilePath.endsWith('.mp4');
            const mediaBuffer = fs.readFileSync(tempFilePath);
            const mediaMedia = new MessageMedia(
                isVideo ? 'video/mp4' : 'image/jpeg',
                mediaBuffer.toString('base64'),
                isVideo ? 'Vazul-instagram-video.mp4' : 'Vazul-instagram-photo.jpg'
            );

            logger.info(`Mengirim ${isVideo ? 'video' : 'photo'} sebagai document...`);
            await msg.reply(mediaMedia, null, {
                sendMediaAsDocument: true
            });

            logger.success('Media Instagram berhasil dikirim!');

        } catch (error) {
            logger.error('Error downloading Instagram media:', error.message);
            logger.error('Stack trace:', error.stack);

            if (error.message.includes('Login required') || error.message.includes('login')) {
                await msg.reply('❌ Instagram memerlukan login!\n\nCoba post yang public atau gunakan link lain.');
            } else if (error.message.includes('Private')) {
                await msg.reply('❌ Akun atau post ini private!');
            } else if (error.message.includes('not available') || error.message.includes('unavailable')) {
                await msg.reply('❌ Post tidak tersedia atau sudah dihapus!');
            } else {
                await msg.reply('❌ Gagal mendownload dari Instagram!\n\nInstagram sering block automated downloads. Coba link lain atau coba lagi nanti.');
            }
        } finally {
            // Cleanup temp files
            const expectedPathMp4 = tempFilePath ? tempFilePath : null;
            const expectedPathJpg = tempFilePath ? tempFilePath.replace('.mp4', '.jpg') : null;
            this.cleanupTempFiles([expectedPathMp4, expectedPathJpg]);
        }
    }

    /**
     * Extract Instagram URL from message
     */
    async extractURL(messageBody, msg) {
        // Remove command prefix
        const text = messageBody.replace(/^\.ig\s+/i, '').trim();

        // Try to find URL in the text
        const urlRegex = /(https?:\/\/)?(www\.)?(instagram\.com)\/(p|reel|reels)\/[^\s]+/gi;
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
     * Validate Instagram URL
     */
    isValidInstagramURL(url) {
        const instagramRegex = /^(https?:\/\/)?(www\.)?(instagram\.com)\/(p|reel|reels)\/.+/;
        return instagramRegex.test(url);
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

module.exports = new InstagramDownloader();
