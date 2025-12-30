const REQUIRED_ENV = ['VT_API_KEY', 'GROQ_API_KEY'];

require('dotenv').config();

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = {
    vtApiKey: process.env.VT_API_KEY,
    groqApiKey: process.env.GROQ_API_KEY,
    nodeEnv: process.env.NODE_ENV || 'development'
};
