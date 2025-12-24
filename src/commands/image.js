const { MessageMedia } = require('whatsapp-web.js');
const https = require('https');
const http = require('http');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

class ImageGeneratorCommand {
    constructor() {
        // Pollinations.ai - Free, no API key needed
        this.apiUrl = 'https://image.pollinations.ai/prompt/';
    }

    /**
     * Generate image dari text prompt
     * Format: .image [prompt]
     * Format auto: Reply text dengan .image (tanpa prompt)
     */
    async generateImage(msg, client, messageBody) {
        try {
            logger.info('Memproses command .image');

            // React:  Command received
            await helpers.reactCommandReceived(msg);

            // Extract prompt dari command
            let prompt = messageBody.replace(/^\.image\s+/i, '').trim();

            // Jika tidak ada prompt, cek quoted message
            if (!prompt || prompt === '' || prompt === 'image' || prompt === 'img' || prompt === 'generate') {
                if (msg.hasQuotedMsg) {
                    try {
                        const quotedMsg = await msg.getQuotedMessage();
                        const quotedText = quotedMsg.body || '';
                        
                        if (quotedText) {
                            prompt = quotedText;
                            logger.info(`Using quoted message as prompt: ${prompt}`);
                        }
                    } catch (error) {
                        logger.warn('Error getting quoted message:', error.message);
                    }
                }
            }

            // Validasi prompt
            if (!prompt) {
                await helpers.reactError(msg);
                return helpers.replyWithTyping(msg, client, `❌ Format salah! 

🎨 *Cara Generate Image:*

*Opsi 1:* Langsung dengan prompt
\`.image [deskripsi gambar]\`

*Opsi 2:* Reply text message dengan \`.image\`
(Text dari message yang di-reply akan jadi prompt)

💡 *Contoh Opsi 1:*
.image beautiful sunset over the ocean
.image cute cat wearing sunglasses
.image futuristic city at night

💡 *Contoh Opsi 2:*
User:  "beautiful landscape with mountains"
You: (reply message itu) .image

⚠️ *Tips:*
• Gunakan bahasa Inggris untuk hasil terbaik
• Deskripsi yang detail = hasil lebih bagus
• Proses memakan waktu ~10-30 detik`, 1500);
            }

            logger.info(`Generating image with prompt: ${prompt}`);

            // React: Processing
            await helpers.reactProcessing(msg);
            await helpers.replyWithTyping(msg, client, '⏳ Generating image dengan AI...\n🤬Lagi proses, SABAR!', 1500);

            // Generate image URL
            const imageUrl = this.generateImageUrl(prompt);
            logger.info(`Image URL:  ${imageUrl}`);

            // Download image
            const imageBuffer = await this.downloadImage(imageUrl);

            if (! imageBuffer) {
                throw new Error('Failed to download generated image');
            }

            logger.info('Image downloaded successfully');

            // Create MessageMedia
            const imageMedia = new MessageMedia(
                'image/jpeg',
                imageBuffer.toString('base64'),
                'ai-generated-image.jpg'
            );

            // Send image
            await helpers.simulateTyping(msg, client, 1500);
            await msg.reply(imageMedia, null, {
                caption: `*Nih Gambarmu, Ngerepotin aja ! 🤬*`
            });

            // React: Success
            await helpers.reactSuccess(msg);
            logger.success('Image generated and sent successfully');

        } catch (error) {
            logger.error('Error generating image:', error.message);
            logger.error('Stack trace:', error.stack);

            await helpers.reactError(msg);

            if (error.message.includes('timeout')) {
                await helpers.replyWithTyping(msg, client, '❌ Timeout! Server AI terlalu lama merespon.\n\n💡 Coba lagi dengan prompt yang lebih simple.');
            } else if (error.message.includes('download')) {
                await helpers.replyWithTyping(msg, client, '❌ Gagal mendownload gambar yang di-generate!\n\n💡 Coba lagi nanti.');
            } else {
                await helpers.replyWithTyping(msg, client, '❌ Gagal generate image!\n\n💡 Coba lagi dengan prompt yang berbeda.');
            }
        }
    }

    /**
     * Generate image URL with Pollinations.ai
     */
    generateImageUrl(prompt) {
        // Encode prompt untuk URL
        const encodedPrompt = encodeURIComponent(prompt);
        
        // Pollinations.ai URL structure
        return `${this.apiUrl}${encodedPrompt}? width=1024&height=1024&nologo=true&enhance=true`;
    }

    /**
     * Download image dari URL
     */
    async downloadImage(url) {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            
            const timeout = 60000; // 60 seconds timeout
            
            const request = protocol.get(url, { timeout }, (response) => {
                // Handle redirects
                if (response.statusCode === 301 || response.statusCode === 302) {
                    logger.info('Following redirect...');
                    return this.downloadImage(response.headers.location)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}:  ${response.statusMessage}`));
                    return;
                }

                const chunks = [];
                
                response.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    logger.info(`Downloaded ${buffer.length} bytes`);
                    resolve(buffer);
                });

                response.on('error', (error) => {
                    reject(error);
                });
            });

            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });

            request.on('error', (error) => {
                reject(error);
            });
        });
    }
}

module.exports = new ImageGeneratorCommand();