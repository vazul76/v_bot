const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

// Instagram merender data post untuk crawler/link-preview bot.
// UA browser biasa dari IP server biasanya hanya mendapat halaman login.
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const DOWNLOAD_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

class InstagramDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 100 * 1024 * 1024; // 100MB
        this.maxItems = 10;

        this.commands = [
            { name: 'ig', method: 'downloadMedia', description: 'Instagram Video/Photo' }
        ];

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadMedia(msg, sock, messageBody) {
        let tempFiles = [];

        try {
            logger.info('Memproses command /ig');
            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /ig [link instagram]\n\n💡 Contoh:\n/ig https://www.instagram.com/p/xxxxx');
            }

            if (!this.isValidInstagramURL(url)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link Instagram tidak valid!');
            }

            logger.info(`Downloading from: ${url}`);
            await helpers.reactProcessing(sock, msg);

            // Cara pertama: baca JSON media dari halaman post (mendukung foto & carousel).
            try {
                const { html, finalUrl } = await this.fetchPost(url);
                const code = this.extractPostCode(finalUrl) || this.extractPostCode(url);

                if (this.isUnavailablePage(finalUrl)) {
                    logger.warn(`Halaman Instagram tidak tersedia: ${finalUrl}`);
                } else {
                    const items = this.parseMediaFromHtml(html, code);

                    if (items.length) {
                        logger.info(`Ditemukan ${items.length} media dari halaman post`);
                        const sent = await this.sendMediaItems(sock, msg, items);

                        if (sent > 0) {
                            await helpers.reactSuccess(sock, msg);
                            logger.success(`${sent} media berhasil dikirim!`);
                            return;
                        }
                    }
                }
            } catch (scrapeError) {
                logger.warn('Scraper Instagram gagal:', scrapeError.message);
            }

            // Fallback: yt-dlp (berguna untuk post yang butuh login, dengan cookies opsional).
            logger.info('Fallback ke yt-dlp...');
            tempFiles = await this.downloadWithYtDlp(url);

            if (tempFiles.length === 0) {
                throw new Error('Tidak ada media yang berhasil diunduh');
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
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari Instagram!\n\n💡 Pastikan post publik dan link benar. Post yang butuh login bisa memakai cookies (IG_COOKIES).');
        } finally {
            this.cleanupTempFiles(tempFiles);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^[\.\/]ig\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/[^\s]+/gi;
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

    isValidInstagramURL(url) {
        const regex = /^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\/(?:share\/[A-Za-z0-9_\/-]+|(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+)/i;
        return regex.test(url);
    }

    extractPostCode(url) {
        const match = (url || '').match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
        return match ? match[1] : null;
    }

    normalizeUrl(url) {
        return /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }

    isUnavailablePage(url) {
        return /\/(?:accounts\/login|login|challenge|sorry)(?:\/|$|\?)|\?(?:[^#]*&)?error=/i.test(url || '');
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

    parseMediaFromHtml(html, code) {
        if (!html || typeof html !== 'string') return [];

        const blocks = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)];
        const medias = [];

        const walk = (node) => {
            if (!node || typeof node !== 'object') return;

            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }

            if (node.code && node.pk && (node.image_versions2 || node.video_versions || node.carousel_media)) {
                medias.push(node);
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

        let post = code ? medias.find(m => m.code === code) : medias[0];

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

                const image = item.image_versions2?.candidates?.[0]?.url
                    || (typeof item.display_uri === 'string' ? item.display_uri : null);

                if (image) {
                    media.push({ type: 'image', url: image });
                }
            }

            if (media.length) return media.slice(0, this.maxItems);
        }

        // Kalau shortcode dari URL sudah diketahui tapi tidak ada media yang
        // cocok, jangan ambil media lain dari halaman (biasanya related post).
        if (code) return [];

        return this.parseOgMedia(html);
    }

    parseOgMedia(html) {
        const decode = (value) => value
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

        const patterns = [
            /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video["']/i
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) return [{ type: 'video', url: decode(match[1]) }];
        }

        const imagePattern = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
        const image = html.match(imagePattern);
        if (image) return [{ type: 'image', url: decode(image[1]) }];

        return [];
    }

    async sendMediaItems(sock, msg, items) {
        let sent = 0;

        for (const item of items.slice(0, this.maxItems)) {
            try {
                const buffer = await this.downloadBuffer(item.url);

                if (!buffer || buffer.length === 0) continue;

                if (buffer.length > this.maxMediaSize) {
                    logger.warn(`Media terlalu besar (${(buffer.length / 1024 / 1024).toFixed(2)}MB), dilewati`);
                    continue;
                }

                if (item.type === 'video') {
                    await helpers.replyVideoWithTyping(sock, msg, buffer, '', 500);
                } else {
                    const meta = await sharp(buffer).metadata();
                    const imageBuffer = meta.format === 'jpeg'
                        ? buffer
                        : await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
                    await helpers.replyImageWithTyping(sock, msg, imageBuffer, '', 500);
                }

                sent++;
            } catch (itemError) {
                logger.warn('Gagal memproses satu media:', itemError.message);
            }
        }

        return sent;
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

    async downloadWithYtDlp(url) {
        const timestamp = Date.now();
        const outputTemplate = path.join(this.tempDir, `ig_media_${timestamp}_%(autonumber)03d.%(ext)s`);

        const options = {
            format: 'best',
            output: outputTemplate,
            noWarnings: true
        };

        const cookies = process.env.IG_COOKIES;
        if (cookies && fs.existsSync(cookies)) {
            options.cookies = cookies;
        }

        try {
            await ytdlpExec(url, options);
        } catch (dlError) {
            logger.warn('yt-dlp error:', dlError.message);
        }

        return fs.readdirSync(this.tempDir)
            .filter(f => f.startsWith(`ig_media_${timestamp}`))
            .sort()
            .map(f => path.join(this.tempDir, f));
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

                if (ext === '.mp4') {
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
                logger.warn('Gagal mengirim file hasil yt-dlp:', fileError.message);
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

module.exports = new InstagramDownloader();
