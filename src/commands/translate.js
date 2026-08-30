const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config');

class TranslateCommand {
    constructor() {
        this.groq = new Groq({
            apiKey: config.groqApiKey
        });

        this.modelCandidates = [
            config.groqModel,
            'openai/gpt-oss-20b',
            'groq/compound-mini',
            'qwen/qwen3.8-27b',
            'qwen/qwen3.6-27b',
            'openai/gpt-oss-120b'
        ].filter((value, index, arr) => value && arr.indexOf(value) === index);

        this.commands = [
            { name: 'tr', method: 'translate', description: 'Translate AI (id, en, jp)' }
        ];

        this.langMap = {
            'id': 'Bahasa Indonesia',
            'en': 'English',
            'eng': 'English',
            'jp': 'Japanese'
        };
    }

    async createCompletionWithFallback(payload) {
        let lastError = null;

        for (const model of this.modelCandidates) {
            try {
                return await this.groq.chat.completions.create({
                    ...payload,
                    model
                });
            } catch (error) {
                lastError = error;
                const errorCode = error?.error?.code || '';
                const message = error?.message || '';
                const isModelError = errorCode === 'model_not_found' ||
                    errorCode === 'model_decommissioned' ||
                    message.includes('does not exist or you do not have access') ||
                    message.includes('decommissioned');

                if (!isModelError) {
                    throw error;
                }

                logger.warn(`Groq model ${model} unavailable, trying next model candidate`);
            }
        }

        throw lastError || new Error('No Groq model available');
    }

    async translate(msg, sock, messageBody) {
        try {
            logger.info('Memproses command .tr');

            await helpers.reactCommandReceived(sock, msg);

            // Check if API key exists
            if (!config.groqApiKey) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ GROQ_API_KEY belum dikonfigurasi!\n\n📝 Tambahkan GROQ_API_KEY di file .env untuk menggunakan fitur translate.');
            }

            // Parse args: .tr [lang] [text?]
            const args = messageBody.trim().split(/\s+/);
            const targetLangCode = args[1]?.toLowerCase();

            if (!targetLangCode || !this.langMap[targetLangCode]) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format salah atau bahasa tidak didukung!\n\nBahasa tersedia:\n- id (Indonesia)\n- en (Inggris)\n- jp (Jepang)\n\nContoh:\n/tr id (sambil reply pesan)\n/tr en Selamat pagi');
            }

            const targetLangName = this.langMap[targetLangCode];

            // Get text source (Direct args or Quoted)
            let textToTranslate = args.slice(2).join(' '); // Direct text

            if (!textToTranslate) {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    textToTranslate = this.getTextFromMessage(quoted.message);
                    logger.info('Translating quoted message');
                }
            }

            if (!textToTranslate) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Tidak ada teks yang akan diterjemahkan!');
            }

            if (textToTranslate.length > 500) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Teks terlalu panjang! (Maks 500 karakter)');
            }

            await helpers.reactProcessing(sock, msg);
            logger.info(`Translating to ${targetLangName}: "${textToTranslate}"`);

            // Call Groq AI
            const prompt = `Translate the following text to ${targetLangName}. 
            Source text: "${textToTranslate}"
            
            IMPORTANT: Output ONLY the translation. Do not add any explanation or notes.`;

            const chatCompletion = await this.createCompletionWithFallback({
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 300
            });

            const translation = chatCompletion.choices[0]?.message?.content || 'Gagal menerjemahkan.';

            await helpers.replyWithTyping(sock, msg, `${translation}`);
            await helpers.reactSuccess(sock, msg);
            logger.success('Translation sent');

        } catch (error) {
            logger.error('Error translating:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal menerjemahkan! Cek API Key atau koneksi.');
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

module.exports = new TranslateCommand();
