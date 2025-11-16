import { ChatOpenAI } from '@langchain/openai';

const modelName = process.env.AI_MODEL || 'gpt-4o-mini';

export const llm = new ChatOpenAI({
  modelName,
  temperature: 0.2,
  apiKey: process.env.OPENAI_API_KEY!,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    organization: process.env.OPENAI_ORG_ID, // optional
  },
  maxRetries: 0,       // IMPORTANT: avoid p-retry storms → fewer 429s
  timeout: 60_000,     // optional
});
