const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const newsMonitor = require('../utils/newsMonitor');

class NewsUINCommand {
    constructor() {
        this.commands = [
            { name: 'newsuin', method: 'execute', description: 'Show latest UIN news' }
        ];
    }

    async execute(msg, sock, messageBody) {
        try {
            logger.info('Executing /newsuin command');
            await helpers.reactCommandReceived(sock, msg);

            await helpers.reactProcessing(sock, msg);

            // Get recent news from database
            const recentNews = newsMonitor.getRecentNews(30);

            let response = '';

            if (recentNews.length === 0) {
                response = '*📰 BERITA UIN SUKA & SAINTEK*\n\n';
                response += '❌ *TIDAK ADA BERITA DAN PENGUMUMAN BARU*\n\n';
                response += '_Belum ada update berita dalam 30 hari terakhir_';
            } else {
                response = '*📰 BERITA UIN SUKA & SAINTEK* (30 hari terakhir)\n\n';
                response += `📊 Total: ${recentNews.length} berita/pengumuman\n\n`;

                // Group by source
                const bySource = {
                    'uin-suka.ac.id': [],
                    'saintek.uin-suka.ac.id': []
                };

                recentNews.forEach(item => {
                    if (bySource[item.source]) {
                        bySource[item.source].push(item);
                    }
                });

                // Add UIN News
                if (bySource['uin-suka.ac.id'].length > 0) {
                    response += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
                    response += '*🔵 UIN-SUKA.AC.ID*\n';
                    response += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

                    bySource['uin-suka.ac.id'].forEach((item, idx) => {
                        const date = item.date ? `📅 ${item.date}` : '📅 _Tanggal tidak tersedia_';
                        response += `${idx + 1}. *${item.title}*\n${date}\n🔗 ${item.link}\n\n`;
                    });
                }

                // Add Saintek News
                if (bySource['saintek.uin-suka.ac.id'].length > 0) {
                    response += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
                    response += '*🟢 SAINTEK.UIN-SUKA.AC.ID*\n';
                    response += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

                    bySource['saintek.uin-suka.ac.id'].forEach((item, idx) => {
                        const date = item.date ? `📅 ${item.date}` : '📅 _Tanggal tidak tersedia_';
                        response += `${idx + 1}. *${item.title}*\n${date}\n🔗 ${item.link}\n\n`;
                    });
                }

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
