const logger = require('./logger');
const { delay, jidNormalizedUser } = require('@whiskeysockets/baileys');

const toNumber = (jid) => (jid || '').split('@')[0].split(':')[0];

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
    async replyImageWithTyping(sock, msg, buffer, caption = '', typingDuration = 2000, mentions = []) {
        await this.simulateTyping(sock, msg, typingDuration);

        const content = {
            image: buffer,
            caption
        };

        if (Array.isArray(mentions) && mentions.length) {
            content.mentions = mentions;
        }

        return await sock.sendMessage(msg.key.remoteJid, content, {
            quoted: msg
        });
    }

    /**
     * Reply video dengan typing simulation & REPLY
     */
    async replyVideoWithTyping(sock, msg, buffer, caption = '', typingDuration = 2000, mentions = []) {
        await this.simulateTyping(sock, msg, typingDuration);

        const content = {
            video: buffer,
            caption,
            gifPlayback: false
        };

        if (Array.isArray(mentions) && mentions.length) {
            content.mentions = mentions;
        }

        return await sock.sendMessage(msg.key.remoteJid, content, {
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
     * Reply voice note (PTT) dengan typing simulation & REPLY
     */
    async replyVoiceNoteWithTyping(sock, msg, buffer, mimetype = 'audio/ogg; codecs=opus', typingDuration = 2000) {
        await this.simulateTyping(sock, msg, typingDuration);
        return await sock.sendMessage(msg.key.remoteJid, {
            audio: buffer,
            mimetype,
            ptt: true
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
            const m = msg.message;
            if (!m) return null;

            // contextInfo bisa ada di berbagai tipe message
            const contextInfo =
                m.extendedTextMessage?.contextInfo ||
                m.imageMessage?.contextInfo ||
                m.videoMessage?.contextInfo ||
                m.audioMessage?.contextInfo ||
                m.documentMessage?.contextInfo ||
                m.stickerMessage?.contextInfo ||
                m.buttonsResponseMessage?.contextInfo ||
                m.listResponseMessage?.contextInfo ||
                m.templateButtonReplyMessage?.contextInfo ||
                // Untuk pesan biasa (conversation) yang di-reply, Baileys kadang wrap ke viewOnceMessage
                m.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
                null;

            if (!contextInfo || !contextInfo.quotedMessage) return null;

            return {
                message: contextInfo.quotedMessage,
                sender: contextInfo.participant,
                id: contextInfo.stanzaId
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
            const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                {},
                sock?.updateMediaMessage ? { reuploadRequest: sock.updateMediaMessage } : undefined
            );
            return buffer;
        } catch (error) {
            logger.error('Error downloading media:', error);
            return null;
        }
    }

    /**
     * Ambil nomor pengirim (PN) dari sebuah pesan.
     * WhatsApp kini memakai LID (@lid) sebagai identitas utama, sehingga
     * remoteJid/participant bisa berupa LID. Nomor asli biasanya tetap ikut
     * dikirim di field alternatif (remoteJidAlt / participantAlt).
     * Return: nomor tanpa "@s.whatsapp.net", atau null bila tidak bisa di-resolve.
     */
    async resolveSenderNumber(sock, msg) {
        const key = msg?.key || {};
        const isGroup = (key.remoteJid || '').endsWith('@g.us');
        const primary = isGroup ? key.participant : key.remoteJid;
        const alt = isGroup ? key.participantAlt : key.remoteJidAlt;

        // 1. Nomor biasanya sudah ikut di stanza pesan
        if (typeof primary === 'string' && primary.endsWith('@s.whatsapp.net')) {
            return toNumber(primary);
        }
        if (typeof alt === 'string' && alt.endsWith('@s.whatsapp.net')) {
            return toNumber(alt);
        }

        // 2. Fallback: mapping LID -> PN yang tersimpan di auth_baileys
        const lid = typeof primary === 'string' && primary.endsWith('@lid')
            ? primary
            : (typeof alt === 'string' && alt.endsWith('@lid') ? alt : null);

        if (!lid) return null;

        try {
            const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(lid);
            if (pn) return toNumber(jidNormalizedUser(pn));
        } catch (error) {
            logger.warn(`Gagal resolve LID ${lid} ke nomor: ${error.message}`);
        }

        return null;
    }

    /**
     * Cek apakah nomor (hasil resolveSenderNumber) adalah admin.
     * ADMIN_NUMBER boleh ditulis dengan atau tanpa "@s.whatsapp.net".
     */
    isAdminNumber(number) {
        const admin = toNumber(process.env.ADMIN_NUMBER);
        return !!number && !!admin && number === admin;
    }

    /**
     * Guard untuk command admin-only.
     * Return true bila pengirim admin; bila bukan, kirim penolakan dan return false.
     */
    async requireAdmin(sock, msg, commandName = 'command') {
        const senderNumber = await this.resolveSenderNumber(sock, msg);
        if (this.isAdminNumber(senderNumber)) return true;

        logger.warn(`Unauthorized ${commandName} attempt from ${senderNumber || msg?.key?.remoteJid}`);
        await this.reactError(sock, msg);
        await this.replyWithTyping(sock, msg, '❌ Command ini hanya bisa digunakan oleh admin!');
        return false;
    }
}

module.exports = new BotHelpers();