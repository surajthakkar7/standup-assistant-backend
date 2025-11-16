// src/routes/insight.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { streak, trends } from '../controllers/insight.controller.js';

const r = Router();
r.get('/streak', requireAuth, streak);
r.get('/trends', requireAuth, trends);
export default r;
