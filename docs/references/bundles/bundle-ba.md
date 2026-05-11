# Bundle: BA

One call, always-needed rules. BA's methodology + REQ template are in ba.md itself — not duplicated here.

---

## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `docs/{policies,protocols,standards,references}/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[ba] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="ba")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Lazy-Load (read ONLY when feature touches that area)

- MCP tool surface → `docs/standards/mcp-tools.md`
- Agent roster → `docs/references/agent-roster.md`
- Cron schedule → `docs/standards/cron-jobs.md`
- Portfolio rules → `docs/standards/portfolio-schema.md`
- Alert rules → `docs/policies/alert-policy.md`
- Hexagram integration → `docs/references/kinh-dich-layer.md`
- /ask queue → `docs/protocols/ask-queue-protocol.md`
- Market analysis framework → `docs/standards/market-analysis.md`
- Vietnamese terms → `docs/GLOSSARY_VI.md`
