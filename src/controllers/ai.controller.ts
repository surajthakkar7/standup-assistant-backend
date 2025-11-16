// backend/src/controllers/ai.controller.ts
import { Request, Response } from "express";
import { Types } from "mongoose";
import  Standup  from "../models/Standup.js";
import { z } from "zod";

import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOllama } from "@langchain/ollama";

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StructuredOutputParser } from "@langchain/core/output_parsers";

// ---------- types ----------
type PopulatedStandup = {
  userId: { _id: Types.ObjectId; name: string; email?: string };
  date: string;
  yesterday?: string;
  today?: string;
  blockers?: string;
};

// ---------- helpers ----------
function toISODateIST(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// ===== TEAM SCHEMA =====
const teamSchema = z.object({
  teamSummary: z.string().describe("2–5 sentence summary of progress"),
  commonBlockers: z.array(z.string()).describe("top blockers/keywords"),
  suggestedSyncs: z.array(
    z.object({
      members: z.array(z.string()),
      reason: z.string(),
    })
  ),
  risks: z.array(z.string()),
});
const teamParser = StructuredOutputParser.fromZodSchema(teamSchema);

// ===== PERSONAL SCHEMA (matches frontend: keyTasks/clarity/tone/suggestions) =====
const personalSchema = z.object({
  keyTasks: z
    .array(z.string())
    .describe("Bulleted key tasks extracted from the update"),
  clarityFeedback: z
    .string()
    .describe(
      "1–2 sentence critique on clarity/structure, suggest improvements if vague"
    ),
  tone: z
    .string()
    .describe(
      "Short tone label like: positive / overwhelmed / neutral / frustrated"
    ),
  suggestions: z.array(z.string()).describe("Actionable, short next steps"),
});
const personalParser = StructuredOutputParser.fromZodSchema(personalSchema);

// --- blocker phrases (normalized) ---
const BLOCKER_PHRASES = [
  "staging db credentials",
  "db creds",
  "staging db user",
  "api access whitelist",
  "api access to staging",
  "payments 429",
  "payments sandbox 429",
  "rate limit",
  "flaky tests",
  "auth middleware mismatch",
  "auth/session",
];

function extractBlockerPhrases(text: string): string[] {
  const t = (text || "").toLowerCase();
  const hits = new Set<string>();
  for (const p of BLOCKER_PHRASES) if (t.includes(p)) hits.add(p);
  // fallback normalization
  if (hits.size === 0) {
    if (/\bstaging\b.*\bdb\b/.test(t) || /\bdb\b.*\bstaging\b/.test(t))
      hits.add("staging db credentials");
    if (/\bapi\b.*\baccess\b/.test(t)) hits.add("api access whitelist");
    if (/\b429\b|\brate limit/.test(t)) hits.add("payments 429");
    if (/flaky.*test/.test(t)) hits.add("flaky tests");
    if (/auth.*middleware|auth\/session/.test(t)) hits.add("auth/session");
  }
  return Array.from(hits);
}
// Normalize near-duplicates so counts aggregate cleanly
// Normalize raw blocker text to a canonical label used across counts/risks/UI
function normBlocker(x: string): string {
  const t = (x || '').toLowerCase().trim();

  if (t.includes('staging db user') || (/\bstaging\b.*\bdb\b/.test(t) || /\bdb\b.*\bstaging\b/.test(t))) {
    return 'staging db credentials';
  }
  if (t.includes('db creds')) return 'staging db credentials';

  if (t.includes('api access whitelist') || (/\bapi\b.*\baccess\b/.test(t))) {
    return 'api access whitelist';
  }

  if (t.includes('payments 429') || t.includes('payments sandbox 429') || /\b429\b|\brate limit/.test(t)) {
    return 'payments 429';
  }

  if (t.includes('auth middleware mismatch')) return 'auth middleware mismatch';
  if (t.includes('auth/session') || /auth.*middleware|auth\/session/.test(t)) return 'auth/session';

  if (t.includes('flaky tests') || /flaky.*test/.test(t)) return 'flaky tests';

  // fallback: return as-is
  return t;
}


// Provider switch
function makeModel(provider?: string) {
  const which = (provider || "").toLowerCase();
  if (which === "gemini") {
    return new ChatGoogleGenerativeAI({
      model: "gemini-1.5-pro",
      apiKey: process.env.GOOGLE_API_KEY,
      temperature: 0.1,
      // keep responses longer if needed
      maxOutputTokens: 1024,
    } as any);
  }
  if (which === "ollama") {
    return new ChatOllama({
      model: "llama3.1:8b",
      temperature: 0.1,
      baseUrl: process.env.OLLAMA_HOST,
      // Ollama wrapper ignores max tokens, but harmless:
      num_predict: 1024,
    } as any);
  }
  // default → Groq
  return new ChatGroq({
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    apiKey: process.env.GROQ_API_KEY!,
    temperature: 0.1,
    // prevent truncation on Groq
    maxTokens: 1024,
  } as any);
}

// Turn standups into compact context for the LLM
function renderStandups(items: PopulatedStandup[]) {
  return items
    .map((s) => {
      const who = s.userId.name;
      return `### ${who} — ${s.date}
- Y: ${s.yesterday || "-"}
- T: ${s.today || "-"}
- B: ${s.blockers || "-"}
`;
    })
    .join("\n");
}

// Unique names in this batch
function uniqueMemberNames(items: PopulatedStandup[]) {
  const s = new Set<string>();
  for (const it of items) s.add(it.userId.name);
  return Array.from(s);
}

function ensurePair(members: string[], universe: string[]): string[] {
  const uniq = Array.from(new Set((members || []).filter(Boolean).map(String)));
  if (uniq.length >= 2) return uniq.slice(0, 2);
  if (universe.length >= 2) return universe.slice(0, 2);
  if (universe.length === 1) return [universe[0], "PM / Tech Lead"];
  return ["PM / Tech Lead", "DevOps"];
}

function refineReason(reason: string): string {
  const r = (reason || "").trim();
  if (
    /^overlap on:\s*(team|work|tasks|add|added|update|code)(,|\s|$)/i.test(r)
  ) {
    return "Overlap on closely related implementation details";
  }
  if (/^coordinate on\b/i.test(r) && r.length < 30) {
    return "Coordinate on today’s specific blockers and deliverables";
  }
  return r;
}

// Basic heuristics to construct valid syncs if model goes off-spec
function postProcessTeamResult(
  raw: unknown,
  members: string[],
  hadCredsBlocker: boolean,
  hadPriorityConfusion: boolean
) {
  const parsed = teamSchema.safeParse(raw);
  if (parsed.success) {
    const fixed = {
      ...parsed.data,
      commonBlockers: (parsed.data.commonBlockers || [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 5),
      suggestedSyncs: (parsed.data.suggestedSyncs || [])
        .map((s) => ({
          members: ensurePair(
            Array.isArray(s.members) ? s.members : [],
            members
          ),
          reason: refineReason(
            (s.reason || "Coordinate on blockers/priorities.").trim()
          ),
        }))
        .slice(0, 5),
      risks: (parsed.data.risks || [])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 5),
    };
    return fixed;
  }

  // Coerce if odd
  let teamSummary = "Summary unavailable.";
  let commonBlockers: string[] = [];
  let suggestedSyncs: { members: string[]; reason: string }[] = [];
  let risks: string[] = [];

  try {
    const str = typeof raw === "string" ? raw : JSON.stringify(raw);
    const tryObj = JSON.parse(str);
    if (typeof tryObj?.teamSummary === "string")
      teamSummary = tryObj.teamSummary;
    if (Array.isArray(tryObj?.commonBlockers)) {
      commonBlockers = tryObj.commonBlockers
        .filter((x: any) => typeof x === "string")
        .map((x: string) => x.trim());
    }
    if (Array.isArray(tryObj?.risks)) {
      risks = tryObj.risks
        .filter((x: any) => typeof x === "string")
        .map((x: string) => x.trim());
    }
    if (Array.isArray(tryObj?.suggestedSyncs)) {
      suggestedSyncs = tryObj.suggestedSyncs
        .map((s: any) => {
          if (Array.isArray(s?.members) && typeof s?.reason === "string") {
            return {
              members: ensurePair(s.members, members),
              reason: refineReason(
                s.reason.trim() || "Coordinate on blockers/priorities."
              ),
            };
          }
          if (typeof s === "string") {
            return {
              members: ensurePair([], members),
              reason: refineReason(
                s.trim() || "Coordinate on blockers/priorities."
              ),
            };
          }
          return null;
        })
        .filter(Boolean) as { members: string[]; reason: string }[];
    }
  } catch {
    /* ignore */
  }

  if (suggestedSyncs.length === 0) {
    if (hadCredsBlocker) {
      suggestedSyncs.push({
        members: ensurePair([], members),
        reason: "Unblock staging DB credentials for backend/testing.",
      });
    }
    if (hadPriorityConfusion) {
      suggestedSyncs.push({
        members: ensurePair([], members),
        reason: "Clarify task priority to reduce context switching.",
      });
    }
    if (suggestedSyncs.length === 0) {
      suggestedSyncs.push({
        members: ensurePair([], members),
        reason: "Coordinate on today’s deliverables and blockers.",
      });
    }
  }

  return {
    teamSummary,
    commonBlockers: Array.from(new Set(commonBlockers)).slice(0, 5),
    suggestedSyncs: suggestedSyncs.slice(0, 5),
    risks: Array.from(new Set(risks)).slice(0, 5),
  };
}

// ---- topic extraction & scoring ----
const EXTRA_STOP = new Set([
  "team",
  "project",
  "today",
  "yesterday",
  "will",
  "done",
  "doing",
  "added",
  "add",
  "work",
  "task",
  "tasks",
  "fix",
  "fixed",
  "issue",
  "issues",
  "setup",
  "set",
  "get",
  "make",
  "made",
  "update",
  "updated",
  "updating",
  "create",
  "created",
  "creating",
  "refactor",
  "refactored",
  "implement",
  "implemented",
  "implementation",
  "doc",
  "docs",
  "documentation",
  "readme",
  "file",
  "folder",
  "code",
  "repo",
  "api",
  "service",
  "module",
  "component",
  "page",
  "screen",
  "test",
  "tests",
  "testing",
  "unit",
  "integration",
  "select",
  "selector",
  "selectors",
  "page",
  "ui",
  "ux",
]);

function extractTopics(text: string): string[] {
  const stop = new Set([
    "the",
    "and",
    "to",
    "for",
    "of",
    "on",
    "in",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "with",
    "by",
    "this",
    "that",
    "it",
    "as",
    "at",
    "from",
    "my",
    "our",
    "your",
    "into",
    "about",
    "over",
    "under",
    "between",
    "across",
    "against",
    "while",
    "also",
    "etc",
  ]);
  const bad = new Set([...stop, ...EXTRA_STOP]);

  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_\/]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !bad.has(w))
    .slice(0, 60);
}

function buildTokenStats(profiles: { topics: string[] }[]) {
  const df = new Map<string, number>();
  for (const p of profiles) {
    const uniq = new Set(p.topics);
    for (const t of uniq) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = Math.max(1, profiles.length);
  const idf = new Map<string, number>();
  for (const [t, d] of df) {
    idf.set(t, Math.log(N / (1 + d)) + 1);
  }
  return { idf, N };
}

function topSharedKeywords(
  a: string[],
  b: string[],
  idf: Map<string, number>,
  k = 3
) {
  const shared = [...new Set(a)].filter((t) => b.includes(t));
  return shared
    .map((t) => ({ t, score: idf.get(t) ?? 1 }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k)
    .map((x) => x.t);
}

function jaccard(a: string[], b: string[]) {
  const A = new Set(a),
    B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const uni = new Set([...a, ...b]).size || 1;
  return inter / uni;
}

function inferTagsFromWork(yesterday: string, today: string) {
  const t = `${yesterday || ""} ${today || ""}`.toLowerCase();
  return {
    devops:
      /provision|secret|whitelist|firewall|cluster|staging|credential|creds|policy|infra|k8s|pod|deploy/.test(
        t
      ),
    auth: /auth|session|middleware/.test(t),
    docs: /doc|readme|handbook|guide|api docs|swagger|openapi/.test(t),
    tests: /test|jest|vitest|ci|flaky/.test(t),
    payments: /payment|stripe|razorpay|429|rate limit/.test(t),
    selectors: /selector|team picker|ui wiring/.test(t),
    rotateCode: /rotate-?code/.test(t),
    insights: /insight|analytics|trend/.test(t),
    metrics: /metric|dashboard|grafana|prometheus/.test(t),
  };
}

type Profile = {
  name: string;
  topics: string[];
  tags: ReturnType<typeof inferTagsFromWork>;
  blockerPhrases: string[];
};

function buildProfiles(standups: PopulatedStandup[]): Profile[] {
  return standups.map((s) => ({
    name: s.userId?.name || "User",
    topics: extractTopics(`${s.yesterday || ""} ${s.today || ""}`),
    tags: inferTagsFromWork(s.yesterday || "", s.today || ""),
    blockerPhrases: extractBlockerPhrases(s.blockers || ""),
  }));
}


function inferTone(y: string, t: string, b: string): string {
  const all = `${y} ${t} ${b}`.toLowerCase();
  if (/blocked|waiting|stuck|delay|urgent|panic/.test(all)) return "frustrated";
  if (/overwhelm|too many|many things|context switch/.test(all)) return "overwhelmed";
  if (/done|shipped|landed|working well|happy|excited|great/.test(all)) return "positive";
  return "neutral";
}
// ---- Personal AI post-processing helpers (REPLACE THESE) ----
// ---- Personal AI post-processing helpers (REPLACED) ----
function normalizeForTasks(s: string): string {
  // Join single newlines into spaces unless the next line is a bullet
  // (bullet = starts with -, *, •, or "1." style)
  return (s || "")
    .replace(/\r/g, "")
    .replace(/\n(?!\s*[-*•]|\s*\d+\.)/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function synthesizeClarity(y: string, t: string): string {
  const yN = normalizeForTasks(y);
  const tN = normalizeForTasks(t);
  const tips: string[] = [];
  if (yN.length < 20) tips.push("Add 2–3 concrete outcomes for “yesterday” (files, PRs, or endpoints).");
  if (tN.length < 20) tips.push("Make “today” measurable (API path, UI surface, or test you’ll add).");
  tips.push("Prefer bullets; name owners/IDs where possible.");
  return tips.slice(0, 2).join(" ");
}

function normalizeSuggestion(s: string): string {
  return s.replace(/^\s*[-*•]\s*/,'').replace(/\s+/g,' ').trim();
}

// Canonical form used for robust de-dupe across “add/create/implement”, dashes/spaces, quotes, etc.
function canonical(s: string): string {
  let c = (s || "")
    .toLowerCase()
    .replace(/[“”"']/g, "")          // strip quotes
    .replace(/\brotate\s*[- ]?\s*code\b/g, "rotate-code") // unify "rotate code" / "rotate-code"
    .replace(/\bjoin\s*[- ]?\s*by\s*[- ]?\s*code\b/g, "join-by-code")
    .replace(/\s*endpoint\b/g, " endpoint")
    .replace(/\s+/g, " ")
    .trim();

  // Normalize leading verbs to reduce duplicates like add/create/build/implement
  c = c.replace(/^(add|create|build)\s+/i, "implement ");
  c = c.replace(/^wire\s+/, "wire ");
  return c;
}

function splitTasks(raw: string): string[] {
  const s = normalizeForTasks(raw);
  // Split only on bullet-like separators or blank-line style breaks
  const parts = s
    .split(/\n\s*(?=[-*•]|\d+\.)|[\u2022\-•]+|\s{2,}|;\s+|\|\s+/g)
    .map(x => x.replace(/^[\s\-*•\d.]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Merge tiny fragments into the next token (e.g., "Join", "by", "code ..." -> "Join by code ...")
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i];
    if (cur.length < 8 && i + 1 < parts.length) {
      merged.push((cur + " " + parts[i + 1]).replace(/\s+/g, " ").trim());
      i++; // skip next because we merged it
    } else {
      merged.push(cur);
    }
  }

  // De-duplicate canonically
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of merged) {
    const c = canonical(m);
    if (!seen.has(c)) {
      seen.add(c);
      out.push(m);
    }
  }
  return out;
}



// ---------- controllers ----------
export async function teamInsight(req: Request, res: Response) {
  try {
    const teamId = String(req.query.teamId || "");
    const date = String(req.query.date || toISODateIST(new Date()));
    const provider = String(req.query.provider || "groq");

    if (!teamId || !Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ message: "Valid teamId is required" });
    }

    const standups = await Standup.find(
      { teamId, date, isDeleted: { $ne: true } },
      { userId: 1, date: 1, yesterday: 1, today: 1, blockers: 1 }
    )
      .populate("userId", "name email")
      .lean<PopulatedStandup[]>();

    if (!standups.length) {
      return res.json({
        teamSummary: "No standups found for this date.",
        commonBlockers: [],
        suggestedSyncs: [],
        risks: [],
      });
    }

    // Per-person topics (for overlap) & per-person blocker tokens
    const perPerson = standups.map((s) => {
      const name = s.userId.name;
      const text = `${s.yesterday || ""} ${s.today || ""}`.trim();
      const topics = extractTopics(text);
      const blockerTopics = extractTopics(s.blockers || "");
      return { name, topics, blockerTopics };
    });

    // Phrase-level blocker counts (normalized)
    const blockerCount: Record<string, number> = {};
    for (const s of standups) {
      const phrases = extractBlockerPhrases(s.blockers || '');
      for (const raw of phrases) {
        const ph = normBlocker(raw);
        blockerCount[ph] = (blockerCount[ph] || 0) + 1;
      }
    }

    // ---- Dynamic hint-pairs (no hardcoded names) ----
    const profiles = buildProfiles(standups);
    const devopsCandidates = profiles.filter((p) => p.tags.devops);
    const authCandidates = profiles.filter((p) => p.tags.auth);
    const paymentsWorkers = profiles.filter((p) => p.tags.payments || p.tags.metrics);

    type HintPair = { members: string[]; reason: string };
    const hintPairs: HintPair[] = [];
    const addedPairs = new Set<string>();
    const addPair = (a: string, b: string, reason: string) => {
      if (!a || !b || a === b) return;
      const key = [a, b].sort().join("|");
      if (addedPairs.has(key)) return;
      addedPairs.add(key);
      hintPairs.push({ members: [a, b], reason });
    };

    // Unblocker logic
    for (const p of profiles) {
      for (const phRaw of p.blockerPhrases) {
        const ph = normBlocker(phRaw);
        if (ph === "staging db credentials" || ph === "api access whitelist") {
          if (devopsCandidates.length) addPair(p.name, devopsCandidates[0].name, `Unblock: ${ph}`);
        }
        if (ph === "auth/session") {
          if (authCandidates.length) addPair(p.name, authCandidates[0].name, "Align on auth/session middleware");
        }
        if (ph === "payments 429") {
          if (paymentsWorkers.length) addPair(p.name, paymentsWorkers[0].name, "Coordinate on payments rate limit mitigation");
        }
        if (ph === "flaky tests") {
          const testOwner = profiles.find((x) => x.tags.tests);
          if (testOwner) addPair(p.name, testOwner.name, "Stabilize flaky tests / CI");
        }
      }
    }

    // Overlap logic (with IDF-weighted keywords for specific reasons)
    const { idf } = buildTokenStats(profiles);
    const OVERLAP_THRESH = 0.1;
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        const a = profiles[i], b = profiles[j];
        const sim = jaccard(a.topics, b.topics);
        if (sim >= OVERLAP_THRESH) {
          const top = topSharedKeywords(a.topics, b.topics, idf, 3);
          const reason = top.length
            ? `Overlap on: ${top.join(", ")}`
            : "Overlap on closely related implementation details";
          addPair(a.name, b.name, reason);
        }
      }
    }
    const hintPairsCapped = hintPairs.slice(0, 8);

    // Build prompt
    const context = renderStandups(standups);
    const formatInstructions = teamParser.getFormatInstructions();
    const model = makeModel(provider);

    const prompt = ChatPromptTemplate.fromTemplate(
`You are an engineering manager assistant.
Return ONLY valid JSON per the schema. No markdown fences. No extra text.
{format_instructions}

# Team Standups (single date)
{context}

# Derived Hints (non-authoritative; use only if helpful)
- Per-person topics (from yesterday/today):
{per_person_json}
- Blocker keyword counts (merged across people):
{blocker_counts_json}
- Suggested pairs hints (pre-identified, optional to use):
{suggested_pairs_hints}

Rules:
- Use only the information above (standups + hints). Do not invent names.
- "teamSummary": write exactly 1 short paragraph (2–4 sentences) that MUST:
  • mention the total number of standups analyzed,
  • explicitly name 2 concrete shared topics/keywords (e.g., "rotate-code", "selectors", "insights"),
  • reference at least one concrete blocker phrase if present (e.g., "staging db credentials", "flaky tests").
- "commonBlockers": 3–5 items, concise, normalized (e.g., "staging db credentials", "flaky tests").
- "suggestedSyncs": 3–5 pairs, each MUST have 2+ members and a specific reason:
  • Overlap: name the 1–3 specific shared keywords (e.g., "rotate-code", "selectors", "insights charts").
  • Unblock: name the specific blocker being unblocked (e.g., "staging db credentials").
- The "reason" MUST NOT summarize accomplishments ("built X", "did Y"); it must explain the overlap or unblock.
- Avoid generic words in reasons like "team", "work", "tasks", "add". Be concrete.
- "risks": up to 3 short items, only if clearly supported by data (e.g., "3 ppl blocked by staging db").
- Keep all lists within 3–5 items.
`
    );

    const chain = prompt.pipe(model).pipe(teamParser);

    let result: unknown;
    try {
      result = await chain.invoke({
        context,
        format_instructions: formatInstructions,
        per_person_json: JSON.stringify(perPerson, null, 2),
        blocker_counts_json: JSON.stringify(blockerCount, null, 2),
        suggested_pairs_hints: JSON.stringify(hintPairsCapped, null, 2),
      });
    } catch {
      const retryPrompt = ChatPromptTemplate.fromTemplate(
`Return ONLY valid JSON for this schema (no markdown, no extra text):
{format_instructions}

Context:
{context}

Per-person topics:
{per_person_json}

Blocker counts:
{blocker_counts_json}

Suggested pairs hints:
{suggested_pairs_hints}`
      );
      result = await retryPrompt.pipe(model).pipe(teamParser).invoke({
        context,
        format_instructions: formatInstructions,
        per_person_json: JSON.stringify(perPerson),
        blocker_counts_json: JSON.stringify(blockerCount),
        suggested_pairs_hints: JSON.stringify(hintPairsCapped),
      });
    }

    const names = uniqueMemberNames(standups);
    const textAll = `${standups.map((s) => `${s.yesterday} ${s.today} ${s.blockers}`).join(" ")}`.toLowerCase();
    const hadCredsBlocker = /credential|creds|password|db user|staging db|api access|whitelist/.test(textAll);
    const hadPriorityConfusion = /unclear|priority|priorit/.test(textAll);

    const final = postProcessTeamResult(result, names, hadCredsBlocker, hadPriorityConfusion);

    // (Optional merge hintPairs → ensure at least some specific pairs)
    const seen = new Set(final.suggestedSyncs.map((s) => s.members.slice(0, 2).sort().join("|")));
    for (const h of hintPairsCapped) {
      const key = h.members.slice(0, 2).sort().join("|");
      if (!seen.has(key)) {
        final.suggestedSyncs.push({
          members: h.members.slice(0, 2),
          reason: refineReason(h.reason),
        });
        seen.add(key);
        if (final.suggestedSyncs.length >= 5) break;
      }
    }

    // ---- Stronger augmentation to guarantee useful pairs ----
    (() => {
      type PairSim = { a: string; b: string; sim: number; top: string[] };
      const pairScores: PairSim[] = [];
      const { idf } = buildTokenStats(profiles);
      for (let i = 0; i < profiles.length; i++) {
        for (let j = i + 1; j < profiles.length; j++) {
          const A = profiles[i], B = profiles[j];
          const sim = jaccard(A.topics, B.topics);
          if (sim > 0) {
            pairScores.push({ a: A.name, b: B.name, sim, top: topSharedKeywords(A.topics, B.topics, idf, 3) });
          }
        }
      }
      pairScores.sort((x, y) => y.sim - x.sim);

      const seenKey = new Set(final.suggestedSyncs.map((s) => s.members.slice(0, 2).sort().join("|")));

      // If still <3, add best overlaps
      for (const p of pairScores) {
        if (final.suggestedSyncs.length >= 5) break;
        const key = [p.a, p.b].sort().join("|");
        if (seenKey.has(key)) continue;
        const reason = p.top.length ? `Overlap on: ${p.top.join(", ")}` : "Overlap on closely related implementation details";
        final.suggestedSyncs.push({ members: [p.a, p.b], reason });
        seenKey.add(key);
        if (final.suggestedSyncs.length >= 3) break;
      }

      // If STILL <3, create unblock pairs from blockerCount
      if (final.suggestedSyncs.length < 3) {
        const blockersSorted = Object.entries(blockerCount).sort((a, b) => b[1] - a[1]).map(([k]) => k);
        for (const ph of blockersSorted) {
          if (final.suggestedSyncs.length >= 3) break;
          const blocked = profiles.find((p) => p.blockerPhrases.map(normBlocker).includes(ph));
          if (!blocked) continue;
          let helper: string | undefined;
          if (/db|cred|staging|api access/.test(ph) && devopsCandidates[0]) helper = devopsCandidates[0].name;
          else if (/auth/.test(ph) && authCandidates[0]) helper = authCandidates[0].name;
          else if (/payment|429|rate limit/.test(ph) && paymentsWorkers[0]) helper = paymentsWorkers[0].name;

          if (helper && helper !== blocked.name) {
            const key = [blocked.name, helper].sort().join("|");
            if (!seenKey.has(key)) {
              final.suggestedSyncs.push({ members: [blocked.name, helper], reason: `Unblock: ${ph}` });
              seenKey.add(key);
            }
          }
        }
      }
    })();

    // ---- De-duplicate pairs & keep best reason (longer/more specific) ----
    {
      const pairMap = new Map<string, { members: string[]; reason: string }>();
      for (const s of final.suggestedSyncs || []) {
        const normMembers = (s.members || []).map(m => (m || '').trim()).filter(Boolean).slice(0, 2);
        if (normMembers.length < 2) continue;
        const key = normMembers.slice(0, 2).sort().join('|');

        const reason = refineReason(s.reason || '');
        const prev = pairMap.get(key);
        if (!prev || reason.length > prev.reason.length) {
          const uniquePair = Array.from(new Set(normMembers)).slice(0, 2);
          pairMap.set(key, { members: uniquePair, reason });
        }
      }
      final.suggestedSyncs = Array.from(pairMap.values()).slice(0, 5);
    }

    // Grammar fix on any LLM-provided risks
    final.risks = (final.risks || []).map(r =>
      r.replace(/\b1\s+ppl\b/gi, '1 person').replace(/\b(\d+)\s+ppl\b/gi, '$1 people')
    );

    // Normalize/sort commonBlockers by frequency; expose counts for UI
    const blockersSorted = Object.entries(blockerCount).sort((a, b) => b[1] - a[1]);
    final.commonBlockers = blockersSorted.map(([k]) => k).slice(0, 5);

    // Deterministic risks from counts (top 3 with count >= 2)
    const deterministicRisks = blockersSorted
      .filter(([, count]) => count >= 2)
      .slice(0, 3)
      .map(([k, count]) => `${count} ${count === 1 ? 'person' : 'people'} blocked by ${k}`);

    if (deterministicRisks.length > 0) {
      final.risks = deterministicRisks;
    }

    // Final response (+ counts for UI)
    return res.json({
      ...final,
      blockerCounts: Object.fromEntries(blockersSorted),
    });

  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "AI failed" });
  }
}


export async function personalInsight(req: Request, res: Response) {
  try {
    const standupId = String(req.params.standupId || "");
    const provider = String(req.query.provider || "groq");

    if (!standupId || !Types.ObjectId.isValid(standupId)) {
      return res.status(400).json({ message: "Valid standupId is required" });
    }

    const s = await Standup.findById(standupId)
      .populate("userId", "name email")
      .lean<PopulatedStandup | null>();

    if (!s) return res.status(404).json({ message: "Standup not found" });

    // Use a non-null alias so TS stops complaining
    const standup = s as PopulatedStandup;

    const who = standup.userId.name;
    const context = `### ${who} — ${standup.date}
- Y: ${standup.yesterday || "-"}
- T: ${standup.today || "-"}
- B: ${standup.blockers || "-"}
`;

    const formatInstructions = personalParser.getFormatInstructions();
    const model = makeModel(provider);

    const prompt = ChatPromptTemplate.fromTemplate(
      `You are a thoughtful teammate coach.
Return ONLY valid JSON per the schema. No markdown fences. No extra text.
{format_instructions}

# Standup (single person)
{context}

Rules:
- "keyTasks": extract crisp bullets from BOTH yesterday and today; include action verbs and objects (e.g., "Implement rotate-code endpoint", "Wire team selectors").
- DO NOT put blockers into "suggestions"; if you must address a blocker, phrase it as "Unblock: <short blocker>".
- "clarityFeedback": write concrete guidance (no placeholders); suggest how to be more specific (files, endpoints, tests, owners).
- "tone": one word from {positive, neutral, overwhelmed, frustrated}.
- "suggestions": 2–5 short next steps, measurable if possible; no duplicates of keyTasks or plain restatements.
- Use only the information provided.`
    );

    const chain = prompt.pipe(model).pipe(personalParser);

    let result: unknown;
    try {
      result = await chain.invoke({
        context,
        format_instructions: formatInstructions,
        "positive, neutral, overwhelmed, frustrated": undefined,
      });
    } catch {
      const retryPrompt = ChatPromptTemplate.fromTemplate(
        `Return ONLY valid JSON for this schema (no markdown, no extra text):
{format_instructions}

Context:
{context}`
      );
      result = await retryPrompt.pipe(model).pipe(personalParser).invoke({
        context,
        format_instructions: formatInstructions,
      });
    }

    // ---------- helpers ----------
    const cleanQuotes = (text: string): string =>
      (text || "")
        .replace(/[“”]/g, '"')
        .replace(/[’]/g, "'")
        .replace(/\u00A0/g, " ");

    const normalizeKey = (text: string): string =>
      cleanQuotes(text)
        .toLowerCase()
        .trim()
        .replace(/\brotate[\s-]?code\b/g, "rotate-code")
        .replace(/\bjoin[\s-]?by[\s-]?code\b/g, "join-by-code")
        .replace(/\s+/g, " ");

    // Canonical form for robust de-dupe across verbs/spacing/quotes
    const canonicalText = (text: string): string => {
      let c = normalizeKey(text);
      c = c.replace(/^(add|create|build)\s+/i, "implement ");
      c = c.replace(/^wire\s+/, "wire ");
      return c.trim();
    };

    const normalizeSuggestion = (text: string): string =>
      cleanQuotes(text).replace(/^\s*[-•]\s*/, "").replace(/\s+/g, " ").trim();

    // Split without breaking on hyphens; recombine join/by/code fragments
    function splitTasks(input: string): string[] {
      let sTxt = cleanQuotes(input || "");
      sTxt = sTxt.replace(
        /\b(Add|Implement|Create|Wire|Fix|Refactor|Test|Prepare|Review|Update|Configure|Set up)\b/gi,
        "• $1"
      );
      const parts = sTxt
        .split(/\r?\n|[•–—]|;|\. (?=[A-Z(])/g)
        .map((x: string) => x.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const out: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const one = parts[i] || "";
        const two = i + 1 < parts.length ? parts[i + 1] : "";
        const three = i + 2 < parts.length ? parts[i + 2] : "";
        const c12 = `${one} ${two}`.trim();
        const c123 = `${one} ${two} ${three}`.trim();
        const isJoin = (t: string) => /join\s*by\s*code/i.test(t);
        if (isJoin(c123)) {
          out.push(c123);
          i += 2;
          continue;
        }
        if (isJoin(c12)) {
          out.push(c12);
          i += 1;
          continue;
        }
        out.push(one);
      }
      return out;
    }

    const inferToneLocal = (y: string, t: string, b: string): string => {
      const all = `${y} ${t} ${b}`.toLowerCase();
      if (/blocked|waiting|stuck|delay|urgent|panic/.test(all)) return "frustrated";
      if (/overwhelm|too many|many things|context switch/.test(all)) return "overwhelmed";
      if (/done|shipped|landed|working well|happy|excited|great/.test(all)) return "positive";
      return "neutral";
    };

    const synthesizeClarity = (y: string, t: string): string => {
      const yTasks = splitTasks(y);
      const tTasks = splitTasks(t);
      const tips: string[] = [];
      const tLower = (t || "").toLowerCase();
      if (tLower.includes("rotate") && tLower.includes("code")) {
        tips.push(
          'For "rotate-code": name the file(s)/module(s) and one test (e.g., POST /teams/:id/rotate-code + Jest case).'
        );
      }
      if (tLower.includes("selector")) {
        tips.push('For selectors: specify component(s) and binding (e.g., <TeamPicker> -> teamId).');
      }
      if (yTasks.join(" ").length < 15) tips.push("Add 1–2 concrete outcomes for yesterday (PR #, files, endpoint).");
      if (tips.length === 0 && tTasks.join(" ").length < 15)
        tips.push("Make today measurable (API path, UI surface, or test).");
      if (tips.length === 0) tips.push("Prefer short bullets; include owners/IDs where relevant.");
      return tips.slice(0, 2).join(" ");
    };

    const isBlockerLike = (text: string): boolean => {
      const t = (text || "").toLowerCase();
      return /\b(waiting|blocked|stuck|no credentials|credential|whitelist|429|rate limit)\b/.test(t);
    };
    // ---------- end helpers ----------

    // Enforce schema & harden
    let out = result as any;
    const parsed = personalSchema.safeParse(out);
    if (!parsed.success) {
      const y = standup.yesterday || "";
      const t = standup.today || "";
      const b = standup.blockers || "";
      out = {
        keyTasks: [...splitTasks(y), ...splitTasks(t)].slice(0, 5),
        clarityFeedback: synthesizeClarity(y, t),
        tone: inferToneLocal(y, t, b),
        suggestions: splitTasks(t).slice(0, 4),
      };
    } else {
      out = parsed.data;
    }

    // Ensure Key Tasks include TODAY & dedupe canonically, then sort TODAY first
    const yTasks: string[] = splitTasks(standup.yesterday || "");
    const tTasks: string[] = splitTasks(standup.today || "");
    const blk: string = (standup.blockers || "").toLowerCase().trim();

    const pool: string[] = [...tTasks, ...yTasks, ...(out.keyTasks || [])].map((v: string) =>
      normalizeSuggestion(v)
    );
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const cand of pool) {
      const key = canonicalText(cand);
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(cand);
      }
    }

    function taskScore(tk: string) {
      const c = canonicalText(tk);
      if (canonicalText(standup.today || "").includes(c)) return 0;
      if (canonicalText(standup.yesterday || "").includes(c)) return 1;
      return 2;
    }

    merged.sort((a: string, b: string) => taskScore(a) - taskScore(b));
    out.keyTasks = merged.slice(0, 6);

    // Tone fallback
    if (!out.tone || !String(out.tone).trim()) {
      out.tone = inferToneLocal(standup.yesterday || "", standup.today || "", standup.blockers || "");
    }
    // If there is a clear blocker, avoid overly optimistic tone
    const blockerText = (standup.blockers || "").toLowerCase();
    if (/\b(blocked|waiting|stuck|no credentials|credential|whitelist|429|rate limit)\b/.test(blockerText)) {
      if (out.tone === "positive") out.tone = "neutral";
      if (/\b(blocked|waiting|stuck|no credentials|credential|whitelist)\b/.test(blockerText)) {
        out.tone = "frustrated";
      }
    }

    // Clarity feedback: reject blocker-like content or placeholders
    if (
      !out.clarityFeedback ||
      /^if vague/i.test(String(out.clarityFeedback)) ||
      isBlockerLike(String(out.clarityFeedback)) ||
      (blk && String(out.clarityFeedback).toLowerCase().includes(blk))
    ) {
      out.clarityFeedback = synthesizeClarity(standup.yesterday || "", standup.today || "");
    }

    // Suggestions cleanup & augmentation
    const keyTaskCanon = new Set<string>((out.keyTasks as string[]).map((x: string) => normalizeKey(x)));
    let suggs: string[] = Array.isArray(out.suggestions)
      ? (out.suggestions as string[]).map((v: string) => normalizeSuggestion(v))
      : [];

    // Remove duplicates of keyTasks and raw blocker statements
    suggs = suggs.filter((x: string) => x && !keyTaskCanon.has(normalizeKey(x)));
    suggs = suggs.filter((x: string) => {
      const xl = x.toLowerCase();
      if (xl.startsWith("unblock:")) return true; // keep explicit unblocks
      if (/^\s*waiting\b/.test(xl)) return false; // drop "waiting..." lines
      if (blk && xl.includes(blk)) return false; // drop verbatim blocker text
      return true;
    });

    // Drop suggestions that substantially overlap with existing key tasks (paraphrase filter)
    function overlaps(a: string, b: string) {
      const stop = new Set([
        "the",
        "a",
        "an",
        "to",
        "for",
        "and",
        "with",
        "add",
        "create",
        "implement",
        "make",
        "do",
        "endpoint",
        "flow",
        "task",
        "today",
        "yesterday",
      ]);
      const A = canonicalText(a)
        .split(" ")
        .filter((w: string) => w.length > 2 && !stop.has(w));
      const B = canonicalText(b)
        .split(" ")
        .filter((w: string) => w.length > 2 && !stop.has(w));
      const inter = A.filter((w: string) => B.includes(w)).length;
      return inter >= 2;
    }
    suggs = suggs.filter((sug: string) => ![...keyTaskCanon].some((k: string) => overlaps(sug, k)));

    // Ensure a single explicit Unblock if there's a blocker
    if (blk && !suggs.some((x: string) => x.toLowerCase().startsWith("unblock:"))) {
      suggs.unshift(`Unblock: ${normBlocker(blk) || "current blocker"}`);
    }

    // Top up actionable steps to ensure 2–5 suggestions
    const tops: string[] = [];
    const tLower = (standup.today || "").toLowerCase();
    if (tLower.includes("rotate") && tLower.includes("code")) {
      tops.push("Write unit test for rotate-code endpoint");
      tops.push("Document API contract for rotate-code (path, payload, status codes)");
    }
    if (tLower.includes("selector")) {
      tops.push("Bind selectors to component state/props and verify UI flow");
      tops.push("Add a small e2e check for team selector wiring");
    }
    for (const cand of [...tTasks, ...tops]) {
      if (suggs.length >= 5) break;
      const norm = normalizeKey(cand);
      if (!norm) continue;
      if (!suggs.some((x: string) => normalizeKey(x) === norm) && !keyTaskCanon.has(norm)) {
        suggs.push(normalizeSuggestion(cand));
      }
    }
    // Ensure minimum 2 suggestions
    if (suggs.length < 2) {
      suggs.push("Add a brief note with file names or PR IDs for today’s task");
    }

    out.suggestions = Array.from(new Set(suggs.map((x: string) => normalizeSuggestion(x)))).slice(0, 5);

    return res.json(out);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || "AI failed" });
  }
}









