const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger');
const helpers = require('./utils/helpers');
const stickerCommand = require('./commands/sticker');
const youtubeCommand = require('./commands/youtube');
const facebookCommand = require('./commands/facebook');
const tiktokCommand = require('./commands/tiktok');
const instagramCommand = require('./commands/instagram');
const quoteCommand = require('./commands/quote');
const imageCommand = require('./commands/image'); // NEW


class WABot {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: 'wa-sticker-bot'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        this.prefix = '.';
        this.startupTime = null;
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('qr', (qr) => {
            logger.info('Scan QR Code di bawah ini:  ');
            qrcode.generate(qr, { small: true });
        });

        this.client.on('loading_screen', (percent, message) => {
            logger.info(`Loading: ${percent}% - ${message}`);
        });

        this.client.on('authenticated', () => {
            logger.success('Autentikasi berhasil!');
        });

        this.client.on('auth_failure', (msg) => {
            logger.error('Autentikasi gagal:', msg);
        });

        this.client.on('ready', () => {
            this.startupTime = Math.floor(Date.now() / 1000);
            logger.success('✅ Bot WhatsApp siap digunakan!');
            logger.info(`Prefix command: ${this.prefix}`);
            logger.info('Bot akan mengabaikan pesan yang diterima saat offline');
        });

        this.client.on('message_create', async (msg) => {
            if (msg.fromMe) return;
            await this.handleMessage(msg);
        });

        this.client.on('disconnected', (reason) => {
            logger.warn('Bot terputus:', reason);
        });
    }

    async handleMessage(msg) {
        try {
            if (msg.from === 'status@broadcast') return;

            const messageTimestamp = msg.timestamp;
            if (this.startupTime && messageTimestamp < this.startupTime) {
                logger.warn(`Pesan diabaikan (diterima saat bot offline): ${msg.body}`);
                return;
            }

            const body = msg.body.trim();
            logger.info(`Pesan diterima: "${body}" dari ${msg.from}`);

            if (! body.startsWith(this.prefix)) {
                logger.info('Bukan command, diabaikan');
                return;
            }

            const commandBody = body.slice(this.prefix.length).trim();
            const args = commandBody.split(/ +/);
            const command = args[0].toLowerCase();

            logger.info(`Command terdeteksi: "${command}"`);

            switch (command) {
                case 's':
                    logger.info('Menjalankan command .s');
                    await stickerCommand.createSticker(msg, this.client);
                    break;
                case 'stext':
                    logger.info('Menjalankan command .stext');
                    await stickerCommand.createStickerWithText(msg, this.client, body);
                    break;
                case 'toimg':
                    logger.info('Menjalankan command .toimg');
                    await stickerCommand.convertStickerToImage(msg, this.client);
                    break;
                case 'ytmp3':
                    logger.info('Menjalankan command .ytmp3');
                    await youtubeCommand.downloadAudio(msg, body);
                    break;
                case 'yt': 
                    logger.info('Menjalankan command .yt');
                    await youtubeCommand.downloadVideo(msg, body);
                    break;
                case 'fb':
                    logger.info('Menjalankan command .fb');
                    await facebookCommand.downloadVideo(msg, body);
                    break;
                case 'tiktok':
                case 'tt':
                    logger.info('Menjalankan command .tiktok');
                    await tiktokCommand.downloadVideo(msg, body);
                    break;
                case 'ig':
                    logger.info('Menjalankan command .ig');
                    await instagramCommand.downloadMedia(msg, body);
                    break;
                case 'quote':
                    logger.info('Menjalankan command .quote');
                    await quoteCommand.sendQuote(msg);
                    break;
                case 'image':
                case 'img':
                case 'generate':
                    logger.info('Menjalankan command .image');
                    await imageCommand.generateImage(msg, this.client, body);
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
            logger.error('Error handling message:', error);
            try {
                await helpers.reactError(msg);
                await helpers.replyWithTyping(msg, this.client, '❌ Terjadi kesalahan saat memproses pesan! ');
            } catch (replyError) {
                logger.error('Error sending error reply:', replyError);
            }
        }
    }

    async sendHelp(msg) {
        await helpers.reactCommandReceived(msg);

        const helpText = `*🤖 V-ULTIMATE BOT - MENU*

*📌 STICKER TOOLS*
├ \`.s\` - Gambar → Sticker
├ \`.stext [teks]\` - Gambar → Sticker + Teks
└ \`.toimg\` - Sticker → Gambar

*📥 DOWNLOADER*
├ \`.ytmp3 [link]\` - YouTube → MP3 (16MB max)
├ \`.yt [link]\` - YouTube → MP4 (64MB max)
├ \`.fb [link]\` - Facebook Video
├ \`.tt [link]\` - TikTok Video
└ \`.ig [link]\` - Instagram Media

*🤖 AI FEATURES*
├ \`.quote\` - Motivasi AI (Groq Llama 3.3)
└ \`.image [prompt]\` - Generate Image (Pollinations AI)

*💡 TIPS: *
• Bisa reply pesan yang ada link, gak perlu ketik ulang! 
• Bot typing 2 detik sebelum reply
• Reactions:  🫡 = received, ✅ = success, ❌ = error

_Bot by vazul76 | v1.3.0_`;

        await helpers.replyWithTyping(msg, this.client, helpText, 2000);
        await helpers.reactSuccess(msg);
        logger.success('Help message sent');
    }

    initialize() {
        this.client.initialize();
    }
}

module.exports = WABot;