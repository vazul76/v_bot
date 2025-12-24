const logger = require('./logger');

class BotHelpers {
    /**
     * Simulasi typing dan react emoji
     * @param {Object} msg - Message object
     * @param {Object} client - WhatsApp client
     * @param {number} duration - Durasi typing dalam ms (default 2000)
     */
    async simulateTyping(msg, client, duration = 2000) {
        try {
            const chat = await msg.getChat();
            
            // Send typing indicator
            await chat.sendStateTyping();
            
            // Wait for specified duration
            await this.sleep(duration);
            
            logger.info(`Typing simulation:  ${duration}ms`);
        } catch (error) {
            logger.warn('Failed to simulate typing:', error.message);
        }
    }

    /**
     * React dengan emoji pada pesan
     * @param {Object} msg - Message object
     * @param {string} emoji - Emoji untuk react
     */
    async reactToMessage(msg, emoji) {
        try {
            await msg.react(emoji);
            logger.info(`Reacted with:  ${emoji}`);
        } catch (error) {
            logger.warn(`Failed to react with ${emoji}: `, error.message);
        }
    }

    /**
     * React command received
     */
    async reactCommandReceived(msg) {
        await this.reactToMessage(msg, '🫡');
    }

    /**
     * React success
     */
    async reactSuccess(msg) {
        await this.reactToMessage(msg, '✅');
    }

    /**
     * React error
     */
    async reactError(msg) {
        await this.reactToMessage(msg, '❌');
    }

    /**
     * React processing
     */
    async reactProcessing(msg) {
        await this.reactToMessage(msg, '⏳');
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reply dengan typing simulation
     * @param {Object} msg - Message object
     * @param {Object} client - WhatsApp client
     * @param {string} text - Text to reply
     * @param {number} typingDuration - Duration of typing (default 2000ms)
     */
    async replyWithTyping(msg, client, text, typingDuration = 2000) {
        await this.simulateTyping(msg, client, typingDuration);
        return await msg.reply(text);
    }

    /**
     * Reply media dengan typing simulation
     */
    async replyMediaWithTyping(msg, client, media, quotedMsg = null, options = {}, typingDuration = 2000) {
        await this.simulateTyping(msg, client, typingDuration);
        return await msg.reply(media, quotedMsg, options);
    }
}

module.exports = new BotHelpers();