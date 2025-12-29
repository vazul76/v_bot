const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const helpers = require('../utils/helpers');
const logger = require('../utils/logger');

const VT_BASE_URL = 'https://www.virustotal.com/api/v3';
const MAX_DIRECT_UPLOAD = 32 * 1024 * 1024; // 32MB

class ScanCommand {
    constructor() {
        this.apiKey = process.env.VT_API_KEY || '';
    }

    async handle(msg, sock, body) {
        try {
            if (!this.apiKey) {
                await helpers.replyWithTyping(sock, msg, '❌ VT_API_KEY belum diset. Tambahkan ke .env atau docker-compose.');
                return;
            }

            await helpers.reactCommandReceived(sock, msg);

            const quoted = await helpers.getQuotedMessage(msg);
            const mediaTarget = this.getMediaTarget(msg, quoted);
            const query = body.replace(/^\.scan\s*/i, '').trim();

            if (mediaTarget) {
                await helpers.reactProcessing(sock, msg);
                return await this.scanFile(mediaTarget, msg, sock);
            }

            if (this.isUrl(query)) {
                await helpers.reactProcessing(sock, msg);
                return await this.scanUrl(query, msg, sock);
            }

            if (this.isHash(query)) {
                await helpers.reactProcessing(sock, msg);
                return await this.scanByHash(query, msg, sock);
            }

            await helpers.replyWithTyping(sock, msg, '❌ Gunakan .scan dengan lampiran file / reply media, URL, atau hash (md5/sha1/sha256).');
            await helpers.reactError(sock, msg);
        } catch (error) {
            logger.error('Error in .scan:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal menjalankan scan. Coba lagi nanti.');
        }
    }

    getMediaTarget(msg, quoted) {
        const hasMedia = (m) => !!(m?.documentMessage || m?.imageMessage || m?.videoMessage || m?.stickerMessage || m?.audioMessage);

        if (hasMedia(msg.message)) {
            return msg;
        }

        if (quoted?.message && hasMedia(quoted.message)) {
            return {
                key: { remoteJid: msg.key.remoteJid, id: quoted.id, fromMe: false },
                message: quoted.message
            };
        }

        return null;
    }

    async scanFile(targetMsg, originalMsg, sock) {
        const buffer = await helpers.downloadMedia(sock, targetMsg);
        if (!buffer) {
            await helpers.replyWithTyping(sock, originalMsg, '❌ Tidak bisa mengambil media. Kirim ulang file atau reply dengan .scan.');
            return await helpers.reactError(sock, originalMsg);
        }

        const fileSize = buffer.length;
        if (fileSize > MAX_DIRECT_UPLOAD) {
            await helpers.replyWithTyping(sock, originalMsg, '❌ File lebih besar dari 32MB. Endpoint free hanya mendukung sampai 32MB.');
            return await helpers.reactError(sock, originalMsg);
        }

        const fileName = this.extractFileName(targetMsg) || 'file.bin';
        const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
        logger.info(`Scanning file ${fileName} (sha256=${sha256})`);

        const existing = await this.safeGetFileReport(sha256);
        if (existing) {
            const text = this.formatReport(existing.attributes?.last_analysis_stats, existing.attributes?.last_analysis_results, {
                title: `File name: ${fileName}`,
                type: existing.attributes?.type_description || 'Unknown',
                size: this.formatSize(existing.attributes?.size || fileSize),
                link: `https://www.virustotal.com/gui/file/${existing.id || sha256}`
            });
            await helpers.replyWithTyping(sock, originalMsg, text);
            return await helpers.reactSuccess(sock, originalMsg);
        }

        const analysisId = await this.uploadFile(buffer, fileName);
        if (!analysisId) {
            await helpers.replyWithTyping(sock, originalMsg, '❌ Upload ke VirusTotal gagal.');
            return await helpers.reactError(sock, originalMsg);
        }

        const analysis = await this.pollAnalysis(analysisId);
        if (!analysis) {
            await helpers.replyWithTyping(sock, originalMsg, '❌ Analisis belum selesai atau gagal.');
            return await helpers.reactError(sock, originalMsg);
        }

        const stats = analysis.attributes?.stats;
        const results = analysis.attributes?.results;
        const text = this.formatReport(stats, results, {
            title: `File name: ${fileName}`,
            type: analysis.attributes?.type || 'File',
            size: this.formatSize(fileSize),
            link: `https://www.virustotal.com/gui/analysis/${analysis.id}`
        });

        await helpers.replyWithTyping(sock, originalMsg, text);
        await helpers.reactSuccess(sock, originalMsg);
    }

    async scanUrl(url, msg, sock) {
        logger.info(`Scanning URL: ${url}`);
        const encodedUrl = Buffer.from(url, 'utf8').toString('base64');

        const existing = await this.safeGetUrlReport(encodedUrl);
        if (existing) {
            const text = this.formatReport(existing.attributes?.last_analysis_stats, existing.attributes?.last_analysis_results, {
                title: `URL: ${url}`,
                type: 'URL',
                size: '-',
                link: `https://www.virustotal.com/gui/url/${existing.id}`
            });
            await helpers.replyWithTyping(sock, msg, text);
            return await helpers.reactSuccess(sock, msg);
        }

        const analysisId = await this.submitUrl(url);
        if (!analysisId) {
            await helpers.replyWithTyping(sock, msg, '❌ Gagal submit URL ke VirusTotal.');
            return await helpers.reactError(sock, msg);
        }

        const analysis = await this.pollAnalysis(analysisId);
        if (!analysis) {
            await helpers.replyWithTyping(sock, msg, '❌ Analisis URL belum selesai atau gagal.');
            return await helpers.reactError(sock, msg);
        }

        const stats = analysis.attributes?.stats;
        const results = analysis.attributes?.results;
        const text = this.formatReport(stats, results, {
            title: `URL: ${url}`,
            type: 'URL',
            size: '-',
            link: `https://www.virustotal.com/gui/url/${analysis.id}`
        });

        await helpers.replyWithTyping(sock, msg, text);
        await helpers.reactSuccess(sock, msg);
    }

    async scanByHash(hash, msg, sock) {
        logger.info(`Scanning by hash: ${hash}`);
        const report = await this.safeGetFileReport(hash);

        if (!report) {
            await helpers.replyWithTyping(sock, msg, '❌ Hash tidak ditemukan di VirusTotal. Coba upload file-nya dengan .scan file.');
            return await helpers.reactError(sock, msg);
        }

        const text = this.formatReport(report.attributes?.last_analysis_stats, report.attributes?.last_analysis_results, {
            title: `Hash: ${hash}`,
            type: report.attributes?.type_description || 'Unknown',
            size: this.formatSize(report.attributes?.size || 0),
            link: `https://www.virustotal.com/gui/file/${report.id || hash}`
        });

        await helpers.replyWithTyping(sock, msg, text);
        await helpers.reactSuccess(sock, msg);
    }

    async safeGetFileReport(hash) {
        try {
            const { data } = await axios.get(`${VT_BASE_URL}/files/${hash}`, {
                headers: { 'x-apikey': this.apiKey }
            });
            return data.data;
        } catch (error) {
            if (error.response?.status === 404) return null;
            logger.warn('Get file report failed:', error.response?.status, error.message);
            return null;
        }
    }

    async safeGetUrlReport(encodedId) {
        try {
            const { data } = await axios.get(`${VT_BASE_URL}/urls/${encodedId}`, {
                headers: { 'x-apikey': this.apiKey }
            });
            return data.data;
        } catch (error) {
            if (error.response?.status === 404) return null;
            logger.warn('Get URL report failed:', error.response?.status, error.message);
            return null;
        }
    }

    async uploadFile(buffer, fileName) {
        try {
            const form = new FormData();
            form.append('file', buffer, { filename: fileName });

            const { data } = await axios.post(`${VT_BASE_URL}/files`, form, {
                headers: {
                    ...form.getHeaders(),
                    'x-apikey': this.apiKey
                }
            });

            return data.data?.id || null;
        } catch (error) {
            logger.error('Upload file failed:', error.response?.status, error.message);
            return null;
        }
    }

    async submitUrl(url) {
        try {
            const form = new FormData();
            form.append('url', url);

            const { data } = await axios.post(`${VT_BASE_URL}/urls`, form, {
                headers: {
                    ...form.getHeaders(),
                    'x-apikey': this.apiKey
                }
            });

            return data.data?.id || null;
        } catch (error) {
            logger.error('Submit URL failed:', error.response?.status, error.message);
            return null;
        }
    }

    async pollAnalysis(id) {
        for (let i = 0; i < 10; i++) {
            try {
                const { data } = await axios.get(`${VT_BASE_URL}/analyses/${id}`, {
                    headers: { 'x-apikey': this.apiKey }
                });

                const status = data.data?.attributes?.status;
                if (status === 'completed') {
                    return data.data;
                }

                await helpers.sleep(3000);
            } catch (error) {
                logger.warn('Polling analysis failed:', error.response?.status, error.message);
                await helpers.sleep(2000);
            }
        }

        return null;
    }

    formatReport(stats = {}, results = {}, meta = {}) {
        const totalEngines = Object.keys(results || {}).length || Object.values(stats || {}).reduce((acc, n) => acc + (n || 0), 0) || 0;
        const detections = (stats.malicious || 0) + (stats.suspicious || 0);

        const engines = this.pickEngines(results, 25);
        const engineLines = engines.length ? engines.join('\n') : 'Tidak ada detail engine.';

        return [
            `🧬 Detections: ${detections} / ${totalEngines || '??'}`,
            '',
            engineLines,
            '',
            `🔖 ${meta.title || 'Scan result'}`,
            `🔒 ${meta.type || '-'}`,
            `📁 ${meta.size || '-'}`,
            '',
            `⚜️ Link to VirusTotal (${meta.link || 'https://www.virustotal.com/'})`
        ].join('\n');
    }

    pickEngines(results = {}, limit = 25) {
        const entries = Object.values(results || {});
        const score = (cat) => {
            if (cat === 'malicious') return 3;
            if (cat === 'suspicious') return 2;
            if (cat === 'undetected') return 1;
            return 1;
        };

        return entries
            .sort((a, b) => score(b.category) - score(a.category))
            .slice(0, limit)
            .map((r) => {
                const mark = (r.category === 'malicious' || r.category === 'suspicious') ? '❌' : '✅';
                const detail = r.result ? ` (${r.result})` : '';
                return `${mark} ${r.engine_name}${detail}`;
            });
    }

    formatSize(bytes) {
        if (!bytes) return '-';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
        return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
    }

    extractFileName(msg) {
        return msg.message?.documentMessage?.fileName || null;
    }

    isUrl(text) {
        if (!text) return false;
        return /^https?:\/\/\S+/i.test(text);
    }

    isHash(text) {
        if (!text) return false;
        const hex = text.toLowerCase();
        return (/^[a-f0-9]{32}$/i.test(hex) || /^[a-f0-9]{40}$/i.test(hex) || /^[a-f0-9]{64}$/i.test(hex));
    }
}

module.exports = new ScanCommand();
