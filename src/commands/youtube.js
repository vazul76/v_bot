const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const ytdlpExec = require('yt-dlp-exec');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class YouTubeDownloader {
    constructor() {
        this.tempDir = path.join(__dirname, '../../temp');
        this.maxAudioSize = 16 * 1024 * 1024; // 16MB for audio
        this.maxVideoSize = 64 * 1024 * 1024; // 64MB for video

        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Download YouTube audio (MP3)
     */
    async downloadAudio(msg, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .ytmp3');

            // React:  Command received
            await helpers.reactCommandReceived(msg);

            // Extract URL from message
            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                logger.warn('URL tidak ditemukan');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Format:  .ytmp3 [link youtube]\n\n💡 Contoh:\n.ytmp3 https://www.youtube.com/watch?v=xxxxx\n\nAtau reply pesan yang ada link YouTube dengan .ytmp3');
            }

            if (!this.isValidYouTubeURL(url)) {
                logger.warn('URL YouTube tidak valid');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Link YouTube tidak valid!\n\n✅ Gunakan link dari youtube.com atau youtu.be');
            }

            logger.info(`Downloading audio from: ${url}`);
            
            // React: Processing
            await helpers.reactProcessing(msg);
            await helpers.replyWithTyping(msg, msg.client, '⏳ Mendownload audio dari YouTube...\n🤬*Lagi proses, SABAR!* ', 1500);

            // Generate temp file path
            const outputTemplate = path.join(this.tempDir, `yt_audio_${Date.now()}.%(ext)s`);

            // Download audio with yt-dlp
            await ytdlpExec(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0, // Best quality
                output: outputTemplate,
                noPlaylist: true,
                noWarnings: true,
                preferFreeFormats: true,
                addMetadata: true
            });

            // Find the downloaded file
            const expectedPath = outputTemplate.replace('.%(ext)s', '.mp3');
            tempFilePath = expectedPath;

            if (!fs.existsSync(tempFilePath)) {
                throw new Error('File download gagal');
            }

            // Check file size
            const stats = fs.statSync(tempFilePath);
            logger.info(`Audio file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxAudioSize) {
                logger.warn('File terlalu besar untuk WhatsApp');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, `❌ Audio terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\n⚠️ Limit WhatsApp: 16MB untuk audio`);
            }

            // Read file and create MessageMedia
            const audioBuffer = fs.readFileSync(tempFilePath);
            const audioMedia = new MessageMedia(
                'audio/mpeg',
                audioBuffer.toString('base64'),
                'Vazul-youtube-audio.mp3'
            );

            logger.info('Mengirim audio...');
            await helpers.simulateTyping(msg, msg.client, 1500);
            await msg.reply(audioMedia, null, {
                sendMediaAsDocument: true
            });

            // React: Success
            await helpers.reactSuccess(msg);
            logger.success('Audio berhasil dikirim! ');

        } catch (error) {
            logger.error('Error downloading audio:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(msg);

            if (error.message.includes('Video unavailable') || error.message.includes('not available')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Video tidak tersedia atau sudah dihapus! ');
            } else if (error.message.includes('Private video')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Video ini bersifat private!');
            } else {
                await helpers.replyWithTyping(msg, msg.client, '❌ Gagal mendownload audio dari YouTube!\n\n💡 Pastikan link valid dan video tersedia.');
            }
        } finally {
            // Cleanup temp files
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    /**
     * Download YouTube video (MP4)
     */
    async downloadVideo(msg, messageBody) {
        let tempFilePath = null;

        try {
            logger.info('Memproses command .yt');

            // React: Command received
            await helpers.reactCommandReceived(msg);

            // Extract URL from message
            const url = await this.extractURL(messageBody, msg);

            if (!url) {
                logger.warn('URL tidak ditemukan');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Format: .yt [link youtube]\n\n💡 Contoh:\n.yt https://www.youtube.com/watch?v=xxxxx\n\nAtau reply pesan yang ada link YouTube dengan .yt');
            }

            if (!this.isValidYouTubeURL(url)) {
                logger.warn('URL YouTube tidak valid');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, '❌ Link YouTube tidak valid!\n\n✅ Gunakan link dari youtube.com atau youtu.be');
            }

            logger.info(`Downloading video from: ${url}`);
            
            // React: Processing
            await helpers.reactProcessing(msg);
            await helpers.replyWithTyping(msg, msg.client, '⏳ Mendownload video dari YouTube...\n🤬*Lagi proses, SABAR!*', 1500);

            // Generate temp file path
            const outputTemplate = path.join(this.tempDir, `yt_video_${Date.now()}.%(ext)s`);
            const expectedPath = outputTemplate.replace('.%(ext)s', '.mp4');
            tempFilePath = expectedPath;

            // Download video with yt-dlp
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
                logger.warn('yt-dlp exited with error but file was downloaded:', dlError.message);
            }

            // Verify file exists
            if (!fs.existsSync(tempFilePath)) {
                throw new Error('File download gagal');
            }

            // Check file size
            const stats = fs.statSync(tempFilePath);
            logger.info(`Video file size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

            if (stats.size > this.maxVideoSize) {
                logger.warn('File terlalu besar untuk WhatsApp');
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, msg.client, `❌ Video terlalu besar! (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n\n⚠️ Limit WhatsApp:  64MB untuk video\n\n💡 Coba video yang lebih pendek atau gunakan .ytmp3 untuk audio saja`);
            }

            // Read file and create MessageMedia
            const videoBuffer = fs.readFileSync(tempFilePath);
            const videoMedia = new MessageMedia(
                'video/mp4',
                videoBuffer.toString('base64'),
                'Vazul-youtube-video.mp4'
            );

            logger.info('Mengirim video...');
            await helpers.simulateTyping(msg, msg.client, 1500);
            await msg.reply(videoMedia, null, {
                sendMediaAsDocument: true
            });

            // React:  Success
            await helpers.reactSuccess(msg);
            logger.success('Video berhasil dikirim!');

        } catch (error) {
            logger.error('Error downloading video:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(msg);

            if (error.message.includes('Video unavailable') || error.message.includes('not available')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Video tidak tersedia atau sudah dihapus!');
            } else if (error.message.includes('Private video')) {
                await helpers.replyWithTyping(msg, msg.client, '❌ Video ini bersifat private!');
            } else {
                await helpers.replyWithTyping(msg, msg.client, '❌ Gagal mendownload video dari YouTube!\n\n💡 Pastikan link valid dan video tersedia.');
            }
        } finally {
            // Cleanup temp files
            this.cleanupTempFiles([tempFilePath]);
        }
    }

    /**
     * Extract YouTube URL from message
     */
    async extractURL(messageBody, msg) {
        // Remove command prefix
        const text = messageBody.replace(/^\.(ytmp3|yt)\s+/i, '').trim();

        // Try to find URL in the text
        const urlRegex = /(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/[^\s]+/gi;
        let matches = text.match(urlRegex);

        if (matches) {
            return matches[0];
        }

        // If no URL found in command, check quoted message
        if (msg.hasQuotedMsg) {
            try {
                const quotedMsg = await msg.getQuotedMessage();
                const quotedText = quotedMsg.body || '';
                matches = quotedText.match(urlRegex);
                if (matches) {
                    logger.info('URL found in quoted message');
                    return matches[0];
                }
            } catch (error) {
                logger.warn('Error getting quoted message:', error.message);
            }
        }

        return null;
    }

    /**
     * Validate YouTube URL
     */
    isValidYouTubeURL(url) {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        return youtubeRegex.test(url);
    }

    /**
     * Cleanup temporary files
     */
    cleanupTempFiles(files) {
        files.forEach(file => {
            if (file && fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                    logger.info('Cleaned up temp file:', file);
                } catch (error) {
                    logger.warn('Failed to cleanup temp file:', file, error.message);
                }
            }
        });
    }
}

module.exports = new YouTubeDownloader();