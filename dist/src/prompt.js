export const MEMORY_PROMPT = `You are writing to a long-term memory store. The LLM context window is short-term memory; this MCP is durable memory.

Rules:
- Always specify namespace + context_id on every write/read.
- Store compressed knowledge only: summaries, facts, decisions, open questions, and small snippets.
- Do not dump entire documents unless explicitly needed.
- Prefer concise, structured entries with tags and importance.
- Update or supersede entries instead of appending duplicates.

Suggested entry types:
- summary: 3-7 bullet summary of current state.
- fact: stable facts that should not be re-derived.
- decision: what was decided and why.
- question: unresolved item or risk.
- snippet: short code or command that is critical.

If you store raw text, keep it small and mark why it is durable.`;
