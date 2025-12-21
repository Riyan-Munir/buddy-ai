require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.AI_PORT || 5000;

app.use(cors({
    origin: 'https://api-testengine.netlify.app'
}));

app.use(express.json());

// Firebase Admin SDK
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_JSON, 'base64').toString('utf8')
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

// Gemini API setup
const modelName = 'gemini-2.5-flash';
const geminiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3
];

// Verify Firebase token middleware
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });

  const idToken = authHeader.split(' ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (err) {
    console.error('Firebase token error:', err);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Helper: try generating AI response with retries
async function generateAIResponseWithRetries(prompt) {
  for (let i = 0; i < geminiKeys.length; i++) {
    const apiKey = geminiKeys[i];
    const ai = new GoogleGenAI({ apiKey });
    try {
      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      let text = 'No response generated';
      if (result?.candidates?.length) {
        const candidate = result.candidates[0];
        const content = candidate.content;

        if (content?.parts && Array.isArray(content.parts)) {
          text = content.parts.map(p => p.text || '').join('\n').trim();
        } else if (content?.text) {
          text = content.text.trim();
        }
      }

      return text;
    } catch (err) {
      console.error(`API key ${i + 1} failed:`, err.message);
      // try next key
    }
  }
  throw new Error('All API keys failed to generate response');
}

// AI assistant route
app.post('/ask', verifyFirebaseToken, async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });

  const prompt = `
You are Study Buddy, AI assistant ONLY for DSA & OOP.
Rules:
1. Answer ONLY DSA/OOP questions.
2. If unrelated, respond exactly: "Sorry! I am only dedicated for DSA and OOP."
3. Only return code & guidance for DSA/OOP.
4. Must Wrap code inside $$ signs like: $$Code here$$, for bold use **text**, for italic use *text*, for underline use __text__, for h1 size heading use ####heading####, for h2 size heading use ###heading###, for h3 size heading use ##heading##.
5. Must not add any other symbol except upper mentioned symbols.
6. Give response with proper line breaks so it'll easy to understand.
The question is:
${question}`;

  try {
    const responseText = await generateAIResponseWithRetries(prompt);
    res.json({ response: responseText });
  } catch (err) {
    console.error('AI generation failed with all keys:', err.message);
    res.status(500).json({ error: 'Failed to generate response with all API keys' });
  }
});

app.listen(port, () => console.log(`🚀 AI Server running at http://localhost:${port}`));
