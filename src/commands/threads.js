const path = require('path');
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

// Threads hanya merender kontennya (JSON media) untuk crawler/link-preview bot.
// UA browser biasa akan mendapat halaman shell yang butuh login.
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const DOWNLOAD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

class ThreadsDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 100 * 1024 * 1024; // 100MB
        this.maxItems = 10;

        this.commands = [
            { name: 'th', method: 'downloadMedia', description: 'Threads Video/Photo' },
            { name: 'threads', method: 'downloadMedia', description: 'Threads Video/Photo (Alias)' }
        ];

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadMedia(msg, sock, messageBody) {
        try {
            logger.info('Memproses command /th');
            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /th [link threads]\n\n💡 Contoh:\n/th https://www.threads.com/@user/post/xxxxx');
            }

            if (!this.isValidThreadsURL(url)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link Threads tidak valid!');
            }

            logger.info(`Downloading from: ${url}`);

            await helpers.reactProcessing(sock, msg);

            const { html, finalUrl } = await this.fetchPost(url);
            const code = this.extractPostCode(finalUrl) || this.extractPostCode(url);

            if (this.isUnavailablePage(finalUrl)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Post Threads tidak ditemukan atau sudah dihapus.');
            }

            const items = this.parseMediaFromHtml(html, code);

            if (!items.length) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Post Threads tidak berisi gambar/video, atau post bersifat privat!');
            }

            logger.info(`Ditemukan ${items.length} media`);

            let sent = 0;

            for (const item of items) {
                try {
                    const buffer = await this.downloadBuffer(item.url);

                    if (!buffer || buffer.length === 0) {
                        logger.warn('Media kosong, dilewati');
                        continue;
                    }

                    if (buffer.length > this.maxMediaSize) {
                        logger.warn(`Media terlalu besar (${(buffer.length / 1024 / 1024).toFixed(2)}MB), dilewati`);
                        continue;
                    }

                    if (item.type === 'video') {
                        await helpers.replyVideoWithTyping(sock, msg, buffer, '', 500);
                    } else {
                        // Threads mengirim WebP; Baileys default-nya image/jpeg.
                        const jpegBuffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
                        await helpers.replyImageWithTyping(sock, msg, jpegBuffer, '', 500);
                    }

                    sent++;
                } catch (itemError) {
                    logger.warn('Gagal memproses satu media:', itemError.message);
                }
            }

            if (sent === 0) {
                throw new Error('Semua media gagal diunduh');
            }

            await helpers.reactSuccess(sock, msg);
            logger.success(`${sent} media berhasil dikirim!`);

        } catch (error) {
            logger.error('Error:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari Threads!\n\n💡 Pastikan link benar, post publik, dan media belum kedaluwarsa.');
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^[\.\/](th|threads)\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?(www\.)?threads\.(net|com)\/[^\s]+/gi;
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

    isValidThreadsURL(url) {
        const regex = /^(https?:\/\/)?(www\.)?threads\.(net|com)\/(@[A-Za-z0-9_.]+\/post\/[A-Za-z0-9_-]+|t\/[A-Za-z0-9_-]+|share\/[A-Za-z0-9_-]+)/i;
        return regex.test(url);
    }

    extractPostCode(url) {
        const match = (url || '').match(/\/(?:post|t)\/([A-Za-z0-9_-]+)/i);
        return match ? match[1] : null;
    }

    normalizeUrl(url) {
        return /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }

    isUnavailablePage(url) {
        return /\/(?:login|challenge)(?:\/|$|\?)|\?(?:[^#]*&)?error=/i.test(url || '');
    }

    async fetchPost(url) {
        const response = await axios.get(this.normalizeUrl(url), {
            headers: {
                'User-Agent': CRAWLER_UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 30000,
            maxRedirects: 5
        });

        const finalUrl = response.request?.res?.responseUrl || response.request?.responseURL || url;
        return { html: response.data, finalUrl };
    }

    /**
     * Threads menempelkan data post sebagai <script type="application/json">.
     * Cari object media yang code-nya cocok dengan shortcode post.
     */
    parseMediaFromHtml(html, code) {
        if (!html || typeof html !== 'string') return [];

        const blocks = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)];
        const candidates = [];

        const walk = (node) => {
            if (!node || typeof node !== 'object') return;

            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }

            if (node.code && node.pk && (node.image_versions2 || node.video_versions || node.carousel_media)) {
                candidates.push(node);
            }

            Object.values(node).forEach(walk);
        };

        for (const block of blocks) {
            try {
                walk(JSON.parse(block[1]));
            } catch (error) {
                // Blok JSON non-media, abaikan
            }
        }

        let post = null;
        if (code) {
            post = candidates.find(c => c.code === code);
        } else {
            post = candidates.find(c => c.media_type !== 19) || candidates[0];
        }

        if (post) {
            const items = Array.isArray(post.carousel_media) && post.carousel_media.length
                ? post.carousel_media
                : [post];

            const media = [];
            for (const item of items) {
                const video = item.video_versions?.[0]?.url;
                if (video) {
                    media.push({ type: 'video', url: video });
                    continue;
                }

                const candidatesImage = item.image_versions2?.candidates || [];
                if (candidatesImage.length) {
                    const best = [...candidatesImage].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
                    media.push({ type: 'image', url: best.url });
                }
            }

            if (media.length) return media.slice(0, this.maxItems);
        }

        // Kalau shortcode sudah diketahui tapi media tidak cocok, jangan
        // mengirim media related post dari halaman error.
        if (code) return [];

        return this.parseOgMedia(html);
    }

    /**
     * Fallback: baca meta og:video / og:image kalau JSON media tidak ditemukan.
     */
    parseOgMedia(html) {
        const decode = (value) => value
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        const getMeta = (property) => {
            const patterns = [
                new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
                new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i')
            ];

            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match) return decode(match[1]);
            }

            return null;
        };

        const video = getMeta('og:video') || getMeta('og:video:secure_url');
        if (video) return [{ type: 'video', url: video }];

        const image = getMeta('og:image');
        if (image) return [{ type: 'image', url: image }];

        return [];
    }

    async downloadBuffer(url) {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': DOWNLOAD_UA,
                'Accept': '*/*'
            },
            timeout: 60000,
            maxContentLength: this.maxMediaSize,
            maxBodyLength: this.maxMediaSize
        });

        return Buffer.from(response.data);
    }
}

module.exports = new ThreadsDownloader();
