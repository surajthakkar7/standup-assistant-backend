// src/controllers/standup.controller.ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import Standup from '../models/Standup.js';
import Team from '../models/Team.js';

// ---------- helpers (IST date + permissions) ----------
const istDateStr = () => {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, '0');
  const d = String(ist.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const isTodayIST = (isoDateYYYYMMDD: string) => isoDateYYYYMMDD === istDateStr();

async function isTeamMember(userId: string, teamId: string) {
  const team = await Team.findOne({ _id: teamId, isDeleted: false, members: userId }).lean();
  return !!team;
}

async function isTeamAdmin(userId: string, teamId: string) {
  const team = await Team.findById(teamId).lean();
  if (!team || team.isDeleted) return false;
  const isOwner = String(team.ownerId) === String(userId);
  const isAdminArr = Array.isArray((team as any).adminIds) ? (team as any).adminIds : [];
  const isAdmin = isAdminArr.some((x: any) => String(x) === String(userId));
  return isOwner || isAdmin;
}

// ---------- validators ----------
const createBody = z.object({
  teamId: z.string().length(24, 'Invalid teamId'),
  yesterday: z.string().min(1, 'yesterday is required'),
  today: z.string().min(1, 'today is required'),
  blockers: z.string().optional(),
});

const updateBody = z.object({
  yesterday: z.string().optional(),
  today: z.string().optional(),
  blockers: z.string().optional(),
});

const myQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  teamId: z.string().length(24).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  includeDeleted: z.string().optional(), // "true" to include soft-deleted in my list (optional)
});

const teamQuery = z.object({
  date: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  includeDeleted: z.string().optional(), // "true" to include soft-deleted (admins only)
});

// ---------- controllers ----------
export const createStandup = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { teamId, yesterday, today, blockers } = createBody.parse(req.body);

  // must be a member of a non-deleted team
  const member = await isTeamMember(userId, teamId);
  if (!member) return res.status(403).json({ message: 'Not a member of team' });

  try {
    const doc = await Standup.create({
      userId,
      teamId,
      date: istDateStr(),
      yesterday,
      today,
      blockers: blockers ?? '',
      // soft-delete defaults are handled in schema (isDeleted=false)
    });
    return res.status(201).json(doc);
  } catch (e: any) {
    if (e?.code === 11000) return res.status(409).json({ message: 'Already submitted for today' });
    throw e;
  }
};

export const updateStandup = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;
  const patch = updateBody.parse(req.body);

  const st = await Standup.findById(id);
  if (!st) return res.status(404).json({ message: 'Not found' });

  // cannot update soft-deleted
  if (st.isDeleted) return res.status(400).json({ message: 'Cannot update a deleted standup' });

  // only owner can edit
  if (String(st.userId) !== String(userId)) return res.status(403).json({ message: 'Not owner' });

  // only today's entry (IST)
  if (!isTodayIST(st.date)) return res.status(400).json({ message: 'Can edit only today\'s entry' });

  if (patch.yesterday !== undefined) st.yesterday = patch.yesterday;
  if (patch.today !== undefined) st.today = patch.today;
  if (patch.blockers !== undefined) st.blockers = patch.blockers;

  await st.save();
  return res.json(st);
};

// SOFT DELETE: author or admin; today only (IST)
export const softDeleteStandup = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;

  const st = await Standup.findById(id);
  if (!st) return res.status(404).json({ message: 'Not found' });

  // permissions: author or admin
  const author = String(st.userId) === String(userId);
  const admin = await isTeamAdmin(userId, String(st.teamId));
  if (!author && !admin) return res.status(403).json({ message: 'Not allowed' });

  // only today's entry (IST)
  if (!isTodayIST(st.date)) return res.status(400).json({ message: 'Can delete only today\'s entry' });

  if (st.isDeleted) return res.status(409).json({ message: 'Already deleted' });

  st.isDeleted = true;
  st.deletedAt = new Date();
  (st as any).deletedBy = userId as any;
  await st.save();

  return res.json({ ok: true });
};

// RESTORE: author or admin; today only (IST)
export const restoreStandup = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;

  const st = await Standup.findById(id);
  if (!st) return res.status(404).json({ message: 'Not found' });

  const author = String(st.userId) === String(userId);
  const admin = await isTeamAdmin(userId, String(st.teamId));
  if (!author && !admin) return res.status(403).json({ message: 'Not allowed' });

  if (!isTodayIST(st.date)) return res.status(400).json({ message: 'Can restore only today\'s entry' });

  if (!st.isDeleted) return res.status(409).json({ message: 'Not deleted' });

  st.isDeleted = false;
  st.deletedAt = null;
  (st as any).deletedBy = null;
  await st.save();

  return res.json({ ok: true });
};

// HARD DELETE: team admin only; today only (IST)
export const hardDeleteStandup = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = req.params;

  const st = await Standup.findById(id);
  if (!st) return res.status(404).json({ message: 'Not found' });

  const admin = await isTeamAdmin(userId, String(st.teamId));
  if (!admin) return res.status(403).json({ message: 'Only team admin can hard-delete' });

  if (!isTodayIST(st.date)) return res.status(400).json({ message: 'Can hard-delete only today\'s entry' });

  await Standup.deleteOne({ _id: id });
  return res.json({ ok: true });
};

export const myStandups = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const q = myQuery.parse(req.query);

  const filter: any = { userId };
  // hide deleted by default; include if explicitly requested
  const includeDeleted = q.includeDeleted === 'true';
  if (!includeDeleted) filter.isDeleted = false;

  if (q.teamId) filter.teamId = q.teamId;
  if (q.from && q.to) filter.date = { $gte: q.from, $lte: q.to };

  const page = Math.max(parseInt(q.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(q.limit || '20', 10), 1), 100);

  const docs = await Standup.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return res.json(docs);
};

export const teamByDate = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { teamId } = z.object({ teamId: z.string().length(24, 'Invalid teamId') }).parse(req.params);
  const q = teamQuery.parse(req.query);

  // must be a member
  const member = await isTeamMember(userId, teamId);
  if (!member) return res.status(403).json({ message: 'Not a member of team' });

  const admin = await isTeamAdmin(userId, teamId);
  const includeDeleted = q.includeDeleted === 'true' && admin; // only admins can see deleted

  const filter: any = { teamId };
  if (!includeDeleted) filter.isDeleted = false;
  if (q.date) filter.date = q.date;

  const page = Math.max(parseInt(q.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(q.limit || '50', 10), 1), 200);

  const docs = await Standup.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('userId', 'name email');

  return res.json(docs);
};

export const getStandupById = async (req: Request, res: Response) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = z.object({ id: z.string().length(24) }).parse(req.params);

  const st = await Standup.findById(id);
  if (!st) return res.status(404).json({ message: 'Not found' });

  // allow read if owner or member of the team
  const team = await Team.findOne({ _id: st.teamId, isDeleted: false, members: userId }).lean();
  const isOwner = String(st.userId) === String(userId);
  if (!team && !isOwner) return res.status(403).json({ message: 'Forbidden' });

  return res.json(st);
};
