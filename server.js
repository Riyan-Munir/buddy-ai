require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
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
];
let apiCallCount = 0;
function getApiKey() {
  const index = Math.floor(apiCallCount / 1000);
  apiCallCount++;
  return geminiKeys[index % geminiKeys.length];
}

// Verify Firebase token
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

// AI assistant route
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
The question is :`;

  try {
    const apiKey = getApiKey();
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: 'user', parts: [{ text: prompt + '\n' + question }] }],
    });

    console.log('AI raw result:', JSON.stringify(result, null, 2)); // debug

    // Robust parsing
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

    res.json({ response: text });
  } catch (err) {
    console.error('AI generation error:', err);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

app.listen(port, () => console.log(`🚀 AI Server running at http://localhost:${port}`));
