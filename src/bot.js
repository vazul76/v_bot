const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const chalk = require('chalk');
const P = require('pino');

const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger');
const helpers = require('./utils/helpers');
const healthChecker = require('./utils/healthChecker');

// Commands
const stickerCommand = require('./commands/sticker');
const youtubeCommand = require('./commands/youtube');
const facebookCommand = require('./commands/facebook');
const tiktokCommand = require('./commands/tiktok');
const instagramCommand = require('./commands/instagram');
const twitterCommand = require('./commands/twitter');
const pollCommand = require('./commands/poll');
const ttsCommand = require('./commands/tts');
const translateCommand = require('./commands/translate');
const scanCommand = require('./commands/scan');
const weatherCommand = require('./commands/weather');
const testCommand = require('./commands/test');
const priceCommand = require('./commands/price');
const imsakiyahCommand = require('./commands/imsakiyah');
const qrCommand = require('./commands/qr');
const nslookupCommand = require('./commands/nslookup');
const encodeCommand = require('./commands/encode');


class WABot {
    constructor() {
        this.sock = null;
        this.prefix = '/';
        this.startupTime = null;
        this.authState = null;
        this.saveCreds = null;
        this.adminNumber = process.env.ADMIN_NUMBER || null; // Format: 628xxxxxxxxxx@s.whatsapp.net
        this.commands = new Map();

        this.registerCommands();
    }

    registerCommands() {
        // Collect all commands from command modules
        const modules = [
            stickerCommand, youtubeCommand, facebookCommand, tiktokCommand,
            instagramCommand, twitterCommand, pollCommand, ttsCommand,
            translateCommand, scanCommand, weatherCommand, testCommand,
            priceCommand, imsakiyahCommand, qrCommand, nslookupCommand, encodeCommand
        ];

        modules.forEach(module => {
            if (module.commands && Array.isArray(module.commands)) {
                module.commands.forEach(cmd => {
                    this.commands.set(cmd.name, {
                        module,
                        method: cmd.method,
                        description: cmd.description
                    });
                });
            }
        });

        logger.info(`Registered ${this.commands.size} commands dynamically`);
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
            browser: ['V-Ultimate-Bot-Stb', 'Chrome', '121.0.0'],
            defaultQueryTimeoutMs: undefined,
            version: [2, 3000, 1033893291], // fix 405 Connection Failure on new pairing
            markOnlineOnConnection: true, // IMPORTANT: Mark bot as online when connected
            syncFullHistory: false
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
                this.displayBanner();
                logger.success('✅ Bot WhatsApp siap digunakan!');
                logger.info(`${chalk.white('Prefix command:')}  ${chalk.yellow.bold(this.prefix)}`);

                // Set presence to available
                try {
                    await this.sock.sendPresenceUpdate('available');
                    logger.info('Presence set to available');
                } catch (err) {
                    logger.warn('Failed to set presence:', err.message);
                }

                // Setup health checker
                if (this.adminNumber) {
                    healthChecker.setAdmin(this.adminNumber, this.sock);
                    this.startHealthChecks();
                } else {
                    logger.warn('ADMIN_NUMBER not set in .env, health monitoring disabled');
                }
            }

            // Disconnected
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                logger.warn('Connection closed:', lastDisconnect?.error?.message || 'No error message');
                if (statusCode) {
                    logger.warn(`Disconnect status code: ${statusCode}`);
                }
                if (lastDisconnect?.error?.output?.payload) {
                    logger.warn(`Disconnect payload: ${JSON.stringify(lastDisconnect.error.output.payload)}`);
                }

                // Log full Baileys error detail
                if (lastDisconnect?.error) {
                    const err = lastDisconnect.error;
                    logger.warn(`[Baileys] error.name: ${err.name}`);
                    logger.warn(`[Baileys] error.message: ${err.message}`);
                    if (err.stack) logger.warn(`[Baileys] error.stack:\n${err.stack}`);
                    if (err.data !== undefined) logger.warn(`[Baileys] error.data: ${JSON.stringify(err.data)}`);
                    if (err.output) logger.warn(`[Baileys] error.output (full): ${JSON.stringify(err.output)}`);
                }

                if (statusCode === 405) {
                    logger.error('HTTP 405 — WebSocket upgrade ditolak oleh jaringan/server. Kemungkinan penyebab: ISP blocking, transparent proxy, atau DPI.');
                    logger.error('Solusi: coba jaringan lain (hotspot), SSH SOCKS tunnel, atau jalankan bot di VPS.');
                    return;
                }

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
            // Special case for help menu
            if (command === 'menu' || command === 'help') {
                logger.info('Menjalankan command help');
                return await this.sendHelp(msg);
            }

            const cmdConfig = this.commands.get(command);

            if (cmdConfig) {
                const { module, method } = cmdConfig;
                if (typeof module[method] === 'function') {
                    logger.info(`Menjalankan command ${this.prefix}${command} via ${module.constructor.name}.${method}`);
                    await module[method](msg, this.sock, body);
                } else {
                    logger.error(`Method ${method} not found in module for command ${command}`);
                }
            } else {
                logger.warn(`Command tidak dikenal: ${command}`);
            }
        } catch (error) {
            logger.error(`Error executing command ${command}:`, error);
            throw error;
        }
    }

    getMessageText(msg) {
        const message = msg.message;

        // Standard text messages
        if (message.conversation) {
            return message.conversation;
        }
        if (message.extendedTextMessage?.text) {
            return message.extendedTextMessage.text;
        }

        // Direct media captions (simple caption, bukan wrapper)
        if (message.imageMessage?.caption) {
            return message.imageMessage.caption;
        }
        if (message.videoMessage?.caption) {
            return message.videoMessage.caption;
        }
        if (message.documentMessage?.caption) {
            return message.documentMessage.caption;
        }

        // ✅ FIXED: Caption wrappers (Baileys/WA structure for media with caption)
        // When user sends file/image/video WITH caption, WA wraps it like this:
        // { documentWithCaptionMessage: { message: { documentMessage: {...}, caption: "text" } } }
        if (message.documentWithCaptionMessage?.message?.documentMessage?.caption) {
            return message.documentWithCaptionMessage.message.documentMessage.caption;
        }
        if (message.imageWithCaptionMessage?.message?.imageMessage?.caption) {
            return message.imageWithCaptionMessage.message.imageMessage.caption;
        }
        if (message.videoWithCaptionMessage?.message?.videoMessage?.caption) {
            return message.videoWithCaptionMessage.message.videoMessage.caption;
        }

        return null;
    }

    async sendHelp(msg) {
        await helpers.reactCommandReceived(this.sock, msg);

        const helpText = `*🗿 V-ULTIMATE BOT v2.3*

*📌 STICKER TOOLS*
├ \`/s\` - Gambar/Video → Sticker
│   ├ Gambar → Static sticker
│   └ Video/GIF → Animated sticker 🎬
├ \`/stext [teks]\` - Gambar → Sticker + Teks
└ \`/toimg\` - Sticker → Gambar/Video

*📥 DOWNLOADER*
├ \`/ytmp3 [link]\` - YouTube → MP3 (16MB max)
├ \`/yt [link]\` - YouTube → Video (100MB max) 🎬
├ \`/fb [link]\` - Facebook Video/Photo
├ \`/tt [link]\` - TikTok Video
├ \`/ig [link]\` - Instagram Video/Photo
└ \`/x [link]\` - Twitter/X Video/Photo

*🛡️ SECURITY*
└ \`/scan [file/url/hash]\` - Scan via VirusTotal

*📊 GROUP TOOLS*
└ \`/poll [tanya],[opsi1],[opsi2]\` - Buat Polling

*🗣️ TTS*
└ \`/say [teks]\` - Text to Speech (Auto-detect)

*🌐 TRANSLATE (AI)*
└ \`/tr [lang] [teks]\` - Translate pintar
👉 Lang: id, en, jp

*🌤️ WEATHER*
└ \`/cuaca [tempat (kelurahan)]\` - Cek Cuaca D I Yogyakarta

*💹 MARKET*
└ \`/price\` - Harga Crypto & Komoditas + IHSG (24h change)

*🛠️ TOOLS*
├ \`/qr [teks/url]\` - Generate QR Code
├ \`/nslookup [ip/domain]\` - IP & DNS Lookup
├ \`/encode [format] [teks]\` - Encode (base64, url, hex, binary, rot13, html)
└ \`/decode [format] [teks]\` - Decode (format sama dengan encode)

_Bot by vazul76 - v2.3.0_
_Link repo bot : https://github.com/vazul76/v_bot_`;

        await helpers.replyWithTyping(this.sock, msg, helpText, 2000);
        await helpers.reactSuccess(this.sock, msg);
        logger.success('Help message sent');
    }

    displayBanner() {
        console.clear();

        // Build command list string
        let commandLines = [];
        const uniqueCommands = [];
        const seenMethods = new Set();

        // Filter out aliases for display if they point to same method in same module
        this.commands.forEach((cfg, name) => {
            const key = `${cfg.module.constructor.name}:${cfg.method}`;
            if (!seenMethods.has(key)) {
                uniqueCommands.push({ name, description: cfg.description });
                seenMethods.add(key);
            }
        });

        // Format command list for banner
        const totalCommands = uniqueCommands.length;
        const half = Math.ceil(totalCommands / 2);

        for (let i = 0; i < half; i++) {
            const cmd1 = uniqueCommands[i];
            const cmd2 = uniqueCommands[i + half];

            const line1 = cmd1 ? `${chalk.yellow('•')} ${chalk.white(this.prefix + cmd1.name.padEnd(8))} ${chalk.gray(cmd1.description.substring(0, 20).padEnd(20))}` : '';
            const line2 = cmd2 ? `${chalk.yellow('•')} ${chalk.white(this.prefix + cmd2.name.padEnd(8))} ${chalk.gray(cmd2.description.substring(0, 20).padEnd(20))}` : '';

            commandLines.push(`${chalk.cyan('║')}    ${line1}  ${line2}   ${chalk.cyan('║')}`);
        }

        const bannerTop = `
${chalk.cyan('╔════════════════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}                                                                        ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.blue.bold('██╗   ██╗')}${chalk.white.bold('      ██╗   ██╗██╗     ████████╗██╗███╗   ███╗ █████╗ ████████╗███████╗')}    ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.blue.bold('██║   ██║')}${chalk.white.bold('      ██║   ██║██║     ╚══██╔══╝██║████╗ ████║██╔══██╗╚══██╔══╝██╔════╝')}    ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.blue.bold('██║   ██║')}${chalk.white.bold('█████╗██║   ██║██║        ██║   ██║██╔████╔██║███████║   ██║   █████╗  ')}    ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.blue.bold('╚██╗ ██╔╝')}${chalk.white.bold('╚════╝██║   ██║██║        ██║   ██║██║╚██╔╝██║██╔══██║   ██║   ██╔══╝  ')}    ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.blue.bold(' ╚████╔╝ ')}${chalk.white.bold('      ╚██████╔╝███████╗   ██║   ██║██║ ╚═╝ ██║██║  ██║   ██║   ███████╗')}    ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.blue.bold('  ╚═══╝  ')}${chalk.white.bold('       ╚═════╝ ╚══════╝   ╚═╝   ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝')}    ${chalk.cyan('║')}
${chalk.cyan('║')}                                                                        ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.yellow('»')} ${chalk.white.bold('Version:')} ${chalk.green('2.3.2')}                                              ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.yellow('»')} ${chalk.white.bold('Author :')} ${chalk.green('vazul76')}                                              ${chalk.cyan('║')}
${chalk.cyan('║')}    ${chalk.yellow('»')} ${chalk.white.bold('Status :')} ${chalk.green.bold('ONLINE')}                                               ${chalk.cyan('║')}
${chalk.cyan('║')}                                                                        ${chalk.cyan('║')}
${chalk.cyan('╠════════════════════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')}    ${chalk.magenta.bold('AVAILABLE COMMANDS:')}                        ${chalk.cyan('║')}`;

        const bannerBottom = `${chalk.cyan('╚════════════════════════════════════════════════════════════════════════╝')}
        `;

        console.log(bannerTop);
        commandLines.forEach(line => console.log(line));
        console.log(bannerBottom);
    }

    startHealthChecks() {

        // Schedule daily health check at 8:00 AM
        const scheduleNextCheck = () => {
            const now = new Date();
            const next = new Date();
            next.setHours(8, 0, 0, 0); // 8:00 AM

            // If 8 AM already passed today, schedule for tomorrow
            if (now.getHours() >= 8) {
                next.setDate(next.getDate() + 1);
            }

            const timeUntilNext = next.getTime() - now.getTime();

            setTimeout(async () => {
                logger.info('Running scheduled health check (8:00 AM)...');
                const results = await healthChecker.checkAll();
                logger.info(healthChecker.formatReport(results));

                // Send report to admin (including warnings)
                await healthChecker.sendReport(results);

                // Schedule next check
                scheduleNextCheck();
            }, timeUntilNext);

            const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
            const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
            logger.info(`Next health check scheduled at 8:00 AM (in ${hours}h ${minutes}m)`);
        };

        scheduleNextCheck();
    }

    async stop() {
        if (this.sock) {
            logger.info('Closing socket...');
            this.sock.end();
        }
    }
}

module.exports = WABot;
