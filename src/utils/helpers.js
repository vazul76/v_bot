const logger = require('./logger');
const { delay } = require('@whiskeysockets/baileys');

class BotHelpers {
    /**
     * Simulasi typing
     */
    async simulateTyping(sock, msg, duration = 2000) {
        try {
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
            await delay(duration);
            await sock.sendPresenceUpdate('paused', msg.key.remoteJid);
            
            logger.info(`Typing simulation: ${duration}ms`);
        } catch (error) {
            logger.warn('Failed to simulate typing:', error.message);
        }
    }

    /**
     * React dengan emoji pada pesan
     */
    async reactToMessage(sock, msg, emoji) {
        try {
            await sock.sendMessage(msg.key.remoteJid, {
                react: {
                    text: emoji,
                    key: msg.key
                }
            });
            logger.info(`Reacted with:  ${emoji}`);
        } catch (error) {
            logger.warn(`Failed to react with ${emoji}: `, error.message);
        }
    }

    async reactCommandReceived(sock, msg) {
        await this.reactToMessage(sock, msg, '🫡');
    }

    async reactSuccess(sock, msg) {
        await this.reactToMessage(sock, msg, '✅');
    }

    async reactError(sock, msg) {
        await this.reactToMessage(sock, msg, '❌');
    }

    async reactProcessing(sock, msg) {
        await this.reactToMessage(sock, msg, '⏳');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reply text dengan typing simulation & REPLY
     */
    async replyWithTyping(sock, msg, text, typingDuration = 2000) {
        await this.simulateTyping(sock, msg, typingDuration);
        return await sock.sendMessage(msg.key.remoteJid, { text }, {
            quoted: msg
        });
    }

    /**
     * Reply image dengan typing simulation & REPLY
     */
    async replyImageWithTyping(sock, msg, buffer, caption = '', typingDuration = 2000) {
        await this.simulateTyping(sock, msg, typingDuration);
        return await sock.sendMessage(msg.key.remoteJid, {
            image: buffer,
            caption
        }, {
            quoted: msg
        });
    }

    /**
     * Reply video dengan typing simulation & REPLY
     */
    async replyVideoWithTyping(sock, msg, buffer, caption = '', typingDuration = 2000) {
        await this.simulateTyping(sock, msg, typingDuration);
        return await sock.sendMessage(msg.key.remoteJid, {
            video:  buffer,
            caption,
            gifPlayback: false
        }, {
            quoted: msg
        });
    }

    /**
     * Reply audio dengan typing simulation & REPLY
     */
    async replyAudioWithTyping(sock, msg, buffer, typingDuration = 2000) {
        await this.simulateTyping(sock, msg, typingDuration);
        return await sock.sendMessage(msg.key.remoteJid, {
            audio: buffer,
            mimetype: 'audio/mp4'
        }, {
            quoted: msg
        });
    }

    /**
     * Reply sticker dengan typing simulation & REPLY
     */
    async replyStickerWithTyping(sock, msg, buffer, typingDuration = 2000) {
        await this.simulateTyping(sock, msg, typingDuration);
        return await sock.sendMessage(msg.key.remoteJid, {
            sticker: buffer
        }, {
            quoted: msg
        });
    }

    /**
     * Reply document dengan typing simulation & REPLY
     */
    async replyDocumentWithTyping(sock, msg, buffer, fileName, mimetype, caption = '', typingDuration = 2000) {
        await this.simulateTyping(sock, msg, typingDuration);
        return await sock.sendMessage(msg.key.remoteJid, {
            document: buffer,
            fileName,
            mimetype,
            caption
        }, {
            quoted: msg
        });
    }

    /**
     * Get quoted message (Baileys)
     */
    async getQuotedMessage(msg) {
        try {
            const quoted = msg.message?.extendedTextMessage?.contextInfo;
            if (! quoted) return null;

            return {
                message: quoted.quotedMessage,
                sender: quoted.participant,
                id: quoted.stanzaId
            };
        } catch (error) {
            logger.error('Error getting quoted message:', error);
            return null;
        }
    }

    /**
     * Download media from message (Baileys)
     */
    async downloadMedia(sock, msg) {
        try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const buffer = await downloadMediaMessage(msg, 'buffer', {});
            return buffer;
        } catch (error) {
            logger.error('Error downloading media:', error);
            return null;
        }
    }
}

module.exports = new BotHelpers();