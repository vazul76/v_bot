const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const newsMonitor = require('../utils/newsMonitor');

class NewsUINCommand {
    constructor() {
        this.commands = [
            { name: 'newsuin', method: 'execute', description: 'Show latest news from uin-suka.ac.id' }
        ];
    }

    async execute(msg, sock, messageBody) {
        try {
            logger.info('Executing /newsuin command');
            await helpers.reactCommandReceived(sock, msg);

            await helpers.reactProcessing(sock, msg);

            // Prioritize 30-day data, fallback to latest cache when empty
            const recentNews = newsMonitor.getRecentNews(30);

            let response = '';

            const recentUINNews = recentNews.filter(item => item.source === 'uin-suka.ac.id');
            const usingFallback = recentUINNews.length === 0;
            const fallbackUINNews = usingFallback
                ? newsMonitor.getLatestNews(100).filter(item => item.source === 'uin-suka.ac.id')
                : [];

            const uinNews = (usingFallback ? fallbackUINNews : recentUINNews)
                .sort((a, b) => new Date(b.scrapedAt || 0).getTime() - new Date(a.scrapedAt || 0).getTime())
                .slice(0, 10);

            if (uinNews.length === 0) {
                response = '*BERITA UIN SUKA*\n\n';
                response += '*TIDAK ADA BERITA BARU*\n\n';
                response += '_Belum ada data berita uin-suka.ac.id di cache_';
            } else {
                response = usingFallback
                    ? '*BERITA UIN SUKA* (10 terakhir dari cache)\n\n'
                    : '*BERITA UIN SUKA* (30 hari terakhir, max 10)\n\n';
                response += `Total: ${uinNews.length} berita\n\n`;

                response += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
                response += '*UIN-SUKA.AC.ID*\n';
                response += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

                uinNews.forEach((item, idx) => {
                    const dateOrScrapeTime = item.date
                        ? ` ${item.date}`
                        : ` Tanggal scrape: ${new Date(item.scrapedAt || Date.now()).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'long', year: 'numeric' })}`;
                    response += `${idx + 1}. *${item.title}*\n${dateOrScrapeTime}\nLink : ${item.link}\n\n`;
                });

                response += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
                response += `_Update terakhir: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}_`;
            }

            await helpers.reactSuccess(sock, msg);
            return helpers.replyWithTyping(sock, msg, response);

        } catch (error) {
            logger.error('Error in newsuin command:', error.message);
            await helpers.reactError(sock, msg);
            return helpers.replyWithTyping(sock, msg, '❌ Gagal menampilkan berita!\n\nError: ' + error.message);
        }
    }
}

module.exports = new NewsUINCommand();
