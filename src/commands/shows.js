const { downloadMediaMessage, normalizeMessageContent } = require('@whiskeysockets/baileys');
const { spawn } = require('child_process');
const sharp = require('sharp');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class ShowsCommand {
    constructor() {
        this.ffmpegPath = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';
        this.commands = [
            { name: 'shows', method: 'showMedia', description: 'Gambar/Video/VN → Kirim ulang' }
        ];
    }

    async showMedia(msg, sock) {
        try {
            logger.info('Memproses command .shows');
            await helpers.reactCommandReceived(sock, msg);

            const mediaInfo = await this.getMediaInfo(msg);

            if (!mediaInfo) {
                logger.warn('Tidak ada media ditemukan untuk .shows');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Reply gambar/video/VN dengan command /shows untuk mengirimkannya kembali!');
            }

            const media = await this.getMediaFromMessage(msg, sock, mediaInfo);

            if (!media) {
                logger.warn('Media gagal diunduh untuk .shows');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Media tidak bisa diunduh. Pastikan media masih tersedia.');
            }

            await helpers.reactProcessing(sock, msg);

            const caption = mediaInfo.caption || '';

            if (mediaInfo.type === 'video') {
                logger.info('Mengirim ulang video...');
                await helpers.replyVideoWithTyping(sock, msg, media, caption, 1500, mediaInfo.mentions || []);
            } else if (mediaInfo.type === 'audio') {
                await this.sendVoiceNote(sock, msg, media, mediaInfo);
            } else {
                logger.info('Converting to PNG...');
                const pngBuffer = await sharp(media).png().toBuffer();

                logger.info('Mengirim ulang sebagai gambar...');
                await helpers.replyImageWithTyping(sock, msg, pngBuffer, caption, 1500, mediaInfo.mentions || []);
            }

            await helpers.reactSuccess(sock, msg);
            logger.success('Media berhasil dikirim ulang!');

        } catch (error) {
            logger.error('Error .shows:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(sock, msg);
            await helpers.replyWithTyping(sock, msg, '❌ Gagal mengirim ulang media!\n\n💡 Pastikan media masih tersedia dan belum kedaluwarsa.');
        }
    }

    async getMediaInfo(msg) {
        const direct = normalizeMessageContent(msg.message);
        const directInfo = this.extractMediaInfo(direct);

        if (directInfo) {
            return {
                ...directInfo,
                source: 'direct',
                content: direct,
                caption: this.stripCommandCaption(directInfo.caption)
            };
        }

        const quoted = await helpers.getQuotedMessage(msg);
        const quotedContent = normalizeMessageContent(quoted?.message);
        const quotedInfo = this.extractMediaInfo(quotedContent);

        if (quotedInfo) {
            return { ...quotedInfo, source: 'quoted', content: quotedContent };
        }

        return null;
    }

    extractMediaInfo(content) {
        if (content?.imageMessage) {
            return {
                type: 'image',
                caption: content.imageMessage.caption || '',
                mentions: content.imageMessage.contextInfo?.mentionedJid || []
            };
        }

        if (content?.videoMessage) {
            return {
                type: 'video',
                caption: content.videoMessage.caption || '',
                mentions: content.videoMessage.contextInfo?.mentionedJid || []
            };
        }

        if (content?.audioMessage) {
            return {
                type: 'audio',
                mimetype: content.audioMessage.mimetype || '',
                ptt: content.audioMessage.ptt === true
            };
        }

        return null;
    }

    stripCommandCaption(caption) {
        return String(caption || '')
            .replace(/^\s*\/shows(?:\s+|$)/i, '')
            .trim();
    }

    async getMediaFromMessage(msg, sock, mediaInfo = null) {
        try {
            const info = mediaInfo || await this.getMediaInfo(msg);
            if (!info) return null;

            if (info.source === 'direct') {
                logger.info('Downloading media from message...');
                return await downloadMediaMessage(
                    { ...msg, message: info.content },
                    'buffer',
                    {}
                );
            }

            logger.info('Downloading media from quoted message...');
            return await downloadMediaMessage(
                { key: msg.key, message: info.content },
                'buffer',
                {}
            );

        } catch (error) {
            logger.error('Error getting media:', error);
            return null;
        }
    }

    async sendVoiceNote(sock, msg, media, mediaInfo) {
        let voiceBuffer = media;
        let mimetype = 'audio/ogg; codecs=opus';

        if (!this.isOggOpus(media)) {
            logger.info('Mengonversi audio ke OGG/Opus untuk voice note...');
            try {
                voiceBuffer = await this.convertToOggOpus(media);
            } catch (error) {
                logger.warn('Gagal konversi ke VN, fallback kirim audio biasa:', error.message);
                await helpers.simulateTyping(sock, msg, 1500);
                return sock.sendMessage(msg.key.remoteJid, {
                    audio: media,
                    mimetype: mediaInfo.mimetype || 'audio/mpeg',
                    ptt: false
                }, { quoted: msg });
            }
        }

        logger.info('Mengirim ulang sebagai voice note...');
        return helpers.replyVoiceNoteWithTyping(sock, msg, voiceBuffer, mimetype, 1500);
    }

    isOggOpus(buffer) {
        if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
        if (buffer.toString('ascii', 0, 4) !== 'OggS') return false;
        return buffer.includes('OpusHead');
    }

    convertToOggOpus(buffer) {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(this.ffmpegPath, [
                '-hide_banner',
                '-loglevel', 'error',
                '-i', 'pipe:0',
                '-vn',
                '-ac', '1',
                '-ar', '48000',
                '-c:a', 'libopus',
                '-b:a', '64k',
                '-f', 'ogg',
                'pipe:1'
            ], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const chunks = [];
            const errors = [];
            let settled = false;
            let timer = null;

            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                callback(value);
            };

            timer = setTimeout(() => {
                ffmpeg.kill('SIGKILL');
                finish(reject, new Error('Konversi audio timeout'));
            }, 30000);

            ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
            ffmpeg.stderr.on('data', chunk => errors.push(chunk));

            ffmpeg.on('error', error => {
                finish(reject, error);
            });

            ffmpeg.on('close', code => {
                if (code !== 0) {
                    const stderr = Buffer.concat(errors).toString('utf8').trim();
                    return finish(reject, new Error(stderr || `ffmpeg exited with code ${code}`));
                }

                const output = Buffer.concat(chunks);
                if (!output.length) {
                    return finish(reject, new Error('Hasil konversi audio kosong'));
                }

                finish(resolve, output);
            });

            ffmpeg.stdin.on('error', () => {
                // Abaikan EPIPE; error utama ditangani lewat event close/error.
            });

            ffmpeg.stdin.end(buffer);
        });
    }
}

module.exports = new ShowsCommand();
