require('dotenv').config();
const WABot = require('./src/bot');


console.log('🚀 Memulai WhatsApp Bot...\n');

const bot = new WABot();
bot.initialize();