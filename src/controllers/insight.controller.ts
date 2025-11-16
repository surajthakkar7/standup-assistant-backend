// src/controllers/insight.controller.ts
import type { Request, Response } from 'express';
import  Standup  from '../models/Standup.js';
import { Types } from 'mongoose';

export const streak = async (req: Request, res: Response) => {
  const userId = req.userId!;
  const teamId = new Types.ObjectId(String(req.query.teamId));

  const items = await Standup.find({ userId, teamId })
    .sort({ date: -1 })
    .limit(90)
    .lean();

  const dates = new Set(items.map(x => x.date));
  let streakDays = 0;
  const d = new Date();
  for (;;) {
    const ymd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
    if (!dates.has(ymd)) break;
    streakDays++;
    d.setDate(d.getDate() - 1);
  }
  return res.json({ streak: streakDays });
};

export const trends = async (req: Request, res: Response) => {
  const teamId = new Types.ObjectId(String(req.query.teamId));
  const from = String(req.query.from);
  const to   = String(req.query.to);

  const perDay = await Standup.aggregate<{ _id: string; count: number }>([
    { $match: { teamId, date: { $gte: from, $lte: to }, isDeleted: { $ne: true } } },
    { $group: { _id: '$date', count: { $sum: 1 } } },
    { $sort: { _id: 1 as 1 } },
  ]);

  const raws = await Standup.find(
    { teamId, date: { $gte: from, $lte: to }, isDeleted: { $ne: true } },
    { blockers: 1, today: 1, yesterday: 1 }
  ).lean();

  const blockerCounts: Record<string, number> = {};
  for (const r of raws) {
    const text = [r.blockers || '', r.today || '', r.yesterday || ''].join(' ').toLowerCase();
    for (const key of ['api','env','build','deploy','access','review','merge','dependency']) {
      if (text.includes(key)) blockerCounts[key] = (blockerCounts[key] || 0) + 1;
    }
  }

  return res.json({ perDay, blockerCounts });
};
