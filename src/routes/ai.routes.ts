import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { personalInsight, teamInsight } from '../controllers/ai.controller.js';

const r = Router();

/**
 * Optional query: ?provider=groq|ollama|gemini
 * e.g. /api/ai/team?teamId=...&date=YYYY-MM-DD&provider=groq
 *      /api/ai/personal/663...abc?provider=gemini
 */
r.get('/personal/:standupId', requireAuth, personalInsight);
r.get('/team', requireAuth, teamInsight);

export default r;
