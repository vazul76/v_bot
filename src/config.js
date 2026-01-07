require('dotenv').config();

module.exports = {
    vtApiKey: process.env.VT_API_KEY || null,
    groqApiKey: process.env.GROQ_API_KEY || null,
    nodeEnv: process.env.NODE_ENV || 'development'
};
