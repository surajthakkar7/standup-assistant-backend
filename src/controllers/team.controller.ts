// src/controllers/team.controller.ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import Team from '../models/Team.js';
import User from '../models/User.js';

const oid = (s: string) => new Types.ObjectId(s);

const createSchema = z.object({ name: z.string().min(2, 'Team name must be at least 2 characters') });
const joinSchema   = z.object({ code: z.string().min(4).max(12) });

/** Simple code generator without confusing characters */
function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** POST /api/teams — create (owner becomes member) */
export async function createTeam(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { name } = createSchema.parse(req.body);

  // unique join code (bounded retries)
  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await Team.exists({ code }))) break;
    code = randomCode();
  }
  if (await Team.exists({ code })) {
    return res.status(503).json({ message: 'Could not allocate a unique team code. Please retry.' });
  }

  const team = await Team.create({
    name,
    code,
    ownerId: userId,
    members: [userId],
  });

  await User.findByIdAndUpdate(userId, { $addToSet: { teams: team._id } });
  return res.status(201).json({ team });
}

/** POST /api/teams/join — join by code (idempotent) */
export async function joinTeam(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { code } = joinSchema.parse(req.body);

  const team = await Team.findOne({ code, isDeleted: false });
  if (!team) return res.status(404).json({ message: 'Team not found' });

  if (team.members.length >= 10 && !team.members.some(m => m.toString() === userId)) {
    return res.status(400).json({ message: 'Team is full (max 10)' });
  }

  await Team.findByIdAndUpdate(team._id, { $addToSet: { members: userId } });
  await User.findByIdAndUpdate(userId, { $addToSet: { teams: team._id } });

  const updated = await Team.findById(team._id).lean();
  return res.json({ team: updated });
}

/** GET /api/teams/:id/members — list members */
export async function listMembers(req: Request, res: Response) {
  const { id } = z.object({ id: z.string().length(24, 'Invalid team id') }).parse(req.params);

  const team = await Team.findOne({ _id: id, isDeleted: false })
    .populate('members', 'name email')
    .lean();

  if (!team) return res.status(404).json({ message: 'Team not found' });

  const members = (team.members as any[]).map(m => ({
    id: m._id?.toString?.() ?? m._id,
    name: m.name,
    email: m.email,
  }));

  return res.json({ members });
}

/** GET /api/teams — list teams where I’m a member */
export async function listMyTeams(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const teams = await Team.find({ members: userId, isDeleted: false }).sort({ createdAt: -1 });
  res.json({ teams });
}

/** GET /api/teams/owned — list teams I own */
export async function listOwnedTeams(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const teams = await Team.find({ ownerId: userId, isDeleted: false }).sort({ createdAt: -1 });
  res.json({ teams });
}

/** GET /api/teams/:id — read one */
export async function getTeam(req: Request, res: Response) {
  const { id } = z.object({ id: z.string().length(24) }).parse(req.params);
  const team = await Team.findOne({ _id: id, isDeleted: false });
  if (!team) return res.status(404).json({ message: 'Team not found' });
  res.json({ team });
}

/** PATCH /api/teams/:id — rename (owner only) */
export async function updateTeam(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = z.object({ id: z.string().length(24) }).parse(req.params);
  const { name } = z.object({ name: z.string().min(2) }).parse(req.body);

  const team = await Team.findById(id);
  if (!team || team.isDeleted) return res.status(404).json({ message: 'Team not found' });
  if (team.ownerId.toString() !== userId) return res.status(403).json({ message: 'Only owner can rename' });

  team.name = name;
  await team.save();
  res.json({ team });
}

/** POST /api/teams/:id/rotate-code — new join code (owner only) */
export async function rotateCode(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = z.object({ id: z.string().length(24) }).parse(req.params);

  const team = await Team.findById(id);
  if (!team || team.isDeleted) return res.status(404).json({ message: 'Team not found' });
  if (team.ownerId.toString() !== userId) return res.status(403).json({ message: 'Only owner can rotate code' });

  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await Team.exists({ code }))) break;
    code = randomCode();
  }
  if (await Team.exists({ code })) return res.status(503).json({ message: 'Try again' });

  team.code = code;
  await team.save();
  res.json({ code: team.code });
}

/** POST /api/teams/:id/leave — member leaves (owner cannot leave) */
export async function leaveTeam(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = z.object({ id: z.string().length(24) }).parse(req.params);

  const team = await Team.findById(id);
  if (!team || team.isDeleted) return res.status(404).json({ message: 'Team not found' });
  if (team.ownerId.toString() === userId) {
    return res.status(400).json({ message: 'Owner cannot leave; transfer ownership or delete team' });
  }

  team.members = team.members.filter(m => m.toString() !== userId);
  await team.save();
  await User.findByIdAndUpdate(userId, { $pull: { teams: oid(id) } });
  res.status(204).send();
}

/** DELETE /api/teams/:id — soft delete (owner only) */
export async function softDeleteTeam(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = z.object({ id: z.string().length(24) }).parse(req.params);

  const team = await Team.findById(id);
  if (!team || team.isDeleted) return res.status(404).json({ message: 'Team not found' });
  if (team.ownerId.toString() !== userId) return res.status(403).json({ message: 'Only owner can delete' });

  team.isDeleted = true;                 // <-- soft delete flag
  await team.save();

  // (optional) also remove this team from all users' teams list
  await User.updateMany({ teams: oid(id) }, { $pull: { teams: oid(id) } });

  res.status(204).send();
}

/** DELETE /api/teams/:id/hard — hard delete (owner only; irreversible) */
export async function hardDeleteTeam(req: Request, res: Response) {
  const userId = req.userId; if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  const { id } = z.object({ id: z.string().length(24) }).parse(req.params);

  const team = await Team.findById(id);
  if (!team) return res.status(404).json({ message: 'Team not found' });
  if (team.ownerId.toString() !== userId) return res.status(403).json({ message: 'Only owner can delete' });

  await Team.deleteOne({ _id: id });
  await User.updateMany({ teams: oid(id) }, { $pull: { teams: oid(id) } });
  res.status(204).send();
}
