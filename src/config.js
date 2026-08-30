require('dotenv').config();

module.exports = {
    vtApiKey: process.env.VT_API_KEY || null,
    groqApiKey: process.env.GROQ_API_KEY || null,
    groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    nodeEnv: process.env.NODE_ENV || 'development'
};
