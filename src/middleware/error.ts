import { Request, Response, NextFunction } from 'express';


export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
const code = err.status || 500;
const msg = err.message || 'Server error';
if (process.env.NODE_ENV !== 'test') console.error(err);
res.status(code).json({ message: msg });
}