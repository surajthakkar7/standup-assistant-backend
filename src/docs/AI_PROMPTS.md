
---

# Prompt Documentation – `docs/AI_PROMPTS.md`

```md
# AI Prompt Documentation

This app can summarize **individual** standups and produce **team** insights.
It’s provider-agnostic (OpenAI / Groq / Gemini / Ollama) if enabled.

> To run in **mock mode** (no keys): set `AI_ENABLED=false` (backend). The UI will still render the card and call the endpoint, which should return mock data if implemented.

---

## Providers & Models

- **Env**:
  - `AI_ENABLED=true|false`
  - `AI_PROVIDER=openai|groq|gemini|ollama`
  - Keys: `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OLLAMA_HOST`
  - `AI_MODEL=<provider-specific>` e.g.:
    - `openai:gpt-4o-mini`
    - `groq:llama-3.1-70b-versatile`
    - `gemini:1.5-pro`
    - `ollama:llama3.1`

- **Timeouts / Quotas**: The frontend triggers requests **only via buttons**, to avoid accidental token burn.

---

## Personal Insight (per standup)

**Goal:** Enrich a single user’s entry with actionable feedback.

**Inputs:**
- `yesterday`, `today`, `blockers`
- Optional context: prior standups (last ~7 days)

**Output fields:**
- `keyTasks[]` — important tasks extracted
- `clarityFeedback` — brief suggestions to make updates crisper
- `tone` — 1–2 words (e.g., “positive”, “neutral”, “frustrated”)
- `suggestions[]` — concrete next actions


**Post-processing:**
- Trim bullets to concise phrases.
- Normalize `tone` to a small, known set.
**Prompt skeleton (pseudocode):**
You are an assistant helping with daily standups.

Given the user's standup:

Yesterday: {yesterday}

Today: {today}

Blockers: {blockers}

Return JSON with:
{
"keyTasks": ["..."],
"clarityFeedback": "...",
"tone": "positive|neutral|frustrated",
"suggestions": ["...", "..."]
}

Rules:

Be concise and specific.

If blockers are empty, omit or return an empty array for blockers-related suggestions.

Avoid repeating the input verbatim.
---

## Team Insight (for a team & date)

**Goal:** Produce a digest of the team’s day with collaboration opportunities.

**Inputs:**
- Collection of standups for a given team/date (excluding soft-deleted by default).
- Each document: `{ user, yesterday, today, blockers }`.

**Output fields:**
- `teamSummary` — 3–5 bullet digest of shared themes
- `commonBlockers[]` — list of blockers with frequency
- `suggestedSyncs[]` — array of `{ pair: [memberA, memberB], reason }` with **specific** reasons
- `risks[]` — concrete risk bullets if relevant

**Prompt skeleton:**
You are summarizing a team's daily standups for {date}.

Given a list of entries:

{name}: Y: {...} T: {...} B: {...}

...

Return JSON with:
{
"teamSummary": ["...", "..."],
"commonBlockers": [{"label":"...", "count": 3}, ...],
"suggestedSyncs": [{"pair": ["A","B"], "reason":"..."}, ...],
"risks": ["...", "..."]
}

Rules:

Use member names in pairs, not generic roles.

Consolidate similar blockers.

Provide specific reasons for each suggested sync (avoid generic “similar tasks”).

If data is sparse, keep arrays short or empty.
**Post-processing:**
- Normalize blocker labels (lowercase, trimmed).
- De-duplicate `suggestedSyncs` pairs (A–B == B–A).
- Cache output keyed by `{teamId, date, provider}` to avoid recharges.

---

## Example (Team Insight) – Minimal

Input entries (3):


A: Y: Setup CI for service-x. T: Ship Dockerfile. B: Waiting on cloud creds
B: Y: Implement /users API. T: Write tests. B: None
C: Y: Investigate 500s. T: Fix N+1 on /orders. B: Need DBA review


Output (abridged):
```json
{
  "teamSummary": [
    "Service-x and user API work progressing",
    "Testing and infra changes planned today",
    "Two infra-related dependencies may delay delivery"
  ],
  "commonBlockers": [
    {"label":"cloud credentials","count":1},
    {"label":"dba review","count":1}
  ],
  "suggestedSyncs": [
    {"pair":["A","B"],"reason":"B's tests depend on A's CI pipeline; coordinate testing workflow"},
    {"pair":["B","C"],"reason":"C's N+1 findings may affect /users; share diagnostics"}
  ],
  "risks": [
    "Missing cloud credentials could block containerization on service-x"
  ]
}