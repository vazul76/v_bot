const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const newsMonitor = require('../utils/newsMonitor');

class CleanUINCommand {
    constructor() {
        this.commands = [
            { name: 'cleanuin', method: 'execute', description: 'Clean UIN news database' }
        ];
    }

    async execute(msg, sock, messageBody) {
        try {
            // Log command
            logger.info('Executing /cleanuin command');
            await helpers.reactCommandReceived(sock, msg);

            // Get sender info
            const senderId = msg.key.remoteJid;
            const adminNumber = process.env.ADMIN_NUMBER;

            // Check if sender is admin
            if (senderId !== adminNumber) {
                logger.warn(`Unauthorized cleanup attempt from ${senderId}`);
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Command ini hanya bisa digunakan oleh admin!');
            }

            logger.info('Admin authorized, proceeding with cleanup');
            await helpers.reactProcessing(sock, msg);

            // Execute cleanup
            const result = await this.performCleanup();

            // Send result
            await helpers.reactSuccess(sock, msg);
            return helpers.replyWithTyping(sock, msg, result);

        } catch (error) {
            logger.error('Error in cleanuin command:', error.message);
            await helpers.reactError(sock, msg);
            return helpers.replyWithTyping(sock, msg, '❌ Gagal membersihkan database!\n\nError: ' + error.message);
        }
    }

    async performCleanup() {
        try {
            const fs = require('fs');
            const path = require('path');

            const dataDir = path.join(__dirname, '../../data');
            const seenFile = path.join(dataDir, 'seen_news.json');

            let totalRecords = 0;
            let deletedRecords = 0;

            // Count records before cleanup
            if (fs.existsSync(seenFile)) {
                const data = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
                for (const source in data) {
                    totalRecords += Object.keys(data[source]).length;
                }
            }

            // Call cleanup with very aggressive retention (1 day)
            // This will delete almost everything except today's news
            newsMonitor.cleanupOldRecords(1);

            // Count records after cleanup
            if (fs.existsSync(seenFile)) {
                const data = JSON.parse(fs.readFileSync(seenFile, 'utf8'));
                let remainingRecords = 0;
                for (const source in data) {
                    remainingRecords += Object.keys(data[source]).length;
                }
                deletedRecords = totalRecords - remainingRecords;
            }

            const fileSize = fs.existsSync(seenFile) 
                ? (fs.statSync(seenFile).size / 1024).toFixed(2)
                : '0';

            let message = '*🗑️  DATABASE UIN NEWS DIBERSIHKAN!*\n\n';
            message += `📊 *Statistik Cleanup:*\n`;
            message += `Total Records: ${totalRecords}\n`;
            message += `Deleted: ${deletedRecords}\n`;
            message += `Remaining: ${totalRecords - deletedRecords}\n`;
            message += `File Size: ${fileSize} KB\n\n`;
            message += '✅ Database sudah siap untuk update berita baru!';

            logger.success(`Cleanup completed: ${deletedRecords} records deleted`);
            return message;

        } catch (error) {
            logger.error('Cleanup error:', error.message);
            throw error;
        }
    }
}

module.exports = new CleanUINCommand();
