<!-- size-justification: 145L — FIX-NEWSSCOUT-COMMIT-POLICY-NEVER-MECHANICALLY-WIRED 2026-08-15: ported market-watcher's working off-hours-self-commit block (task_claim mutex + git_commit_retry + RULE 2.5 pathspec + task_release + BUG fallback) verbatim, +26L; the block is non-factorizable without breaking the same mutex-guard/retry/pathspec contract market-watcher's identical fix already establishes as the correct pattern. Exceeds the 120L flow-file cap (pre-existing debt: file was already 113L before this fix). +5L (FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-SKIPS-COMMIT-LOSES-NOTEBOOK, 2026-08-15 rework): the ported block's mutex key deliberately differs from eod.md's own ("news-scout-notebook:main" vs "market-watcher-notebook:main" — by design, so the two agents never deadlock on each other's OWN file) but eod.md's Step D also commits news-scout.md in its own batch under ITS key, on the identical shared 16:00 UTC Mon-Fri tick — a same-tick clean-diff guard was added so the benign case (eod.md's batch lands first, this step's own git add finds nothing pending) is skipped instead of misrouted into the BUG-channel escalation, which would otherwise fire a false-positive alert every co-firing weekday. -->
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

**Off-hours self-commit** (`slot=news-scout-offhours` only — any other/no `slot=` value, e.g. `slot=news-scout-market` or `slot=news-scout-sentiment` or a manual/ad-hoc invocation, stays deferred to market-watcher's eod.md batch commit above) — FIX-NEWSSCOUT-COMMIT-POLICY-NEVER-MECHANICALLY-WIRED, 2026-08-15: the sentence above stated this policy since 1968b2 but no step anywhere in news-scout's flow tree ever executed a git/commit-mutex call (confirmed via RAW tool-call-log verification, tick 2026-08-15T00:00Z, `slot=news-scout-offhours` — zero git/commit-mutex invocations, notebook left genuinely modified-but-uncommitted every off-hours cycle). Ported verbatim from market-watcher's identical, working off-hours-self-commit fix (FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-SKIPS-COMMIT-LOSES-NOTEBOOK, 2026-08-06 — `docs/agents/market-watcher/flow/cycle.md`), with a DIFFERENT mutex key so the two agents never collide when both fire in the same cowork batch:

`slot=` is passed in the original invocation prompt (cowork dispatcher convention — `docs/agents/cowork-team/flow/spawn-fanout.md` Step 5: `"run <flow_path>  slot=<slot_id>"`, same mechanism market-watcher's `main.md` documents). News-scout's own `main.md`/`cycle.md` do not route sub-flows by slot (cycle.md is the single universal sub-flow for every news-scout slot) — check the literal `slot=` value from your invocation prompt directly at this step.

```
LOCK = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id: "news-scout-notebook:main", task_kind: "sprint-task",
  owner_agent: "news-scout",
  owner_client_session: "<resolved CLAUDE_CODE_SESSION_ID — REQUIRED, coordinationTools.ts:104-110;
    substitute the real value from the spawn-prompt coordination line, NEVER write the literal
    text "$CLAUDE_CODE_SESSION_ID" — a call_tool argument does not expand shell variables, it
    sends the token literally>,
  ttl_seconds: 60
})
```
If `claimed:false`: retry up to 2 more times (5s apart, same bounded-retry style as `git_commit_retry`); if still held after 3 attempts, proceed unguarded and log `[news-scout] notebook-lock contended 3x — proceeding unguarded`.

> **Same-tick clean-diff guard** (FIX-MARKETWATCHER-EODMD-STALE-NOBASH-CAVEAT-SKIPS-COMMIT-LOSES-NOTEBOOK, 2026-08-15): `news-scout-offhours` (`0 */4 * * *`) and `market-watcher-eod` (`0 16 * * 1-5`) share the identical 16:00 UTC Mon-Fri tick (same co-fire class `eod.md`'s own "Same-agent multi-slot mutex" note documents) — `eod.md` Step D ALSO commits `news-scout.md` in its own batch, under a DIFFERENT mutex key (`market-watcher-notebook:main`, by design, so the two agents never deadlock on each other's own file). If `eod.md`'s batch commit lands first on a shared tick, this step's own `git add` finds nothing pending — a benign no-op, NOT a failure. Check for a real diff before attempting the commit so that benign case never reaches the BUG-channel branch below:
```bash
if git diff --quiet HEAD -- docs/agent-memory/notebooks/news-scout.md 2>/dev/null; then
  log "[news-scout] offhours notebook already committed this tick (eod.md batch landed first) — skip, no BUG"
else
  git add docs/agent-memory/notebooks/news-scout.md
  git_commit_retry -m "chore(memory/news-scout): offhours cycle YYYY-MM-DD HH:MM UTC" \
    -- docs/agent-memory/notebooks/news-scout.md
fi
```
> **RULE 2.5 pathspec-scoped commit**: `git_commit_retry` passes `"$@"` straight to `git commit` (`docs/protocols/head-lock-self-cure.md` § F4) — a bare `git commit -m "..."` with no trailing pathspec commits whatever is currently staged in the shared index, not only the file this step's own `git add` named. The trailing `-- <path>` above closes that gap per `.claude/skills/commit-boundary/SKILL.md` RULE 2.5.

`task_release(task_id="news-scout-notebook:main", owner_client_session="<same resolved value as the task_claim above>")` in a finally, regardless of outcome (including the clean-diff skip branch above).
> If the `else` branch's commit fails after retries (a genuine failure — index/HEAD lock exhausted, or any other non-lock `git commit` error): log to BUG channel + `send_telegram(channel="bug", message="[news-scout] offhours notebook commit failed — manual recovery needed: docs/protocols/head-lock-self-cure.md")`. The clean-diff skip branch above is NEVER a BUG-channel condition.

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

  Invoke directly via Bash (this agent holds Bash — .claude/agents/news-scout.md:5 —
  granted 2026-07-30T23:18Z, commit 610110e16). If the Bash invocation itself errors (script
  missing, non-zero exit, mutex timeout — a genuine transport failure, not a tool-grant gap):
  SKIP the coverage-state write entirely this cycle and log `[coverage-write-skipped:
  <reason>]` on the WORK ping — do NOT fall back to a full-file rewrite, that reintroduces
  the exact bug this task fixed.
```

**8. WORK channel** (ULTRA tier — inter-agent status ping per `.claude/skills/caveman/SKILL.md`)

```
call_tool(server="vn-market", tool="send_telegram", arguments={
  "message": "[ns] HH:MM — N items | fired:X sup:Y | next:TIME",
  "channel": "work"
})
```

> Tier: ULTRA. Cycle-status pings are inter-agent state changes — not user-facing. Drop articles, labels, full sentences. Arrows for causality. ≤80 chars target.

**End of cycle** → skill: `.claude/skills/end-0-cowork/SKILL.md`

---

## Batch 2 Sentiment Log (05:00 UTC daily)

Per ticker from `get_watchlist()` → if `docs/analysis-briefs/{TICKER}.md` does not exist → create from `docs/references/analysis-ledger-template.md`

Then append to `docs/analysis-briefs/{TICKER}.md` [News Scout]:
```
YYYY-MM-DD | {sentiment description} | YoY: {comparison or "no prior data"}
```
Only when `|sentiment_score| ≥ 0.1` OR neutral (document absence) | one line | skip weekends/holidays
