import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { loadEnv } from '../config/env.js';


const { JWT_SECRET } = loadEnv();


const registerSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6) });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });


export async function register(req: any, res: any) {
const { name, email, password } = registerSchema.parse(req.body);
const existing = await User.findOne({ email });
if (existing) return res.status(409).json({ message: 'Email already in use' });
const passwordHash = await bcrypt.hash(password, 12);
const user = await User.create({ name, email, passwordHash, teams: [] });
const token = jwt.sign({}, JWT_SECRET, { subject: String(user._id), expiresIn: '1d' });
res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
}


export async function login(req: any, res: any) {
const { email, password } = loginSchema.parse(req.body);
const user = await User.findOne({ email });
if (!user) return res.status(401).json({ message: 'Invalid credentials' });
const ok = await bcrypt.compare(password, user.passwordHash);
if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
const token = jwt.sign({}, JWT_SECRET, { subject: String(user._id), expiresIn: '1d' });
res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
}