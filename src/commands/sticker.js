const { MessageMedia } = require('whatsapp-web.js');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const Canvas = require('canvas');
const sharp = require('sharp');
const logger = require('../utils/logger');

class StickerCommand {
    constructor() {
        this.packName = 'WA Sticker Bot';
        this.authorName = 'vazul76';
    }

    /**
     * Membuat sticker biasa tanpa teks
     */
    async createSticker(msg, client) {
        try {
            logger.info('Memproses command .s');

            const media = await this.getMediaFromMessage(msg);

            if (!media) {
                logger.warn('Tidak ada media ditemukan');
                return msg.reply('❌ Kirim gambar atau reply gambar dengan command .s');
            }

            logger.info(`Media ditemukan: ${media.mimetype}`);

            if (!this.isImage(media.mimetype)) {
                logger.warn('Media bukan gambar');
                return msg.reply('❌ Hanya mendukung format gambar (jpg, png, jpeg, webp)!');
            }

            await msg.reply('⏳ Membuat sticker...');

            // Convert media data ke buffer
            const buffer = Buffer.from(media.data, 'base64');

            logger.info('Membuat sticker dengan wa-sticker-formatter...');
            const sticker = new Sticker(buffer, {
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
            await msg.reply(stickerMedia, null, {
                sendMediaAsSticker: true,
                stickerAuthor: this.authorName,
                stickerName: this.packName,
                stickerCategories: ['🤖']
            });

            logger.success('Sticker berhasil dikirim!');

        } catch (error) {
            logger.error('Error creating sticker:', error.message);
            logger.error('Stack trace:', error.stack);
            await msg.reply('❌ Gagal membuat sticker!  Pastikan file adalah gambar yang valid.');
        }
    }

    /**
     * Membuat sticker dengan teks di bawah
     */
    async createStickerWithText(msg, client, fullCommand) {
        try {
            logger.info('Memproses command .stext');

            // Ambil teks setelah .stext
            const text = fullCommand.slice(6).trim(); // Hilangkan ".stext"

            logger.info(`Teks yang diambil: "${text}"`);

            if (!text) {
                return msg.reply('❌ Format:  .stext teks yang ingin ditambahkan\n\nContoh: .stext Hello Maxi');
            }

            const media = await this.getMediaFromMessage(msg);

            if (!media) {
                logger.warn('Tidak ada media ditemukan');
                return msg.reply('❌ Kirim gambar atau reply gambar dengan command .stext');
            }

            logger.info(`Media ditemukan: ${media.mimetype}`);

            if (!this.isImage(media.mimetype)) {
                logger.warn('Media bukan gambar');
                return msg.reply('❌ Hanya mendukung format gambar (jpg, png, jpeg, webp)!');
            }

            await msg.reply('⏳ Membuat sticker dengan teks...');

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
            await msg.reply(stickerMedia, null, {
                sendMediaAsSticker: true,
                stickerAuthor: this.authorName,
                stickerName: this.packName,
                stickerCategories: ['🤖']
            });

            logger.success('Sticker dengan teks berhasil dikirim!');

        } catch (error) {
            logger.error('Error creating sticker with text:', error.message);
            logger.error('Stack trace:', error.stack);
            await msg.reply('❌ Gagal membuat sticker dengan teks! ');
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
     * Menambahkan teks OVERLAY di atas gambar (bawah center)
     */
    async addTextToImage(imageData, text) {
        const buffer = Buffer.from(imageData, 'base64');
        const image = await Canvas.loadImage(buffer);

        // Buat canvas dengan ukuran sticker WhatsApp
        const canvasSize = 512;
        const canvas = Canvas.createCanvas(canvasSize, canvasSize);
        const ctx = canvas.getContext('2d');

        // Background transparan
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        // Hitung scaling untuk fit gambar ke canvas
        const scale = Math.min(
            canvasSize / image.width,
            canvasSize / image.height
        );

        const scaledWidth = image.width * scale;
        const scaledHeight = image.height * scale;

        // Posisi gambar di tengah canvas
        const imageX = (canvasSize - scaledWidth) / 2;
        const imageY = (canvasSize - scaledHeight) / 2;

        // Gambar image
        ctx.drawImage(image, imageX, imageY, scaledWidth, scaledHeight);

        // === OVERLAY TEXT ===
        // Setup font
        const fontSize = this.calculateFontSize(text);
        ctx.font = `bold ${fontSize}px Impact, Arial Black, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Posisi teks RELATIF ke gambar
        // Bukan ke canvas, tapi ke posisi gambar yang sudah di-scale
        const textX = canvasSize / 2; // Center horizontal
        const textY = imageY + scaledHeight - 30; // 30px dari bawah GAMBAR

        // Measure text untuk background (optional)
        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize;

        // Background semi-transparan (optional, uncomment kalau mau)
        const padding = 15;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(
            textX - textWidth / 2 - padding,
            textY - textHeight - padding,
            textWidth + padding * 2,
            textHeight + padding * 2
        );

        // Stroke hitam tebal (outline)
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(fontSize / 6, 4);
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(text, textX, textY);

        // Fill putih
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

    /**
     * Mengubah sticker menjadi gambar
     */
    async convertStickerToImage(msg, client) {
        try {
            logger.info('Memproses command .toimg');

            // Cek apakah ada quoted message
            if (!msg.hasQuotedMsg) {
                logger.warn('Tidak ada quoted message');
                return msg.reply('❌ Reply sticker dengan command .toimg untuk mengubah sticker menjadi gambar!');
            }

            logger.info('Mengambil quoted message...');
            const quotedMsg = await msg.getQuotedMessage();

            // Cek apakah quoted message adalah sticker
            if (quotedMsg.type !== 'sticker') {
                logger.warn('Quoted message bukan sticker');
                return msg.reply('❌ Reply hanya bisa digunakan untuk sticker!');
            }

            logger.info('Sticker ditemukan, downloading...');
            await msg.reply('⏳ Mengubah sticker menjadi gambar...');

            // Download sticker
            const media = await quotedMsg.downloadMedia();

            if (!media) {
                logger.error('Gagal download sticker');
                return msg.reply('❌ Gagal mengunduh sticker!');
            }

            logger.info(`Sticker downloaded: ${media.mimetype}`);

            // Convert WebP ke PNG menggunakan sharp
            const buffer = Buffer.from(media.data, 'base64');

            logger.info('Converting WebP to PNG and trimming whitespace...');
            const pngBuffer = await sharp(buffer)
                .trim({
                    background: { r: 255, g: 255, b: 255, alpha: 0 },
                    threshold: 10
                })
                .png()
                .toBuffer();

            // Buat MessageMedia
            const imageMedia = new MessageMedia(
                'image/png',
                pngBuffer.toString('base64'),
                'sticker-to-image.png'
            );

            logger.info('Mengirim sebagai gambar...');
            await msg.reply(imageMedia);

            logger.success('Sticker berhasil diubah menjadi gambar!');

        } catch (error) {
            logger.error('Error converting sticker to image:', error.message);
            logger.error('Stack trace:', error.stack);
            await msg.reply('❌ Gagal mengubah sticker menjadi gambar!');
        }
    }
}

module.exports = new StickerCommand();