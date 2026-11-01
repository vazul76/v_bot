const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

class TwitterDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 100 * 1024 * 1024; // 100MB
        this.maxItems = 10;

        this.commands = [
            { name: 'twitter', method: 'downloadMedia', description: 'Twitter/X Video/Photo' },
            { name: 'x', method: 'downloadMedia', description: 'Twitter/X Video/Photo (Alias)' }
        ];

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadMedia(msg, sock, messageBody) {
        let tempFiles = [];

        try {
            logger.info('Memproses command /twitter');
            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /x [link] atau /twitter [link]\n\n💡 Contoh:\n/x https://x.com/user/status/123456789');
            }

            if (!this.isValidTwitterURL(url)) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link Twitter/X tidak valid!\n\n✅ Gunakan link post (contoh: https://x.com/user/status/123456789)');
            }

            logger.info(`Downloading from: ${url}`);
            await helpers.reactProcessing(sock, msg);

            const tweetId = await this.resolveTweetId(url);
            if (!tweetId) {
                throw new Error('ID tweet tidak ditemukan');
            }

            const tweet = await this.fetchSyndication(tweetId);
            if (!tweet) {
                throw new Error('Tweet tidak tersedia atau sudah dihapus');
            }

            const mediaItems = this.extractMediaItems(tweet);
            if (!mediaItems.length) {
                throw new Error('Tweet tidak berisi foto/video');
            }

            // Foto tidak didukung yt-dlp, jadi semua media tweet diambil dari
            // syndication API. yt-dlp hanya dipakai untuk variant HLS.
            const sent = await this.sendMediaItems(sock, msg, mediaItems, tempFiles);

            if (sent === 0) {
                throw new Error('Semua media gagal dikirim');
            }

            await helpers.reactSuccess(sock, msg);
            logger.success(`${sent} media berhasil dikirim!`);

        } catch (error) {
            logger.error('Error:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari Twitter!\n\n💡 Pastikan link post benar, tweet publik, dan tidak dihapus.');
        } finally {
            this.cleanupTempFiles(tempFiles);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^[\.\/](x|twitter)\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?((?:www|mobile|m)\.)?(twitter\.com|x\.com|t\.co|fxtwitter\.com|vxtwitter\.com|fixupx\.com|fixvx\.com)\/[^\s]+/gi;
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

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        return '';
    }

    cleanUrl(url) {
        return (url || '').replace(/[)\].,;:!?'"]+$/, '');
    }

    isValidTwitterURL(url) {
        try {
            const parsed = new URL(this.normalizeUrl(url));
            const host = parsed.hostname.toLowerCase();

            if (host === 't.co') {
                return /^\/[A-Za-z0-9]+/i.test(parsed.pathname);
            }

            if (!/(?:^|\.)(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com|fixvx\.com)$/i.test(host)) {
                return false;
            }

            return /\/status(?:es)?\/\d+|\/i\/(?:web\/)?status\/\d+/i.test(parsed.pathname);
        } catch (error) {
            return false;
        }
    }

    normalizeUrl(url) {
        return /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }

    extractTweetId(url) {
        const match = (url || '').match(/\/(?:status(?:es)?|i\/(?:web\/)?status)\/(\d+)/i);
        return match ? match[1] : null;
    }

    async resolveTweetId(url) {
        let target = this.normalizeUrl(url);

        if (/\/\/t\.co\//i.test(target)) {
            const response = await axios.get(target, {
                headers: {
                    'User-Agent': BROWSER_UA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: 20000,
                maxRedirects: 5,
                responseType: 'stream',
                validateStatus: () => true
            });

            target = response.request?.res?.responseUrl || response.request?.responseURL || target;
            if (response.data && typeof response.data.destroy === 'function') {
                response.data.destroy();
            }
        }

        return this.extractTweetId(target);
    }

    async fetchSyndication(tweetId) {
        const token = ((Number(tweetId) / 1e15) * Math.PI)
            .toString(36)
            .replace(/(0+|\.)/g, '');

        if (!token) return null;

        const response = await axios.get('https://cdn.syndication.twimg.com/tweet-result', {
            params: {
                id: tweetId,
                lang: 'en',
                token
            },
            headers: {
                'User-Agent': BROWSER_UA,
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 30000,
            validateStatus: () => true
        });

        if (response.status !== 200 || !response.data || typeof response.data !== 'object') {
            return null;
        }

        if (response.data.__typename === 'TweetTombstone' || response.data.tombstone) {
            return null;
        }

        return response.data;
    }

    extractMediaItems(tweet) {
        const items = [];
        const seen = new Set();

        const add = (item) => {
            if (!item || !item.url || seen.has(item.url)) return;
            seen.add(item.url);
            items.push(item);
        };

        const details = Array.isArray(tweet.mediaDetails) ? tweet.mediaDetails : [];

        for (const detail of details) {
            const type = detail.type;
            const mediaUrl = detail.media_url_https || detail.media_url;

            if (type === 'photo' && mediaUrl) {
                add({ type: 'image', url: this.withPhotoSize(mediaUrl) });
                continue;
            }

            if (type === 'video' || type === 'animated_gif') {
                const variants = detail.video_info?.variants || [];
                const mp4 = variants
                    .filter(v => v.content_type === 'video/mp4' && v.url)
                    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

                if (mp4) {
                    add({ type: 'video', url: mp4.url });
                    continue;
                }

                const hls = variants.find(v => /mpegurl/i.test(v.content_type || '') && v.url);
                if (hls) {
                    add({ type: 'video', url: hls.url, isHls: true });
                }
            }
        }

        // Sebagian response lama hanya menyediakan array photos.
        if (!items.length && Array.isArray(tweet.photos)) {
            for (const photo of tweet.photos) {
                if (photo?.url) {
                    add({ type: 'image', url: this.withPhotoSize(photo.url) });
                }
            }
        }

        return items.slice(0, this.maxItems);
    }

    withPhotoSize(url) {
        let result = String(url);

        if (/[?&]name=/i.test(result)) {
            result = result.replace(/([?&])name=[^&]*/i, '$1name=large');
        } else {
            result += result.includes('?') ? '&name=large' : '?name=large';
        }

        return result;
    }

    async sendMediaItems(sock, msg, items, tempFiles) {
        let sent = 0;

        for (const item of items.slice(0, this.maxItems)) {
            try {
                if (item.isHls) {
                    const files = await this.downloadWithYtDlp(item.url);
                    tempFiles.push(...files);
                    sent += await this.sendDownloadedFiles(sock, msg, files);
                    continue;
                }

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
                'User-Agent': BROWSER_UA,
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
        const outputTemplate = path.join(this.tempDir, `twitter_media_${timestamp}_%(autonumber)03d.%(ext)s`);

        const options = {
            format: 'best',
            output: outputTemplate,
            noWarnings: true
        };

        const cookies = process.env.X_COOKIES;
        if (cookies && fs.existsSync(cookies)) {
            options.cookies = cookies;
        }

        try {
            await ytdlpExec(url, options);
        } catch (dlError) {
            logger.warn('yt-dlp error:', dlError.message);
        }

        return fs.readdirSync(this.tempDir)
            .filter(f => f.startsWith(`twitter_media_${timestamp}`))
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

module.exports = new TwitterDownloader();
