const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

class FacebookDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxMediaSize = 100 * 1024 * 1024; // 100MB
        this.maxItems = 10;

        this.commands = [
            { name: 'fb', method: 'downloadMedia', description: 'Facebook Video/Photo' }
        ];

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadMedia(msg, sock, messageBody) {
        let tempFiles = [];

        try {
            logger.info('Memproses command /fb');
            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                logger.warn('URL tidak ditemukan');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /fb [link facebook]\n\n💡 Contoh:\n/fb https://www.facebook.com/watch?v=xxxxx\n\nAtau reply pesan yang ada link Facebook');
            }

            if (!this.isValidFacebookURL(url)) {
                logger.warn('URL tidak valid');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link Facebook tidak valid!\n\n✅ Gunakan link dari facebook.com, fb.watch, fb.com, atau fb.me');
            }

            await helpers.reactProcessing(sock, msg);

            const canonical = await this.resolveCanonical(url);
            logger.info(`Canonical URL: ${canonical}`);

            // Scraper plugin Facebook: satu jalur untuk video dan foto publik.
            const pluginItems = await this.fetchPluginMedia(canonical);

            if (pluginItems.length) {
                const sent = await this.sendMediaItems(sock, msg, pluginItems);

                if (sent > 0) {
                    await helpers.reactSuccess(sock, msg);
                    logger.success(`${sent} media berhasil dikirim!`);
                    return;
                }
            }

            // Fallback: yt-dlp (terutama untuk video yang tidak muncul di plugin).
            logger.info('Fallback ke yt-dlp...');
            tempFiles = await this.downloadWithYtDlp(canonical);

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
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload dari Facebook!\n\n💡 Pastikan link valid, media publik, dan bukan post yang butuh login.');
        } finally {
            this.cleanupTempFiles(tempFiles);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^[\.\/]fb\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?((?:[A-Za-z0-9-]+\.)?facebook\.com|fb\.watch|fb\.com|fb\.me)\/[^\s]+/gi;
        let matches = text.match(urlRegex);

        if (matches) return this.cleanUrl(matches[0]);

        const quoted = await helpers.getQuotedMessage(msg);
        if (quoted) {
            const quotedText = this.getTextFromMessage(quoted.message);
            matches = quotedText?.match(urlRegex);
            if (matches) {
                logger.info('URL found in quoted message');
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

    isValidFacebookURL(url) {
        try {
            const parsed = new URL(this.normalizeUrl(url));
            const host = parsed.hostname.toLowerCase();
            return /(?:^|\.)facebook\.com$/i.test(host)
                || ['fb.watch', 'fb.com', 'fb.me'].includes(host);
        } catch (error) {
            return false;
        }
    }

    isFacebookHost(url) {
        try {
            const host = new URL(this.normalizeUrl(url)).hostname.toLowerCase();
            return /(?:^|\.)facebook\.com$/i.test(host)
                || ['fb.watch', 'fb.com', 'fb.me'].includes(host);
        } catch (error) {
            return false;
        }
    }

    normalizeUrl(url) {
        return /^https?:\/\//i.test(url) ? url : `https://${url}`;
    }

    isLoginUrl(url) {
        return /\/(?:login(?:\.php)?|checkpoint|recover|two_step|save-device)(?:\/|$|\?)|\/privacy(?:\/|$|\?)/i.test(url || '');
    }

    getNextParam(url) {
        try {
            const parsed = new URL(url);
            let next = parsed.searchParams.get('next');

            if (!next) return null;
            if (/^https?%3A/i.test(next)) next = decodeURIComponent(next);
            if (/^https?:\/\//i.test(next)) return next;
            if (next.startsWith('/')) return `https://www.facebook.com${next}`;
            return null;
        } catch (error) {
            return null;
        }
    }

    async resolveCanonical(url) {
        let current = this.normalizeUrl(url);
        let lastNonLogin = current;
        let nextCandidate = null;

        try {
            for (let i = 0; i < 8; i++) {
                if (/\/\/(?:l|lm)\.facebook\.com\//i.test(current)) {
                    const parsed = new URL(current);
                    const target = parsed.searchParams.get('u') || parsed.searchParams.get('url');
                    if (target && /^https?:\/\//i.test(target)) {
                        current = target;
                        lastNonLogin = current;
                        continue;
                    }
                }

                if (this.isLoginUrl(current)) {
                    const next = this.getNextParam(current);
                    if (next && !this.isLoginUrl(next)) nextCandidate = next;
                    break;
                }

                const response = await axios.get(current, {
                    headers: {
                        'User-Agent': CRAWLER_UA,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9'
                    },
                    timeout: 20000,
                    maxRedirects: 0,
                    responseType: 'stream',
                    validateStatus: () => true
                });

                const location = response.headers.location;
                if (response.data && typeof response.data.destroy === 'function') {
                    response.data.destroy();
                }

                if (!location) {
                    lastNonLogin = current;
                    break;
                }

                let next = new URL(location, current).href;

                if (this.isLoginUrl(next)) {
                    const nextParam = this.getNextParam(next);
                    if (nextParam && !this.isLoginUrl(nextParam)) nextCandidate = nextParam;
                    break;
                }

                if (!this.isFacebookHost(next)) {
                    break;
                }

                current = next;
                lastNonLogin = current;
            }

            return this.toCanonicalUrl(nextCandidate || lastNonLogin);
        } catch (error) {
            logger.warn('Gagal resolve URL Facebook:', error.message);
            return this.toCanonicalUrl(url);
        }
    }

    toCanonicalUrl(url) {
        try {
            const parsed = new URL(this.normalizeUrl(url));
            let host = parsed.hostname.toLowerCase();

            if (/(?:^|\.)facebook\.com$/i.test(host)) {
                host = 'www.facebook.com';
            } else {
                return this.normalizeUrl(url);
            }

            const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
            const query = parsed.searchParams;

            const story = query.get('story_fbid') || query.get('fbid');
            if (/^\/(?:story|permalink)\.php$/i.test(pathname) && story) {
                const id = query.get('id');
                return `https://www.facebook.com/story.php?story_fbid=${encodeURIComponent(story)}${id ? `&id=${encodeURIComponent(id)}` : ''}`;
            }

            const reel = pathname.match(/^\/reel\/(\d+)/i);
            if (reel) {
                return `https://www.facebook.com/reel/${reel[1]}/`;
            }

            if (/^\/watch$/i.test(pathname)) {
                const videoId = query.get('v');
                if (videoId) return `https://www.facebook.com/watch/?v=${encodeURIComponent(videoId)}`;
            }

            const video = pathname.match(/\/(?:videos)\/(\d+)/i);
            if (video) {
                return `https://www.facebook.com/watch/?v=${video[1]}`;
            }

            if (/^\/photo(?:\.php)?$/i.test(pathname)) {
                const fbid = query.get('fbid');
                if (fbid) return `https://www.facebook.com/photo/?fbid=${encodeURIComponent(fbid)}`;
            }

            if (/^\/[^/]+\/posts\/\d+/i.test(pathname)) {
                return `https://${host}${pathname}/`;
            }

            return `https://${host}${pathname}${parsed.search}`;
        } catch (error) {
            return this.normalizeUrl(url);
        }
    }

    async fetchPluginHtml(kind, href) {
        const url = `https://www.facebook.com/plugins/${kind}.php?href=${encodeURIComponent(href)}&show_text=${kind === 'post' ? 'true' : 'false'}&width=500`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': CRAWLER_UA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: () => true
            });

            if (response.status !== 200 || typeof response.data !== 'string') {
                return '';
            }

            return response.data;
        } catch (error) {
            logger.warn(`Plugin ${kind} Facebook gagal:`, error.message);
            return '';
        }
    }

    async fetchPluginMedia(canonical) {
        const videoLike = /\/reel\/|\/watch\/|\/videos\//i.test(canonical);

        if (videoLike) {
            const videoHtml = await this.fetchPluginHtml('video', canonical);
            const video = await this.chooseVideo(this.parsePluginVideos(videoHtml));
            if (video) return [video];
        }

        const postHtml = await this.fetchPluginHtml('post', canonical);
        const postVideo = await this.chooseVideo(this.parsePluginVideos(postHtml));
        if (postVideo) return [postVideo];

        const images = this.parsePluginImages(postHtml);
        if (images.length) return images;

        return [];
    }

    parsePluginVideos(html) {
        if (!html || typeof html !== 'string') return [];

        const normalized = html
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"')
            .replace(/\\u0025/gi, '%')
            .replace(/\\u0026/gi, '&')
            .replace(/\\u003d/gi, '=')
            .replace(/&amp;/g, '&');

        const patterns = [
            /"hd_src"\s*:\s*"([^"]+)"/i,
            /"sd_src"\s*:\s*"([^"]+)"/i,
            /<video[^>]+src=["']([^"']+)["']/i,
            /<source[^>]+src=["']([^"']+)["']/i
        ];

        const candidates = [];
        const seen = new Set();

        for (const pattern of patterns) {
            const match = normalized.match(pattern);
            if (!match || !/^https?:\/\//i.test(match[1]) || seen.has(match[1])) continue;
            seen.add(match[1]);
            candidates.push({ type: 'video', url: match[1] });
        }

        return candidates;
    }

    async chooseVideo(candidates) {
        const checked = await Promise.all(candidates.map(async (candidate) => ({
            candidate,
            size: await this.getRemoteSize(candidate.url)
        })));

        const fitting = checked.find(item => item.size && item.size <= this.maxMediaSize);
        if (fitting) return fitting.candidate;

        const unknown = checked.find(item => !item.size);
        if (unknown) return unknown.candidate;

        for (const item of checked) {
            logger.warn(`Video ${(item.size / 1024 / 1024).toFixed(2)}MB melebihi limit`);
        }

        return null;
    }

    async getRemoteSize(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': BROWSER_UA,
                    'Range': 'bytes=0-0'
                },
                timeout: 15000,
                validateStatus: () => true,
                responseType: 'arraybuffer'
            });

            const range = response.headers['content-range'];
            const match = range && range.match(/\/(\d+)$/);
            if (match) return Number(match[1]);

            const length = response.headers['content-length'];
            return length ? Number(length) : null;
        } catch (error) {
            return null;
        }
    }

    parsePluginImages(html) {
        if (!html || typeof html !== 'string') return [];

        const normalized = html.replace(/&amp;/g, '&');
        const tags = normalized.match(/<img\b[^>]*>/gi) || [];
        const items = [];
        const seen = new Set();

        for (const tag of tags) {
            const cls = (tag.match(/class=["']([^"']*)["']/i) || [])[1] || '';
            if (!/_1p6f/i.test(cls)) continue;
            if (/_3fnw/i.test(cls)) continue;

            const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1];
            if (!src || /get_thumbnail=1/i.test(src)) continue;
            if (!/^https?:\/\//i.test(src)) continue;
            if (seen.has(src)) continue;

            seen.add(src);
            items.push({ type: 'image', url: src });
        }

        return items.slice(0, this.maxItems);
    }

    async sendMediaItems(sock, msg, items) {
        let sent = 0;

        for (const item of items.slice(0, this.maxItems)) {
            try {
                const buffer = await this.downloadBuffer(item.url, item.type);

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
                logger.warn('Gagal memproses satu media Facebook:', itemError.message);
            }
        }

        return sent;
    }

    async downloadBuffer(url, type) {
        const isImage = type === 'image' || /lookaside\.fbsbx\.com/i.test(url);

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': isImage ? CRAWLER_UA : BROWSER_UA,
                'Accept': isImage
                    ? 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                    : '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.facebook.com/'
            },
            timeout: 60000,
            maxContentLength: this.maxMediaSize,
            maxBodyLength: this.maxMediaSize
        });

        return Buffer.from(response.data);
    }

    async downloadWithYtDlp(url) {
        const timestamp = Date.now();
        const outputTemplate = path.join(this.tempDir, `fb_media_${timestamp}_%(autonumber)03d.%(ext)s`);

        const options = {
            format: 'best',
            output: outputTemplate,
            noWarnings: true
        };

        const cookies = process.env.FB_COOKIES;
        if (cookies && fs.existsSync(cookies)) {
            options.cookies = cookies;
        }

        try {
            await ytdlpExec(this.normalizeUrl(url), options);
        } catch (dlError) {
            logger.warn('yt-dlp error:', dlError.message);
        }

        return fs.readdirSync(this.tempDir)
            .filter(f => f.startsWith(`fb_media_${timestamp}`))
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
                    logger.info('Cleaned up temp file');
                } catch (error) {
                    logger.warn('Failed to cleanup');
                }
            }
        });
    }
}

module.exports = new FacebookDownloader();
