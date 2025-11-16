export function mockPersonal(input: { yesterday: string; today: string; blockers?: string }) {
  return {
    keyTasks: [...(input.yesterday.split('\n')), ...(input.today.split('\n'))]
      .map(s => s.replace(/^[\-\*\d\.\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 6),
    clarityFeedback: input.today.length < 20 ? 'Add a bit more detail on today’s plan.' : 'Clear update.',
    tone: (input.blockers && input.blockers.trim()) ? 'frustrated' : 'positive',
    suggestions: ['Prioritize top 1–2 tasks', 'Create small PRs', 'Post a quick status at EOD'],
  };
}

export function mockTeam(items: Array<{ user: string; yesterday: string; today: string; blockers?: string }>) {
  const blockers = items.flatMap(x => (x.blockers ? [x.blockers] : []));
  return {
    teamSummary: `Team posted ${items.length} standups. Overall steady progress.`,
    commonBlockers: blockers.slice(0, 3),
    suggestedSyncs: items.slice(0, 2).map((x, i, arr) => ({
      members: [x.user, arr[(i + 1) % arr.length]?.user].filter(Boolean),
      reason: 'Similar tasks—share context.',
    })),
    risks: blockers.length > 2 ? ['Multiple members blocked today'] : [],
  };
}
