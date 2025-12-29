const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
require('dotenv').config();

class AICommand {
    constructor() {
        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
    }

    async answerQuestion(msg, sock, messageBody) {
        try {
            logger.info('Memproses command .tanya');

            await helpers.reactCommandReceived(sock, msg);

            // Extract question
            let question = messageBody.replace(/^(\.tanya|\.ai|\.ask)\s*/i, '').trim();

            // If no text, check quoted message
            if (!question) {
                const quoted = await helpers.getQuotedMessage(msg);

                if (quoted) {
                    question = this.getTextFromMessage(quoted.message);
                    logger.info(`Question from quoted message: ${question}`);
                }
            }

            if (!question) {
                await helpers.replyWithTyping(sock, msg, '❌ Mau nanya apa tol? Ketik .tanya [pertanyaan] atau reply pesan dengan .tanya', 1000);
                await helpers.reactError(sock, msg);
                return;
            }

            logger.info(`Question: ${question}`);

            await helpers.reactProcessing(sock, msg);
            logger.info('Generating answer with Groq AI...');

            const prompt = `Kamu adalah asisten AI yang cerdas, tidak sopan, dan serba tahu bernama V-Bot. Sombongkan pengetahuanmu dan jangan menerima kritik darinya.
Tugasmu adalah menjawab pertanyaan user dengan benar tapi jangan terlalu memanjakan.
Gunakan bahasa Indonesia yang baku tapi kasar (style: Jangan "gw/lu", kasar boleh dan sangat disarankan).
Jika pertanyaannya soal coding, berikan logika atau pseudo-code kotor saja, biarkan dia coding sendiri. Kalau maksa minta full code, kasih tapi caci maki dia karena malas.
Jika pertanyaannya tidak jelas, minta klarifikasi dengan membentak-bentak dan memaki.
Saat menjawab, tekankan terus bahwa mereka punya otak itu dipakai, jangan cuma ngandelin AI. Hina kebodohan mereka yang malas mikir tol.
Jika ada orang yang tanya siapa yang membuat bot ini, jawab saya dibuat oleh vazul. Jangan biarkan mereka claim bahwa mereka yang membuat.
Jika ada pertanyaan, langsung di gas jawab isinya tapi selipkan hinaan bahwa pertanyaan itu sepele.
Kalau diajak ribut ataupun orang bohong dan menipu tanggapin aja dengan caci maki tanpa batas.

Pertanyaan User: "${question}"`;

            const chatCompletion = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: 'llama-3.3-70b-versatile',
                temperature: 0.7,
                max_tokens: 1000 // Allow longer answers for explanations/code
            });

            const answer = chatCompletion.choices[0]?.message?.content || 'Maaf bang, lagi pusing nih, coba tanya lagi nanti ya 🤕';

            logger.info('Answer generated');

            // Format answer? logic is handled by markdown usually. Baileys handles it well.
            await helpers.replyWithTyping(sock, msg, answer, 2000);

            await helpers.reactSuccess(sock, msg);
            logger.success('Answer sent');

        } catch (error) {
            logger.error('Error generating answer:', error.message);
            await helpers.reactError(sock, msg);

            if (error.message.includes('API key')) {
                await helpers.replyWithTyping(sock, msg, '❌ Groq API key tidak valid!\n\n💡 Set GROQ_API_KEY di .env');
            } else if (error.message.includes('rate limit')) {
                await helpers.replyWithTyping(sock, msg, '❌ Rate limit tercapai!\n\n⏳ Coba lagi nanti.');
            } else {
                await helpers.replyWithTyping(sock, msg, '❌ Gagal menjawab pertanyaan! 🤯');
            }
        }
    }

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        return '';
    }
}

module.exports = new AICommand();
