require('dotenv').config();

module.exports = {
    vtApiKey: process.env.VT_API_KEY || null,
    geminiApiKey: process.env.GEMINI_API_KEY || null,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    groqApiKey: process.env.GROQ_API_KEY || null,
    groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    nodeEnv: process.env.NODE_ENV || 'development'
};
