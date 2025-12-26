const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class PollCommand {
    async createPoll(msg, sock, messageBody) {
        try {
            // Remove command (.poll or .pool)
            const content = messageBody.replace(/^[\.](poll|pool)\s+/i, '').trim();

            // Split by comma or pipe
            let parts = content.split(',').map(p => p.trim()).filter(p => p.length > 0);

            // Fallback to pipe | if parts are insufficient with comma
            if (parts.length < 3 && content.includes('|')) {
                parts = content.split('|').map(p => p.trim()).filter(p => p.length > 0);
            }

            if (parts.length < 3) {
                await helpers.reactError(sock, msg);
                await helpers.replyWithTyping(sock, msg, '❌ Format salah!\n\nContoh:\n.poll Makan apa?, Nasi Goreng, Mie Ayam\n\n(Minimal ada 1 pertanyaan dan 2 opsi)');
                return;
            }

            const question = parts[0];
            const options = parts.slice(1);

            logger.info(`Creating poll: "${question}" with options: ${options.join(', ')}`);
            await helpers.reactCommandReceived(sock, msg);

            // Send Poll
            await sock.sendMessage(msg.key.remoteJid, {
                poll: {
                    name: question,
                    values: options,
                    selectableCount: 1
                }
            });

            logger.success('Poll sent successfully');

        } catch (error) {
            logger.error('Error creating poll:', error);
            await helpers.reactError(sock, msg);
        }
    }
}

module.exports = new PollCommand();
