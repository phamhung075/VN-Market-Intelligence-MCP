# News Scout — Cycle Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/news-scout.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
`urgent_news` + `chain_catalyst` signals on bus | WORK status | ledger entries (05:00 UTC)

---

## Dispatch

| Stage | Steps | Sub-flow |
|---|---|---|
| Bootstrap + Regime + Feedback | 0, 0b, 0c | `→ Run sub-flow: ./stage-bootstrap.md` |
| Fetch + Historical | 1, 1b | `→ Run sub-flow: ./stage-fetch.md` |
| Sentiment + Impact | 2 | `→ Run sub-flow: ./stage-sentiment.md` |
| Signals | 3 | `→ Run sub-flow: ./stage-signals.md` |
| Session log + WORK + Batch 2 | 4, 5 | `→ Run sub-flow: ./stage-log-notify.md` |
