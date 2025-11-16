# Standup Assistant — Backend (Node + TS + Mongo)

Daily standup backend with Teams, Auth (JWT), Standups, optional AI (LangChain providers), and soft/hard delete.

## Tech
- Node.js + TypeScript + Express
- MongoDB + Mongoose
- Zod (validation)
- Swagger/OpenAPI at `/api/docs`
- Optional AI providers (OpenAI / Groq / Gemini / Ollama) via LangChain

## Quick Start
```bash
# 1) Clone
git clone https://github.com/surajthakkar7/standup-assistant-backend.git
cd standup-assistant-backend

# 2) Install
npm i

# 3) Configure env
cp .env.example .env
# fill values: MONGO_URI, JWT_SECRET, AI_* as needed

# 4) Run (dev)
npm run dev

# 5) Swagger
# open http://localhost:4000/api/docs
