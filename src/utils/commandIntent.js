/**
 * Rule-based command intent:
 * - deteksi prefix salah (.s / !s)
 * - deteksi permintaan menu / bantuan
 * - pencocokan kata kunci (banyak sinonim + fuzzy typo)
 * - ekstraksi argumen (link, teks, tempat, format)
 * - cache + cooldown untuk panggilan AI
 */

const catalog = require('./commandCatalog');

const AI_COOLDOWN_MS = 10 * 1000;          // maksimal 1 panggilan AI / 10 detik / chat
const AI_CACHE_TTL_MS = 10 * 60 * 1000;    // cache hasil AI 10 menit

const aiCooldown = new Map();
const aiCache = new Map();

const MENU_EXACT = new Set([
    'menu', 'help', 'bantuan', 'menu bot', 'bantuan bot', 'daftar command',
    'daftar perintah', 'list command', 'command apa saja', 'command apa aja',
    'fitur apa saja', 'fitur apa aja', 'kamu bisa apa', 'kamu bisa apa aja',
    'kamu bisa ngapain', 'kamu bisa ngapain aja', 'bisa ngapain', 'bisa ngapain aja',
    'apa saja fitur', 'apa aja fitur', 'apa saja command', 'apa aja command',
    'apa saja yang bisa kamu lakukan', 'apa aja yang bisa kamu lakukan',
    'apa saja yang bisa kamu lakuin', 'apa aja yang bisa kamu lakuin',
    'fitur bot', 'menu fitur', 'bisa apa aja', 'bisa apa saja',
    'kamu bisa bantu apa', 'bisa bantu apa aja', 'bisa bantu apa saja',
    'bantuan apa aja', 'bantuan apa saja'
]);

const HELP_WORDS = [
    /\bcara\b/, /\bgimana\b/, /\bbagaimana\b/, /\btutorial\b/,
    /\bpenggunaan\b/, /\bfungsi\b/, /\bcara pakai\b/, /\bpakai gimana\b/
];

const ENCODE_FORMATS = [
    'base64', 'url', 'hex', 'binary', 'rot13', 'html',
    'b64', 'bin', 'b', 'r13', 'entity', 'htmlentity'
];

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return normalize(text).split(' ').filter(Boolean).slice(0, 40);
}

function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function levenshtein(a, b) {
    const s = String(a || '');
    const t = String(b || '');
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    const rows = s.length + 1;
    const cols = t.length + 1;
    const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));

    for (let i = 0; i < rows; i++) dp[i][0] = i;
    for (let j = 0; j < cols; j++) dp[0][j] = j;

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return dp[s.length][t.length];
}

/**
 * Deteksi salah ketuk posisi huruf (transposisi), mis. "dwonload" -> "download".
 */
function isOneTransposition(a, b) {
    const s = String(a || '');
    const t = String(b || '');

    if (s.length !== t.length || s.length < 4) return false;

    const diffs = [];
    for (let i = 0; i < s.length; i++) {
        if (s[i] !== t[i]) diffs.push(i);
        if (diffs.length > 2) return false;
    }

    return diffs.length === 2 &&
        s[diffs[0]] === t[diffs[1]] &&
        s[diffs[1]] === t[diffs[0]];
}

/**
 * Cocokkan satu token user dengan satu token kata kunci.
 * Mendukung typo (levenshtein <= 1), transposisi, dan singkatan/awalan.
 */
function tokenMatches(textToken, keywordToken) {
    const text = String(textToken || '');
    const keyword = String(keywordToken || '');
    if (!text || !keyword) return false;
    if (text === keyword) return true;

    // Typo ringan / huruf tertukar.
    if (text.length >= 4 && keyword.length >= 4 && Math.abs(text.length - keyword.length) <= 2) {
        const distance = levenshtein(text, keyword);
        if (distance <= 1 || isOneTransposition(text, keyword)) return true;
        if (distance === 2 && text.length >= 6 && keyword.length >= 6) return true;
    }

    // Singkatan / awalan, mis. "vid" -> "video", "down" -> "download".
    if (text.length >= 3 && keyword.startsWith(text)) return true;
    if (keyword.length >= 3 && text.startsWith(keyword)) return true;

    return false;
}

function cleanUrl(url) {
    return String(url || '').replace(/[),.;!?\]}]+$/g, '').trim();
}

function extractUrl(text) {
    const raw = String(text || '');

    const withProtocol = raw.match(/\bhttps?:\/\/[^\s<>"']+/i);
    if (withProtocol) return cleanUrl(withProtocol[0]);

    const bare = raw.match(/\b(?:www\.)?(?:youtube\.com|youtu\.be|facebook\.com|fb\.watch|fb\.com|fb\.me|instagram\.com|instagr\.am|tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|threads\.com|threads\.net|x\.com|twitter\.com|t\.co)\/[^\s<>"']+/i);
    if (bare) return cleanUrl(`https://${bare[0]}`);

    return null;
}

function getHost(url) {
    try {
        const parsed = new URL(String(url).startsWith('http') ? url : `https://${url}`);
        return parsed.hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
        return null;
    }
}

function hostMatches(host, hosts = []) {
    if (!host) return false;
    return hosts.some(item => {
        const target = String(item).replace(/^www\./i, '').toLowerCase();
        return host === target || host.endsWith(`.${target}`);
    });
}

function unwrapMessage(message) {
    let current = message;

    for (let i = 0; i < 5 && current; i++) {
        if (current.ephemeralMessage?.message) {
            current = current.ephemeralMessage.message;
        } else if (current.viewOnceMessage?.message) {
            current = current.viewOnceMessage.message;
        } else if (current.viewOnceMessageV2?.message) {
            current = current.viewOnceMessageV2.message;
        } else if (current.documentWithCaptionMessage?.message) {
            current = current.documentWithCaptionMessage.message;
        } else if (current.imageWithCaptionMessage?.message) {
            current = current.imageWithCaptionMessage.message;
        } else if (current.videoWithCaptionMessage?.message) {
            current = current.videoWithCaptionMessage.message;
        } else {
            break;
        }
    }

    return current;
}

function getDirectMediaType(message) {
    const m = unwrapMessage(message);
    if (!m) return null;
    if (m.imageMessage) return 'image';
    if (m.videoMessage) return 'video';
    if (m.stickerMessage) return 'sticker';
    if (m.audioMessage) return 'audio';
    if (m.documentMessage) return 'document';
    return null;
}

function getQuotedMessage(msg) {
    const m = unwrapMessage(msg?.message) || {};
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
        null;

    return contextInfo?.quotedMessage || null;
}

function getMediaType(msg) {
    const direct = getDirectMediaType(msg?.message);
    if (direct) return direct;

    const quoted = getQuotedMessage(msg);
    if (quoted) return getDirectMediaType(quoted);

    return null;
}

function hasRequiredMedia(command, msg) {
    if (!command?.requiresMedia) return true;
    const mediaType = getMediaType(msg);
    if (!mediaType) return false;

    const allowed = command.mediaTypes || [];
    if (allowed.length === 0) return true;
    return allowed.includes(mediaType);
}

function stripPatterns(text, patterns = []) {
    let out = String(text || '').trim();

    for (const pattern of patterns) {
        out = out.replace(pattern, '').trim();
    }

    return out.replace(/^[:\-–—]\s*/, '').trim();
}

function extractArgs(command, text) {
    const raw = String(text || '').trim();
    const name = command?.name;

    if (!name) return '';

    // Downloader: wajib link
    if (['yt', 'ytmp3', 'fb', 'ig', 'tt', 'th', 'x'].includes(name)) {
        return extractUrl(raw) || '';
    }

    if (name === 'scan') {
        const url = extractUrl(raw);
        if (url) return url;

        const hash = raw.match(/\b[a-f0-9]{32,64}\b/i);
        if (hash) return hash[0];

        const stripped = stripPatterns(raw, [
            /^\/?scan\s*/i,
            /^(?:tolong\s+)?cek\s+/i,
            /^(?:tolong\s+)?periksa\s+/i
        ]);

        // "scan file ini" / "cek file ini aman" -> targetnya media, bukan teks argumen.
        if (/^(file(?:nya)?|gambar(?:nya)?|foto(?:nya)?|media(?:nya)?|video(?:nya)?|link(?:nya)?|url(?:nya)?|apakah)\b/i.test(stripped) && !/[/.]/.test(stripped)) {
            return '';
        }

        return stripped;
    }

    if (name === 'qr') {
        return stripPatterns(raw, [
            /^(?:tolong\s+)?(?:generate|bikin|buat)\s+qr\s*code\s*/i,
            /^(?:generate|bikin|buat)\s+qr\s*/i,
            /^qr\s+generator\s*/i,
            /^kode\s+qr\s*/i,
            /^qr\s*code\s*/i,
            /^qrcode\s*/i,
            /^qr\s*/i,
            /^untuk\s+/i,
            /^buat\s+/i
        ]);
    }

    if (name === 'nslookup') {
        return stripPatterns(raw, [
            /^(?:tolong\s+)?(?:nslookup|lookup)\s*/i,
            /^cek\s+ip\s*/i,
            /^cek\s+domain\s*/i,
            /^cek\s+dns\s*/i,
            /^lihat\s+ip\s*/i,
            /^lihat\s+domain\s*/i,
            /^dns\s*/i,
            /^domain\s+/i,
            /^ip\s+address\s*/i,
            /^alamat\s+ip\s*/i,
            /^ip\s+/i,
            /^untuk\s+/i
        ]);
    }

    if (name === 'cuaca') {
        return stripPatterns(raw, [
            /^(?:tolong\s+)?cek\s+cuaca(?:nya)?\s*/i,
            /^prakiraan\s+cuaca(?:nya)?\s*/i,
            /^ramalan\s+cuaca(?:nya)?\s*/i,
            /^(?:cek\s+)?suhu(?:nya)?\s+(?:udara\s+)?/i,
            /^cuaca(?:nya)?\s*/i,
            /^weather(?:nya)?\s*/i,
            /^cek\s+/i,
            /^di\s+/i,
            /^untuk\s+/i,
            /^daerah\s+/i,
            /^kota\s+/i,
            /^kabupaten\s+/i
        ]);
    }

    if (name === 'bbm') {
        return stripPatterns(raw, [
            /^harga\s+bbm\s*/i,
            /^harga\s+bensin\s*/i,
            /^harga\s+pertalite\s*/i,
            /^harga\s+pertamax\s*/i,
            /^harga\s+solar\s*/i,
            /^harga\s+pertamina\s*/i,
            /^cek\s+harga\s*/i,
            /^cek\s+bbm\s*/i,
            /^hari\s+ini\s*/i,
            /^bbm\s*/i,
            /^bensin\s*/i,
            /^di\s+/i,
            /^provinsi\s+/i,
            /^daerah\s+/i,
            /^untuk\s+/i
        ]);
    }

    if (name === 'say') {
        return stripPatterns(raw, [
            /^text\s*to\s*speech\s*/i,
            /^tts\s*/i,
            /^bikin\s+tts\s*/i,
            /^ubah\s+teks(?:\s+ini)?\s+jadi\s+suara\s*/i,
            /^jadikan\s+suara\s*/i,
            /^bikin\s+suara\s*/i,
            /^buat\s+suara\s*/i,
            /^ubah\s+suara\s*/i,
            /^dari\s+teks\s*/i,
            /^voice\s+note(?:\s+dari\s+teks)?\s*/i,
            /^voice\s+/i,
            /^suara\s+/i,
            /^say\s*/i
        ]);
    }

    if (name === 'tr') {
        const lang = /\b(inggris|english|eng|en)\b/i.test(raw)
            ? 'en'
            : /\b(jepang|japanese|jp)\b/i.test(raw)
                ? 'jp'
                : /\b(indonesia|indonesian|id)\b/i.test(raw)
                    ? 'id'
                    : '';

        let out = stripPatterns(raw, [
            /^(?:tolong\s+)?(?:translatein|terjemahin|terjemahkan|translate|terjemah|artikan)\s*/i,
            /^(?:tolong\s+)?ubah\s+(?:ke\s+)?bahasa\s*/i
        ]);

        out = out
            .replace(/^dari\s+bahasa\s+\w+\s+ke\s+bahasa\s+\w+\s*/i, '')
            // Kode bahasa di depan, mis. "en halo" atau "eng: halo".
            .replace(/^(?:inggris|english|eng|en|jepang|japanese|jp|indonesia|indonesian|id)\b[\s:\-]*/i, '')
            .replace(/^(?:ke|dalam)\s+(?:bahasa\s+)?(?:inggris|english|eng|en|jepang|japanese|jp|indonesia|indonesian|id)\s*[:\-]?\s*/i, '')
            .replace(/^(?:ke\s+)?bahasa\s+(?:inggris|jepang|indonesia|english|japanese)\s*/i, '')
            .replace(/^(?:inggris|jepang|indonesia|english|japanese)\s*/i, '')
            // Frasa bahasa di belakang, mis. "halo ke inggris" atau "halo inggris".
            .replace(/[\s,]+(?:ke|dalam)\s+(?:bahasa\s+)?(?:inggris|english|eng|en|jepang|japanese|jp|indonesia|indonesian|id)\s*$/i, '')
            .replace(/[\s,]+(?:inggris|english|eng|en|jepang|japanese|jp|indonesia|indonesian|id)\s*$/i, '')
            .replace(/^[:\-]\s*/, '')
            .trim();

        if (!lang) return '';
        return `${lang} ${out}`.trim();
    }

    if (name === 'encode' || name === 'decode') {
        let out = stripPatterns(raw, [/^(?:encode|decode)\s*/i]);
        const first = out.split(/\s+/)[0]?.toLowerCase();

        if (!ENCODE_FORMATS.includes(first)) return '';

        const rest = out.slice(first.length).trim();
        return `${first} ${rest}`.trim();
    }

    if (name === 'poll') {
        return stripPatterns(raw, [
            /^(?:tolong\s+)?(?:buat|bikin)\s+poll(?:ing)?\s*/i,
            /^(?:buat|bikin)\s+vote\s*/i,
            /^voting\s*/i,
            /^poll(?:ing)?\s*/i
        ]);
    }

    if (name === 'stext') {
        if (/\b(teks|tulisan)\b/i.test(raw)) {
            const stripped = stripPatterns(raw, [
                /^(?:bikin|buat|bikinin)?\s*stiker\s+(?:pakai|pake|dengan|ada)\s+(?:teks|tulisan)\s*/i,
                /^(?:bikin|buat|bikinin)?\s*stiker\s+(?:teks|tulisan)\s*/i,
                /^(?:tambah|tambahkan)\s+(?:teks|tulisan)\s+(?:ke\s+)?stiker\s*/i,
                /^(?:stiker|sticker)\s+(?:pakai|pake|dengan|ada)\s+(?:teks|tulisan)\s*/i,
                /^(?:stiker|sticker)\s+(?:teks|tulisan)\s*/i,
                /^stext\s*/i
            ]);

            if (stripped) return stripped;
        }

        // Bentuk eksplisit tanpa slash: "stext halo" -> teksnya "halo".
        const explicit = raw.match(/^stext\s+(.+)$/i);
        if (explicit) return explicit[1].trim();

        return '';
    }

    return '';
}

function getMissingArg(command, args) {
    const text = String(args || '').trim();
    const defs = command?.args || [];
    if (defs.length === 0) return null;

    if (!text) {
        return defs.find(arg => arg.required) || null;
    }

    const firstToken = text.split(/\s+/)[0]?.toLowerCase();

    for (const arg of defs) {
        if (!arg.required) continue;

        if (arg.name === 'url' && !extractUrl(text)) return arg;

        if (arg.name === 'lang' && arg.enum && !arg.enum.includes(firstToken)) {
            return arg;
        }

        if (arg.name === 'format' && arg.enum && !arg.enum.includes(firstToken)) {
            return arg;
        }
    }

    if (command.name === 'tr') {
        if (text.split(/\s+/).length < 2) {
            return defs.find(arg => arg.name === 'teks') || null;
        }
    }

    if (command.name === 'encode' || command.name === 'decode') {
        if (text.split(/\s+/).length < 2) {
            return defs.find(arg => arg.name === 'teks') || null;
        }
    }

    return null;
}

function validateArgs(command, args) {
    const text = String(args || '').trim();

    if (command?.urlHosts?.length) {
        const url = extractUrl(text);
        if (!url) {
            return { ok: false, error: 'Link tidak ditemukan. Kirim link-nya ya.' };
        }

        const host = getHost(url);
        if (host && !hostMatches(host, command.urlHosts)) {
            return {
                ok: false,
                error: `Link itu bukan ${command.description.toLowerCase()}. Kirim link yang sesuai ya.`
            };
        }
    }

    if (command?.name === 'stext' && text.length > 40) {
        return { ok: false, error: 'Teks maksimal 40 karakter ya.' };
    }

    if (command?.name === 'say' && text.length > 200) {
        return { ok: false, error: 'Teks maksimal 200 karakter ya.' };
    }

    if (command?.name === 'qr' && text.length > 1000) {
        return { ok: false, error: 'Teks QR maksimal 1000 karakter ya.' };
    }

    if (command?.name === 'tr') {
        const first = text.split(/\s+/)[0]?.toLowerCase();
        if (!['id', 'en', 'jp'].includes(first)) {
            return { ok: false, error: 'Bahasa harus id, en, atau jp.' };
        }
    }

    if (command?.name === 'encode' || command?.name === 'decode') {
        const first = text.split(/\s+/)[0]?.toLowerCase();
        if (!ENCODE_FORMATS.includes(first)) {
            return { ok: false, error: 'Format harus base64, url, hex, binary, rot13, atau html.' };
        }
    }

    if (command?.name === 'poll') {
        const parts = text.split(',').map(part => part.trim()).filter(Boolean);
        if (parts.length < 3) {
            return { ok: false, error: 'Format polling: pertanyaan, opsi1, opsi2' };
        }
    }

    return { ok: true, args: text };
}

function buildArgPrompt(command) {
    if (!command) return 'Argumennya apa?';

    const name = command.name;

    if (command.urlHosts?.length) return 'Kirim link-nya ya.';
    if (name === 'stext') return 'Teksnya mau apa? (maksimal 40 karakter)';
    if (name === 'say') return 'Teks yang mau dijadikan suara?';
    if (name === 'tr') return 'Mau diterjemahkan ke bahasa apa? (id/en/jp) beserta teksnya.';
    if (name === 'encode' || name === 'decode') {
        return 'Formatnya apa? (base64/url/hex/binary/rot13/html) beserta teksnya.';
    }
    if (name === 'cuaca') return 'Tempatnya mana? (contoh: Tirtoadi, Sleman)';
    if (name === 'bbm') return 'Provinsi mana? (contoh: Jawa Barat)';
    if (name === 'nslookup') return 'IP atau domain yang mau dicek?';
    if (name === 'qr') return 'Teks atau URL untuk QR code?';
    if (name === 'poll') return 'Format: pertanyaan, opsi1, opsi2';
    if (name === 'scan') return 'Kirim file/link/hash yang mau discan ya.';

    return 'Argumennya apa?';
}

function matchScore(command, text) {
    const norm = normalize(text);
    if (!norm) return 0;

    const textTokens = new Set(tokenize(text));
    const commandName = String(command.name || '').toLowerCase();
    const candidates = [
        command.name,
        ...(command.aliases || []),
        ...(command.keywords || [])
    ].filter(Boolean);

    let best = 0;

    // Nama command yang diketik persis (mis. "yt", "fb", "s") adalah sinyal kuat.
    if (commandName && textTokens.has(commandName)) {
        best = Math.max(best, commandName.length <= 2 ? 0.85 : 0.95);
    }

    for (const candidate of candidates) {
        const keyword = normalize(candidate);
        if (!keyword) continue;

        const parts = keyword.split(' ').filter(Boolean);

        if (parts.length === 1) {
            const token = parts[0];

            if (textTokens.has(token)) {
                if (token.length <= 2) {
                    if (norm === token || textTokens.size <= 3) {
                        best = Math.max(best, 0.75);
                    }
                } else {
                    best = Math.max(best, 0.9);
                }
            }

            if (token.length >= 4) {
                for (const textToken of textTokens) {
                    if (textToken.length >= 3 && tokenMatches(textToken, token)) {
                        const distance = levenshtein(textToken, token);
                        best = Math.max(best, distance <= 1 ? 0.75 : 0.7);
                    }
                }
            }

            continue;
        }

        if (norm.includes(keyword)) {
            best = Math.max(best, 1);
            continue;
        }

        // Cocokkan tiap kata kunci secara fuzzy supaya typo tetap terdeteksi.
        let matched = 0;
        for (const part of parts) {
            if (textTokens.has(part)) {
                matched++;
                continue;
            }

            for (const textToken of textTokens) {
                if (tokenMatches(textToken, part)) {
                    matched++;
                    break;
                }
            }
        }

        if (matched >= 2) {
            best = Math.max(best, 0.6 + (0.2 * matched / parts.length));
        }
    }

    return Math.min(best, 1);
}

/**
 * Cari command yang cocok.
 * options:
 * - executableOnly: hanya command publik yang aman dieksekusi (default true)
 * - includePrivate: izinkan command privat (untuk bantuan admin di DM)
 * - threshold: skor minimum
 */
function matchCommands(text, options = {}) {
    const {
        executableOnly = true,
        includePrivate = false,
        threshold = 0.6,
        limit = 4
    } = options;

    const pool = executableOnly
        ? catalog.getExecutableCommands()
        : catalog.getMenuCommands({ includePrivate });

    const url = extractUrl(text);
    const host = url ? getHost(url) : null;

    const scored = [];
    const normText = normalize(text);

    for (const command of pool) {
        let score = matchScore(command, text);

        // Disambiguasi /s vs /stext:
        // - ada kata "teks"/"tulisan" -> utamakan /stext
        // - ada "tanpa teks" -> utamakan /s
        if (command.name === 'stext') {
            if (/\b(teks|tulisan)\b/.test(normText)) score += 0.2;
            if (/\b(tanpa|tidak|gak|nggak)\b/.test(normText)) score -= 0.15;
        }

        if (command.name === 's') {
            if (/\b(teks|tulisan)\b/.test(normText) && !/\b(tanpa|tidak|gak|nggak)\b/.test(normText)) {
                score -= 0.15;
            }
            if (/\b(tanpa|tidak|gak|nggak)\b/.test(normText) && /\bteks\b/.test(normText)) {
                score += 0.2;
            }
        }

        // Disambiguasi /encode vs /decode (kata kerja lebih kuat dari nama format).
        if (command.name === 'encode') {
            if (/\b(decode|dekripsi)\b/.test(normText)) score -= 0.2;
            if (/\b(encode|enkripsi)\b/.test(normText)) score += 0.1;
        }
        if (command.name === 'decode') {
            if (/\b(encode|enkripsi)\b/.test(normText)) score -= 0.2;
            if (/\b(decode|dekripsi)\b/.test(normText)) score += 0.1;
        }

        // Disambiguasi /yt (video) vs /ytmp3 (audio).
        if (command.name === 'yt' && /\b(lagu|audio|mp3|musik)\b/.test(normText)) {
            score -= 0.15;
        }
        if (command.name === 'ytmp3' &&
            /\b(video|vidio|vid|mp4)\b/.test(normText) &&
            !/\b(lagu|audio|mp3|musik)\b/.test(normText)) {
            score -= 0.1;
        }

        if (host && command.urlHosts?.length) {
            if (hostMatches(host, command.urlHosts)) {
                // Link yang cocok adalah bukti kuat, tapi tetap kalah dari keyword
                // yang lebih spesifik (mis. "video" vs "lagu").
                score = Math.max(score, 0.6);
                score = Math.min(score + 0.15, 1);
            } else {
                score -= 0.1;
            }
        }

        if (score < threshold) continue;

        scored.push({
            command,
            score: Number(score.toFixed(3)),
            args: extractArgs(command, text)
        });
    }

    scored.sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name));

    if (scored.length === 0) return [];

    const topScore = scored[0].score;
    const close = scored.filter(item => topScore - item.score <= 0.08);

    return close.slice(0, limit);
}

function buildChoiceOptions(candidates) {
    return candidates.map(({ command, args }) => {
        const missing = getMissingArg(command, args);

        return {
            label: catalog.formatUsage(command),
            hint: command.description,
            command: command.name,
            args: args || '',
            needsText: command.name === 'stext' && !args,
            missingArg: missing ? missing.name : null,
            argPrompt: missing ? buildArgPrompt(command) : ''
        };
    });
}

function isMenuRequest(text) {
    const norm = normalize(text);
    if (!norm) return false;

    if (MENU_EXACT.has(norm)) return true;

    const tokens = norm.split(' ');
    if (tokens.length > 6) return false;

    if (/\b(menu|help|bantuan)\b/.test(norm)) return true;
    if (/\b(fitur|command|perintah)\b/.test(norm) && /\b(apa|saja|aja|bot)\b/.test(norm)) return true;

    return false;
}

function isHelpQuestion(text) {
    const raw = String(text || '').trim();
    if (!raw) return false;

    // Kalau ada link, anggap aksi, bukan pertanyaan bantuan.
    if (extractUrl(raw)) return false;

    const norm = normalize(raw);
    if (HELP_WORDS.some(pattern => pattern.test(norm))) return true;

    return /[?]$/.test(raw);
}

function detectWrongPrefix(body) {
    const raw = String(body || '').trim();
    const match = /^([.!])\s*([a-zA-Z0-9_]+)\b(.*)$/s.exec(raw);

    if (!match) return null;

    return {
        prefix: match[1],
        name: match[2].toLowerCase(),
        rest: match[3].trim(),
        raw
    };
}

function aiCacheKey(scope, text) {
    return `${scope?.includePrivate ? 'admin' : 'public'}:${normalize(text)}`;
}

function getCachedAiResult(scope, text) {
    const key = aiCacheKey(scope, text);
    const item = aiCache.get(key);
    if (!item) return null;

    if (item.expiresAt <= Date.now()) {
        aiCache.delete(key);
        return null;
    }

    return item.value;
}

function setCachedAiResult(scope, text, value) {
    aiCache.set(aiCacheKey(scope, text), {
        value,
        expiresAt: Date.now() + AI_CACHE_TTL_MS
    });

    if (aiCache.size > 200) {
        const now = Date.now();
        for (const [key, item] of aiCache.entries()) {
            if (item.expiresAt <= now) aiCache.delete(key);
        }
    }
}

function canCallAi(chatId, cooldownMs = AI_COOLDOWN_MS) {
    if (!chatId) return true;
    const last = aiCooldown.get(chatId) || 0;
    return Date.now() - last >= cooldownMs;
}

function markAiCall(chatId) {
    if (chatId) aiCooldown.set(chatId, Date.now());
}

module.exports = {
    normalize,
    tokenize,
    levenshtein,
    extractUrl,
    getHost,
    hostMatches,
    getMediaType,
    hasRequiredMedia,
    getQuotedMessage,
    extractArgs,
    getMissingArg,
    validateArgs,
    buildArgPrompt,
    matchScore,
    matchCommands,
    buildChoiceOptions,
    isMenuRequest,
    isHelpQuestion,
    detectWrongPrefix,
    getCachedAiResult,
    setCachedAiResult,
    canCallAi,
    markAiCall,
    AI_COOLDOWN_MS
};
