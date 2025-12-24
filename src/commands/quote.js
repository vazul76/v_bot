const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
require('dotenv').config();

class QuoteCommand {
    constructor() {
        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
    }

    async sendQuote(msg) {
        try {
            logger.info('Memproses command .quote');

            // React: Command received
            await helpers.reactCommandReceived(msg);

            // Check if replying to a message
            let context = '';
            if (msg.hasQuotedMsg) {
                try {
                    const quotedMsg = await msg.getQuotedMessage();
                    context = quotedMsg.body || '';
                    logger.info(`Quote with context: ${context}`);
                } catch (error) {
                    logger.warn('Error getting quoted message:', error.message);
                }
            }

            // React: Processing
            await helpers.reactProcessing(msg);

            logger.info('Generating quote with Groq AI...');

            let prompt = 'Berikan satu quote motivasi yang inspiratif dan bermakna dalam bahasa Indonesia.Hanya quote-nya saja, tanpa penjelasan tambahan.';
            
            if (context) {
                prompt = `Seseorang mengatakan: "${context}"\n\nBerikan satu quote motivasi yang relevan dan menyemangati dalam bahasa Indonesia sebagai respon. Hanya quote-nya saja, tanpa penjelasan tambahan.`;
            }

            const chatCompletion = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model:  'llama-3.3-70b-versatile',
                temperature: 0.8,
                max_tokens: 200
            });

            const quote = chatCompletion.choices[0]?.message?.content || 'Terus berjuang dan jangan menyerah!  💪';

            logger.info('Quote generated successfully');

            const formattedQuote = `${quote}\n\n_Terus semangat ya!_`;

            await helpers.simulateTyping(msg, msg.client, 2000);
            await msg.reply(formattedQuote);

            // React: Success
            await helpers.reactSuccess(msg);
            logger.success('Quote sent successfully');

        } catch (error) {
            logger.error('Error generating quote:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(msg);

            if (error.message.includes('API key')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Groq API key tidak valid!\n\n💡 Pastikan GROQ_API_KEY sudah diset di file .env');
            } else if (error.message.includes('rate limit')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Rate limit tercapai!\n\n⏳ Coba lagi beberapa saat.');
            } else {
                await helpers.replyWithTyping(msg, msg.client, '❌ Gagal membuat quote!\n\n💡 Coba lagi nanti.');
            }
        }
    }
}

module.exports = new QuoteCommand();