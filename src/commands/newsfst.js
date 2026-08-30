const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const newsMonitor = require('../utils/newsMonitor');

class NewsFSTCommand {
    constructor() {
        this.commands = [
            { name: 'newsfst', method: 'execute', description: 'Show latest announcements from saintek.uin-suka.ac.id' }
        ];

        this.monthMap = {
            januari: 0,
            februari: 1,
            maret: 2,
            april: 3,
            mei: 4,
            juni: 5,
            juli: 6,
            agustus: 7,
            september: 8,
            oktober: 9,
            november: 10,
            desember: 11
        };
    }

    parsePublishedDate(dateText, scrapedAt) {
        if (dateText) {
            // Expected format: "Selasa, 13 Januari 2026"
            const match = dateText.match(/(?:[^,]+,\s*)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
            if (match) {
                const day = Number(match[1]);
                const monthName = match[2].toLowerCase();
                const year = Number(match[3]);
                const month = this.monthMap[monthName];

                if (Number.isInteger(day) && Number.isInteger(year) && month !== undefined) {
                    return new Date(year, month, day).getTime();
                }
            }
        }

        return new Date(scrapedAt || 0).getTime();
    }

    async execute(msg, sock, messageBody) {
        try {
            logger.info('Executing /newsfst command');
            await helpers.reactCommandReceived(sock, msg);

            await helpers.reactProcessing(sock, msg);

            // Prioritize 30-day data, fallback to latest cache when empty
            const recentNews = newsMonitor.getRecentNews(30);
            const recentFSTNews = recentNews.filter(item => item.source === 'saintek.uin-suka.ac.id');
            const usingFallback = recentFSTNews.length === 0;
            const fallbackFSTNews = usingFallback
                ? newsMonitor.getLatestNews(100).filter(item => item.source === 'saintek.uin-suka.ac.id')
                : [];

            const fstNews = (usingFallback ? fallbackFSTNews : recentFSTNews)
                .sort((a, b) => this.parsePublishedDate(b.date, b.scrapedAt) - this.parsePublishedDate(a.date, a.scrapedAt))
                .slice(0, 10);

            let response = '';

            if (fstNews.length === 0) {
                response = '*PENGUMUMAN FST UIN SUKA*\n\n';
                response += '*TIDAK ADA PENGUMUMAN BARU*\n\n';
                response += '_Belum ada data pengumuman saintek.uin-suka.ac.id di cache_';
            } else {
                response = usingFallback
                    ? '*PENGUMUMAN FST UIN SUKA* (10 terakhir dari cache)\n\n'
                    : '*PENGUMUMAN FST UIN SUKA* (30 hari terakhir, max 10)\n\n';
                response += `Total: ${fstNews.length} pengumuman\n\n`;

                response += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
                response += '*SAINTEK.UIN-SUKA.AC.ID*\n';
                response += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

                fstNews.forEach((item, idx) => {
                    const date = item.date ? ` ${item.date}` : ' _Tanggal tidak tersedia_';
                    response += `${idx + 1}. *${item.title}*\n${date}\nLink : ${item.link}\n\n`;
                });

                response += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
                response += `_Update terakhir: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}_`;
            }

            await helpers.reactSuccess(sock, msg);
            return helpers.replyWithTyping(sock, msg, response);

        } catch (error) {
            logger.error('Error in newsfst command:', error.message);
            await helpers.reactError(sock, msg);
            return helpers.replyWithTyping(sock, msg, '❌ Gagal menampilkan pengumuman FST!\n\nError: ' + error.message);
        }
    }
}

module.exports = new NewsFSTCommand();
