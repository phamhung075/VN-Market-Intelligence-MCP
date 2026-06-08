# News Scout — Cycle Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/news-scout.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
`urgent_news` + `chain_catalyst` signals on bus | WORK status | ledger entries (05:00 UTC)

---

**Step 0-GW — Gateway availability gate** → skill: `.claude/skills/gateway-availability-gate/SKILL.md`
Replace `<agent-id>` with `news-scout`. Run BEFORE bootstrap. On gateway dead: write signal file + BLOCKED notebook entry + EXIT. See skill for full protocol and explicit prohibitions.

---

## Dispatch

| Stage | Steps | Sub-flow |
|---|---|---|
| Bootstrap + Regime + Feedback | 0, 0b, 0c | `→ Run sub-flow: ./stage-bootstrap.md` |
| Fetch + Historical | 1, 1b | `→ Run sub-flow: ./stage-fetch.md` |
| Sentiment + Impact | 2 | `→ Run sub-flow: ./stage-sentiment.md` |
| Signals | 3 | `→ Run sub-flow: ./stage-signals.md` |
| Session log + WORK + Batch 2 | 4, 5 | `→ Run sub-flow: ./stage-log-notify.md` |

---

## Insider Disclosure Trigger

On detection of insider disclosure filings in stage-signals.md:

→ skill: `.claude/skills/ownership-governance-screen/SKILL.md` (Step 2: insider transaction check)

When a ticker matches an insider disclosure filing pattern, invoke the insider transaction check (SKILL-4 Step 2). If the result contains `flag=INSIDER-EXIT` (net insider sell > 5% of holdings in 3-month window), emit a WORK channel alert:
```
[News-Scout] INSIDER-EXIT flag: {ticker} — {insider_name} sold {amount} shares ({pct}%) in {timeframe}. Alert level: MEDIUM.
```
Rationale: Abnormal insider selling within 3–6 months signals potential negative information; elevated vigilance warranted.
