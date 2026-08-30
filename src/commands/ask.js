const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config');

class AskCommand {
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
            { name: 'ask', method: 'execute', description: 'Tanya AI Groq (chatbot)' }
        ];
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

    async execute(msg, sock, messageBody) {
        try {
            logger.info('Executing /ask command');
            await helpers.reactCommandReceived(sock, msg);

            if (!config.groqApiKey) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ GROQ_API_KEY belum dikonfigurasi!');
            }

            let promptText = messageBody.replace(/^\/ask\s*/i, '').trim();

            if (!promptText) {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    promptText = this.getTextFromMessage(quoted.message);
                }
            }

            if (!promptText) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Tulis pertanyaan setelah /ask atau reply pesan yang ingin ditanyakan.');
            }

            if (promptText.length > 3000) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Pertanyaan terlalu panjang! (Maks 3000 karakter)');
            }

            await helpers.reactProcessing(sock, msg);

            const completion = await this.createCompletionWithFallback({
                messages: [
                    {
                        role: 'system',
                        content: 'Jawab langsung isi jawaban tanpa pembuka, tanpa label, dan tanpa metadata.'
                    },
                    {
                        role: 'user',
                        content: promptText
                    }
                ],
                temperature: 0.6,
                max_tokens: 800
            });

            const answer = completion.choices?.[0]?.message?.content?.trim();

            if (!answer) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ AI tidak memberikan jawaban. Coba lagi.');
            }

            await helpers.replyWithTyping(sock, msg, answer);
            await helpers.reactSuccess(sock, msg);
        } catch (error) {
            logger.error('Error in /ask:', error.message);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal memproses pertanyaan ke AI.');
        }
    }

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message?.imageMessage?.caption) return message.imageMessage.caption;
        if (message?.videoMessage?.caption) return message.videoMessage.caption;

        if (message?.documentWithCaptionMessage?.message?.documentMessage?.caption) {
            return message.documentWithCaptionMessage.message.documentMessage.caption;
        }
        if (message?.imageWithCaptionMessage?.message?.imageMessage?.caption) {
            return message.imageWithCaptionMessage.message.imageMessage.caption;
        }
        if (message?.videoWithCaptionMessage?.message?.videoMessage?.caption) {
            return message.videoWithCaptionMessage.message.videoMessage.caption;
        }

        return '';
    }
}

module.exports = new AskCommand();
