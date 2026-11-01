const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class TikTokDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 100 * 1024 * 1024; // 100MB
        this.maxItems = 10;

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
        let tempFiles = [];

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

            if (this.isPhotoPost(url)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Post foto/slideshow TikTok belum didukung!\n\n💡 Saat ini hanya video TikTok yang bisa diunduh.');
            }

            const targetUrl = this.normalizeUrl(url);
            logger.info(`Downloading from: ${targetUrl}`);
            await helpers.reactProcessing(sock, msg);

            const timestamp = Date.now();
            const outputTemplate = path.join(this.tempDir, `tiktok_${timestamp}_%(autonumber)03d.%(ext)s`);

            const options = {
                ...this.getYtDlpCommonOptions(),
                format: 'best[ext=mp4]/best',
                output: outputTemplate
            };

            const cookies = process.env.TT_COOKIES;
            if (cookies && fs.existsSync(cookies)) {
                options.cookies = cookies;
            }

            try {
                await ytdlpExec(targetUrl, options);
            } catch (dlError) {
                logger.warn('yt-dlp error:', dlError.message);
            }

            tempFiles = fs.readdirSync(this.tempDir)
                .filter(f => f.startsWith(`tiktok_${timestamp}`))
                .sort()
                .map(f => path.join(this.tempDir, f));

            if (tempFiles.length === 0) {
                throw new Error('File download gagal');
            }

            const sent = await this.sendDownloadedFiles(sock, msg, tempFiles);

            if (sent === 0) {
                throw new Error('Semua media gagal dikirim');
            }

            await helpers.reactSuccess(sock, msg);
            logger.success(`${sent} media berhasil dikirim!`);

        } catch (error) {
            logger.error('Error:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari TikTok!\n\n💡 Pastikan link valid, video publik, dan belum dihapus.');
        } finally {
            this.cleanupTempFiles(tempFiles);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^[\.\/](tiktok|tt)\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?((?:www|m|vm|vt)\.)?tiktok\.com\/[^\s]+/gi;
        let matches = text.match(urlRegex);

        if (matches) return this.cleanUrl(matches[0]);

        const quoted = await helpers.getQuotedMessage(msg);
        if (quoted) {
            const quotedText = this.getTextFromMessage(quoted.message);
            matches = quotedText?.match(urlRegex);
            if (matches) {
                logger.info('URL found in quoted');
                return this.cleanUrl(matches[0]);
            }
        }

        return null;
    }

    cleanUrl(url) {
        return (url || '').replace(/[)\].,;:!?'"]+$/, '');
    }

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        return '';
    }

    isValidTikTokURL(url) {
        const regex = /^(https?:\/\/)?((?:www|m|vm|vt)\.)?tiktok\.com\/.+/i;
        return regex.test(url);
    }

    isPhotoPost(url) {
        return /\/@[^/?#]+\/photo\/\d+/i.test(url);
    }

    normalizeUrl(url) {
        let normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;

        // yt-dlp hanya mengenali www.tiktok.com / vt / vm / t, bukan m.tiktok.com.
        normalized = normalized.replace(/^https?:\/\/m\.tiktok\.com/i, 'https://www.tiktok.com');

        return normalized;
    }

    async sendDownloadedFiles(sock, msg, files) {
        let sent = 0;

        for (const file of files.slice(0, this.maxItems)) {
            try {
                const stats = fs.statSync(file);
                if (stats.size > this.maxMediaSize) {
                    logger.warn(`Media terlalu besar (${(stats.size / 1024 / 1024).toFixed(2)}MB), dilewati`);
                    continue;
                }

                const buffer = fs.readFileSync(file);
                const ext = path.extname(file).toLowerCase();

                if (['.mp4', '.webm', '.mov'].includes(ext)) {
                    await helpers.replyVideoWithTyping(sock, msg, buffer, '', 500);
                } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                    const meta = await sharp(buffer).metadata();
                    const imageBuffer = meta.format === 'jpeg'
                        ? buffer
                        : await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
                    await helpers.replyImageWithTyping(sock, msg, imageBuffer, '', 500);
                } else {
                    continue;
                }

                sent++;
            } catch (fileError) {
                logger.warn('Gagal mengirim file:', fileError.message);
            }
        }

        return sent;
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
