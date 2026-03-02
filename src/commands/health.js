const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const healthChecker = require('../utils/healthChecker');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class HealthCommand {
    constructor() {
        this.commands = [
            { name: 'health', method: 'execute', description: 'Cek Kesehatan Bot' }
        ];
    }
    async execute(msg, sock, messageBody) {
        try {
            logger.info('Memproses command /health');
            await helpers.reactCommandReceived(sock, msg);

            const args = messageBody.replace(/^[\.\/]health\s*/i, '').trim().toLowerCase();

            // Check if update command
            if (args === 'update') {
                return await this.updateYtDlp(msg, sock);
            }

            // Run health check
            await helpers.reactProcessing(sock, msg);

            const results = await healthChecker.checkAll();

            // Send detailed report
            await healthChecker.sendReport(results);

            await helpers.reactSuccess(sock, msg);
            logger.info('Health check completed');

        } catch (error) {
            logger.error('Error running health check:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal menjalankan health check!');
        }
    }

    async updateYtDlp(msg, sock) {
        try {
            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '🔄 Updating yt-dlp binary...\n⏳ Please wait...', 1000);

            const ytdlpPath = require('path').join(__dirname, '../../node_modules/yt-dlp-exec/bin/yt-dlp');
            const { stdout, stderr } = await execPromise(`${ytdlpPath} -U`);

            let message = '✅ *yt-dlp Updated Successfully!*\n\n';
            message += '📦 Update Details:\n';
            message += stdout.split('\n').slice(0, 5).join('\n');

            if (stderr && stderr.includes('ERROR')) {
                throw new Error(stderr);
            }

            await helpers.reactSuccess(sock, msg);
            await helpers.replyWithTyping(sock, msg, message, 1500);

            logger.info('yt-dlp binary updated successfully');

        } catch (error) {
            logger.error('Error updating yt-dlp:', error);
            await helpers.reactError(sock, msg);

            let errorMsg = '❌ Gagal update yt-dlp!\n\n';
            if (error.message.includes('already up to date')) {
                errorMsg = '✅ yt-dlp sudah versi terbaru!';
            } else {
                errorMsg += `Error: ${error.message.substring(0, 200)}`;
            }

            await helpers.replyWithTyping(sock, msg, errorMsg);
        }
    }
}

module.exports = new HealthCommand();
