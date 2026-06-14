const googleTTS = require('google-tts-api');
const axios = require('axios');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class TTSCommand {
    constructor() {
        this.commands = [
            { name: 'say', method: 'createAudio', description: 'Text to Speech (Auto-detect)' }
        ];
    }

    async createAudio(msg, sock, messageBody) {
        try {
            logger.info('Memproses command .say');
            await helpers.reactCommandReceived(sock, msg);

            let text = messageBody.replace(/^[\.\/]say\s*/i, '').trim();

            if (!text) {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    text = this.getTextFromMessage(quoted.message);
                }
            }

            if (!text) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Masukkan teks atau reply pesan!\n\nContoh:\n/say Halo dunia');
            }

            if (text.length > 200) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Teks terlalu panjang! (Maks 200 karakter)');
            }

            let lang = 'id';
            if (/[\u0600-\u06FF]/.test(text)) lang = 'ar';
            else if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(text)) lang = 'ja';

            logger.info(`Converting text to audio (${lang}): "${text}"`);
            await helpers.reactProcessing(sock, msg);

            const url = googleTTS.getAudioUrl(text, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com',
            });

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://translate.google.com/',
                },
                timeout: 10000,
            });

            const audioBuffer = Buffer.from(response.data);
            logger.info(`Sending audio (${lang})...`);

            await helpers.simulateTyping(sock, msg, 1500);
            await sock.sendMessage(msg.key.remoteJid, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `tts_${lang}.mp3`,
                ptt: false
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
