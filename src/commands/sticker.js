const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const Canvas = require('canvas');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class StickerCommand {
    constructor() {
        this.packName = 'WA Sticker Bot';
        this.authorName = 'vazul76';
        this.tempDir = path.join(__dirname, '../../temp');

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this. tempDir, { recursive: true });
        }
    }

    async createSticker(msg, sock) {
        try {
            logger.info('Memproses command . s');
            await helpers.reactCommandReceived(sock, msg);

            const media = await this.getMediaFromMessage(msg, sock);

            if (!media) {
                logger.warn('Tidak ada media ditemukan');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Kirim gambar/video atau reply gambar/video dengan command . s\n\n📝 Support:\n• Gambar → Static sticker\n• Video → Animated sticker');
            }

            logger.info('Media ditemukan');

            const messageType = this.getMediaType(msg);
            const isVideo = messageType === 'video';

            await helpers.reactProcessing(sock, msg);

            if (isVideo) {
                await helpers.replyWithTyping(sock, msg, '⏳ Membuat animated sticker dari video...\n🎬 Tunggu sebentar ya! ', 1000);
            } else {
                await helpers. replyWithTyping(sock, msg, '⏳ Membuat sticker... ', 1000);
            }

            logger.info('Membuat sticker dengan wa-sticker-formatter.. .');
            const sticker = new Sticker(media, {
                pack: this.packName,
                author: this.authorName,
                type: StickerTypes. FULL,
                quality: 50,
                animated: isVideo
            });

            logger.info('Convert ke buffer WebP...');
            const stickerBuffer = await sticker. toBuffer();

            logger.info('Mengirim sebagai sticker...');
            
            // ✅ REPLY KE USER
            await helpers.replyStickerWithTyping(sock, msg, stickerBuffer, 1500);

            await helpers.reactSuccess(sock, msg);
            logger.success(`${isVideo ? 'Animated sticker' : 'Sticker'} berhasil dikirim! `);

        } catch (error) {
            logger.error('Error creating sticker:', error. message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal membuat sticker!\n\n💡 Tips:\n• Pastikan file valid\n• Video max 10 detik\n• Ukuran file jangan terlalu besar');
        }
    }

    async createStickerWithText(msg, sock, fullCommand) {
        try {
            logger.info('Memproses command .stext');
            await helpers.reactCommandReceived(sock, msg);

            const text = fullCommand.slice(6).trim();
            logger.info(`Teks yang diambil: "${text}"`);

            if (!text) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /stext teks yang ingin ditambahkan\n\nContoh: /stext Hello World');
            }

            const media = await this.getMediaFromMessage(msg, sock);

            if (! media) {
                logger.warn('Tidak ada media ditemukan');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Kirim gambar atau reply gambar dengan command .stext\n\n⚠️ Text overlay hanya support untuk gambar! ');
            }

            const messageType = this.getMediaType(msg);
            if (messageType === 'video') {
                logger.warn('Media adalah video');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ /stext hanya mendukung gambar!\n\n💡 Untuk video, gunakan /s tanpa text');
            }

            await helpers. reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Membuat sticker dengan teks... ', 1000);

            logger.info('Menambahkan teks ke gambar...');
            const imageBuffer = await this.addTextToImage(media, text);

            logger.info('Membuat sticker...');
            const sticker = new Sticker(imageBuffer, {
                pack: this.packName,
                author: this.authorName,
                type: StickerTypes.FULL,
                quality: 50
            });

            logger.info('Convert ke buffer WebP...');
            const webpBuffer = await sticker.toBuffer();

            logger.info('Mengirim sebagai sticker...');
            
            // ✅ REPLY KE USER
            await helpers.replyStickerWithTyping(sock, msg, webpBuffer, 1500);

            await helpers.reactSuccess(sock, msg);
            logger.success('Sticker dengan teks berhasil dikirim!');

        } catch (error) {
            logger.error('Error creating sticker with text:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal membuat sticker dengan teks! ');
        }
    }

    async convertStickerToImage(msg, sock) {
        try {
            logger.info('Memproses command .toimg');
            await helpers.reactCommandReceived(sock, msg);

            const quoted = await helpers.getQuotedMessage(msg);

            if (!quoted || !quoted.message?. stickerMessage) {
                logger.warn('Tidak ada sticker di quoted message');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Reply sticker dengan command .toimg untuk mengubah sticker menjadi gambar! ');
            }

            logger.info('Sticker ditemukan, downloading...');

            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Mengubah sticker menjadi gambar... ', 1000);

            const buffer = await downloadMediaMessage(
                { key: msg.key, message: { ... quoted.message } },
                'buffer',
                {}
            );

            if (! buffer) {
                throw new Error('Gagal download sticker');
            }

            logger.info('Sticker downloaded');

            const isAnimated = await this.isAnimatedSticker(buffer);

            if (isAnimated) {
                logger.info('Sending animated sticker as webp...');
                
                // ✅ REPLY KE USER
                await helpers. replyDocumentWithTyping(sock, msg, buffer, 'sticker-animated. webp', 'image/webp', '✅ Animated sticker converted', 1500);

            } else {
                logger.info('Converting to PNG...');
                const pngBuffer = await sharp(buffer)
                    .trim({
                        background: { r: 255, g: 255, b:  255, alpha: 0 },
                        threshold: 10
                    })
                    .png()
                    .toBuffer();

                logger.info('Mengirim sebagai gambar...');
                
                // ✅ REPLY KE USER
                await helpers.replyImageWithTyping(sock, msg, pngBuffer, '✅ Sticker converted to image', 1500);
            }

            await helpers.reactSuccess(sock, msg);
            logger.success('Sticker berhasil diubah! ');

        } catch (error) {
            logger.error('Error converting sticker:', error.message);
            logger. error('Stack trace:', error.stack);

            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mengubah sticker!');
        }
    }

    async getMediaFromMessage(msg, sock) {
        try {
            const message = msg.message;
            
            if (message?.imageMessage || message?.videoMessage) {
                logger.info('Downloading media from message.. .');
                return await downloadMediaMessage(msg, 'buffer', {});
            }

            const quoted = await helpers.getQuotedMessage(msg);
            if (quoted && (quoted.message?.imageMessage || quoted.message?.videoMessage)) {
                logger.info('Downloading media from quoted message...');
                return await downloadMediaMessage(
                    { key: msg.key, message: { ...quoted.message } },
                    'buffer',
                    {}
                );
            }

            return null;

        } catch (error) {
            logger.error('Error getting media:', error);
            return null;
        }
    }

    getMediaType(msg) {
        const message = msg.message;
        
        if (message?.imageMessage) return 'image';
        if (message?.videoMessage) return 'video';
        
        const quoted = message?.extendedTextMessage?.contextInfo?. quotedMessage;
        if (quoted?. imageMessage) return 'image';
        if (quoted?.videoMessage) return 'video';
        
        return 'unknown';
    }

    async isAnimatedSticker(buffer) {
        try {
            const header = buffer.toString('hex', 0, 20);
            return header.includes('414e494d');
        } catch (error) {
            logger.warn('Error checking if animated:', error.message);
            return false;
        }
    }

    async addTextToImage(imageData, text) {
        const image = await Canvas.loadImage(imageData);

        const canvasSize = 512;
        const canvas = Canvas. createCanvas(canvasSize, canvasSize);
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, canvasSize, canvasSize);

        const scale = Math.min(
            canvasSize / image.width,
            canvasSize / image.height
        );

        const scaledWidth = image.width * scale;
        const scaledHeight = image.height * scale;

        const imageX = (canvasSize - scaledWidth) / 2;
        const imageY = (canvasSize - scaledHeight) / 2;

        ctx.drawImage(image, imageX, imageY, scaledWidth, scaledHeight);

        const fontSize = this.calculateFontSize(text);
        ctx.font = `bold ${fontSize}px Impact, Arial Black, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        const textX = canvasSize / 2;
        const textY = imageY + scaledHeight - 30;

        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        const padding = 15;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(
            textX - textWidth / 2 - padding,
            textY - textHeight - padding,
            textWidth + padding * 2,
            textHeight + padding * 2
        );

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(fontSize / 6, 4);
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(text, textX, textY);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, textX, textY);

        return canvas.toBuffer('image/png');
    }

    calculateFontSize(text) {
        const length = text.length;

        if (length <= 5) return 65;
        if (length <= 10) return 55;
        if (length <= 15) return 45;
        if (length <= 20) return 38;
        if (length <= 30) return 32;

        return 28;
    }
}

module.exports = new StickerCommand();