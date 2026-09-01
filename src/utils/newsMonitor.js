const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const webScraper = require('./webScraper');

class NewsMonitor {
    constructor() {
        this.dataDir = path.join(__dirname, '../../data');
        this.seenFile = path.join(this.dataDir, 'seen_news.json');
        this.lastNewsFile = path.join(this.dataDir, 'last_news.json');
        this.seenNews = {};
        this.lastNews = [];
        this.sock = null;
        this.adminNumber = null;
        this.checkInterval = null;

        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        this.loadSeenNews();
        this.loadLastNews();
    }

    loadSeenNews() {
        try {
            if (fs.existsSync(this.seenFile)) {
                const data = fs.readFileSync(this.seenFile, 'utf8');
                this.seenNews = JSON.parse(data);
                logger.info('Loaded seen news database');
            }
        } catch (error) {
            logger.warn('Failed to load seen news, starting fresh:', error.message);
            this.seenNews = {};
        }
    }

    loadLastNews() {
        try {
            if (fs.existsSync(this.lastNewsFile)) {
                const data = fs.readFileSync(this.lastNewsFile, 'utf8');
                this.lastNews = JSON.parse(data);
                logger.info('Loaded last news database');
            }
        } catch (error) {
            logger.warn('Failed to load last news, starting fresh:', error.message);
            this.lastNews = [];
        }
    }

    saveSeenNews() {
        try {
            fs.writeFileSync(this.seenFile, JSON.stringify(this.seenNews, null, 2));
        } catch (error) {
            logger.error('Failed to save seen news:', error.message);
        }
    }

    saveLastNews() {
        try {
            fs.writeFileSync(this.lastNewsFile, JSON.stringify(this.lastNews, null, 2));
        } catch (error) {
            logger.error('Failed to save last news:', error.message);
        }
    }

    addSeenNews(source, hash) {
        if (!this.seenNews[source]) {
            this.seenNews[source] = {};
        }
        this.seenNews[source][hash] = new Date().toISOString();
        this.saveSeenNews();
    }

    isNewItem(source, hash) {
        if (!this.seenNews[source] || !this.seenNews[source][hash]) {
            return true;
        }
        return false;
    }

    async checkForUpdates() {
        try {
            logger.info('Checking for news updates...');

            const [uinNews, saintekNews] = await Promise.all([
                webScraper.scrapeUINNews(),
                webScraper.scrapeSaintekAnnouncements()
            ]);

            const newItems = [];

            // Check UIN News
            for (const item of uinNews) {
                const hash = webScraper.contentHash(item);
                if (this.isNewItem('uin-news', hash)) {
                    newItems.push(item);
                    this.addSeenNews('uin-news', hash);
                }
            }

            // Check Saintek News
            for (const item of saintekNews) {
                const hash = webScraper.contentHash(item);
                if (this.isNewItem('saintek-news', hash)) {
                    newItems.push(item);
                    this.addSeenNews('saintek-news', hash);
                }
            }

            if (newItems.length > 0) {
                logger.info(`Found ${newItems.length} new items`);
                await this.notifyAdmin(newItems);
            } else {
                logger.info('No new items found');
            }

        } catch (error) {
            logger.error('Error checking updates:', error.message);
        }
    }

    async notifyAdmin(items) {
        if (!this.sock || !this.adminNumber) {
            logger.warn('Socket or admin number not configured for news notifications');
            return;
        }

        for (const item of items) {
            try {
                const message = this.formatMessage(item);
                logger.info(`Sending news to admin: ${item.title.substring(0, 50)}...`);

                // Send to admin via WhatsApp
                await this.sock.sendMessage(this.adminNumber, {
                    text: message
                });

                // Save to lastNews with metadata
                this.lastNews.unshift({
                    ...item,
                    sentAt: new Date().toISOString()
                });

                // Keep only last 50 news
                if (this.lastNews.length > 50) {
                    this.lastNews = this.lastNews.slice(0, 50);
                }

                this.saveLastNews();

                // Small delay between messages
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                logger.error('Failed to send news notification:', error.message);
            }
        }
    }

    formatMessage(item) {
        let message = '*📰 UIN NEWS :*\n\n';
        message += `*${item.title}*\n`;
        
        if (item.date) {
            message += `📅 _${item.date}_\n`;
        }
        
        message += `\n*Link:* ${item.link}`;

        return message;
    }

    start(sock, adminNumber, intervalMinutes = 300) {
        this.sock = sock;
        this.adminNumber = adminNumber;

        logger.info(`Starting news monitor (every ${intervalMinutes} minutes = ${(intervalMinutes / 60).toFixed(1)} hours)`);

        // First check immediately
        this.checkForUpdates();

        // Then check periodically
        this.checkInterval = setInterval(() => {
            this.checkForUpdates();
        }, intervalMinutes * 60 * 1000);
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            logger.info('News monitor stopped');
        }
    }

    async manualCheck() {
        await this.checkForUpdates();
    }

    cleanupOldRecords(daysToKeep = 30) {
        try {
            const now = new Date().getTime();
            const millisPerDay = 24 * 60 * 60 * 1000;
            const cutoffTime = now - (daysToKeep * millisPerDay);

            let deletedCount = 0;
            let totalCount = 0;

            for (const source in this.seenNews) {
                for (const hash in this.seenNews[source]) {
                    totalCount++;
                    const timestamp = new Date(this.seenNews[source][hash]).getTime();
                    
                    if (timestamp < cutoffTime) {
                        delete this.seenNews[source][hash];
                        deletedCount++;
                    }
                }

                // Remove empty source entries
                if (Object.keys(this.seenNews[source]).length === 0) {
                    delete this.seenNews[source];
                }
            }

            if (deletedCount > 0) {
                this.saveSeenNews();
                const fileSizeBefore = fs.statSync(this.seenFile).size / 1024; // KB
                const fileSizeAfter = fs.statSync(this.seenFile).size / 1024;
                
                logger.info(`🗑️  Cleanup completed! Deleted ${deletedCount}/${totalCount} old records (${daysToKeep} days retention)`);
                logger.info(`File size: ${fileSizeBefore.toFixed(2)}KB → ${fileSizeAfter.toFixed(2)}KB`);
            } else {
                logger.info(`✓ No old records to cleanup`);
            }
        } catch (error) {
            logger.error('Error during cleanup:', error.message);
        }
    }

    getRecentNews(daysToCheck = 30) {
        const now = new Date().getTime();
        const millisPerDay = 24 * 60 * 60 * 1000;
        const cutoffTime = now - (daysToCheck * millisPerDay);

        const recentNews = this.lastNews.filter(item => {
            const itemTime = new Date(item.scrapedAt).getTime();
            return itemTime >= cutoffTime;
        });

        return recentNews;
    }

    getLatestNews(limit = 10) {
        if (!Array.isArray(this.lastNews) || this.lastNews.length === 0) {
            return [];
        }

        return this.lastNews.slice(0, limit);
    }
}

module.exports = new NewsMonitor();
