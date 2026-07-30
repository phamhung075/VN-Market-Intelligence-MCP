> Parent: [./cycle.md](./cycle.md)

# News Scout — Stage 4–5: Session Log, WORK Notify, Batch 2

**4. Notebook write** — APPEND class → skill: `.claude/skills/notebook-write/SKILL.md` (AC-3 settled-write; AC-5 gate; AC-4 blank-state fallback)

Section template (≤10L):
```
## c<NNN> · <ISO-timestamp>
- Items: N | Impacts: M | Signals: [types] | Regime: REGIME | Carry: CARRY_REGIME
- Feedback: X accepted / Y rejected | Filter hints: [FILTER_HINT_urgent_news=<STRICT|LOOSE|default>, ...]
```

> Notebook is written (appended) to disk every cycle. Git commit is deferred to market-watcher eod.md batch commit at market close (L-7, 1968b2). Off-hours cycles retain their own per-cycle commit.
> Recovery if EOD missed: `docs/protocols/head-lock-self-cure.md`.

---

**5. Exec-proof gate** → skill: `.claude/skills/exec-proof-gate/SKILL.md`

```
Inputs:
  CYCLE_START_UTC    = <captured at bootstrap Step 0 via cycle-bootstrap skill>
  NOTEBOOK_PATH      = docs/agent-memory/notebooks/news-scout.md
  FETCH_RESULT_COUNT = fetched_articles.length (from stage-fetch.md Step 1 result)
  FETCH_MACRO_TS     = macro_snapshot.fetchedAt (from stage-bootstrap.md Step 0b)
  AGENT_ID           = "news-scout"
```

On PASS → continue to Step 6 (session log — log_agent_work) below.
On FAIL → skill exits; do not continue to Step 6.

---

**6. Session log**

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

**7. Coverage-state update** (deterministic scripted write, after notebook append):
```
TICKERS_COVERED = tickers analyzed this cycle (both event-driven AND sweep-forced) — the
  SAME set, nothing added or dropped.

scripts/agents-flow/coverage-stamp.sh --agent news-scout --tickers <TICKERS_COVERED, comma-joined>
  → surgical jq patch: sets ONLY .tickers[T].last_covered_news_scout = now for T in
    TICKERS_COVERED; every other key/ticker/field — including market-watcher's own field on
    the SAME ticker — is preserved byte-for-byte. Internally wrapped in a
    task_claim(task_id="coverage-state:main", task_kind="sprint-task", owner_agent="news-scout",
    owner_client_session=$CLAUDE_CODE_SESSION_ID, ttl_seconds=30) mutex (see
    scripts/agents-flow/coverage-stamp.sh `_acquire_mutex` — owner_client_session is REQUIRED,
    coordinationTools.ts:104-110; the script reads it from the `CLAUDE_CODE_SESSION_ID` env var or
    `--session`, never a literal `$CLAUDE_CODE_SESSION_ID` string), serializing against
    market-watcher's own write (co-ships FIX-COVERAGE-STATE-CROSS-AGENT-LOST-UPDATE). Also repairs
    the top-level sweep_config key if it is missing.
  FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER: this REPLACES "for each ticker analyzed, set
  X=now" prose executed by hand — that prose, re-run against a 57-entry blob every cycle,
  blanket-stamped ALL tickers (measured live), making the 48h staleness trigger permanently
  unsatisfiable. Do NOT regenerate/overwrite the whole file as a substitute for this step.

  ⚠ TRANSPORT GAP (open 2026-07-25): this agent holds no Bash (.claude/agents/news-scout.md:5)
  and cannot invoke the script directly today — closing this needs either a Bash grant
  (governance decision) or an MCP-tool wrapper (dev-mcp-server zone); neither is decided yet.
  Until resolved: if this step cannot execute, SKIP the coverage-state write entirely this
  cycle and log `[coverage-write-skipped: no-transport]` on the WORK ping — do NOT fall back
  to a full-file rewrite, that reintroduces the exact bug this task fixed.
```

**8. WORK channel** (ULTRA tier — inter-agent status ping per `.claude/skills/caveman/SKILL.md`)

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
