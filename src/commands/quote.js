const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config');

class QuoteCommand {
    constructor() {
        this.groq = new Groq({
            apiKey: config.groqApiKey
        });
    }

    async sendQuote(msg, sock, messageBody) {  // ← Add messageBody parameter
        try {
            logger.info('Memproses command .quote');

            await helpers.reactCommandReceived(sock, msg);

            // ✅ NEW: Extract text dari command
            let context = messageBody.replace(/^\.quote\s*/i, '').trim();

            // Jika gak ada text di command, cek quoted message
            if (!context) {
                const quoted = await helpers.getQuotedMessage(msg);
                
                if (quoted) {
                    context = this.getTextFromMessage(quoted.message);
                    logger.info(`Quote with quoted context: ${context}`);
                }
            } else {
                logger.info(`Quote with text parameter: ${context}`);
            }

            await helpers.reactProcessing(sock, msg);

            logger.info('Generating quote with Groq AI...');

            let prompt;
            
            if (context) {
                // Dengan context (dari parameter atau quoted)
                prompt = `Seseorang mengatakan:  "${context}"\n\nBerikan satu quote motivasi yang relevan dan menyemangati dalam bahasa Indonesia sebagai respon. Hanya quote-nya saja, tanpa penjelasan tambahan.`;
            } else {
                // Random quote (no context)
                prompt = 'Berikan satu quote motivasi yang inspiratif dan bermakna dalam bahasa Indonesia.Hanya quote-nya saja, tanpa penjelasan tambahan.';
            }

            const chatCompletion = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.8,
                max_tokens: 200
            });

            const quote = chatCompletion.choices[0]?.message?.content || 'Terus berjuang dan jangan menyerah!  💪';

            logger.info('Quote generated');

            const formattedQuote = `${quote}`;

            await helpers.replyWithTyping(sock, msg, formattedQuote, 2000);

            await helpers.reactSuccess(sock, msg);
            logger.success('Quote sent');

        } catch (error) {
            logger.error('Error generating quote:', error.message);
            await helpers.reactError(sock, msg);

            if (error.message.includes('API key')) {
                await helpers.replyWithTyping(sock, msg, '❌ Groq API key tidak valid!\n\n💡 Set GROQ_API_KEY di .env');
            } else if (error.message.includes('rate limit')) {
                await helpers.replyWithTyping(sock, msg, '❌ Rate limit tercapai!\n\n⏳ Coba lagi nanti.');
            } else {
                await helpers.replyWithTyping(sock, msg, '❌ Gagal membuat quote! ');
            }
        }
    }

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        return '';
    }
}

module.exports = new QuoteCommand();