const Groq = require('groq-sdk');
const axios = require('axios');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const config = require('../config');

const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

class AskCommand {
    constructor() {
        this.groq = new Groq({
            apiKey: config.groqApiKey
        });

        // Gemini = provider utama. Urutan ini dipakai kalau satu model kena limit/503.
        this.geminiModelCandidates = [
            config.geminiModel,
            'gemini-3.6-flash',
            'gemini-3.5-flash',
            'gemini-flash-lite-latest'
        ].filter((value, index, arr) => value && arr.indexOf(value) === index);

        // Groq = cadangan kalau semua model Gemini gagal.
        this.groqModelCandidates = [
            config.groqModel,
            'openai/gpt-oss-120b',
            'qwen/qwen3.6-27b'
        ].filter((value, index, arr) => value && arr.indexOf(value) === index);
    }

    /**
     * Panggil Gemini lewat endpoint OpenAI-compatible.
     * Return shape dibuat sama dengan Groq: { choices: [{ message: { content } }] }
     */
    async callGemini(payload, model) {
        const response = await axios.post(
            GEMINI_OPENAI_URL,
            { ...payload, model },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.geminiApiKey}`
                },
                timeout: 30000,
                validateStatus: () => true
            }
        );

        const data = response.data;

        if (response.status >= 200 && response.status < 300 && data?.choices?.length) {
            return data;
        }

        const apiError = Array.isArray(data) ? data[0]?.error : data?.error;
        const error = new Error(apiError?.message || `Gemini HTTP ${response.status}`);
        error.status = response.status;
        error.code = apiError?.status || apiError?.code;
        throw error;
    }

    /**
     * Gemini dulu (dengan fallback antar model), Groq hanya cadangan.
     */
    async createCompletionWithFallback(payload) {
        const errors = [];

        const hasContent = (result) => {
            const content = result?.choices?.[0]?.message?.content;
            return typeof content === 'string' && content.trim().length > 0;
        };

        if (config.geminiApiKey) {
            for (const model of this.geminiModelCandidates) {
                try {
                    const result = await this.callGemini(payload, model);
                    if (!hasContent(result)) throw new Error('respons kosong');
                    return result;
                } catch (error) {
                    errors.push(`gemini/${model}: ${error.message}`);
                    logger.warn(`Gemini model ${model} gagal (${error.status || error.code || '?'}): ${error.message}`);
                }
            }
        } else {
            logger.warn('GEMINI_API_KEY tidak diset, langsung memakai Groq sebagai cadangan');
        }

        if (config.groqApiKey) {
            for (const model of this.groqModelCandidates) {
                try {
                    const result = await this.groq.chat.completions.create({
                        ...payload,
                        model
                    });
                    if (!hasContent(result)) throw new Error('respons kosong');
                    return result;
                } catch (error) {
                    errors.push(`groq/${model}: ${error.message}`);
                    logger.warn(`Groq model ${model} gagal: ${error.message}`);
                }
            }
        }

        throw new Error(`Semua provider AI gagal: ${errors.join(' | ') || 'tidak ada API key'}`);
    }

    hasAiConfig() {
        return Boolean(config.geminiApiKey || config.groqApiKey);
    }

    /**
     * Parse JSON dari output AI. Model kadang membungkus dengan ```json ... ```.
     */
    parseJsonLoose(raw) {
        if (!raw) return null;

        const text = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();

        try {
            return JSON.parse(text);
        } catch {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try {
                    return JSON.parse(text.slice(start, end + 1));
                } catch {
                    return null;
                }
            }
            return null;
        }
    }

    /**
     * Router intent: user minta aksi -> AI pilih command dari katalog.
     * Return: { command, args, confidence } atau null.
     */
    async classifyCommandIntent(text, catalogText) {
        if (!this.hasAiConfig()) return null;

        const system = `Kamu adalah router command bot WhatsApp. Pilih SATU command dari daftar berikut yang paling cocok dengan permintaan user.

Daftar command:
${catalogText}

Aturan:
- Balas HANYA JSON valid tanpa markdown, format: {"command":"nama_tanpa_slash_atau_null","args":"argumen","confidence":0.0-1.0}
- Jangan mengarang command di luar daftar.
- Jangan pernah memilih command admin/privat.
- Untuk link, salin URL persis dari pesan user (jangan diubah).
- Isi "args" hanya dengan argumen yang dibutuhkan command (link/teks/tempat/format).
- Jika tidak ada yang cocok atau ragu, pakai command null dan confidence rendah.`;

        const completion = await this.createCompletionWithFallback({
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: String(text || '').slice(0, 2000) }
            ],
            temperature: 0,
            max_tokens: 512
        });

        const parsed = this.parseJsonLoose(completion.choices?.[0]?.message?.content);
        if (!parsed || typeof parsed !== 'object') return null;

        const command = parsed.command ? String(parsed.command).replace(/^\//, '').trim().toLowerCase() : null;
        const args = parsed.args ? String(parsed.args).trim() : '';
        const confidence = Number(parsed.confidence);

        if (!command) return null;

        return {
            command,
            args,
            confidence: Number.isFinite(confidence) ? confidence : 0
        };
    }

    /**
     * Help mode: jawab pertanyaan "cara pakai ..." berdasarkan katalog command.
     */
    async answerCommandHelp(text, catalogText) {
        if (!this.hasAiConfig()) return null;

        const system = `Kamu adalah asisten bot WhatsApp. Jawab pertanyaan user tentang cara memakai fitur bot berdasarkan daftar command berikut.

Daftar command:
${catalogText}

Aturan:
- Jawab dalam Bahasa Indonesia yang santai, jelas, dan singkat.
- Sebutkan command yang relevan beserta contoh pemakaiannya.
- Jangan mengarang command di luar daftar.
- Jika fitur tidak ada di daftar, katakan belum tersedia.
- Jangan menampilkan seluruh menu; cukup command yang relevan dengan pertanyaan.`;

        const completion = await this.createCompletionWithFallback({
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: String(text || '').slice(0, 2000) }
            ],
            temperature: 0.3,
            max_tokens: 1200
        });

        return completion.choices?.[0]?.message?.content?.trim() || null;
    }

    // Generic method for processing AI requests (dipakai auto-chat DM dan trigger tag/reply di grup)
    async processAndReply(sock, msg, promptText, options = {}) {
        try {
            const {
                showReactions = true,
                includeQuotedContext = false,
                preserveQuotedOnlyPrompt = false,
                catalogText = ''
            } = options;

            if (!config.geminiApiKey && !config.groqApiKey) {
                return helpers.replyWithTyping(sock, msg, '❌ API AI belum dikonfigurasi (GEMINI_API_KEY / GROQ_API_KEY).');
            }

            let finalPrompt = (promptText || '').trim();

            if (!finalPrompt) {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    const quotedText = this.getTextFromMessage(quoted.message).trim();
                    if (quotedText) {
                        finalPrompt = quotedText;
                    }
                }
            }

            if (!finalPrompt) {
                return helpers.replyWithTyping(sock, msg, '❌ Tulis pertanyaan dulu ya.');
            }

            if (includeQuotedContext) {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    const quotedText = this.getTextFromMessage(quoted.message).trim();
                    if (quotedText) {
                        const safePrompt = finalPrompt.trim();
                        if (!(preserveQuotedOnlyPrompt && safePrompt === quotedText)) {
                            finalPrompt = `Konteks pesan sebelumnya:\n${quotedText}\n\nPesan user:\n${safePrompt}\n\nJawab sesuai konteks percakapan.`;
                        }
                    }
                }
            }

            if (finalPrompt.length > 3000) {
                return helpers.replyWithTyping(sock, msg, '❌ Pertanyaan terlalu panjang! (Maks 3000 karakter)');
            }

            if (showReactions) {
                await helpers.reactProcessing(sock, msg);
            }

            const baseSystem = 'Jawab langsung isi jawaban tanpa pembuka, tanpa label, dan tanpa metadata.';
            const systemContent = catalogText
                ? `${baseSystem}\n\nJika user bertanya tentang fitur atau command bot, gunakan daftar command berikut. Sebutkan hanya command yang relevan, jangan mengarang command di luar daftar, dan jangan pernah menjalankan command.\n\nDaftar command:\n${catalogText}`
                : baseSystem;

            const completion = await this.createCompletionWithFallback({
                messages: [
                    {
                        role: 'system',
                        content: systemContent
                    },
                    {
                        role: 'user',
                        content: finalPrompt
                    }
                ],
                temperature: 0.6,
                max_tokens: 1500
            });

            const answer = completion.choices?.[0]?.message?.content?.trim();

            if (!answer) {
                return helpers.replyWithTyping(sock, msg, '❌ AI tidak memberikan jawaban. Coba lagi.');
            }

            await helpers.replyWithTyping(sock, msg, answer);
            if (showReactions) {
                await helpers.reactSuccess(sock, msg);
            }
        } catch (error) {
            logger.error('Error in processAndReply:', error.message);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal memproses pertanyaan ke AI.');
        }
    }

    getTextFromMessage(message) {
        const m = this.unwrapMessage(message);

        if (m?.conversation) return m.conversation;
        if (m?.extendedTextMessage?.text) return m.extendedTextMessage.text;
        if (m?.imageMessage?.caption) return m.imageMessage.caption;
        if (m?.videoMessage?.caption) return m.videoMessage.caption;
        if (m?.documentMessage?.caption) return m.documentMessage.caption;

        if (m?.documentWithCaptionMessage?.message?.documentMessage?.caption) {
            return m.documentWithCaptionMessage.message.documentMessage.caption;
        }
        if (m?.imageWithCaptionMessage?.message?.imageMessage?.caption) {
            return m.imageWithCaptionMessage.message.imageMessage.caption;
        }
        if (m?.videoWithCaptionMessage?.message?.videoMessage?.caption) {
            return m.videoWithCaptionMessage.message.videoMessage.caption;
        }

        return '';
    }

    /**
     * Buka wrapper Baileys (ephemeral/view-once) supaya teks quoted tetap terbaca.
     */
    unwrapMessage(message) {
        let m = message;

        while (m) {
            if (m.ephemeralMessage?.message) {
                m = m.ephemeralMessage.message;
                continue;
            }
            if (m.viewOnceMessage?.message) {
                m = m.viewOnceMessage.message;
                continue;
            }
            if (m.viewOnceMessageV2?.message) {
                m = m.viewOnceMessageV2.message;
                continue;
            }
            break;
        }

        return m || message;
    }
}

module.exports = new AskCommand();
