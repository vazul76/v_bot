const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, delay } = require('@whiskeysockets/baileys');
const chalk = require('chalk');
const P = require('pino');

const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger');
const helpers = require('./utils/helpers');
const healthChecker = require('./utils/healthChecker');
const autoUpdater = require('./utils/autoUpdater');
const newsMonitor = require('./utils/newsMonitor');
const catalog = require('./utils/commandCatalog');
const pendingActions = require('./utils/pendingActions');
const intent = require('./utils/commandIntent');

// Commands
const stickerCommand = require('./commands/sticker');
const showsCommand = require('./commands/shows');
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
const bbmCommand = require('./commands/bbm');
const imsakiyahCommand = require('./commands/imsakiyah');
const qrCommand = require('./commands/qr');
const nslookupCommand = require('./commands/nslookup');
const encodeCommand = require('./commands/encode');
const cleanuinCommand = require('./commands/cleanuin');
const newsuinCommand = require('./commands/newsuin');
const newsfstCommand = require('./commands/newsfst');
const idgrupCommand = require('./commands/idgrup');
const askCommand = require('./commands/ask');
const matkulCommand = require('./commands/matkul');
const threadsCommand = require('./commands/threads');

// Schedulers
const matkulScheduler = require('./utils/matkulScheduler');


class WABot {
    constructor() {
        this.sock = null;
        this.prefix = '/';
        this.startupTime = null;
        this.authState = null;
        this.saveCreds = null;
        this.adminNumber = process.env.ADMIN_NUMBER || null; // Format: 628xxxxxxxxxx@s.whatsapp.net
        this.commands = new Map();
        this.healthCheckTimer = null;

        this.registerCommands();
    }

    registerCommands() {
        // Collect all commands from command modules
        const modules = [
            stickerCommand, showsCommand, youtubeCommand, facebookCommand, tiktokCommand,
            instagramCommand, twitterCommand, pollCommand, ttsCommand,
            translateCommand, scanCommand, weatherCommand, testCommand,
            priceCommand, bbmCommand, imsakiyahCommand, qrCommand, nslookupCommand, encodeCommand, cleanuinCommand, newsuinCommand,
            newsfstCommand, idgrupCommand, matkulCommand, threadsCommand
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
            browser: ['V-Bot', 'Chrome', '121.0.0'],
            defaultQueryTimeoutMs: undefined,
            version: [2, 3200, 6934490], // fix 405 Connection Failure on new pairing
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

                // Start auto-updater (00:00 WIB every day)
                autoUpdater.start('0 0 * * *');

                // Start matkul scheduler (reminder at 05:00 every day)
                matkulScheduler.start(this.sock, this.adminNumber);

                // Start news monitor (every 5 hours = 300 minutes)
                if (this.adminNumber) {
                    newsMonitor.start(this.sock, this.adminNumber, 300);
                    logger.info('News monitor started');
                } else {
                    logger.warn('ADMIN_NUMBER not set in .env, news monitoring disabled');
                }
            }

            // Disconnected
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                logger.warn('Connection closed:', lastDisconnect?.error?.message || 'No error message');
                // Ensure we don't keep scheduled health checks from previous connection
                try {
                    this.stopHealthChecks();
                } catch (e) {
                    logger.warn('Error stopping health checks on disconnect:', e.message);
                }

                // Stop auto-updater on disconnect
                try {
                    autoUpdater.stop();
                } catch (e) {
                    logger.warn('Error stopping auto-updater on disconnect:', e.message);
                }

                // Stop matkul scheduler on disconnect
                try {
                    matkulScheduler.stop();
                } catch (e) {
                    logger.warn('Error stopping matkul scheduler on disconnect:', e.message);
                }

                // Stop news monitor on disconnect
                try {
                    newsMonitor.stop();
                } catch (e) {
                    logger.warn('Error stopping news monitor on disconnect:', e.message);
                }
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
            const senderNumber = await this.resolveSenderNumber(msg);
            const ctx = await this.getConversationContext(msg, senderNumber);
            const body = (text || '').trim();

            if (!body) {
                // Media tanpa caption tetap diproses kalau ada saran yang menunggu media.
                if (intent.getMediaType(msg)) {
                    logger.info(`Media diterima tanpa teks dari ${senderNumber}${this.getChatSuffix(msg)}`);
                    if (await this.handlePendingAction(msg, '', ctx)) return;
                }
                return;
            }

            logger.info(`Pesan diterima: "${body}" dari ${senderNumber}${this.getChatSuffix(msg)}`);

            // Deteksi tag bot lebih awal supaya "@bot /s" dan "@bot .s" tetap terbaca.
            const mentionedBot = ctx.isGroup ? this.isBotMentioned(msg, body) : false;
            const cleanBody = mentionedBot ? this.stripBotMentions(body).trim() : body;

            // 1. Command eksplisit "/..." (boleh didahului tag bot)
            if (cleanBody.startsWith(this.prefix)) {
                pendingActions.clear(ctx.chatId, ctx.senderId);

                const commandBody = cleanBody.slice(this.prefix.length).trim();
                const args = commandBody.split(/ +/);
                const command = args[0].toLowerCase();

                logger.info(`Command terdeteksi: "${command}"`);
                await this.routeCommand(command, cleanBody, msg);
                return;
            }

            // Deteksi reply bot (dipakai untuk menu & AI di grup)
            const replyToBot = ctx.isGroup ? await this.isReplyToBot(msg) : false;

            // Kalau isi pesan baru hanya tag bot, pakai teks pesan yang di-reply.
            let quotedText = '';
            if (ctx.isGroup && (mentionedBot || replyToBot) && !cleanBody) {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    quotedText = (askCommand.getTextFromMessage(quoted.message) || '').trim();
                }
            }

            const effectiveText = quotedText || cleanBody;

            // 2. Permintaan menu / bantuan.
            //    Di grup hanya merespons jika bot di-tag atau di-reply agar tidak spam.
            if (intent.isMenuRequest(effectiveText) && (!ctx.isGroup || mentionedBot || replyToBot)) {
                pendingActions.clear(ctx.chatId, ctx.senderId);
                await this.sendHelp(msg, ctx);
                return;
            }

            // 3. Lanjutan saran (ya / 1 / 2 / isi argumen / media)
            if (await this.handlePendingAction(msg, cleanBody, ctx)) return;

            // 4. Prefix salah: .s / !s
            if (await this.handleWrongPrefix(msg, cleanBody, ctx)) return;

            // 5. Gate grup: AI & saran hanya aktif jika tag/reply
            if (ctx.isGroup && !mentionedBot && !replyToBot) {
                logger.info('Pesan grup non-command diabaikan (bukan reply/tag bot)');
                return;
            }

            const promptText = effectiveText;

            if (!promptText) {
                logger.info('Prompt kosong setelah diproses, diabaikan');
                return;
            }

            if (ctx.isGroup) {
                logger.info(
                    `AI trigger di grup via ${mentionedBot ? 'tag' : ''}${mentionedBot && replyToBot ? ' + ' : ''}${replyToBot ? 'reply' : ''}`
                );
            }

            // 6. Pertanyaan "cara pakai ..." -> bantuan command
            if (await this.handleHelpQuestion(msg, promptText, ctx)) return;

            // 7. Intent command (rule-based dulu, AI kalau perlu)
            if (await this.handleCommandIntent(msg, promptText, ctx)) return;

            // 8. Fallback: AI chat biasa
            logger.info(`Auto AI trigger terdeteksi: "${promptText}"`);
            await askCommand.processAndReply(this.sock, msg, promptText, {
                showReactions: false,
                includeQuotedContext: true,
                preserveQuotedOnlyPrompt: Boolean(quotedText),
                catalogText: catalog.buildAiCatalogText(ctx.scope, { executableOnly: false })
            });

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

    /**
     * Konteks percakapan + scope katalog.
     * Aturan: admin hanya dapat katalog privat di DM; grup selalu public.
     */
    async getConversationContext(msg, senderNumber) {
        const chatId = msg?.key?.remoteJid || '';
        const isGroup = this.isGroupChat(chatId);
        const senderId = senderNumber
            || (isGroup ? msg?.key?.participant : msg?.key?.remoteJid)
            || chatId;
        const isAdmin = helpers.isAdminNumber(senderNumber);

        return {
            chatId,
            senderId,
            isGroup,
            isAdmin,
            scope: catalog.getCatalogScope({ isGroup, isAdmin })
        };
    }

    getMediaLabel(command) {
        const types = command?.mediaTypes || [];
        if (types.includes('sticker')) return 'stiker';
        if (types.includes('image') && types.includes('video')) return 'gambar/video';
        if (types.includes('image')) return 'gambar';
        if (types.includes('video')) return 'video';
        if (types.includes('audio')) return 'audio/voice note';
        if (types.includes('document')) return 'file';
        return 'media (gambar/video)';
    }

    isActionLike(text) {
        if (intent.extractUrl(text)) return true;
        return /\b(download|unduh|bikin|buat|bikinin|ubah|jadiin|jadikan|cek|scan|generate|kirim|terjemah|translate|cari|tolong|minta)\b/i.test(text);
    }

    parseChoice(body, options = []) {
        const norm = intent.normalize(body);
        if (!norm) return -1;

        const number = Number.parseInt(norm, 10);
        if (Number.isInteger(number) && number >= 1 && number <= options.length) {
            return number - 1;
        }

        const tokens = new Set(norm.split(' ').filter(Boolean));

        // "tanpa teks" / "tidak pakai teks" -> pilih opsi /s
        if (/\b(tanpa|tidak|gak|nggak)\b/.test(norm) && tokens.has('teks')) {
            const index = options.findIndex(option => option.command === 's');
            if (index >= 0) return index;
        }

        // "pakai teks" / "dengan tulisan" -> pilih opsi yang butuh teks
        if (/\b(pakai|dengan|ada)\b/.test(norm) && (tokens.has('teks') || tokens.has('tulisan'))) {
            const index = options.findIndex(option => option.needsText || option.command === 'stext');
            if (index >= 0) return index;
        }

        for (let i = 0; i < options.length; i++) {
            const command = catalog.findCommand(options[i].command);
            if (!command) continue;

            const names = [command.name, ...(command.aliases || [])]
                .map(item => String(item).toLowerCase());

            if (names.some(name => tokens.has(name))) return i;
        }

        return -1;
    }

    /**
     * Tangani lanjutan saran: konfirmasi, pilihan, argumen, atau media.
     * Return true jika pesan sudah dikonsumsi.
     */
    async handlePendingAction(msg, body, ctx) {
        const action = pendingActions.get(ctx.chatId, ctx.senderId);
        if (!action) return false;

        // Jangan hapus pending hanya karena pesan berisi tag tanpa teks.
        if (!String(body || '').trim() && !intent.getMediaType(msg)) return false;

        const norm = intent.normalize(body);
        const isYes = /^(ya|y|yes|yup|boleh|gas|lanjut|oke|ok|setuju|jalankan|silakan)\b/.test(norm);
        const isNo = /^(tidak|enggak|gak|nggak|no|batal|cancel|jangan|stop)\b/.test(norm);

        const cancel = async (message = 'Oke, dibatalkan.') => {
            pendingActions.clear(ctx.chatId, ctx.senderId);
            await helpers.replyWithTyping(this.sock, msg, message);
        };

        if (action.stage === 'confirm') {
            if (isYes) {
                pendingActions.clear(ctx.chatId, ctx.senderId);
                await this.executePendingAction(action, msg, ctx);
                return true;
            }

            if (isNo) {
                await cancel();
                return true;
            }

            // Bukan jawaban konfirmasi -> lepas pending agar tidak nyangkut
            pendingActions.clear(ctx.chatId, ctx.senderId);
            return false;
        }

        if (action.stage === 'choose') {
            const index = this.parseChoice(body, action.options || []);

            if (index >= 0) {
                await this.applyChoice(action, index, msg, ctx);
                return true;
            }

            if (isNo) {
                await cancel();
                return true;
            }

            pendingActions.clear(ctx.chatId, ctx.senderId);
            return false;
        }

        if (action.stage === 'need_arg') {
            if (isNo) {
                await cancel();
                return true;
            }

            const args = body.trim();

            if (!args) {
                // User mengirim media tanpa teks saat diminta argumen (mis. /scan).
                if (action.commandDef?.optionalMedia && intent.getMediaType(msg)) {
                    pendingActions.clear(ctx.chatId, ctx.senderId);
                    await this.executePendingAction({ ...action, args: '', originalMsg: msg }, msg, ctx);
                    return true;
                }
                return true;
            }

            const validation = intent.validateArgs(action.commandDef, args);
            if (!validation.ok) {
                await helpers.replyWithTyping(this.sock, msg, `❌ ${validation.error}`);
                return true;
            }

            action.args = validation.args;
            action.command = action.commandDef.name;
            action.stage = 'need_media';

            if (intent.hasRequiredMedia(action.commandDef, action.originalMsg)) {
                pendingActions.clear(ctx.chatId, ctx.senderId);
                await this.executePendingAction(action, msg, ctx);
                return true;
            }

            pendingActions.set(ctx.chatId, ctx.senderId, action);
            await helpers.replyWithTyping(
                this.sock,
                msg,
                `Sekarang kirim atau reply ${this.getMediaLabel(action.commandDef)} dulu ya. Balas *batal* untuk membatalkan.`
            );
            return true;
        }

        if (action.stage === 'need_media') {
            if (isNo) {
                await cancel();
                return true;
            }

            if (!intent.getMediaType(msg)) {
                await helpers.replyWithTyping(
                    this.sock,
                    msg,
                    `Kirim atau reply ${this.getMediaLabel(action.commandDef)} dulu ya. Balas *batal* untuk membatalkan.`
                );
                return true;
            }

            // Kalau user mengirim media dengan caption, coba ambil argumen dari caption.
            if (!action.args) {
                const caption = (this.getMessageText(msg) || '').trim();
                if (caption) {
                    if (action.commandDef.name === 'stext') {
                        action.args = caption.slice(0, 40);
                    } else {
                        const extracted = intent.extractArgs(action.commandDef, caption);
                        if (extracted) action.args = extracted;
                    }
                }
            }

            const missing = intent.getMissingArg(action.commandDef, action.args);
            if (missing) {
                action.stage = 'need_arg';
                action.argPrompt = intent.buildArgPrompt(action.commandDef);
                pendingActions.set(ctx.chatId, ctx.senderId, action);
                await helpers.replyWithTyping(this.sock, msg, action.argPrompt);
                return true;
            }

            pendingActions.clear(ctx.chatId, ctx.senderId);
            await this.executePendingAction({ ...action, originalMsg: msg }, msg, ctx);
            return true;
        }

        pendingActions.clear(ctx.chatId, ctx.senderId);
        return false;
    }

    async applyChoice(action, index, msg, ctx) {
        const option = (action.options || [])[index];
        if (!option) return;

        const commandDef = catalog.findCommand(option.command);
        if (!commandDef) return;

        let args = option.args || '';

        if (option.needsText && !args) {
            action.stage = 'need_arg';
            action.command = commandDef.name;
            action.commandDef = commandDef;
            action.args = '';
            action.argPrompt = intent.buildArgPrompt(commandDef);
            pendingActions.set(ctx.chatId, ctx.senderId, action);
            await helpers.replyWithTyping(this.sock, msg, action.argPrompt);
            return;
        }

        const validation = intent.validateArgs(commandDef, args);
        if (!validation.ok) {
            action.stage = 'need_arg';
            action.command = commandDef.name;
            action.commandDef = commandDef;
            action.args = '';
            action.argPrompt = `❌ ${validation.error}\n\n${intent.buildArgPrompt(commandDef)}`;
            pendingActions.set(ctx.chatId, ctx.senderId, action);
            await helpers.replyWithTyping(this.sock, msg, action.argPrompt);
            return;
        }

        args = validation.args;
        action.command = commandDef.name;
        action.commandDef = commandDef;
        action.args = args;

        if (!intent.hasRequiredMedia(commandDef, action.originalMsg)) {
            action.stage = 'need_media';
            pendingActions.set(ctx.chatId, ctx.senderId, action);
            await helpers.replyWithTyping(
                this.sock,
                msg,
                `Siap. Sekarang kirim atau reply ${this.getMediaLabel(commandDef)} dulu ya. Balas *batal* untuk membatalkan.`
            );
            return;
        }

        pendingActions.clear(ctx.chatId, ctx.senderId);
        await this.executePendingAction(action, msg, ctx);
    }

    async executePendingAction(action, msg, ctx) {
        const commandDef = action.commandDef || catalog.findCommand(action.command);

        if (!commandDef) {
            await helpers.replyWithTyping(this.sock, msg, '❌ Command tidak ditemukan.');
            return;
        }

        // Command admin/privat/dangerous tidak pernah dieksekusi otomatis.
        if (!commandDef.public || commandDef.adminOnly || commandDef.dangerous) {
            await helpers.replyWithTyping(
                this.sock,
                msg,
                `🔒 /${commandDef.name} tidak bisa dijalankan otomatis. Ketik command-nya manual ya.`
            );
            return;
        }

        const args = String(action.args || '').trim();
        const commandBody = `/${commandDef.name}${args ? ` ${args}` : ''}`;
        const targetMsg = action.originalMsg || msg;

        logger.info(
            `Menjalankan saran /${commandDef.name}${args ? ` (${args})` : ''} untuk ${ctx.senderId}${this.getChatSuffix(msg)}`
        );

        await this.routeCommand(commandDef.name, commandBody, targetMsg);
    }

    /**
     * Prefix salah: .s / !s -> saran command yang benar.
     */
    async handleWrongPrefix(msg, body, ctx) {
        const detected = intent.detectWrongPrefix(body);
        if (!detected) return false;

        if (['menu', 'help', 'bantuan'].includes(detected.name)) {
            await this.sendHelp(msg, ctx);
            return true;
        }

        const commandDef = catalog.findCommand(detected.name);
        if (!commandDef) return false;

        // Command privat hanya boleh "dilihat" admin di DM.
        if (!commandDef.public && !ctx.scope.includePrivate) return false;

        // Untuk /stext, semua teks setelah nama command adalah isi stiker.
        // Command lain pakai extractor supaya kata pemicu tidak ikut jadi argumen.
        const args = detected.rest
            ? (commandDef.name === 'stext'
                ? detected.rest
                : intent.extractArgs(commandDef, detected.rest))
            : '';

        if (!commandDef.public || commandDef.adminOnly || commandDef.dangerous) {
            await helpers.replyWithTyping(
                this.sock,
                msg,
                `Mungkin maksudmu \`${catalog.formatUsage(commandDef)}\`?\n\n${commandDef.description}.\n\n🔒 Command ini hanya untuk admin.`
            );
            return true;
        }

        await this.presentSuggestion(msg, ctx, commandDef, args, 'prefix');
        return true;
    }

    /**
     * Tampilkan saran satu command + siapkan pending action.
     */
    async presentSuggestion(msg, ctx, commandDef, args, source = 'rule') {
        if (!commandDef || !commandDef.public || commandDef.adminOnly || commandDef.dangerous) {
            return;
        }

        let finalArgs = String(args || '').trim();

        // Untuk prefix salah (.scan ...), jangan fallback ke teks lengkap:
        // extractor sudah memutuskan apakah rest itu argumen valid atau bukan.
        if (!finalArgs && source !== 'prefix') {
            finalArgs = intent.extractArgs(commandDef, this.getMessageText(msg) || '');
        }

        let validationError = '';
        const validation = intent.validateArgs(commandDef, finalArgs);

        if (!validation.ok) {
            validationError = validation.error;
            finalArgs = '';
        }

        const missing = intent.getMissingArg(commandDef, finalArgs);
        const hasMedia = intent.hasRequiredMedia(commandDef, msg);
        const mediaType = intent.getMediaType(msg);
        const needsScanTarget = commandDef.name === 'scan' && !finalArgs && !mediaType;
        const needsArg = Boolean(missing) || needsScanTarget;

        let text = `Mungkin maksudmu \`${catalog.formatUsage(commandDef)}\`?\n\n${commandDef.description}.`;

        if (finalArgs) {
            text += `\n\n📎 Argumen terdeteksi: ${finalArgs}`;
        }

        if (validationError) {
            text += `\n\n❌ ${validationError}`;
        }

        if (needsArg) {
            text += `\n\n${intent.buildArgPrompt(commandDef)}`;
        } else if (!hasMedia) {
            text += `\n\n📷 Kirim atau reply ${this.getMediaLabel(commandDef)} dulu ya.`;
        } else {
            text += '\n\nBalas *ya* untuk saya jalankan.';
        }

        if (source === 'ai') {
            text += '\n\n_(disarankan AI)_';
        }

        await helpers.replyWithTyping(this.sock, msg, text);

        if (needsArg) {
            pendingActions.set(ctx.chatId, ctx.senderId, {
                stage: 'need_arg',
                command: commandDef.name,
                commandDef,
                args: finalArgs,
                argPrompt: intent.buildArgPrompt(commandDef),
                originalMsg: msg,
                options: null
            });
            return;
        }

        if (!hasMedia) {
            pendingActions.set(ctx.chatId, ctx.senderId, {
                stage: 'need_media',
                command: commandDef.name,
                commandDef,
                args: finalArgs,
                originalMsg: msg,
                options: null
            });
            return;
        }

        pendingActions.set(ctx.chatId, ctx.senderId, {
            stage: 'confirm',
            command: commandDef.name,
            commandDef,
            args: finalArgs,
            originalMsg: msg,
            options: null
        });
    }

    /**
     * Tampilkan beberapa pilihan command (mis. /s vs /stext).
     */
    async presentChoices(msg, ctx, matches, source = 'rule') {
        const options = intent.buildChoiceOptions(matches);
        if (options.length === 0) return;

        const lines = ['Mau yang mana?', ''];

        options.forEach((option, index) => {
            lines.push(`${index + 1}. \`${option.label}\` — ${option.hint}`);
        });

        lines.push('');
        lines.push(`Balas angka 1${options.length > 1 ? `-${options.length}` : ''}.`);
        if (source === 'ai') lines.push('_(disarankan AI)_');

        await helpers.replyWithTyping(this.sock, msg, lines.join('\n'));

        pendingActions.set(ctx.chatId, ctx.senderId, {
            stage: 'choose',
            command: null,
            commandDef: null,
            args: '',
            options,
            originalMsg: msg
        });
    }

    /**
     * Pertanyaan "cara pakai ..." dijawab dari katalog.
     * Match kuat -> deterministik (hemat kuota). Match lemah -> AI help.
     */
    async handleHelpQuestion(msg, text, ctx) {
        if (!intent.isHelpQuestion(text)) return false;

        const matches = intent.matchCommands(text, {
            executableOnly: false,
            includePrivate: ctx.scope.includePrivate,
            threshold: 0.6
        });

        if (matches.length === 0) return false;

        if (matches[0].score >= 0.85) {
            await helpers.replyWithTyping(this.sock, msg, this.buildDeterministicHelp(matches));
            return true;
        }

        const cached = intent.getCachedAiResult(ctx.scope, text);
        if (cached) {
            await helpers.replyWithTyping(this.sock, msg, cached);
            return true;
        }

        if (askCommand.hasAiConfig() && intent.canCallAi(ctx.chatId)) {
            try {
                intent.markAiCall(ctx.chatId);
                const catalogText = catalog.buildAiCatalogText(ctx.scope, { executableOnly: false });
                const answer = await askCommand.answerCommandHelp(text, catalogText);

                if (answer) {
                    intent.setCachedAiResult(ctx.scope, text, answer);
                    await helpers.replyWithTyping(this.sock, msg, answer);
                    return true;
                }
            } catch (error) {
                logger.warn(`AI help gagal: ${error.message}`);
            }
        }

        await helpers.replyWithTyping(this.sock, msg, this.buildDeterministicHelp(matches));
        return true;
    }

    buildDeterministicHelp(matches) {
        const lines = ['Ini command yang cocok:', ''];

        for (const { command } of matches.slice(0, 3)) {
            lines.push(`\`${catalog.formatUsage(command)}\` — ${command.description}`);

            if (command.examples?.length) {
                lines.push(`   contoh: ${command.examples[0]}`);
            }

            if (command.requiresMedia) {
                lines.push(`   butuh: ${this.getMediaLabel(command)}`);
            }

            if (command.adminOnly || !command.public) {
                lines.push('   🔒 hanya admin');
            }

            lines.push('');
        }

        lines.push('Ketik command-nya langsung ya.');
        return lines.join('\n');
    }

    /**
     * Rule-based intent dulu; AI hanya fallback kalau tidak ada rule yang cocok.
     */
    async handleCommandIntent(msg, text, ctx) {
        if (!text) return false;

        const threshold = ctx.isGroup ? 0.6 : 0.7;
        let matches = intent.matchCommands(text, {
            executableOnly: true,
            threshold
        });

        let source = 'rule';

        if (matches.length === 0 &&
            askCommand.hasAiConfig() &&
            this.isActionLike(text) &&
            intent.canCallAi(ctx.chatId)) {

            const cached = intent.getCachedAiResult(ctx.scope, text);

            if (cached) {
                matches = this.matchesFromAiResult(cached, text);
            } else {
                try {
                    intent.markAiCall(ctx.chatId);
                    const catalogText = catalog.buildAiCatalogText(ctx.scope, { executableOnly: true });
                    const result = await askCommand.classifyCommandIntent(text, catalogText);

                    if (result) {
                        intent.setCachedAiResult(ctx.scope, text, result);
                        matches = this.matchesFromAiResult(result, text);
                    }
                } catch (error) {
                    logger.warn(`AI intent gagal: ${error.message}`);
                }
            }

            source = 'ai';
        }

        if (matches.length === 0) return false;

        matches = matches.filter(({ command }) =>
            command.public && !command.adminOnly && !command.dangerous
        );

        if (matches.length === 0) return false;

        if (matches.length === 1) {
            await this.presentSuggestion(msg, ctx, matches[0].command, matches[0].args, source);
            return true;
        }

        await this.presentChoices(msg, ctx, matches, source);
        return true;
    }

    matchesFromAiResult(result, text) {
        if (!result || !result.command) return [];
        if (Number(result.confidence) < 0.7) return [];

        const commandDef = catalog.findCommand(result.command);
        if (!commandDef) return [];
        if (!commandDef.public || commandDef.adminOnly || commandDef.dangerous) return [];

        const args = result.args
            ? String(result.args).trim()
            : intent.extractArgs(commandDef, text);

        return [{
            command: commandDef,
            args: args || '',
            score: Number(result.confidence) || 0.7
        }];
    }

    isGroupChat(remoteJid) {
        return typeof remoteJid === 'string' && remoteJid.endsWith('@g.us');
    }

    /**
     * Info konteks chat untuk log: hanya grup yang ditampilkan.
     * Contoh: " di 120363198302441256@g.us"
     */
    getChatSuffix(msg) {
        const jid = msg?.key?.remoteJid;
        return this.isGroupChat(jid) ? ` di ${jid}` : '';
    }

    /**
     * Daftar identitas bot (PN dan LID) dalam format ternormalisasi.
     * Di grup LID, tag/reply bisa memakai salah satu, jadi keduanya dibandingkan.
     */
    getBotIdentities() {
        return [this.sock?.user?.id, this.sock?.user?.lid]
            .filter(Boolean)
            .map(jid => this.normalizeJid(jid));
    }

    /**
     * Ambil contextInfo dari berbagai tipe pesan (tempat mentionedJid berada).
     */
    getMessageContextInfo(msg) {
        const m = msg?.message || {};

        return (
            m.extendedTextMessage?.contextInfo ||
            m.imageMessage?.contextInfo ||
            m.videoMessage?.contextInfo ||
            m.audioMessage?.contextInfo ||
            m.documentMessage?.contextInfo ||
            m.stickerMessage?.contextInfo ||
            m.buttonsResponseMessage?.contextInfo ||
            m.listResponseMessage?.contextInfo ||
            m.templateButtonReplyMessage?.contextInfo ||
            m.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
            null
        );
    }

    /**
     * Cek apakah bot di-tag di pesan grup.
     * Utama: contextInfo.mentionedJid. Fallback: token "@nomor" di teks.
     */
    isBotMentioned(msg, text = '') {
        const botIds = this.getBotIdentities();
        if (!botIds.length) return false;

        const mentioned = this.getMessageContextInfo(msg)?.mentionedJid || [];
        if (mentioned.length) {
            const mentionedIds = mentioned.map(jid => this.normalizeJid(jid));
            if (mentionedIds.some(jid => botIds.includes(jid))) return true;
        }

        // Fallback: WhatsApp kadang tidak mengirim mentionedJid pada varian tertentu
        const body = text || this.getMessageText(msg) || '';
        return botIds.some(jid => {
            const number = jid.split('@')[0];
            return number && new RegExp(`@${number}\\b`).test(body);
        });
    }

    /**
     * Buang token tag bot dari teks, supaya prompt AI bersih.
     * Contoh: "@62895380204873 jelaskan X" -> "jelaskan X"
     */
    stripBotMentions(text) {
        let result = text || '';

        for (const jid of this.getBotIdentities()) {
            const number = jid.split('@')[0];
            if (!number) continue;
            result = result.replace(new RegExp(`@${number}\\b`, 'g'), '');
        }

        return result.replace(/\s+/g, ' ').trim();
    }

    getBotJid() {
        return this.normalizeJid(this.sock?.user?.id || '');
    }

    normalizeJid(jid) {
        return (jid || '').replace(/:\d+@/g, '@');
    }

    /**
     * Nomor pengirim untuk keperluan log.
     * Delegasi ke helpers agar logika LID -> PN satu sumber dengan command admin.
     * Return: nomor tanpa "@s.whatsapp.net", atau "LID:<id>" bila tidak bisa di-resolve.
     */
    async resolveSenderNumber(msg) {
        const number = await helpers.resolveSenderNumber(this.sock, msg);
        if (number) return number;

        const key = msg.key || {};
        const isGroup = this.isGroupChat(key.remoteJid);
        const jid = isGroup ? key.participant : key.remoteJid;
        return jid ? `LID:${this.normalizeJid(jid).split('@')[0]}` : 'unknown';
    }

    async isReplyToBot(msg, botJids = this.getBotIdentities()) {
        if (!botJids.length) return false;

        const quoted = await helpers.getQuotedMessage(msg);
        if (!quoted?.sender) return false;

        const sender = this.normalizeJid(quoted.sender);
        if (botJids.includes(sender)) return true;

        // Fallback: sender LID -> PN (grup yang memakai addressing LID)
        if (sender.endsWith('@lid')) {
            try {
                const pn = await this.sock?.signalRepository?.lidMapping?.getPNForLID(sender);
                if (pn && botJids.includes(this.normalizeJid(pn))) return true;
            } catch (err) {
                logger.warn(`Gagal resolve quoted sender ${sender} ke nomor: ${err.message}`);
            }
        }

        return false;
    }

    async routeCommand(command, body, msg) {
        try {
            // Special case for help menu
            if (command === 'menu' || command === 'help') {
                logger.info('Menjalankan command help');
                const senderNumber = await this.resolveSenderNumber(msg);
                const ctx = await this.getConversationContext(msg, senderNumber);
                return await this.sendHelp(msg, ctx);
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
                await helpers.replyWithTyping(
                    this.sock,
                    msg,
                    `❌ Command \`/${command}\` tidak dikenal.\n\nKetik \`/menu\` untuk lihat daftar command.\nAtau tulis pertanyaanmu langsung (di grup: tag/reply bot dulu).`
                );
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

    async sendHelp(msg, ctx = {}) {
        await helpers.reactCommandReceived(this.sock, msg);

        // Admin hanya dapat bagian privat di DM. Grup selalu public.
        const scope = {
            isGroup: Boolean(ctx.isGroup),
            isAdmin: Boolean(ctx.isAdmin),
            includePrivate: Boolean(!ctx.isGroup && ctx.isAdmin)
        };

        const helpText = catalog.buildMenuText(scope);

        await helpers.replyWithTyping(this.sock, msg, helpText, 2000);
        await helpers.reactSuccess(this.sock, msg);
        logger.success(`Help message sent (${scope.includePrivate ? 'admin' : 'public'})`);
    }

    displayBanner() {
        console.clear();

        // Build command list string
        let commandLines = [];
        const uniqueCommands = [];
        const seenMethods = new Set();

        // Filter out aliases for display if they point to same method in same module
        this.commands.forEach((cfg, name) => {
            if (['imsakiyah', 'cleanuin', 'newsuin', 'newsfst', 'idgrup', 'addmatkul', 'listmatkul', 'deletematkul', 'deleteallmatkul', 'matkul'].includes(name)) {
                return;
            }

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
${chalk.cyan('║')}    ${chalk.yellow('»')} ${chalk.white.bold('Version:')} ${chalk.green('2.5.0')}                                              ${chalk.cyan('║')}
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
        // Prevent multiple schedulers by clearing any existing timer first
        if (this.healthCheckTimer) {
            logger.info('Existing health check timer detected, clearing it before scheduling a new one');
            clearTimeout(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        const scheduleNextCheck = () => {
            const now = new Date();
            const next = new Date();
            next.setHours(8, 0, 0, 0); // 8:00 AM

            // If 8 AM already passed today, schedule for tomorrow
            if (now.getHours() >= 8) {
                next.setDate(next.getDate() + 1);
            }

            const timeUntilNext = next.getTime() - now.getTime();

            // Clear any existing pending timer and set a new one
            if (this.healthCheckTimer) {
                clearTimeout(this.healthCheckTimer);
                this.healthCheckTimer = null;
            }

            this.healthCheckTimer = setTimeout(async () => {
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

    stopHealthChecks() {
        if (this.healthCheckTimer) {
            logger.info('Stopping health check timer');
            clearTimeout(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    async stop() {
        if (this.sock) {
            logger.info('Closing socket...');
            this.sock.end();
        }

        // Stop scheduler
        try {
            matkulScheduler.stop();
        } catch (e) {
            logger.warn('Error stopping matkul scheduler:', e.message);
        }
    }
}

module.exports = WABot;
