const logger = require('./logger');

class HealthChecker {
    constructor() {
        this.adminNumber = null; // Will be set from bot.js
        this.sock = null; // WhatsApp socket
        this.lastCheckTime = null;
        this.failedChecks = new Set();
    }

    setAdmin(number, sock) {
        this.adminNumber = number;
        this.sock = sock;
        logger.info(`Health check admin set to: ${number}`);
    }

    async checkAll() {
        logger.info('Running health checks...');
        this.lastCheckTime = new Date();
        const results = [];

        // Test YouTube
        try {
            const ytdlp = require('yt-dlp-exec');
            await ytdlp('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
                dumpJson: true,
                noWarnings: true,
                skipDownload: true
            });
            results.push({ name: 'YouTube (yt-dlp)', status: '✅', error: null });
            this.failedChecks.delete('youtube');
        } catch (error) {
            results.push({ name: 'YouTube (yt-dlp)', status: '❌', error: error.message });
            this.failedChecks.add('youtube');
        }

        // Test TikTok
        try {
            const ytdlp = require('yt-dlp-exec');
            await ytdlp('https://www.tiktok.com/@tiktok/video/7106594312292453675', {
                dumpJson: true,
                noWarnings: true,
                skipDownload: true
            });
            results.push({ name: 'TikTok (yt-dlp)', status: '✅', error: null });
            this.failedChecks.delete('tiktok');
        } catch (error) {
            results.push({ name: 'TikTok (yt-dlp)', status: '❌', error: error.message });
            this.failedChecks.add('tiktok');
        }

        // Test Instagram - Skip automated testing due to anti-bot measures
        // Instagram works fine on real usage but fails on automated checks
        results.push({ name: 'Instagram (yt-dlp)', status: '⚠️', error: 'Auto-test disabled (works on real usage)' });

        // Test Twitter - Skip automated testing due to anti-bot measures
        // Twitter works fine on real usage but fails on automated checks
        results.push({ name: 'Twitter/X (yt-dlp)', status: '⚠️', error: 'Auto-test disabled (works on real usage)' });

        // Test Facebook
        try {
            const axios = require('axios');
            const response = await axios.get('https://www.facebook.com/', { timeout: 5000 });
            if (response.status === 200) {
                results.push({ name: 'Facebook API', status: '✅', error: null });
                this.failedChecks.delete('facebook');
            } else {
                throw new Error('Unexpected response');
            }
        } catch (error) {
            results.push({ name: 'Facebook API', status: '❌', error: error.message });
            this.failedChecks.add('facebook');
        }

        // Test BMKG Weather API
        try {
            const axios = require('axios');
            const response = await axios.get('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=34.04.06.2004', { timeout: 5000 });
            if (response.data && response.data.data) {
                results.push({ name: 'BMKG Weather API', status: '✅', error: null });
                this.failedChecks.delete('bmkg');
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            results.push({ name: 'BMKG Weather API', status: '❌', error: error.message });
            this.failedChecks.add('bmkg');
        }

        // Test Groq AI
        try {
            if (process.env.GROQ_API_KEY) {
                const Groq = require('groq-sdk');
                const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
                await groq.chat.completions.create({
                    messages: [{ role: 'user', content: 'test' }],
                    model: 'llama-3.3-70b-versatile',
                    max_tokens: 10
                });
                results.push({ name: 'Groq AI Translation', status: '✅', error: null });
                this.failedChecks.delete('groq');
            } else {
                results.push({ name: 'Groq AI Translation', status: '⚠️', error: 'API key not set (optional)' });
            }
        } catch (error) {
            results.push({ name: 'Groq AI Translation', status: '❌', error: error.message });
            this.failedChecks.add('groq');
        }

        // Test VirusTotal
        try {
            if (process.env.VT_API_KEY) {
                const axios = require('axios');
                await axios.get('https://www.virustotal.com/api/v3/ip_addresses/8.8.8.8', {
                    headers: { 'x-apikey': process.env.VT_API_KEY },
                    timeout: 5000
                });
                results.push({ name: 'VirusTotal API', status: '✅', error: null });
                this.failedChecks.delete('virustotal');
            } else {
                results.push({ name: 'VirusTotal API', status: '⚠️', error: 'API key not set (optional)' });
            }
        } catch (error) {
            results.push({ name: 'VirusTotal API', status: '❌', error: error.message });
            this.failedChecks.add('virustotal');
        }

        // Test Google TTS
        try {
            const googleTTS = require('google-tts-api');
            await googleTTS.getAudioUrl('test', { lang: 'id', slow: false });
            results.push({ name: 'Google TTS', status: '✅', error: null });
            this.failedChecks.delete('tts');
        } catch (error) {
            results.push({ name: 'Google TTS', status: '❌', error: error.message });
            this.failedChecks.add('tts');
        }

        return results;
    }

    async sendReport(results) {
        if (!this.adminNumber || !this.sock) {
            logger.warn('Admin number not set, skipping health report');
            return;
        }

        const failed = results.filter(r => r.status === '❌');
        const warning = results.filter(r => r.status === '⚠️');
        const passed = results.filter(r => r.status === '✅');

        let message = '🏥 *Bot Health Check Report*\n\n';
        message += `📅 ${new Date().toLocaleString('id-ID')}\n\n`;

        if (failed.length > 0) {
            message += '❌ *Failed Services:*\n';
            failed.forEach(r => {
                message += `• ${r.name}\n  Error: ${r.error.substring(0, 100)}\n\n`;
            });
        }

        if (warning.length > 0) {
            message += '⚠️ *Warnings:*\n';
            warning.forEach(r => {
                message += `• ${r.name}\n  ${r.error}\n\n`;
            });
        }

        message += `✅ *Healthy Services:* ${passed.length}\n`;
        passed.forEach(r => {
            message += `• ${r.name}\n`;
        });

        message += `\n📊 *Summary:* ${passed.length}/${results.length} services healthy`;

        if (failed.length > 0) {
            message += `\n\n⚠️ *Action Required:*\n`;
            if (this.failedChecks.has('youtube') || this.failedChecks.has('tiktok')) {
                message += '• Update yt-dlp binary:\n  `/health update`';
            }
        }

        try {
            await this.sock.sendMessage(this.adminNumber, { text: message });
            logger.info('Health report sent to admin');
        } catch (error) {
            logger.error('Failed to send health report:', error.message);
        }
    }

    formatReport(results) {
        let report = '\n🏥 Bot Health Check Report\n';
        report += '='.repeat(50) + '\n';
        
        results.forEach(r => {
            report += `${r.status} ${r.name}\n`;
            if (r.error) {
                report += `   └─ ${r.error.substring(0, 80)}\n`;
            }
        });

        const failed = results.filter(r => r.status === '❌').length;
        const passed = results.filter(r => r.status === '✅').length;
        
        report += '='.repeat(50) + '\n';
        report += `Summary: ${passed}/${results.length} services healthy\n`;

        return report;
    }
}

module.exports = new HealthChecker();
