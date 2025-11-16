// src/types/express.d.ts
export {};

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: { id: string; email?: string; name?: string; roles?: string[] };
    }
  }
}
