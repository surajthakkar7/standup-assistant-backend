// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth.routes.js';
import teamRoutes from './routes/team.routes.js';
import standupRoutes from './routes/standup.routes.js';
import { errorHandler } from './middleware/error.js';
import { openapiSpec } from './docs/openapi.js';
import aiRoutes from './routes/ai.routes.js';
import insightRoutes from './routes/insight.routes.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use('/api/ai', aiRoutes);
app.use('/api/insights', insightRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Swagger UI + JSON
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.get('/api/docs.json', (_req, res) => res.json(openapiSpec));

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/standups', standupRoutes);

app.use(errorHandler);

export default app;
