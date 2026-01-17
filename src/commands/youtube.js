const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class YouTubeDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxAudioSize = 16 * 1024 * 1024;
        this.maxVideoSize = 100 * 1024 * 1024;

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadAudio(msg, sock, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command /ytmp3');
            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                logger.warn('URL tidak ditemukan');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /ytmp3 [link youtube]\n\n💡 Contoh:\n/ytmp3 https://www.youtube.com/watch?v=xxxxx\n\nAtau reply pesan yang ada link YouTube dengan /ytmp3');
            }

            if (! this.isValidYouTubeURL(url)) {
                logger.warn('URL YouTube tidak valid');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link YouTube tidak valid!\n\n✅ Gunakan link dari youtube.com atau youtu.be');
            }

            logger.info(`Downloading audio from: ${url}`);
            
            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Mendownload audio dari YouTube...\n🎵 Tunggu sebentar ya!', 1500);

            const outputTemplate = path.join(this.tempDir, `yt_audio_${Date.now()}.%(ext)s`);

            await ytdlpExec(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0,
                output: outputTemplate,
                noPlaylist: true,
                noWarnings: true,
                preferFreeFormats: true,
                addMetadata: true
            });

            const expectedPath = outputTemplate.replace('.%(ext)s', '.mp3');
            tempFilePath = expectedPath;

            if (!fs.existsSync(tempFilePath)) {
                throw new Error('File download gagal');
            }

            const stats = fs.statSync(tempFilePath);
            logger.info(`Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxAudioSize) {
                logger.warn('File terlalu besar');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, `❌ Audio terlalu besar!  (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\n⚠️ Limit:  16MB untuk audio`);
            }

            const audioBuffer = fs.readFileSync(tempFilePath);

            logger.info('Mengirim audio...');
            
            // ✅ REPLY KE USER
            await helpers.replyAudioWithTyping(sock, msg, audioBuffer, 1500);

            await helpers.reactSuccess(sock, msg);
            logger.success('Audio berhasil dikirim! ');

        } catch (error) {
            logger.error('Error downloading audio:', error.message);
            await helpers.reactError(sock, msg);

            if (error.message.includes('Video unavailable')) {
                await helpers.replyWithTyping(sock, msg, '❌ Video tidak tersedia atau sudah dihapus! ');
            } else if (error.message.includes('Private video')) {
                await helpers.replyWithTyping(sock, msg, '❌ Video ini bersifat private!');
            } else {
                await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload audio!\n\n💡 Pastikan link valid dan video tersedia.');
            }
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async downloadVideo(msg, sock, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .yt');
            await helpers.reactCommandReceived(sock, msg);

            const url = await this.extractURL(messageBody, msg);

            if (! url) {
                logger.warn('URL tidak ditemukan');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Format: /yt [link youtube]\n\n💡 Contoh:\n/yt https://www.youtube.com/watch?v=xxxxx\n\nAtau reply pesan yang ada link YouTube dengan /yt');
            }

            if (!this.isValidYouTubeURL(url)) {
                logger.warn('URL tidak valid');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, '❌ Link YouTube tidak valid!\n\n✅ Gunakan link dari youtube.com atau youtu.be');
            }

            logger.info(`Downloading video from: ${url}`);
            
            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Mendownload video dari YouTube...', 1500);

            const outputTemplate = path.join(this.tempDir, `yt_video_${Date.now()}.%(ext)s`);
            const expectedPath = outputTemplate.replace('.%(ext)s', '.mp4');
            tempFilePath = expectedPath;

            try {
                await ytdlpExec(url, {
                    format: 'best[ext=mp4]/best',
                    output: outputTemplate,
                    noPlaylist: true,
                    noWarnings: true
                });
            } catch (dlError) {
                if (! fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
                    throw dlError;
                }
                logger.warn('yt-dlp exited with error but file downloaded');
            }

            if (!fs.existsSync(tempFilePath)) {
                throw new Error('File download gagal');
            }

            const stats = fs.statSync(tempFilePath);
            logger.info(`Video file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxVideoSize) {
                logger.warn('File terlalu besar');
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, `❌ Video terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\n⚠️ Limit: 100MB\n\n💡 Coba video lebih pendek atau gunakan /ytmp3`);
            }

            const videoBuffer = fs.readFileSync(tempFilePath);

            logger.info('Mengirim video...');
            
            // ✅ REPLY KE USER (VIDEO AS PREVIEW!)
            await helpers.replyVideoWithTyping(sock, msg, videoBuffer);

            await helpers.reactSuccess(sock, msg);
            logger.success('Video berhasil dikirim! ');

        } catch (error) {
            logger.error('Error downloading video:', error.message);
            await helpers.reactError(sock, msg);

            if (error.message.includes('Video unavailable')) {
                await helpers.replyWithTyping(sock, msg, '❌ Video tidak tersedia atau sudah dihapus!');
            } else if (error.message.includes('Private video')) {
                await helpers.replyWithTyping(sock, msg, '❌ Video ini bersifat private!');
            } else {
                await helpers.replyWithTyping(sock, msg, '❌ Gagal mendownload video!\n\n💡 Pastikan link valid dan video tersedia.');
            }
        } finally {
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    async extractURL(messageBody, msg) {
        const text = messageBody.replace(/^[\.\/](ytmp3|yt)\s+/i, '').trim();
        const urlRegex = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/gi;
        let matches = text.match(urlRegex);

        if (matches) {
            return matches[0];
        }

        const quoted = await helpers.getQuotedMessage(msg);
        if (quoted) {
            const quotedText = this.getTextFromMessage(quoted.message);
            matches = quotedText?.match(urlRegex);
            if (matches) {
                logger.info('URL found in quoted message');
                return matches[0];
            }
        }

        return null;
    }

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        return '';
    }

    isValidYouTubeURL(url) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        return youtubeRegex.test(url);
    }

    cleanupTempFiles(files) {
        files.forEach(file => {
            if (file && fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                    logger.info('Cleaned up temp file');
                } catch (error) {
                    logger.warn('Failed to cleanup:', error.message);
                }
            }
        });
    }
}

module.exports = new YouTubeDownloader();