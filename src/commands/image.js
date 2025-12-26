const https = require('https');
const http = require('http');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class ImageGeneratorCommand {
    constructor() {
        this.apiUrl = 'https://image.pollinations.ai/prompt/';
    }

    async generateImage(msg, sock, messageBody) {
        try {
            logger.info('Memproses command .image');

            await helpers.reactCommandReceived(sock, msg);

            let prompt = messageBody.replace(/^\.image\s+/i, '').trim();

            // Check quoted message for prompt
            if (! prompt || prompt === '' || prompt === 'image' || prompt === 'img' || prompt === 'generate') {
                const quoted = await helpers.getQuotedMessage(msg);
                if (quoted) {
                    const quotedText = this.getTextFromMessage(quoted.message);
                    if (quotedText) {
                        prompt = quotedText;
                        logger.info(`Using quoted as prompt: ${prompt}`);
                    }
                }
            }

            if (!prompt) {
                await helpers.reactError(sock, msg);
                return helpers.replyWithTyping(sock, msg, `❌ Format salah! 

🎨 *Cara Generate Image: *

*Opsi 1:* Langsung
\`.image [deskripsi gambar]\`

*Opsi 2:* Reply text
(Reply text message) \`.image\`

💡 *Contoh:*
.image beautiful sunset over ocean
.image cute cat with sunglasses

⚠️ Gunakan bahasa Inggris untuk hasil terbaik`, 1500);
            }

            logger.info(`Generating image: ${prompt}`);

            await helpers.reactProcessing(sock, msg);
            await helpers.replyWithTyping(sock, msg, '⏳ Generating image...', 1500);

            const imageUrl = this.generateImageUrl(prompt);
            logger.info(`Image URL: ${imageUrl}`);

            const imageBuffer = await this.downloadImage(imageUrl);

            if (!imageBuffer) {
                throw new Error('Failed to download image');
            }

            logger.info('Image downloaded');

            await helpers.simulateTyping(sock, msg, 1500);
            
            await helpers.replyImageWithTyping(sock, msg, imageBuffer, `🎨 *Nih Gambarmu!*`);

            await helpers.reactSuccess(sock, msg);
            logger.success('Image sent');

        } catch (error) {
            logger.error('Error generating image:', error.message);
            await helpers.reactError(sock, msg);

            if (error.message.includes('timeout')) {
                await helpers.replyWithTyping(sock, msg, '❌ Timeout!  Coba prompt lebih simple.');
            } else {
                await helpers.replyWithTyping(sock, msg, '❌ Gagal generate image!');
            }
        }
    }

    generateImageUrl(prompt) {
        const encodedPrompt = encodeURIComponent(prompt);
        return `${this.apiUrl}${encodedPrompt}? width=1024&height=1024&nologo=true&enhance=true`;
    }

    async downloadImage(url) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            const timeout = 60000;
            
            const request = protocol.get(url, { timeout }, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return this.downloadImage(response.headers.location)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }

                const chunks = [];
                
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    logger.info(`Downloaded ${buffer.length} bytes`);
                    resolve(buffer);
                });
                response.on('error', reject);
            });

            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
            request.on('error', reject);
        });
    }

    getTextFromMessage(message) {
        if (message?.conversation) return message.conversation;
        if (message?.extendedTextMessage?.text) return message.extendedTextMessage.text;
        return '';
    }
}

module.exports = new ImageGeneratorCommand();