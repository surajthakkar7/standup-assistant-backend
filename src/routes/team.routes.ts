// src/routes/team.routes.ts
import { Router } from 'express';
import {
  createTeam, joinTeam, listMembers,
  listMyTeams, listOwnedTeams, getTeam,
  updateTeam, rotateCode, leaveTeam,
  softDeleteTeam, hardDeleteTeam
} from '../controllers/team.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// create & join
router.post('/',               requireAuth, createTeam);
router.post('/join',           requireAuth, joinTeam);

// reads
router.get('/',                requireAuth, listMyTeams);
router.get('/owned',           requireAuth, listOwnedTeams);
router.get('/:id',             requireAuth, getTeam);
router.get('/:id/members',     requireAuth, listMembers);

// updates
router.patch('/:id',           requireAuth, updateTeam);
router.post('/:id/rotate-code',requireAuth, rotateCode);
router.post('/:id/leave',      requireAuth, leaveTeam);

// deletes
router.delete('/:id',          requireAuth, softDeleteTeam);
router.delete('/:id/hard',     requireAuth, hardDeleteTeam);

export default router;
