const { MessageMedia } = require('whatsapp-web.js');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const Canvas = require('canvas');
const sharp = require('sharp');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class StickerCommand {
    constructor() {
        this.packName = 'WA Sticker Bot';
        this.authorName = 'vazul76';
    }

    /**
     * Membuat sticker dari gambar atau video
     * Gambar → Static sticker
     * Video → Animated sticker
     */
    async createSticker(msg, client) {
        try {
            logger.info('Memproses command .s');

            // React:  Command diterima
            await helpers.reactCommandReceived(msg);

            const media = await this.getMediaFromMessage(msg);

            if (!media) {
                logger.warn('Tidak ada media ditemukan');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, '❌ Kirim gambar/video atau reply gambar/video dengan command .s\n\n📝 Support:\n• Gambar → Static sticker\n• Video → Animated sticker');
            }

            logger.info(`Media ditemukan: ${media.mimetype}`);

            // Check if image or video
            const isImage = this.isImage(media.mimetype);
            const isVideo = this.isVideo(media.mimetype);

            if (! isImage && !isVideo) {
                logger.warn('Media bukan gambar atau video');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, '❌ Hanya mendukung gambar (jpg, png, webp) atau video (mp4, gif)! ');
            }

            // React: Processing
            await helpers.reactProcessing(msg);

            if (isVideo) {
                await helpers.replyWithTyping(msg, client, '⏳ Membuat animated sticker dari video...\n🤬Lagi proses, SABAR!', 1000);
            } else {
                await helpers.replyWithTyping(msg, client, '⏳ Membuat sticker...', 1000);
            }

            // Convert media data ke buffer
            const buffer = Buffer.from(media.data, 'base64');

            logger.info('Membuat sticker dengan wa-sticker-formatter...');
            const sticker = new Sticker(buffer, {
                pack: this.packName,
                author: this.authorName,
                type: StickerTypes.FULL,
                quality: 50,
                animated: isVideo // Enable animated for video
            });

            logger.info('Convert ke buffer WebP/WebM...');
            const stickerBuffer = await sticker.toBuffer();

            logger.info('Membuat MessageMedia...');
            const mimetype = isVideo ? 'image/webp' : 'image/webp'; // WhatsApp uses webp for both
            const stickerMedia = new MessageMedia(
                mimetype,
                stickerBuffer.toString('base64'),
                'sticker.webp'
            );

            logger.info('Mengirim sebagai sticker...');
            await helpers.simulateTyping(msg, client, 1500);
            await msg.reply(stickerMedia, null, {
                sendMediaAsSticker: true,
                stickerAuthor: this.authorName,
                stickerName: this.packName,
                stickerCategories: ['🤖']
            });

            // React: Success
            await helpers.reactSuccess(msg);
            logger.success(`${isVideo ? 'Animated sticker' : 'Sticker'} berhasil dikirim!`);

        } catch (error) {
            logger.error('Error creating sticker:', error.message);
            logger.error('Stack trace:', error.stack);

            // React: Error
            await helpers.reactError(msg);
            await helpers.replyWithTyping(msg, client, '❌ Gagal membuat sticker!\n\n💡 Tips:\n• Pastikan file valid\n• Video max 10 detik\n• Ukuran file jangan terlalu besar');
        }
    }

    /**
     * Membuat sticker dengan teks di bawah (hanya untuk gambar)
     */
    async createStickerWithText(msg, client, fullCommand) {
        try {
            logger.info('Memproses command .stext');

            // React: Command diterima
            await helpers.reactCommandReceived(msg);

            // Ambil teks setelah .stext
            const text = fullCommand.slice(6).trim();

            logger.info(`Teks yang diambil: "${text}"`);

            if (!text) {
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, '❌ Format:  .stext teks yang ingin ditambahkan\n\nContoh: .stext Hello World');
            }

            const media = await this.getMediaFromMessage(msg);

            if (!media) {
                logger.warn('Tidak ada media ditemukan');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, '❌ Kirim gambar atau reply gambar dengan command .stext\n\n⚠️ Text overlay hanya support untuk gambar, bukan video!');
            }

            logger.info(`Media ditemukan: ${media.mimetype}`);

            // Hanya support gambar untuk text overlay
            if (! this.isImage(media.mimetype)) {
                logger.warn('Media bukan gambar');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, '❌ .stext hanya mendukung gambar!\n\n💡 Untuk video, gunakan .s tanpa text');
            }

            // React:  Processing
            await helpers.reactProcessing(msg);
            await helpers.replyWithTyping(msg, client, '⏳ Membuat sticker dengan teks...', 1000);

            // Proses gambar dengan canvas
            logger.info('Menambahkan teks ke gambar...');
            const imageBuffer = await this.addTextToImage(media.data, text);

            // Buat sticker
            logger.info('Membuat sticker...');
            const sticker = new Sticker(imageBuffer, {
                pack: this.packName,
                author: this.authorName,
                type: StickerTypes.FULL,
                quality: 50
            });

            logger.info('Convert ke buffer WebP...');
            const webpBuffer = await sticker.toBuffer();

            logger.info('Membuat MessageMedia...');
            const stickerMedia = new MessageMedia(
                'image/webp',
                webpBuffer.toString('base64'),
                'sticker.webp'
            );

            logger.info('Mengirim sebagai sticker...');
            await helpers.simulateTyping(msg, client, 1500);
            await msg.reply(stickerMedia, null, {
                sendMediaAsSticker:  true,
                stickerAuthor: this.authorName,
                stickerName: this.packName,
                stickerCategories: ['🤖']
            });

            // React:  Success
            await helpers.reactSuccess(msg);
            logger.success('Sticker dengan teks berhasil dikirim! ');

        } catch (error) {
            logger.error('Error creating sticker with text:', error.message);
            logger.error('Stack trace:', error.stack);

            // React: Error
            await helpers.reactError(msg);
            await helpers.replyWithTyping(msg, client, '❌ Gagal membuat sticker dengan teks! ');
        }
    }

    /**
     * Mengubah sticker menjadi gambar/video
     */
    async convertStickerToImage(msg, client) {
        try {
            logger.info('Memproses command .toimg');

            // React: Command diterima
            await helpers.reactCommandReceived(msg);

            // Cek apakah ada quoted message
            if (! msg.hasQuotedMsg) {
                logger.warn('Tidak ada quoted message');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, '❌ Reply sticker dengan command .toimg untuk mengubah sticker menjadi gambar/video! ');
            }

            logger.info('Mengambil quoted message...');
            const quotedMsg = await msg.getQuotedMessage();

            // Cek apakah quoted message adalah sticker
            if (quotedMsg.type !== 'sticker') {
                logger.warn('Quoted message bukan sticker');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, '❌ Reply hanya bisa digunakan untuk sticker!');
            }

            logger.info('Sticker ditemukan, downloading...');

            // React: Processing
            await helpers.reactProcessing(msg);
            await helpers.replyWithTyping(msg, client, '⏳ Mengubah sticker menjadi gambar/video...', 1000);

            // Download sticker
            const media = await quotedMsg.downloadMedia();

            if (!media) {
                logger.error('Gagal download sticker');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, '❌ Gagal mengunduh sticker!');
            }

            logger.info(`Sticker downloaded: ${media.mimetype}`);

            // Convert WebP ke PNG/GIF
            const buffer = Buffer.from(media.data, 'base64');

            // Check if animated sticker (webm/animated webp)
            const isAnimated = await this.isAnimatedSticker(buffer);

            if (isAnimated) {
                // Animated sticker → return as GIF or MP4
                logger.info('Converting animated sticker to GIF...');
                
                // Untuk animated, kita return as-is (webp animated) atau convert ke gif
                // Tapi whatsapp-web.js lebih mudah kirim as document
                const imageMedia = new MessageMedia(
                    'image/webp',
                    buffer.toString('base64'),
                    'sticker-animated.webp'
                );

                await helpers.simulateTyping(msg, client, 1500);
                await msg.reply(imageMedia, null, {
                    sendMediaAsDocument: true
                });

            } else {
                // Static sticker → convert to PNG
                logger.info('Converting static sticker to PNG and trimming...');
                const pngBuffer = await sharp(buffer)
                    .trim({
                        background: { r: 255, g: 255, b:  255, alpha: 0 },
                        threshold: 10
                    })
                    .png()
                    .toBuffer();

                const imageMedia = new MessageMedia(
                    'image/png',
                    pngBuffer.toString('base64'),
                    'sticker-to-image.png'
                );

                logger.info('Mengirim sebagai gambar...');
                await helpers.simulateTyping(msg, client, 1500);
                await msg.reply(imageMedia);
            }

            // React:  Success
            await helpers.reactSuccess(msg);
            logger.success('Sticker berhasil diubah! ');

        } catch (error) {
            logger.error('Error converting sticker to image:', error.message);
            logger.error('Stack trace:', error.stack);

            // React: Error
            await helpers.reactError(msg);
            await helpers.replyWithTyping(msg, client, '❌ Gagal mengubah sticker! ');
        }
    }

    /**
     * Mengambil media dari pesan (baik langsung atau quoted)
     */
    async getMediaFromMessage(msg) {
        let media = null;

        try {
            // Cek apakah ada quoted message
            if (msg.hasQuotedMsg) {
                logger.info('Mengambil media dari quoted message...');
                const quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg.hasMedia) {
                    logger.info('Downloading media dari quoted message...');
                    media = await quotedMsg.downloadMedia();
                }
            }
            // Cek apakah pesan langsung memiliki media
            else if (msg.hasMedia) {
                logger.info('Downloading media dari message...');
                media = await msg.downloadMedia();
            } else {
                logger.warn('Tidak ada media di message atau quoted message');
            }
        } catch (error) {
            logger.error('Error getting media:', error);
        }

        return media;
    }

    /**
     * Cek apakah file adalah gambar
     */
    isImage(mimetype) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        return mimetype && validTypes.includes(mimetype.toLowerCase());
    }

    /**
     * Cek apakah file adalah video
     */
    isVideo(mimetype) {
        const validTypes = ['video/mp4', 'video/webm', 'image/gif', 'video/gif'];
        return mimetype && validTypes.includes(mimetype.toLowerCase());
    }

    /**
     * Cek apakah sticker adalah animated
     */
    async isAnimatedSticker(buffer) {
        try {
            // Check file signature/header
            const header = buffer.toString('hex', 0, 20);
            // WebP animated has VP8X chunk with animation flag
            // This is a simple check, might need refinement
            return header.includes('414e494d'); // "ANIM" in hex
        } catch (error) {
            logger.warn('Error checking if sticker is animated:', error.message);
            return false;
        }
    }

    /**
     * Menambahkan teks OVERLAY di atas gambar (bawah center)
     */
    async addTextToImage(imageData, text) {
        const buffer = Buffer.from(imageData, 'base64');
        const image = await Canvas.loadImage(buffer);

        const canvasSize = 512;
        const canvas = Canvas.createCanvas(canvasSize, canvasSize);
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

    /**
     * Hitung ukuran font berdasarkan panjang teks
     */
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