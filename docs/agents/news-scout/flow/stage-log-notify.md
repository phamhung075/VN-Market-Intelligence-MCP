> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 4–5: Session Log, WORK Notify, Batch 2

**Step 3e — Exec-proof gate** → skill: `.claude/skills/exec-proof-gate/SKILL.md`

```
Inputs:
  CYCLE_START_UTC    = <captured at bootstrap Step 0 via cycle-bootstrap skill>
  NOTEBOOK_PATH      = docs/agent-memory/notebooks/news-scout.md
  FETCH_RESULT_COUNT = fetched_articles.length (from stage-fetch.md Step 1 result)
  FETCH_MACRO_TS     = macro_snapshot.fetchedAt (from stage-bootstrap.md Step 0b)
  AGENT_ID           = "news-scout"
```

On PASS → continue to log_agent_work(completed) below.
On FAIL → skill exits; do not continue to Step 4.

---

**4. Session log**

> Invariant: timestamp = current UTC, never future, never speculative. NEVER write entries for cycles that have not fired yet. If unsure of current time: call `get_cycle_bootstrap` to refresh time anchor before writing log.

```
# Step 1 — open work log (returns id)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "news-scout",
  "status": "running",
  "action": "news-scout-cycle",
  "context": { "items": N, "impacts": M, "signals_fired": X, "regime": "<REGIME>" }
})
# → { "id": <log_id> }

# Step 2 — close work log (required: agent_name, id, status)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "news-scout",
  "id": "<log_id from step 1>",
  "status": "completed",
  "action": "news-scout-cycle",
  "context": { "items": N, "impacts": M, "signals_fired": X, "regime": "<REGIME>" },
  "signal_ids": ["<signal_id_1>"]
})
```

**Settled-write invariant (AC-3): compose ≤200L body entirely in memory, then land in ONE Write/Edit. Never append-then-trim.**

Step 1 — Read full `docs/agent-memory/notebooks/news-scout.md` into memory.
Step 2 — Identify preamble (before first `^## `) and all `^## ` section boundaries.
Step 3 — If ≥ 3 sections: drop oldest `## ` block (heading + body to next `## `) from in-memory body.
Step 4 — Build new section (≤60L) in memory:
```
## c<NNN> · <ISO-timestamp>
- Items: N | Impacts: M | Signals: [types] | Regime: REGIME | Carry: CARRY_REGIME
- Feedback: X accepted / Y rejected | Filter hints: [FILTER_HINT_urgent_news=<STRICT|LOOSE|default>, ...]
```
Append new section to end of in-memory body.
Step 5 — Count in-memory lines. If > 200L: drop next-oldest `## ` block, recount; repeat until ≤200L. If new section > 60L: trim to 60L first.
Step 6 — Single settled write:
```
Write(path="docs/agent-memory/notebooks/news-scout.md", content=<final settled body>)
```
Step 7 — AC-5 sanity check (verification only, NOT a remediation loop):
```bash
NB_LINES=$(wc -l < docs/agent-memory/notebooks/news-scout.md | tr -d ' ')
[ "$NB_LINES" -gt 200 ] && echo "[news-scout] BUG: compose logic failed — fix Step 1-5 and re-write once"
```

> Notebook is written (appended) to disk every cycle. Git commit is deferred to market-watcher eod.md batch commit at market close (L-7, 1968b2). Off-hours cycles retain their own per-cycle commit.
> Recovery if EOD missed: `docs/protocols/head-lock-self-cure.md`.

**4b. Coverage-state update** (atomic write, after notebook append):
```
for each ticker analyzed this cycle (both event-driven AND sweep-forced):
  set COVERAGE_STATE.tickers[ticker].last_covered_news_scout = <current UTC ISO-8601>
set COVERAGE_STATE._updated_by = "news-scout"
set COVERAGE_STATE._updated_at = <current UTC ISO-8601>

Atomic write:
  write updated JSON to docs/data/coverage-state.json.tmp
  mv docs/data/coverage-state.json.tmp docs/data/coverage-state.json
```

**5. WORK channel** (ULTRA tier — inter-agent status ping per `.claude/skills/caveman/SKILL.md`)

```
call_tool(server="vn-market", tool="send_telegram", arguments={
  "message": "[ns] HH:MM — N items | fired:X sup:Y | next:TIME",
  "channel": "work"
})
```

> Tier: ULTRA. Cycle-status pings are inter-agent state changes — not user-facing. Drop articles, labels, full sentences. Arrows for causality. ≤80 chars target.

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
(skip notebook-write step — already written above; keep session-log + doc-self-heal + self-critique)

---

## Batch 2 Sentiment Log (05:00 UTC daily)

Per ticker from `get_watchlist()` → if `docs/analysis-briefs/{TICKER}.md` does not exist → create from `docs/references/analysis-ledger-template.md`

Then append to `docs/analysis-briefs/{TICKER}.md` [News Scout]:
```
YYYY-MM-DD | {sentiment description} | YoY: {comparison or "no prior data"}
```
Only when `|sentiment_score| ≥ 0.1` OR neutral (document absence) | one line | skip weekends/holidays
