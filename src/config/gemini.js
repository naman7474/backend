const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  throw new Error('Missing Google Gemini API key');
}

const genAI = new GoogleGenerativeAI(apiKey);

// Different models for different purposes
const models = {
  photoAnalysis: genAI.getGenerativeModel({ 
    model: process.env.AI_PHOTO_ANALYSIS_MODEL || "gemini-2.0-flash" 
  }),
  recommendation: genAI.getGenerativeModel({ 
    model: process.env.AI_RECOMMENDATION_MODEL || "gemini-2.5-flash-preview-05-20" 
  })
};

module.exports = { genAI, models }; 