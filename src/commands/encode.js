const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

// Supported format definitions
const FORMATS = {
    base64: {
        label: 'Base64',
        encode: (s) => Buffer.from(s, 'utf8').toString('base64'),
        decode: (s) => {
            const clean = s.trim().replace(/[\u200b-\u200f\uFEFF\u00a0]/g, '');
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
                throw new Error('Input bukan Base64 yang valid');
            }
            return Buffer.from(clean, 'base64').toString('utf8');
        }
    },
    url: {
        label: 'URL',
        encode: (s) => encodeURIComponent(s),
        decode: (s) => decodeURIComponent(s)
    },
    hex: {
        label: 'Hex',
        encode: (s) => Buffer.from(s, 'utf8').toString('hex'),
        decode: (s) => {
            if (!/^[0-9a-fA-F\s]+$/.test(s)) throw new Error('Input bukan hex yang valid');
            return Buffer.from(s.replace(/\s/g, ''), 'hex').toString('utf8');
        }
    },
    binary: {
        label: 'Binary',
        encode: (s) => [...Buffer.from(s, 'utf8')].map(b => b.toString(2).padStart(8, '0')).join(' '),
        decode: (s) => {
            const bits = s.trim().split(/\s+/);
            if (bits.some(b => !/^[01]{8}$/.test(b))) throw new Error('Input bukan binary 8-bit yang valid');
            return Buffer.from(bits.map(b => parseInt(b, 2))).toString('utf8');
        }
    },
    rot13: {
        label: 'ROT13',
        // ROT13 adalah simetris: encode = decode
        encode: (s) => s.replace(/[a-zA-Z]/g, c => {
            const base = c <= 'Z' ? 65 : 97;
            return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
        }),
        decode: (s) => s.replace(/[a-zA-Z]/g, c => {
            const base = c <= 'Z' ? 65 : 97;
            return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
        })
    },
    html: {
        label: 'HTML Entity',
        encode: (s) => s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;'),
        decode: (s) => s
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    }
};

const FORMAT_ALIASES = {
    b64: 'base64',
    b: 'binary',
    bin: 'binary',
    r13: 'rot13',
    entity: 'html',
    htmlentity: 'html'
};

const USAGE = `📖 *Format yang tersedia:*

| Format | Alias |
|--------|-------|
| \`base64\` | \`b64\` |
| \`url\` | - |
| \`hex\` | - |
| \`binary\` | \`bin\`, \`b\` |
| \`rot13\` | \`r13\` |
| \`html\` | \`entity\` |

💡 *Contoh:*
\`/encode base64 Hello World!\`
\`/decode hex 48656c6c6f\`
\`/encode url https://example.com/path?a=1&b=2\`
\`/decode b64 SGVsbG8h\`
\`/encode rot13 Hello\`

📌 *Tips:* Bisa reply pesan teks lalu ketik hanya \`/encode base64\` tanpa teks.
Cek help kapanpun dengan \`/encode -h\``;

class EncodeCommand {
    constructor() {
        this.commands = [
            { name: 'encode', method: 'encode', description: 'Encode teks (base64, url, hex, dll)' },
            { name: 'decode', method: 'decode', description: 'Decode teks (base64, url, hex, dll)' }
        ];
    }

    async encode(msg, sock, messageBody) {
        return this._process(msg, sock, messageBody, 'encode');
    }

    async decode(msg, sock, messageBody) {
        return this._process(msg, sock, messageBody, 'decode');
    }

    async _process(msg, sock, messageBody, mode) {
        try {
            logger.info(`Memproses command /${mode}`);
            await helpers.reactCommandReceived(sock, msg);

            // Parse: /encode <format> [teks...]
            const rawArgs = messageBody.replace(/^\/(encode|decode)\s*/i, '').trim();
            const parts = rawArgs ? rawArgs.split(/\s+/) : [];
            let formatRaw = parts[0]?.toLowerCase() || '';
            let text = parts.slice(1).join(' ').trim();

            // Help flag eksplisit: /encode -h / --help / help
            if (formatRaw === '-h' || formatRaw === '--help' || formatRaw === 'help') {
                await helpers.reactSuccess(sock, msg);
                return helpers.replyWithTyping(sock, msg, USAGE);
            }

            // Ambil quoted message dulu sebelum apapun
            if (!text) {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    const quotedText = this._getQuotedText(quoted);
                    if (quotedText) text = quotedText;
                }
            }

            // Resolve alias dan cari formatter
            let formatKey = FORMAT_ALIASES[formatRaw] || formatRaw;
            let formatter = FORMATS[formatKey];

            // Kalau format tidak dikenal / kosong → coba auto-detect (khusus decode)
            if (!formatter) {
                if (mode === 'decode' && text) {
                    const detected = this._autoDetectFormat(text);
                    if (detected) {
                        formatKey = detected;
                        formatter = FORMATS[detected];
                        logger.info(`Auto-detected format: ${detected}`);
                    }
                }

                // Jika masih tidak ada formatter, mungkin user tidak tulis format
                // tapi tulis teks langsung (misal: /decode aGFp) → coba treat formatRaw sebagai teks
                if (!formatter && formatRaw && !text && mode === 'decode') {
                    const candidate = rawArgs;
                    const detected = this._autoDetectFormat(candidate);
                    if (detected) {
                        text = candidate;
                        formatKey = detected;
                        formatter = FORMATS[detected];
                        formatRaw = '';
                        logger.info(`Auto-detected format from raw args: ${detected}`);
                    }
                }

                if (!formatter) {
                    await helpers.reactError(sock, msg);
                    return helpers.replyWithTyping(sock, msg,
                        !formatRaw
                            ? `❌ Tidak ada format yang ditentukan!\n\n${USAGE}`
                            : `❌ Format tidak dikenal: \`${formatRaw}\`\n\n${USAGE}`
                    );
                }
            }

            if (!text) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg,
                    `❌ Tidak ada teks yang di-${mode}!\n\n${USAGE}`
                );
            }

            if (text.length > 2000) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Teks terlalu panjang! Maksimal 2000 karakter.');
            }

            await helpers.reactProcessing(sock, msg);

            let result;
            try {
                result = formatter[mode](text);
            } catch (convErr) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, `❌ Gagal ${mode}: ${convErr.message}`);
            }

            const truncResult = result.length > 1800 ? result.substring(0, 1800) + '\n_(dipotong, terlalu panjang)_' : result;
            const response = `\`\`\`${truncResult}\`\`\``;

            await helpers.replyWithTyping(sock, msg, response, 800);
            await helpers.reactSuccess(sock, msg);
            logger.success(`${mode} ${formatter.label} berhasil`);

        } catch (error) {
            logger.error(`Error in /${mode}:`, error);
            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, `❌ Terjadi kesalahan saat ${mode}. Coba lagi.`);
        }
    }

    _autoDetectFormat(text) {
        const t = text.trim();
        // Binary: hanya 0/1 berkelompok 8 bit
        if (/^[01]{8}(\s[01]{8})*$/.test(t)) return 'binary';
        // Hex: hanya karakter hex tanpa spasi
        if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0 && t.length >= 4) return 'hex';
        // URL-encoded: ada %XX
        if (/%[0-9a-fA-F]{2}/.test(t)) return 'url';
        // HTML entity: ada &...; 
        if (/&(amp|lt|gt|quot|#\d+);/.test(t)) return 'html';
        // Base64: karakter valid + panjang kelipatan 4 (dengan padding =)
        if (/^[A-Za-z0-9+/]+=*$/.test(t) && t.length % 4 === 0 && t.length >= 4) return 'base64';
        return null;
    }

    _getQuotedText(quoted) {
        const m = quoted?.message;
        if (!m) return null;
        const raw = m.conversation
            || m.extendedTextMessage?.text
            || m.imageMessage?.caption
            || m.videoMessage?.caption
            || null;
        if (!raw) return null;
        // Strip backtick code block (```...```) — hasil encode bot sendiri
        const stripped = raw.replace(/^```([\s\S]*?)```$/, '$1').trim();
        // Bersihkan karakter zero-width/invisible dari WA
        return stripped.replace(/[\u200b-\u200f\uFEFF\u00a0\r]/g, '').trim();
    }
}

module.exports = new EncodeCommand();
