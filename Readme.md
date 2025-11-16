# Standup Assistant — Backend (Node + TS + Mongo)

Daily standup backend with Teams, Auth (JWT), Standups, AI (optional), and **soft/hard delete** for standups & teams.

## Tech
- Node.js + TypeScript + Express
- MongoDB + Mongoose
- Zod (validation)
- Swagger/OpenAPI (`/api/docs`)
- Optional AI providers (OpenAI / Groq / Gemini / Ollama) via LangChain (if you added AI parts)

---

## Quick Start

```bash
# 1) Clone
git clone <this-backend-repo-url>
cd backend

# 2) Install
npm i

# 3) Configure env
cp .env.example .env
# edit .env

# 4) Run (dev)
npm run dev

# 5) Swagger
# http://localhost:4000/api/docs
