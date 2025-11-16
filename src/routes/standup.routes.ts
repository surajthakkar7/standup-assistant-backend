// src/routes/standup.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createStandup,
  myStandups,
  teamByDate,
  updateStandup,
  softDeleteStandup,
  restoreStandup,
  hardDeleteStandup,
  getStandupById,
} from '../controllers/standup.controller.js';

const r = Router();

// Create today's standup (member of team only)
r.post('/', requireAuth, createStandup);

// List my standups (hide deleted by default; ?includeDeleted=true to include)
r.get('/me', requireAuth, myStandups);

// List team standups by date (admins can use ?includeDeleted=true)
r.get('/team/:teamId', requireAuth, teamByDate);

// Update today's standup (owner only; blocked if soft-deleted)
r.patch('/:id', requireAuth, updateStandup);

// Soft delete today's standup (author or admin)
r.delete('/:id', requireAuth, softDeleteStandup);

// Restore a soft-deleted standup (author or admin; today only)
r.post('/:id/restore', requireAuth, restoreStandup);

// Hard delete today's standup (admin only)
r.delete('/:id/hard', requireAuth, hardDeleteStandup);

// Get a standup by id (owner or team member)
r.get('/:id', requireAuth, getStandupById);

export default r;
