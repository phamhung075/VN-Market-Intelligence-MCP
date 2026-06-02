<!-- size-justification: 148L — coverage-sweep design; ticker-rotation mechanics + flow edit specs are operationally coupled; cannot split without losing the cross-reference between state schema, priority algorithm, and per-agent wiring instructions -->

# Coverage Sweep — Watchlist Rotation for news-scout + market-watcher

**Status:** DESIGN COMPLETE — agent-father implementation pending
**Task:** 1965-COVERAGE-SWEEP
**Authored:** 2026-06-02 (extends 2026-05-21 stub — stub had no content, brief is new)
**Author:** agents-architect

---

## 1. Problem Statement

news-scout and market-watcher concentrate on tickers that generate high-impact events,
leaving tail watchlist tickers (currently 33 active) without coverage for extended periods.
The cycle flows have no rotation state: every tick each agent independently re-scores
all tickers and focuses on the highest-signal ones — the same few names dominate.

There is no floor guarantee that every watchlist ticker receives at least periodic attention.

---

## 2. Affected Agents / Files

| Agent | File | Current behaviour |
|---|---|---|
| news-scout | `docs/agents/news-scout/flow/stage-sentiment.md` | calls `run_impact_chain` for all watchlist hits; picks highest-impact naturally |
| news-scout | `docs/agents/news-scout/flow/stage-log-notify.md` | Batch 2 (05:00 UTC) writes sentiment to `docs/analysis-briefs/{TICKER}.md` — but only when `|sentiment_score| ≥ 0.1` |
| market-watcher | `docs/agents/market-watcher/flow/cycle.md` Step 1 | scans watchlist prices for sigma anomalies; no coverage floor |
| (new) | `docs/data/coverage-state.json` | does not exist — needs to be created as SSOT for sweep state |

---

## 3. Design

### 3a. Coverage State File

Create `docs/data/coverage-state.json` as the SSOT for per-ticker last-covered timestamps.

Schema:
```json
{
  "_schema": "v1",
  "_ssot": true,
  "_updated_by": "<agent-id>",
  "_updated_at": "<ISO-8601 UTC>",
  "tickers": {
    "<TICKER>": {
      "last_covered_news_scout": "<ISO-8601 UTC or null>",
      "last_covered_market_watcher": "<ISO-8601 UTC or null>"
    }
  },
  "sweep_config": {
    "max_staleness_hours": 48,
    "sweep_batch_size": 3
  }
}
```

Seed: all 33 active watchlist tickers with `null` timestamps (triggers immediate sweep on first cycle).
Active ticker list is read from `docs/data/system-map.json` `.watchlist[]` where `active == true` — NEVER hardcoded.

Writes use atomic temp-rename (same protocol as orch-state.json: write to temp path, then `mv`).

### 3b. Priority Algorithm (Least-Recently-Covered, Event-Driven on Top)

At each agent cycle, compute a **sweep priority list** using this two-tier sort (no tool call — pure in-agent logic):

```
TIER-1 (Sweep floor — mandatory): tickers where:
  (now - last_covered_<agent>) > sweep_config.max_staleness_hours * 3600
  OR last_covered_<agent> == null
  → sorted ascending by last_covered timestamp (oldest first, null = oldest)
  → take up to sweep_config.sweep_batch_size tickers

TIER-2 (Event-driven — normal flow): tickers with current high-signal events
  (sigma anomaly for market-watcher; impact_score ≥ 6 for news-scout)
  → sorted descending by signal strength
  → unlimited (normal behaviour)

COMBINED: TIER-1 tickers are APPENDED to TIER-2 candidates (no dedup needed — if
a TIER-1 ticker also has a high-signal event it surfaces naturally in TIER-2 already).
```

This guarantees:
- Every ticker gets coverage within `max_staleness_hours` (48h default = 2× trading-day cadence).
- High-signal events are never suppressed — event-driven focus sits above the sweep floor.
- Sweep batch size (3) keeps per-cycle token cost bounded.

### 3c. Flow Wiring — news-scout

**File to edit:** `docs/agents/news-scout/flow/stage-sentiment.md`

Insert a new **Step 0-sweep** block BEFORE the existing `run_impact_chain` call:

```
## Step 0-sweep — load coverage state + build sweep list

COVERAGE_STATE = read docs/data/coverage-state.json (atomic read, fail-silent: if missing → treat all tickers as last_covered=null)

WATCHLIST = call_tool(server="vn-market", tool="get_watchlist", arguments={})
  (this call is already made for cross-referencing — deduplicate, do not call twice)

STALE_TICKERS = [t for t in WATCHLIST.active where
  COVERAGE_STATE.tickers[t].last_covered_news_scout == null OR
  (now - COVERAGE_STATE.tickers[t].last_covered_news_scout) > 48h
] sorted by last_covered_news_scout ascending, take ≤3

For each ticker in STALE_TICKERS that is NOT already in the article-impacted set:
  → explicitly include it in sentiment/impact analysis this cycle even if impact_score < threshold
  → set coverage_sweep_forced=true on the ticker for Step 4 log
```

**File to edit:** `docs/agents/news-scout/flow/stage-log-notify.md` — append to existing Step 4 notebook section:

```
After notebook append, update docs/data/coverage-state.json:
  for each ticker analyzed this cycle (both event-driven and sweep-forced):
    set tickers[ticker].last_covered_news_scout = <current UTC ISO-8601>
  Atomic write: write to docs/data/coverage-state.json.tmp, then mv to docs/data/coverage-state.json
  update _updated_by="news-scout", _updated_at=<UTC>
```

### 3d. Flow Wiring — market-watcher

**File to edit:** `docs/agents/market-watcher/flow/cycle.md` Step 1

Insert a new **Step 0-sweep** block BEFORE Step 1 (Price analysis):

```
## Step 0-sweep — load coverage state + build sweep list

COVERAGE_STATE = read docs/data/coverage-state.json (fail-silent: missing → treat all as null)

STALE_TICKERS = [t for t in WATCHLIST where
  COVERAGE_STATE.tickers[t].last_covered_market_watcher == null OR
  (now - COVERAGE_STATE.tickers[t].last_covered_market_watcher) > 48h
] sorted by last_covered_market_watcher ascending, take ≤3

For each ticker in STALE_TICKERS:
  → include in Step 1 price analysis even if move < sigma_threshold
  → set coverage_sweep_forced=true; log as: "[SWEEP] <TICKER> forced (last_covered: <ts or never>)"
  → do NOT emit a price_anomaly signal for sweep-only tickers (no anomaly = no signal)
    (sweep-forced entries reach the notebook/log, NOT the signal bus)
```

**File to edit:** `docs/agents/market-watcher/flow/cycle.md` Step 5 (notebook) — add sweep log line:

```
## Metrics (cycle YYYY-MM-DD HH:MM UTC)
+ | sweep_tickers_forced | N |   ← new row
+ | coverage_state_updated | yes|no |
```

After Step 5, update `docs/data/coverage-state.json`:
```
for each ticker priced this cycle (both anomaly-driven and sweep-forced):
  set tickers[ticker].last_covered_market_watcher = <current UTC ISO-8601>
atomic write (tmp → mv)
```

---

## 4. Invariants

| Invariant | Description |
|---|---|
| SSOT-driven | Watchlist read from system-map.json; sweep state in coverage-state.json; no hardcoded tickers |
| Lazy-load-friendly | coverage-state.json is ≤5KB; read once per cycle per agent (not at startup) |
| Event-driven floor only | Sweep tickers are APPENDED, never replacing event-driven focus |
| Signal-bus clean | Sweep-forced tickers do NOT generate price_anomaly signals unless a real anomaly is found |
| Atomic writes | temp-rename protocol; concurrent writes safe under WIP≤2 |
| No new MCP tools needed | Pure file read/write + existing watchlist call |

---

## 5. Agent-Father Implementation Spec

### Files to create

1. `docs/data/coverage-state.json` — seed with schema v1, all 33 active tickers, `null` timestamps, `sweep_config.max_staleness_hours=48`, `sweep_config.sweep_batch_size=3`. Populate tickers from `docs/data/system-map.json` watchlist where `active==true`.

### Files to edit

2. `docs/agents/news-scout/flow/stage-sentiment.md` — insert Step 0-sweep block per §3c above (before run_impact_chain). Add coverage_sweep_forced flag to ticker context.

3. `docs/agents/news-scout/flow/stage-log-notify.md` — append coverage-state atomic update after existing notebook write (§3c).

4. `docs/agents/market-watcher/flow/cycle.md` — insert Step 0-sweep block before Step 1 (§3d); add sweep_tickers_forced row to Step 5 notebook template; add coverage-state atomic update after Step 5.

### Size caps

- `coverage-state.json`: no line cap (data file), but should stay ≤200 lines for 33 tickers
- Flow edits: each agent file stays within its declared cap (news-scout stage files ≤160L, market-watcher cycle.md ≤160L); split if needed per split-policy

### Sequencing

No dependencies. All 4 items can land in a single agent-father commit.
`coverage-state.json` must be created BEFORE flow edits are applied (flows read it).

---

## 6. Verification

After implementation, agent-father should verify:
- `docs/data/coverage-state.json` exists and parses as valid JSON with 33 active-ticker entries
- All entries have `last_covered_news_scout: null` and `last_covered_market_watcher: null` on seed
- Stage-sentiment.md and cycle.md contain the `Step 0-sweep` marker
- No new always_load entries added (lazy-load-friendly constraint)
