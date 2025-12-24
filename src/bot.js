const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger');
const stickerCommand = require('./commands/sticker');
const youtubeCommand = require('./commands/youtube');
const facebookCommand = require('./commands/facebook');
const tiktokCommand = require('./commands/tiktok');
const instagramCommand = require('./commands/instagram');
const quoteCommand = require('./commands/quote');


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
        this.startupTime = null; // Waktu bot mulai online
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Event:  QR Code
        this.client.on('qr', (qr) => {
            logger.info('Scan QR Code di bawah ini: ');
            qrcode.generate(qr, { small: true });
        });

        // Event:  Loading
        this.client.on('loading_screen', (percent, message) => {
            logger.info(`Loading: ${percent}% - ${message}`);
        });

        // Event: Authenticated
        this.client.on('authenticated', () => {
            logger.success('Autentikasi berhasil! ');
        });

        // Event: Auth Failure
        this.client.on('auth_failure', (msg) => {
            logger.error('Autentikasi gagal:', msg);
        });

        // Event: Ready
        this.client.on('ready', () => {
            this.startupTime = Math.floor(Date.now() / 1000); // Unix timestamp
            logger.success('✅ Bot WhatsApp siap digunakan!');
            logger.info(`Prefix command: ${this.prefix}`);
            logger.info('Bot akan mengabaikan pesan yang diterima saat offline');
        });

        // Event: Message - HANYA SATU EVENT INI SAJA
        this.client.on('message_create', async (msg) => {
            // Skip pesan dari diri sendiri
            if (msg.fromMe) return;
            await this.handleMessage(msg);
        });

        // Event:  Disconnected
        this.client.on('disconnected', (reason) => {
            logger.warn('Bot terputus:', reason);
        });
    }

    async handleMessage(msg) {
        try {
            // Abaikan pesan dari status/broadcast
            if (msg.from === 'status@broadcast') return;

            // Abaikan pesan yang diterima saat bot offline
            const messageTimestamp = msg.timestamp;
            if (this.startupTime && messageTimestamp < this.startupTime) {
                logger.warn(`Pesan diabaikan (diterima saat bot offline): ${msg.body}`);
                return;
            }

            const body = msg.body.trim();

            // Log semua pesan untuk debugging
            logger.info(`Pesan diterima: "${body}" dari ${msg.from}`);

            // Cek apakah pesan adalah command
            if (!body.startsWith(this.prefix)) {
                logger.info('Bukan command, diabaikan');
                return;
            }

            // Parse command
            const commandBody = body.slice(this.prefix.length).trim();
            const args = commandBody.split(/ +/);
            const command = args[0].toLowerCase();

            logger.info(`Command terdeteksi: "${command}"`);

            // Routing command
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
                await msg.reply('❌ Terjadi kesalahan saat memproses pesan! ');
            } catch (replyError) {
                logger.error('Error sending error reply:', replyError);
            }
        }
    }

    async sendHelp(msg) {
        const helpText = `*📌 MENU BOT STICKER*

*Cara Pakai:*

1️⃣ *Sticker Biasa*
   • Kirim gambar dengan caption:  .s
   • Atau reply gambar dengan:  .s

2️⃣ *Sticker dengan Teks*
   • Kirim gambar dengan caption: .stext teks kamu
   • Atau reply gambar dengan: .stext teks kamu

3️⃣ *Sticker ke Gambar*
   • Reply sticker dengan: .toimg

4️⃣ *YouTube Downloader*
   • Audio MP3: .ytmp3 [link youtube]
   • Video MP4: .yt [link youtube]

5️⃣ *Facebook Downloader*
   • Video: .fb [link facebook]

6️⃣ *TikTok Downloader*
   • Video: .tiktok [link] atau .tt [link]

7️⃣ *Instagram Downloader*
   • Video/Photo: .ig [link instagram]

8️⃣ *Motivation*
   • Reply pesan dengan: .quote
   • Kirim motivasi: .quote

⚠️ *Limit ukuran:*
   • Audio: max 16MB
   • Video: max 64MB

_Bot by vazul76_`;

        await msg.reply(helpText);
        logger.success('Help message sent');
    }

    initialize() {
        this.client.initialize();
    }
}

module.exports = WABot;