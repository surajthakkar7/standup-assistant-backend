// src/ai/safe.ts

export type AISafeJSON =
  | { ok: true; data: any }
  | { ok: false; code: string; message: string; http?: number };

const GEMINI_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

/** Minimal POST JSON helper with safe JSON parse */
async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // leave json as null; caller can inspect raw text if needed
  }
  return { res, json, text };
}

/** Extract a JSON object from model text (handles extra prose or markdown fences) */
function extractJSON(str: string) {
  // try direct parse first
  try {
    return JSON.parse(str);
  } catch {}

  // strip markdown fences if present
  const fenced = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : str;

  // find first '{' to last '}' heuristic
  const i = candidate.indexOf("{");
  const j = candidate.lastIndexOf("}");
  if (i >= 0 && j > i) {
    const slice = candidate.slice(i, j + 1);
    try {
      return JSON.parse(slice);
    } catch {}
  }

  throw new Error("Could not parse JSON from model output");
}

/**
 * Call Gemini (AI Studio) and return structured JSON.
 * Expect your prompt to instruct: "Return ONLY valid JSON with shape {...}"
 */
export async function aiJSON(prompt: string): Promise<AISafeJSON> {
  try {
    if (!GEMINI_KEY) {
      return {
        ok: false,
        code: "AI_KEY_MISSING",
        message: "GEMINI_API_KEY is not set",
        http: 500,
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

    const body = {
      contents: [
        {
          // role is optional for AI Studio; included for clarity
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    };

    const { res, json } = await postJson(url, body);

    if (!res.ok) {
      // Normalize common Google API error shape
      const gErr = json?.error;
      const message =
        gErr?.message ||
        json?.message ||
        `Gemini HTTP ${res.status}`;
      const code =
        gErr?.status ||
        gErr?.code ||
        "GEMINI_ERROR";

      return { ok: false, code: String(code), message, http: res.status };
    }

    const textOut =
      json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!textOut) {
      return {
        ok: false,
        code: "NO_CANDIDATE",
        message: "No text in Gemini candidates",
        http: 502,
      };
    }

    let data: any;
    try {
      data = extractJSON(textOut);
    } catch {
      // If the model didn’t return JSON despite the instruction, return raw text
      data = { text: textOut };
    }

    return { ok: true, data };
  } catch (err: any) {
    return {
      ok: false,
      code: "AI_CLIENT",
      message: err?.message || "Gemini request failed",
      http: 429,
    };
  }
}
