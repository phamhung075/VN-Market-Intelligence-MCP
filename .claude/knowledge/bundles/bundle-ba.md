# Bundle: BA

One call, always-needed rules. BA's methodology + REQ template are in ba.md itself — not duplicated here.

---

## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[ba] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="ba")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Lazy-Load (read ONLY when feature touches that area)

- MCP tool surface → `.claude/knowledge/mcp-tools.md`
- Agent roster → `.claude/knowledge/agent-roster.md`
- Cron schedule → `.claude/knowledge/cron-jobs.md`
- Portfolio rules → `.claude/knowledge/portfolio-schema.md`
- Alert rules → `.claude/knowledge/alert-policy.md`
- Hexagram integration → `.claude/knowledge/kinh-dich-layer.md`
- /ask queue → `.claude/knowledge/ask-queue-protocol.md`
- Market analysis framework → `.claude/knowledge/market-analysis.md`
- Vietnamese terms → `docs/GLOSSARY_VI.md`
