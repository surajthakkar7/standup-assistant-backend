export function loadEnv() {
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const MONGO_URI = process.env.MONGO_URI || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
if (!MONGO_URI) throw new Error('MONGO_URI missing');
if (!JWT_SECRET) throw new Error('JWT_SECRET missing');
return { PORT, MONGO_URI, JWT_SECRET };
}