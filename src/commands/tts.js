const googleTTS = require('google-tts-api');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class TTSCommand {
    async createAudio(msg, sock, messageBody) {
        try {
            logger.info('Memproses command .say');

            await helpers.reactCommandReceived(sock, msg);

            let text = messageBody.replace(/^\.say\s*/i, '').trim();

            // Jika tidak ada text, cek quoted message
            if (!text) {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    text = this.getTextFromMessage(quoted.message);
                    logger.info('Mengambil teks dari quoted message');
                }
            }

            if (!text) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Masukkan teks atau reply pesan!\n\nContoh:\n.say Halo dunia');
            }

            if (text.length > 200) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Teks terlalu panjang! (Maks 200 karakter)');
            }

            // Simple Auto-Detect Language features
            let lang = 'id'; // Default

            // Check for Arabic characters
            if (/[\u0600-\u06FF]/.test(text)) {
                lang = 'ar';
            }
            // Check for Japanese characters (Hiragana, Katakana, Kanji)
            else if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(text)) {
                lang = 'ja';
            }
            // Check if text is purely English (basic heuristic: common english words or structure? - keeping it simple for now)
            // Or maybe just let 'id' read english with indo accent (funny) unless user specifies.
            // But let's stick to script detection for now to fix the "silent" issue.

            logger.info(`Converting text to audio (${lang}): "${text}"`);
            await helpers.reactProcessing(sock, msg);

            // Get Audio URL
            const url = googleTTS.getAudioUrl(text, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com',
            });

            logger.info(`Sending audio (${lang})...`);

            // Send as PTT (Voice Note)
            await sock.sendMessage(msg.key.remoteJid, {
                audio: { url: url },
                mimetype: 'audio/mp4',
                ptt: true
            }, { quoted: msg });

            await helpers.reactSuccess(sock, msg);
            logger.success('Audio sent successfully');

        } catch (error) {
            logger.error('Error creating TTS:', error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal membuat audio!');
        }
    }

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message?.imageMessage?.caption) return message.imageMessage.caption;
        if (message?.videoMessage?.caption) return message.videoMessage.caption;
        return '';
    }
}

module.exports = new TTSCommand();
