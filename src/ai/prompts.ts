export const personalPrompt = (input: {
  userName?: string;
  yesterday: string;
  today: string;
  blockers?: string;
}) => `
You are an assistant for daily engineering standups.

Given a single user's standup, extract:
1) keyTasks: array of 3-8 bullet items (concise, action-oriented) found in "yesterday" and "today"
2) clarityFeedback: if the update is vague, tell the user how to improve (max 3 lines)
3) tone: one of ["frustrated","overwhelmed","neutral","positive"]
4) suggestions: up to 3 practical, low-effort next steps for the user

Return strict JSON with keys: { "keyTasks": string[], "clarityFeedback": string, "tone": string, "suggestions": string[] }.

User: ${input.userName || 'Unknown'}
Yesterday: ${input.yesterday}
Today: ${input.today}
Blockers: ${input.blockers || 'None'}
`;

export const teamPrompt = (input: {
  date: string;
  items: Array<{
    user: string;
    yesterday: string;
    today: string;
    blockers?: string;
  }>;
}) => `
You are summarizing a team's daily standups for ${input.date}.

Tasks:
- teamSummary: one compact paragraph capturing overall progress
- commonBlockers: top 3 recurring blockers (short phrases)
- suggestedSyncs: pairs or small groups of members who should sync, with a one-line reason (max 5 suggestions)
- risks: 0-3 notable risks (e.g., "3 people blocked on same API")

Return strict JSON with keys:
{ "teamSummary": string, "commonBlockers": string[], "suggestedSyncs": { "members": string[], "reason": string }[], "risks": string[] }.

Standups:
${input.items.map(s => `- ${s.user}: Yesterday: ${s.yesterday} | Today: ${s.today} | Blockers: ${s.blockers || 'None'}`).join('\n')}
`;
