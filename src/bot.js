const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger');
const helpers = require('./utils/helpers');

// Commands
const stickerCommand = require('./commands/sticker');
const youtubeCommand = require('./commands/youtube');
const facebookCommand = require('./commands/facebook');
const tiktokCommand = require('./commands/tiktok');
const instagramCommand = require('./commands/instagram');
const quoteCommand = require('./commands/quote');
const imageCommand = require('./commands/image');
const twitterCommand = require('./commands/twitter');
const pollCommand = require('./commands/poll');
const ttsCommand = require('./commands/tts');
const translateCommand = require('./commands/translate');
const quranCommand = require('./commands/quran');

class WABot {
    constructor() {
        this.sock = null;
        this.prefix = '.';
        this.startupTime = null;
        this.authState = null;
        this.saveCreds = null;
    }

    async initialize() {
        try {
            logger.info('Initializing WhatsApp Bot with Baileys...');

            // Setup auth
            const { state, saveCreds } = await useMultiFileAuthState('./auth_baileys');
            this.authState = state;
            this.saveCreds = saveCreds;

            // Create socket
            await this.createSocket();

        } catch (error) {
            logger.error('Failed to initialize bot:', error);
            process.exit(1);
        }
    }

    async createSocket() {
        this.sock = makeWASocket({
            auth: this.authState,
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: ['V-Ultimate-Bot', 'Chrome', '121.0.0'],
            defaultQueryTimeoutMs: undefined
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Connection updates
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // QR Code
            if (qr) {
                logger.info('Scan QR Code di bawah ini:');
                qrcode.generate(qr, { small: true });
            }

            // Connected
            if (connection === 'open') {
                this.startupTime = Math.floor(Date.now() / 1000);
                logger.success('✅ Bot WhatsApp siap digunakan!');
                logger.info(`Prefix command:  ${this.prefix}`);
            }

            // Disconnected
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

                logger.warn('Connection closed:', lastDisconnect?.error?.message);

                if (shouldReconnect) {
                    logger.info('Reconnecting...');
                    await delay(5000);
                    await this.createSocket();
                } else {
                    logger.error('Logged out!  Please delete auth_baileys folder and restart.');
                    process.exit(1);
                }
            }
        });

        // Credentials update
        this.sock.ev.on('creds.update', this.saveCreds);

        // Messages
        this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                await this.handleMessage(msg);
            }
        });
    }

    async handleMessage(msg) {
        try {
            // Skip jika bukan pesan biasa
            if (!msg.message) return;
            if (msg.key.fromMe) return;
            if (msg.key.remoteJid === 'status@broadcast') return;

            // Abaikan pesan lama
            if (this.startupTime && msg.messageTimestamp < this.startupTime) {
                logger.warn('Pesan diabaikan (diterima saat bot offline)');
                return;
            }

            // Extract text
            const text = this.getMessageText(msg);
            if (!text) return;

            const body = text.trim();
            logger.info(`Pesan diterima: "${body}" dari ${msg.key.remoteJid}`);

            // Cek prefix
            if (!body.startsWith(this.prefix)) {
                logger.info('Bukan command, diabaikan');
                return;
            }

            // Parse command
            const commandBody = body.slice(this.prefix.length).trim();
            const args = commandBody.split(/ +/);
            const command = args[0].toLowerCase();

            logger.info(`Command terdeteksi: "${command}"`);

            // Route command
            await this.routeCommand(command, body, msg);

        } catch (error) {
            logger.error('Error handling message:', error);
            try {
                await helpers.reactError(this.sock, msg);
                await helpers.replyWithTyping(this.sock, msg, '❌ Terjadi kesalahan saat memproses pesan! ');
            } catch (replyError) {
                logger.error('Error sending error reply:', replyError);
            }
        }
    }

    async routeCommand(command, body, msg) {
        try {
            switch (command) {
                case 's':
                    logger.info('Menjalankan command .s');
                    await stickerCommand.createSticker(msg, this.sock);
                    break;
                case 'stext':
                    logger.info('Menjalankan command .stext');
                    await stickerCommand.createStickerWithText(msg, this.sock, body);
                    break;
                case 'toimg':
                    logger.info('Menjalankan command .toimg');
                    await stickerCommand.convertStickerToImage(msg, this.sock);
                    break;
                case 'ytmp3':
                    logger.info('Menjalankan command .ytmp3');
                    await youtubeCommand.downloadAudio(msg, this.sock, body);
                    break;
                case 'yt':
                    logger.info('Menjalankan command .yt');
                    await youtubeCommand.downloadVideo(msg, this.sock, body);
                    break;
                case 'fb':
                    logger.info('Menjalankan command .fb');
                    await facebookCommand.downloadVideo(msg, this.sock, body);
                    break;
                case 'tiktok':
                case 'tt':
                    logger.info('Menjalankan command .tiktok');
                    await tiktokCommand.downloadVideo(msg, this.sock, body);
                    break;
                case 'ig':
                    logger.info('Menjalankan command .ig');
                    await instagramCommand.downloadMedia(msg, this.sock, body);
                    break;
                case 'twitter':
                case 'x':
                    logger.info('Menjalankan command .twitter');
                    await twitterCommand.downloadVideo(msg, this.sock, body);
                    break;
                case 'poll':
                case 'pool':
                    logger.info('Menjalankan command .poll');
                    await pollCommand.createPoll(msg, this.sock, body);
                    break;
                case 'say':
                    logger.info('Menjalankan command .say');
                    await ttsCommand.createAudio(msg, this.sock, body);
                    break;
                case 'tr':
                    logger.info('Menjalankan command .tr');
                    await translateCommand.translate(msg, this.sock, body);
                    break;
                case 'quran':
                case 'ngaji':
                    logger.info('Menjalankan command .quran');
                    await quranCommand.getAyat(msg, this.sock, body);
                    break;
                case 'quote':
                    logger.info('Menjalankan command .quote');
                    await quoteCommand.sendQuote(msg, this.sock, body);  // ← Add body parameter
                    break;
                case 'image':
                case 'img':
                case 'generate':
                    logger.info('Menjalankan command .image');
                    await imageCommand.generateImage(msg, this.sock, body);
                    break;
                case 'help':
                case 'menu':
                    logger.info('Menjalankan command help');
                    await this.sendHelp(msg);
                    break;
                default:
                    logger.warn(`Command tidak dikenal: ${command}`);
                    break;
            }
        } catch (error) {
            logger.error(`Error executing command ${command}:`, error);
            throw error;
        }
    }

    getMessageText(msg) {
        const message = msg.message;

        if (message.conversation) {
            return message.conversation;
        }
        if (message.extendedTextMessage?.text) {
            return message.extendedTextMessage.text;
        }
        if (message.imageMessage?.caption) {
            return message.imageMessage.caption;
        }
        if (message.videoMessage?.caption) {
            return message.videoMessage.caption;
        }

        return null;
    }

    async sendHelp(msg) {
        await helpers.reactCommandReceived(this.sock, msg);

        const helpText = `*🤖 V-ULTIMATE BOT v2.0 - BAILEYS*

*📌 STICKER TOOLS*
├ \`.s\` - Gambar/Video → Sticker
│   ├ Gambar → Static sticker
│   └ Video/GIF → Animated sticker 🎬
├ \`.stext [teks]\` - Gambar → Sticker + Teks
└ \`.toimg\` - Sticker → Gambar/Video

*📥 DOWNLOADER*
├ \`.ytmp3 [link]\` - YouTube → MP3 (16MB max)
├ \`.yt [link]\` - YouTube → MP4 (100MB max) 🎬
├ \`.fb [link]\` - Facebook Video
├ \`.tt [link]\` - TikTok Video
├ \`.ig [link]\` - Instagram Media
└ \`.x [link]\` - Twitter/X Video

*🤖 AI FEATURES*
├ \`.quote [teks]\` - Motivasi AI (Groq Llama 3.3)
└ \`.image [prompt]\` - Generate Image AI

*📊 Group Tools*
└ \`.poll [tanya],[opsi1],[opsi2]\` - Buat Polling

*🗣️ TTS*
└ \`.say [teks]\` - Text to Speech (Indonesia)

*🌐 TRANSLATE (AI)*
└ \`.tr [lang] [teks]\` - Translate pintar
👉 Lang: id, en, jp

*🕌 ISLAMIC*
└ \`.quran [surat] [ayat]\` - Baca Al-Quran

*💡 TIPS: *
• Bisa reply pesan yang ada link!

_Bot by vazul76 - v2.0.0_`;

        await helpers.replyWithTyping(this.sock, msg, helpText, 2000);
        await helpers.reactSuccess(this.sock, msg);
        logger.success('Help message sent');
    }

    async stop() {
        if (this.sock) {
            logger.info('Closing socket...');
            this.sock.end();
        }
    }
}

module.exports = WABot;