const WABot = require('./src/bot');
const logger = require('./src/utils/logger');
require('./src/config');

const bot = new WABot();

// Handle process termination
process.on('SIGINT', async () => {
    logger.warn('Received SIGINT, closing bot...');
    await bot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.warn('Received SIGTERM, closing bot...');
    await bot.stop();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
});

// Start bot
bot.initialize();