import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import { loadEnv } from './config/env.js';


const { PORT, MONGO_URI } = loadEnv();


async function start() {
await mongoose.connect(MONGO_URI);
console.log('MongoDB connected');
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
}
const mask = (k?: string) => (k ? k.slice(0, 7) + '…' : 'none');
console.log('[AI] enabled:', process.env.AI_ENABLED,
            'mock:', process.env.AI_MOCK,
            'model:', process.env.AI_MODEL,
            'key:', mask(process.env.OPENAI_API_KEY),
            'org:', process.env.OPENAI_ORG_ID || 'none');


start().catch((err) => {
console.error(err);
process.exit(1);
});