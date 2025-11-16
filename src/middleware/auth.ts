// src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const hdr = req.headers.authorization;
  if (!hdr || !hdr.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing token' });
  }

  const token = hdr.slice(7); // strip "Bearer "
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as any;

    // Accept any of these fields from your token generator
    const rawId = payload?.id ?? payload?._id ?? payload?.userId ?? payload?.sub;
    if (!rawId) {
      return res.status(401).json({ message: 'Invalid token payload (no user id)' });
    }

    // Normalize onto req.userId and (optionally) req.user
    req.userId = String(rawId);
    req.user = {
      id: String(rawId),
      email: payload?.email,
      name: payload?.name,
      roles: payload?.roles,
    };

    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export default requireAuth;
