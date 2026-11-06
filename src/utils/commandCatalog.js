/**
 * Katalog command bot — satu sumber kebenaran untuk:
 * - /menu (public + admin)
 * - rule-based intent matcher
 * - database command untuk AI
 *
 * Aturan:
 * - public: true  -> tampil di /menu publik & boleh dipakai AI
 * - public: false -> command privat/admin, TIDAK tampil di /menu publik
 * - adminOnly     -> hanya admin yang boleh menjalankan (guard tetap di command)
 * - dangerous     -> tidak pernah dieksekusi otomatis oleh AI/saran
 *
 * Alias command (tiktok->tt, threads->th, twitter->x, weather->cuaca, pool->poll)
 * disimpan di field `aliases`, bukan entry terpisah.
 */

const COMMANDS = [
    // ================= STICKER =================
    {
        name: 's',
        aliases: [],
        description: 'Gambar/video → stiker',
        usage: '/s',
        category: 'Sticker',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: true,
        mediaTypes: ['image', 'video'],
        intentGroup: 'sticker',
        keywords: [
            'stiker', 'sticker', 'bikin stiker', 'buat stiker', 'bikinin stiker',
            'jadiin stiker', 'ubah ke stiker', 'bikin sticker', 'buat sticker',
            'stiker tanpa teks', 'bikin stiker tanpa teks'
        ],
        args: [],
        examples: ['bikin stiker dari gambar ini', 'buat sticker tanpa teks']
    },
    {
        name: 'stext',
        aliases: [],
        description: 'Gambar/video → stiker dengan teks',
        usage: '/stext <teks>',
        category: 'Sticker',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: true,
        mediaTypes: ['image', 'video'],
        intentGroup: 'sticker',
        keywords: [
            'stiker', 'sticker', 'bikin stiker', 'buat stiker',
            'bikin sticker', 'buat sticker',
            'stiker pakai teks', 'stiker dengan teks', 'stiker ada teks',
            'stiker ada tulisan', 'stiker pakai tulisan', 'tambah teks ke stiker',
            'tambah tulisan ke stiker', 'stiker teks', 'stext'
        ],
        args: [{ name: 'teks', required: true, type: 'text', maxLength: 40 }],
        examples: ['bikin stiker pakai teks Halo Dunia', 'stiker dengan tulisan lucu']
    },
    {
        name: 'toimg',
        aliases: [],
        description: 'Stiker → gambar/video',
        usage: '/toimg',
        category: 'Sticker',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: true,
        mediaTypes: ['sticker'],
        intentGroup: 'sticker-to-image',
        keywords: [
            'stiker jadi gambar', 'sticker jadi gambar', 'ubah stiker ke gambar',
            'stiker ke foto', 'stiker ke gambar', 'toimg', 'convert stiker',
            'stiker jadi foto', 'sticker jadi foto', 'convert sticker',
            'ubah sticker ke gambar'
        ],
        args: [],
        examples: ['ubah stiker ini jadi gambar']
    },

    // ================= DOWNLOADER =================
    {
        name: 'yt',
        aliases: [],
        description: 'Download video YouTube',
        usage: '/yt <link>',
        category: 'Downloader',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'youtube',
        keywords: [
            'download video youtube', 'unduh video youtube', 'video youtube',
            'youtube mp4', 'simpan video youtube', 'yt',
            'download youtube', 'unduh youtube', 'download video yt',
            'unduh video yt', 'video yt', 'yt video', 'simpan youtube',
            'download mp4', 'unduh mp4'
        ],
        args: [{ name: 'url', required: true, type: 'url' }],
        urlHosts: ['youtube.com', 'youtu.be', 'm.youtube.com'],
        examples: ['download video youtube ini https://youtu.be/xxx']
    },
    {
        name: 'ytmp3',
        aliases: [],
        description: 'Download audio/MP3 YouTube',
        usage: '/ytmp3 <link>',
        category: 'Downloader',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'youtube',
        keywords: [
            'download lagu youtube', 'download audio youtube', 'unduh lagu youtube',
            'youtube mp3', 'lagu youtube', 'mp3 youtube', 'audio youtube',
            'download mp3', 'unduh mp3', 'download audio', 'unduh audio',
            'download lagu', 'unduh lagu', 'lagu', 'mp3', 'audio'
        ],
        args: [{ name: 'url', required: true, type: 'url' }],
        urlHosts: ['youtube.com', 'youtu.be', 'm.youtube.com'],
        examples: ['download lagu youtube ini https://youtu.be/xxx']
    },
    {
        name: 'fb',
        aliases: [],
        description: 'Download video/foto Facebook',
        usage: '/fb <link>',
        category: 'Downloader',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'facebook',
        keywords: [
            'download video facebook', 'download facebook', 'video facebook',
            'unduh facebook', 'foto facebook', 'fb',
            'download fb', 'unduh video facebook', 'download video fb',
            'video fb', 'fb video', 'download foto facebook'
        ],
        args: [{ name: 'url', required: true, type: 'url' }],
        urlHosts: ['facebook.com', 'fb.watch', 'fb.com', 'fb.me', 'm.facebook.com'],
        examples: ['download video facebook ini https://fb.watch/xxx']
    },
    {
        name: 'ig',
        aliases: [],
        description: 'Download video/foto Instagram',
        usage: '/ig <link>',
        category: 'Downloader',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'instagram',
        keywords: [
            'download instagram', 'download ig', 'video instagram', 'foto instagram',
            'reels instagram', 'reels', 'ig',
            'download reels', 'unduh instagram', 'download video ig',
            'ig video', 'reel'
        ],
        args: [{ name: 'url', required: true, type: 'url' }],
        urlHosts: ['instagram.com', 'instagr.am'],
        examples: ['download video instagram ini https://instagram.com/reel/xxx']
    },
    {
        name: 'tt',
        aliases: ['tiktok'],
        description: 'Download video TikTok',
        usage: '/tt <link>',
        category: 'Downloader',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'tiktok',
        keywords: [
            'download tiktok', 'download video tiktok', 'video tiktok',
            'unduh tiktok', 'tiktok',
            'unduh video tiktok', 'tiktok video', 'download tt', 'unduh tt'
        ],
        args: [{ name: 'url', required: true, type: 'url' }],
        urlHosts: ['tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com'],
        examples: ['download video tiktok ini https://vt.tiktok.com/xxx']
    },
    {
        name: 'th',
        aliases: ['threads'],
        description: 'Download video/foto Threads',
        usage: '/th <link>',
        category: 'Downloader',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'threads',
        keywords: [
            'download threads', 'download thread', 'video threads', 'foto threads',
            'post threads', 'threads',
            'download video threads', 'unduh threads', 'threads video'
        ],
        args: [{ name: 'url', required: true, type: 'url' }],
        urlHosts: ['threads.com', 'threads.net', 'www.threads.com', 'www.threads.net'],
        examples: ['download post threads ini https://threads.com/@user/post/xxx']
    },
    {
        name: 'x',
        aliases: ['twitter'],
        description: 'Download video/foto Twitter/X',
        usage: '/x <link>',
        category: 'Downloader',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'twitter',
        keywords: [
            'download twitter', 'download x', 'video twitter', 'video x',
            'foto twitter', 'tweet', 'twitter',
            'download video twitter', 'unduh twitter', 'x video', 'twitter video'
        ],
        args: [{ name: 'url', required: true, type: 'url' }],
        urlHosts: ['x.com', 'twitter.com', 't.co', 'mobile.twitter.com'],
        examples: ['download video twitter ini https://x.com/user/status/xxx']
    },

    // ================= SECURITY =================
    {
        name: 'scan',
        aliases: [],
        description: 'Scan file/URL/hash via VirusTotal',
        usage: '/scan <file/url/hash>',
        category: 'Security',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        mediaTypes: ['document', 'image', 'video', 'audio', 'sticker'],
        optionalMedia: true,
        intentGroup: 'scan',
        keywords: [
            'scan virus', 'cek virus', 'scan file', 'scan link', 'scan url',
            'scan hash', 'virustotal', 'apakah file ini aman',
            'scan', 'cek file', 'periksa file', 'file aman', 'link aman', 'cek link'
        ],
        args: [{ name: 'target', required: false, type: 'text' }],
        examples: ['scan file ini', 'scan https://example.com', 'scan hash abc123']
    },

    // ================= GROUP =================
    {
        name: 'poll',
        aliases: ['pool'],
        description: 'Buat polling',
        usage: '/poll <pertanyaan>, <opsi1>, <opsi2>',
        category: 'Group',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'poll',
        keywords: [
            'buat poll', 'buat polling', 'bikin polling', 'polling', 'voting',
            'buat vote', 'poll', 'bikin poll', 'buat voting', 'bikin vote', 'vote'
        ],
        args: [{
            name: 'poll',
            required: true,
            type: 'list',
            format: 'pertanyaan, opsi1, opsi2'
        }],
        examples: ['buat polling Makan apa?, Nasi Goreng, Mie Ayam']
    },

    // ================= TTS =================
    {
        name: 'say',
        aliases: [],
        description: 'Teks → suara (TTS)',
        usage: '/say <teks>',
        category: 'TTS',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'tts',
        keywords: [
            'text to speech', 'tts', 'bikin suara', 'ubah teks jadi suara',
            'jadikan suara', 'voice note dari teks', 'say',
            'bikin tts', 'buat suara', 'voice', 'voice note', 'ubah suara', 'suara'
        ],
        args: [{ name: 'teks', required: true, type: 'text', maxLength: 200 }],
        examples: ['ubah teks ini jadi suara: Halo dunia']
    },

    // ================= TRANSLATE =================
    {
        name: 'tr',
        aliases: [],
        description: 'Terjemahkan teks (id/en/jp)',
        usage: '/tr <lang> <teks>',
        category: 'Translate',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'translate',
        keywords: [
            'translate', 'terjemahkan', 'terjemah', 'artikan', 'ubah bahasa',
            'bahasa inggris', 'bahasa jepang', 'bahasa indonesia', 'tr',
            'terjemahin', 'translatein', 'terjemahkan ke', 'translate ke',
            'ubah ke bahasa', 'artikan ke'
        ],
        args: [
            { name: 'lang', required: true, type: 'enum', enum: ['id', 'en', 'jp'] },
            { name: 'teks', required: true, type: 'text' }
        ],
        examples: ['terjemahkan ke bahasa inggris: selamat pagi']
    },

    // ================= WEATHER =================
    {
        name: 'cuaca',
        aliases: ['weather'],
        description: 'Cek cuaca DIY',
        usage: '/cuaca <tempat>',
        category: 'Weather',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'weather',
        keywords: [
            'cuaca', 'weather', 'prakiraan cuaca', 'cek cuaca', 'suhu',
            'apakah akan hujan', 'hujan',
            'ramalan cuaca', 'cek suhu', 'suhu udara'
        ],
        args: [{ name: 'tempat', required: true, type: 'text' }],
        examples: ['cek cuaca jogja', 'cuaca di sleman']
    },

    // ================= MARKET =================
    {
        name: 'price',
        aliases: [],
        description: 'Cek harga crypto, emas, IHSG',
        usage: '/price',
        category: 'Market',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'market',
        keywords: [
            'harga crypto', 'harga bitcoin', 'harga emas', 'harga saham', 'ihsg',
            'harga market', 'market', 'price', 'harga btc',
            'harga', 'cek harga', 'hitung harga', 'harga hari ini',
            'kurs', 'crypto', 'bitcoin', 'btc', 'emas', 'saham'
        ],
        args: [],
        examples: ['cek harga bitcoin', 'harga emas hari ini']
    },
    {
        name: 'bbm',
        aliases: [],
        description: 'Cek harga BBM per provinsi',
        usage: '/bbm <provinsi>',
        category: 'Market',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'bbm',
        keywords: [
            'harga bbm', 'harga bensin', 'harga pertalite', 'harga pertamax',
            'harga solar', 'bbm', 'bensin',
            'cek bbm', 'harga pertamina', 'harga bbm hari ini'
        ],
        args: [{ name: 'provinsi', required: false, type: 'text' }],
        examples: ['harga bbm di jawa barat', 'harga bensin jogja']
    },

    // ================= TOOLS =================
    {
        name: 'qr',
        aliases: [],
        description: 'Generate QR code',
        usage: '/qr <teks/url>',
        category: 'Tools',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'qr',
        keywords: [
            'qr', 'qr code', 'qrcode', 'bikin qr', 'buat qr', 'generate qr',
            'kode qr', 'buat qr code', 'bikin qr code', 'generate qr code',
            'qr generator'
        ],
        args: [{ name: 'teks', required: true, type: 'text', maxLength: 1000 }],
        examples: ['buat qr code untuk https://example.com']
    },
    {
        name: 'nslookup',
        aliases: [],
        description: 'Cek IP/domain dan DNS',
        usage: '/nslookup <ip/domain>',
        category: 'Tools',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'nslookup',
        keywords: [
            'nslookup', 'cek ip', 'cek domain', 'dns', 'lookup domain',
            'ip address', 'alamat ip',
            'cek dns', 'lihat ip', 'lihat domain', 'ip'
        ],
        args: [{ name: 'target', required: true, type: 'text' }],
        examples: ['cek ip 8.8.8.8', 'nslookup google.com']
    },
    {
        name: 'encode',
        aliases: [],
        description: 'Encode teks (base64/url/hex/binary/rot13/html)',
        usage: '/encode <format> <teks>',
        category: 'Tools',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'encode',
        keywords: [
            'encode', 'base64', 'hex', 'binary', 'rot13', 'url encode',
            'html entity', 'enkripsi teks',
            'enkripsi', 'base64 encode', 'hex encode', 'binary encode',
            'rot13 encode', 'html encode'
        ],
        args: [
            {
                name: 'format',
                required: true,
                type: 'enum',
                enum: ['base64', 'url', 'hex', 'binary', 'rot13', 'html']
            },
            { name: 'teks', required: true, type: 'text' }
        ],
        examples: ['encode base64 Hello World']
    },
    {
        name: 'decode',
        aliases: [],
        description: 'Decode teks (base64/url/hex/binary/rot13/html)',
        usage: '/decode <format> <teks>',
        category: 'Tools',
        public: true,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'decode',
        keywords: [
            'decode', 'base64 decode', 'hex decode', 'binary decode',
            'rot13 decode', 'url decode', 'html decode', 'dekripsi teks',
            'dekripsi'
        ],
        args: [
            {
                name: 'format',
                required: true,
                type: 'enum',
                enum: ['base64', 'url', 'hex', 'binary', 'rot13', 'html']
            },
            { name: 'teks', required: true, type: 'text' }
        ],
        examples: ['decode base64 SGVsbG8h']
    },

    // ================= PRIVATE / ADMIN =================
    {
        name: 'idgrup',
        aliases: [],
        description: 'Lihat daftar ID grup bot',
        usage: '/idgrup',
        category: 'Admin',
        public: false,
        adminOnly: true,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'admin',
        keywords: ['id grup', 'daftar id grup', 'idgrup'],
        args: [],
        examples: ['lihat id grup']
    },
    {
        name: 'cleanuin',
        aliases: [],
        description: 'Bersihkan database berita UIN',
        usage: '/cleanuin',
        category: 'Admin',
        public: false,
        adminOnly: true,
        dangerous: true,
        requiresMedia: false,
        intentGroup: 'admin',
        keywords: ['bersihkan database', 'clean uin', 'cleanuin'],
        args: [],
        examples: ['bersihkan database berita']
    },
    {
        name: 'addmatkul',
        aliases: [],
        description: 'Tambah jadwal matkul',
        usage: '/addmatkul "Matkul" "Hari" "HH.MM-HH.MM" "Tempat"',
        category: 'Admin',
        public: false,
        adminOnly: true,
        dangerous: true,
        requiresMedia: false,
        intentGroup: 'matkul',
        keywords: ['tambah matkul', 'tambah jadwal kuliah', 'add matkul'],
        args: [],
        examples: ['tambah matkul Algoritma Senin 07.00-08.45 Ruang 101']
    },
    {
        name: 'deletematkul',
        aliases: [],
        description: 'Hapus jadwal matkul',
        usage: '/deletematkul <nomor>',
        category: 'Admin',
        public: false,
        adminOnly: true,
        dangerous: true,
        requiresMedia: false,
        intentGroup: 'matkul',
        keywords: ['hapus matkul', 'hapus jadwal kuliah'],
        args: [],
        examples: ['hapus matkul nomor 1']
    },
    {
        name: 'deleteallmatkul',
        aliases: [],
        description: 'Hapus semua jadwal matkul',
        usage: '/deleteallmatkul',
        category: 'Admin',
        public: false,
        adminOnly: true,
        dangerous: true,
        requiresMedia: false,
        intentGroup: 'matkul',
        keywords: ['hapus semua matkul', 'hapus semua jadwal'],
        args: [],
        examples: ['hapus semua matkul']
    },
    {
        name: 'matkul',
        aliases: [],
        description: 'Bantuan command matkul',
        usage: '/matkul',
        category: 'Admin',
        public: false,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'matkul',
        keywords: ['bantuan matkul', 'command matkul', 'cara pakai matkul'],
        args: [],
        examples: ['cara pakai matkul']
    },
    {
        name: 'listmatkul',
        aliases: [],
        description: 'Lihat daftar matkul',
        usage: '/listmatkul',
        category: 'Admin',
        public: false,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'matkul',
        keywords: ['daftar matkul', 'list matkul', 'jadwal matkul'],
        args: [],
        examples: ['lihat daftar matkul']
    },
    {
        name: 'newsfst',
        aliases: [],
        description: 'Pengumuman terbaru FST UIN Suka',
        usage: '/newsfst',
        category: 'Admin',
        public: false,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'news',
        keywords: ['pengumuman fst', 'berita fst', 'newsfst'],
        args: [],
        examples: ['pengumuman fst terbaru']
    },
    {
        name: 'newsuin',
        aliases: [],
        description: 'Berita terbaru UIN Suka',
        usage: '/newsuin',
        category: 'Admin',
        public: false,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'news',
        keywords: ['berita uin', 'news uin', 'newsuin'],
        args: [],
        examples: ['berita uin terbaru']
    },
    {
        name: 'imsakiyah',
        aliases: [],
        description: 'Jadwal imsakiyah Ramadan',
        usage: '/imsakiyah',
        category: 'Admin',
        public: false,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'imsakiyah',
        keywords: ['imsakiyah', 'jadwal imsak', 'jadwal sahur'],
        args: [],
        examples: ['jadwal imsakiyah']
    },
    {
        name: 'shows',
        aliases: [],
        description: 'Kirim ulang media (gambar/video/VN)',
        usage: '/shows',
        category: 'Admin',
        public: false,
        adminOnly: false,
        dangerous: false,
        requiresMedia: true,
        mediaTypes: ['image', 'video', 'audio'],
        intentGroup: 'shows',
        keywords: ['kirim ulang media', 'reshare media', 'shows'],
        args: [],
        examples: ['kirim ulang gambar ini']
    },
    {
        name: 'test',
        aliases: [],
        description: 'Cek status server dan bot',
        usage: '/test',
        category: 'Admin',
        public: false,
        adminOnly: false,
        dangerous: false,
        requiresMedia: false,
        intentGroup: 'test',
        keywords: ['cek status bot', 'status server', 'test bot'],
        args: [],
        examples: ['cek status bot']
    }
];

const CATEGORY_ORDER = [
    'Sticker',
    'Downloader',
    'Security',
    'Group',
    'TTS',
    'Translate',
    'Weather',
    'Market',
    'Tools',
    'Admin'
];

const CATEGORY_TITLES = {
    Sticker: '📌 STICKER TOOLS',
    Downloader: '📥 DOWNLOADER',
    Security: '🛡️ SECURITY',
    Group: '📊 GROUP TOOLS',
    TTS: '🗣️ TTS',
    Translate: '🌐 TRANSLATE',
    Weather: '🌤️ CUACA',
    Market: '💹 MARKET',
    Tools: '🛠️ TOOLS',
    Admin: '🔒 ADMIN ONLY'
};

// Index nama command + alias -> entry
const COMMAND_INDEX = new Map();
for (const command of COMMANDS) {
    COMMAND_INDEX.set(command.name.toLowerCase(), command);
    for (const alias of command.aliases || []) {
        COMMAND_INDEX.set(String(alias).toLowerCase(), command);
    }
}

function allCommands() {
    return COMMANDS;
}

function findCommand(nameOrAlias) {
    if (!nameOrAlias) return null;
    return COMMAND_INDEX.get(String(nameOrAlias).toLowerCase().replace(/^\//, '')) || null;
}

/**
 * Command publik: tampil di /menu publik dan boleh dipakai AI publik.
 */
function getPublicCommands() {
    return COMMANDS.filter(command => command.public);
}

/**
 * Command privat/admin: hanya untuk admin di DM.
 */
function getPrivateCommands() {
    return COMMANDS.filter(command => !command.public);
}

/**
 * Command yang boleh dieksekusi otomatis dari saran AI.
 * Command admin/privat/dangerous tidak pernah masuk sini.
 */
function getExecutableCommands() {
    return COMMANDS.filter(command => command.public && !command.adminOnly && !command.dangerous);
}

/**
 * Scope katalog:
 * - DM + admin: public + private (untuk menu & help AI).
 * - DM + non-admin: public saja.
 * - Grup: selalu public, walaupun pengirim admin.
 */
function getCatalogScope({ isGroup = false, isAdmin = false } = {}) {
    return {
        includePrivate: Boolean(!isGroup && isAdmin),
        isGroup: Boolean(isGroup),
        isAdmin: Boolean(isAdmin)
    };
}

function getMenuCommands(scope = {}) {
    const { includePrivate = false } = scope;
    return COMMANDS.filter(command => command.public || includePrivate);
}

function formatUsage(command) {
    return command.usage || `/${command.name}`;
}

function buildMenuText(scope = {}) {
    const commands = getMenuCommands(scope);
    const grouped = new Map();

    for (const command of commands) {
        const category = command.public ? command.category : 'Admin';
        if (!grouped.has(category)) grouped.set(category, []);
        grouped.get(category).push(command);
    }

    const lines = ['*🗿 V-ULTIMATE BOT v2.5*', ''];

    for (const category of CATEGORY_ORDER) {
        const items = grouped.get(category);
        if (!items || items.length === 0) continue;

        lines.push(`*${CATEGORY_TITLES[category] || category}*`);

        items.forEach((command, index) => {
            const branch = index === items.length - 1 ? '└' : '├';
            lines.push(`${branch} \`${formatUsage(command)}\` — ${command.description}`);
        });

        lines.push('');
    }

    if (scope.includePrivate) {
        lines.push('_Menu admin hanya terlihat di chat pribadi oleh admin._');
        lines.push('');
    }

    lines.push('_Bot by vazul76 - v2.5.0_');
    return lines.join('\n');
}

/**
 * Katalog ringkas untuk prompt AI.
 * Hanya berisi command yang relevan dengan scope.
 */
function buildAiCatalogText(scope = {}, options = {}) {
    const { executableOnly = false } = options;
    let commands = getMenuCommands(scope);

    if (executableOnly) {
        commands = commands.filter(command => command.public && !command.adminOnly && !command.dangerous);
    }

    return commands
        .map(command => {
            const aliases = command.aliases?.length ? ` | alias: ${command.aliases.join(', ')}` : '';
            const media = command.requiresMedia
                ? ` | butuh media: ${(command.mediaTypes || ['media']).join('/')}`
                : '';
            const keywords = command.keywords?.length ? ` | kata kunci: ${command.keywords.join(', ')}` : '';
            return `- /${command.name} | ${command.description} | usage: ${formatUsage(command)}${aliases}${media}${keywords}`;
        })
        .join('\n');
}

module.exports = {
    COMMANDS,
    CATEGORY_ORDER,
    CATEGORY_TITLES,
    allCommands,
    findCommand,
    getPublicCommands,
    getPrivateCommands,
    getExecutableCommands,
    getCatalogScope,
    getMenuCommands,
    formatUsage,
    buildMenuText,
    buildAiCatalogText
};
