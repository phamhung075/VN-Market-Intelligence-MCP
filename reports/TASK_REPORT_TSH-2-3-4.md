# Task Report: TOOL-SURFACE-HYGIENE TSH-2/TSH-3/TSH-4
date: 2026-05-31
sprint: TOOL-SURFACE-HYGIENE
commit_under_review: f4da532f
verdict: APPROVED

---

## RE-VERIFY — 2026-05-31 (after ops real rebuild, ops session ca53c8de)

### Container & Image Timeline

```
image built:       2026-05-31T11:25:47Z  (docker image inspect confirmed)
commit f4da532f:   2026-05-31T11:13:20Z
gap:               +12 min → image IS post-commit
container created: 2026-05-31T11:27:40Z
container started: 2026-05-31T11:27:55Z
/health:           {"status":"ok","toolCount":154,"uptime":320s}
```

Image built 12 minutes AFTER f4da532f. Container running from new image. Not stale.

---

### Gateway Cache Assessment

Gateway connection: SSE at localhost:4004 → container port 3000 (direct, not through
Cloudflare tunnel). SSE handshake loads schema at session start. This QA session was
spawned after the container rebuild (container started 11:27:55Z; QA spawned after that).
No stale gateway cache — schema loaded from new container at session connect time.

`list_server_tools` is permission-denied in this session; gateway cache assessed via
connection timing and in-container source verification (the only reliable source of truth
for registered descriptions).

---

### Per-Tool Verification — Live Container Source (post-rebuild)

All 6 tool description strings verified by in-container grep against live running container
`vn-market-intelligence-mcp-mcp-server-1`.

#### 1. mark_alert_outcome

Container file: `/app/src/interface/mcp/tools/alerts/alertAccuracy.ts`

```
line 496: "Writes to SQLite alerts table (market.db), updating the outcome/outcome_at/outcome_detail " +
line 497:   "columns of an existing alert row. POST-HOC only — call after the real price outcome is " +
line 498:   "known, not at fire time. Distinct from write_alert_verdict which writes a pending row " +
line 499:   "to the alert-verdicts JSON file at fire time. "
```

REQUIRED DISTINCTIONS LIVE: YES
- "SQLite alerts table" — PRESENT (line 496)
- "POST-HOC only" — PRESENT (line 497)
- timing contrast ("not at fire time") — PRESENT (line 498)
- cross-ref to write_alert_verdict — PRESENT (line 498-499)

---

#### 2. write_alert_verdict

Container file: `/app/src/interface/mcp/tools/alerts/alertVerdictTools.ts`

```
line 109: "Writes a NEW pending AlertVerdict row to docs/data/alert-verdicts.json (file store, " +
line 110:   "NOT the SQLite alerts table). Call AT FIRE TIME (alert-commander step 4a). Verdict starts " +
line 111:   "as 'pending' and is resolved later by the verdict resolution job. Distinct from " +
line 112:   "mark_alert_outcome which scores an existing SQLite alerts row post-hoc. "
```

REQUIRED DISTINCTIONS LIVE: YES
- "docs/data/alert-verdicts.json" — PRESENT (line 109)
- "NOT the SQLite alerts table" — PRESENT (line 110)
- "AT FIRE TIME" — PRESENT (line 110)
- "Distinct from mark_alert_outcome" — PRESENT (line 111-112)

---

#### 3. get_calibration_report

Container file: `/app/src/interface/mcp/tools/macro/calibrationTools.ts`

```
line 284: "Reads from calibration_snapshots table (SQLite). Machine-computed Brier score — " +
line 285:   "measures how well probability estimates match actual outcomes. Weekly snapshot. " +
line 286:   "Distinct from get_label_accuracy_report (human-labelled signal quality) and " +
line 287:   "get_prediction_accuracy (Polymarket signal precision). "
```

REQUIRED DISTINCTIONS LIVE: YES
- "calibration_snapshots table (SQLite)" — PRESENT (line 284)
- "Machine-computed Brier score" — PRESENT (line 284)
- distinction block (vs label_accuracy + prediction_accuracy) — PRESENT (line 285-287)

---

#### 4. get_label_accuracy_report

Container file: `/app/src/interface/mcp/tools/macro/calibrationTools.ts`

```
line 354: "Reads from market_messages table (SQLite). Human-labelled signal quality — " +
line 355:   "counts operator 'signal' vs 'noise' verdicts per agent. Distinct from " +
line 356:   "get_calibration_report (Brier/machine accuracy) and get_prediction_accuracy " +
line 357:   "(Polymarket signal precision). "
```

REQUIRED DISTINCTIONS LIVE: YES
- "market_messages table (SQLite)" — PRESENT (line 354)
- "Human-labelled signal quality" — PRESENT (line 354)
- distinction block (vs calibration + prediction_accuracy) — PRESENT (line 355-357)

---

#### 5. get_prediction_accuracy

Container file: `/app/src/interface/mcp/tools/macro/predictionTools.ts`

```
line 167: "Computed from Polymarket prediction signals only (predictionOutcomeJob). " +
line 168:   "Measures precision = confirmed/(confirmed+false_positive) for volume_spike/ " +
line 169:   "probability_shift signals vs ±2% price moves. Distinct from get_calibration_report " +
line 170:   "(Brier/machine accuracy) and get_label_accuracy_report (human-labelled quality). "
```

REQUIRED DISTINCTIONS LIVE: YES
- "Computed from Polymarket prediction signals only" — PRESENT (line 167)
- "predictionOutcomeJob" — PRESENT (line 167)
- distinction block (vs calibration + label_accuracy) — PRESENT (line 169-170)

---

#### 6. get_patterns

Container file: `/app/src/interface/mcp/tools/market-data/marketTools.ts`

```
line 330: "Reads from RAG memory (LanceDB rag_analyses). Semantic/keyword historical " +
line 331:   "precedent lookup — answers 'how did this stock respond to events like X in the past?' " +
line 332:   "Distinct from get_technical_indicators which computes price-derived quantitative " +
line 333:   "indicators (RSI/MACD/MA) from the Go TA service. "
```

REQUIRED DISTINCTIONS LIVE: YES
- "LanceDB rag_analyses" — PRESENT (line 330)
- "Distinct from get_technical_indicators" — PRESENT (line 332)

---

### TSH-1 Regression — get_market_hexagram

In-container grep on `kinhDichTools.ts` returns 2 hits — BOTH are comment lines:
```
line 11:  * Note: get_market_hexagram was deregistered (TSH-1, 2026-05-31). The
line 380:  * Used by get_market_hexagram for USD/VND, oil, gold direction.
```
Zero `server.tool(...)` registrations. ABSENT — regression check PASS.

---

### Summary Table (Re-Verify)

| Tool | Required distinction | In live container |
|---|---|---|
| mark_alert_outcome | SQLite alerts table / POST-HOC | YES — line 496-499 |
| write_alert_verdict | alert-verdicts.json / AT FIRE TIME | YES — line 109-112 |
| get_calibration_report | calibration_snapshots / Machine Brier | YES — line 284-287 |
| get_label_accuracy_report | market_messages / human-labelled | YES — line 354-357 |
| get_prediction_accuracy | Polymarket / predictionOutcomeJob | YES — line 167-170 |
| get_patterns | LanceDB rag_analyses / vs get_technical_indicators | YES — line 330-333 |
| toolCount=154 | — | CONFIRMED |
| get_market_hexagram GONE | — | CONFIRMED (comments only) |

### DDD / Security / Tests (Smart-Skip)

String-only description change. Smart-Skip applies:
- DDD: SKIP (no domain layer touched)
- Security: SKIP (no logic, no credentials, no SQL)
- tsc: SKIP (string literals only, no type changes)
- Full suite: SKIP (no production logic changed)

Host tsc remains clean — last verified at d081ccde (cycle-165), no new .ts logic introduced.

## Verdict: APPROVED

All 6 tool description distinctions are LIVE in the running mcp-server container
(built 2026-05-31T11:25:47Z, started 2026-05-31T11:27:55Z, toolCount=154).
Container image post-dates commit f4da532f by 12 minutes. In-container source greps
confirm exact description strings at expected line numbers. get_market_hexagram absent.

---
<!-- prior round below -->


---

## Scope

Verify that the 6 tool description updates from commit f4da532f are LIVE in the actual MCP tool
surface — i.e., served by the running mcp-server container.

---

## Container & Health Check

```
container: vn-market-intelligence-mcp-mcp-server-1
/health:   {"status":"ok","toolCount":154}
image built at: 2026-05-31T10:42:27Z
container started at: 2026-05-31T11:14:35Z
commit f4da532f authored at: 2026-05-31T11:13:20Z (= 2026-05-31T13:13:20 +0200)
```

toolCount=154: CONFIRMED — matches expected post-TSH-1 count (155 - 1 deregistered = 154).

---

## TSH-1 Regression Check — get_market_hexagram

`get_market_hexagram` is ABSENT from the deployed `kinhDichTools.ts` source (container grep
confirms 0 registration hits). The only two occurrences in the container are a comment block
referencing its removal (TSH-1) and an internal helper comment — no `server.tool(...)` call.

RESULT: get_market_hexagram GONE — regression check PASS.

---

## Core Finding: Container Image Predates Commit f4da532f

The container image was built at `2026-05-31T10:42:27Z`. Commit f4da532f was authored at
`2026-05-31T11:13:20Z` — 31 minutes AFTER the image build. The container is running a stale image
that does NOT contain the description changes.

Verification: grepping the container's live source files for the key new tokens introduced by
f4da532f returns 0 results:

```
grep "POST-HOC|SQLite alerts table|alert-verdicts|calibration_snapshots.*Machine|
      market_messages.*Human|LanceDB rag_analyses|Reads from RAG|Reads from calibration|
      Reads from market_messages|Computed from Polymarket"
  → /app/src/interface/mcp/tools/alerts/alertAccuracy.ts:       0 hits
  → /app/src/interface/mcp/tools/alerts/alertVerdictTools.ts:    1 hit (pre-existing "alert-verdicts store" — original line)
  → /app/src/interface/mcp/tools/macro/calibrationTools.ts:      2 hits (comment + batch_review ref — not description strings)
  → /app/src/interface/mcp/tools/macro/predictionTools.ts:       2 hits (runtime output string + old description — not new token)
  → /app/src/interface/mcp/tools/market-data/marketTools.ts:     1 hit (file header comment — not description string)
```

The updated description disambiguation strings are ABSENT from the live container.

---

## Per-Tool Verification: What Is Live vs What Should Be Live

### 1. mark_alert_outcome

LIVE (container source, alertAccuracy.ts:495-500):
```
"Manually record the outcome of an alert as HIT, MISS, or UNKNOWN. " +
  "Used by Alert Commander after verifying whether the predicted direction materialised."
```

EXPECTED (host HEAD, alertAccuracy.ts:496-502):
```
"Writes to SQLite alerts table (market.db), updating the outcome/outcome_at/outcome_detail " +
  "columns of an existing alert row. POST-HOC only — call after the real price outcome is " +
  "known, not at fire time. Distinct from write_alert_verdict which writes a pending row " +
  "to the alert-verdicts JSON file at fire time. " +
  "Manually record the outcome of an alert as HIT, MISS, or UNKNOWN. " +
  "Used by Alert Commander after verifying whether the predicted direction materialised."
```

DISTINCTION LIVE: NO — "SQLite alerts table", "POST-HOC", timing contrast absent from container.

---

### 2. write_alert_verdict

LIVE (container source, alertVerdictTools.ts:108-114):
```
"Record a pending verdict after alert-commander fires a MARKET alert. " +
  "Generates a UUID, writes one AlertVerdict row with verdict='pending' to the " +
  "alert-verdicts store. Used by alert-commander at fire time (step 4a). " +
  "alertSource must be one of: urgent_news, verified_chain, chain_catalyst, " +
  "price_anomaly, position_danger, watchlist_opportunity, legal_risk, crisis_velocity."
```

EXPECTED (host HEAD, alertVerdictTools.ts:109-115):
```
"Writes a NEW pending AlertVerdict row to docs/data/alert-verdicts.json (file store, " +
  "NOT the SQLite alerts table). Call AT FIRE TIME (alert-commander step 4a). Verdict starts " +
  "as 'pending' and is resolved later by the verdict resolution job. Distinct from " +
  "mark_alert_outcome which scores an existing SQLite alerts row post-hoc. " +
  "Record a pending verdict after alert-commander fires a MARKET alert. " +
  "Generates a UUID, writes one AlertVerdict row with verdict='pending' to the " +
  "alert-verdicts store. " +
  "alertSource must be one of: ..."
```

DISTINCTION LIVE: NO — "docs/data/alert-verdicts.json", "NOT the SQLite alerts table", "AT FIRE TIME",
"Distinct from mark_alert_outcome" absent from container. Only the original "at fire time (step 4a)"
and "alert-verdicts store" phrases are present (pre-existing, not the new disambiguation block).

---

### 3. get_calibration_report

LIVE (container source, calibrationTools.ts:246-259 approximate):
```
"Returns the latest weekly calibration report for the prediction engine. " +
  "Shows overall Brier score, breakdown by agent/stock/direction, calibration curve " +
  "(predicted probability vs actual hit rate), trend vs last week, and top/worst predictions. " +
  "Data is at most 7 days stale (written weekly Sunday 20:00 VN). " +
  "If no snapshots exist yet (first 1-2 weeks after Phase C deploy), returns a clear message. " +
  "Pass date= to retrieve a specific Sunday's historical report."
```

EXPECTED (host HEAD, calibrationTools.ts:284-295):
```
"Reads from calibration_snapshots table (SQLite). Machine-computed Brier score — " +
  "measures how well probability estimates match actual outcomes. Weekly snapshot. " +
  "Distinct from get_label_accuracy_report (human-labelled signal quality) and " +
  "get_prediction_accuracy (Polymarket signal precision). " +
  [+ original description follows]
```

DISTINCTION LIVE: NO — "calibration_snapshots", "Machine-computed Brier score", distinction block absent.

---

### 4. get_label_accuracy_report

LIVE (container source, calibrationTools.ts):
```
"Returns per-agent signal accuracy computed from human verdict labels on MARKET channel messages. " +
  "Each row shows how often an agent's messages were labelled 'signal' vs 'noise' by the user. " +
  "Use this alongside get_calibration_report to understand which agents generate genuine signals. " +
  "since_days controls the lookback window (default 90 days, matching the calibration engine window)."
```

EXPECTED (host HEAD, calibrationTools.ts:354-363):
```
"Reads from market_messages table (SQLite). Human-labelled signal quality — " +
  "counts operator 'signal' vs 'noise' verdicts per agent. Distinct from " +
  "get_calibration_report (Brier/machine accuracy) and get_prediction_accuracy " +
  "(Polymarket signal precision). " +
  [+ original description follows]
```

DISTINCTION LIVE: NO — "market_messages table (SQLite)", "Human-labelled signal quality", distinction block absent.

---

### 5. get_prediction_accuracy

LIVE (container source, predictionTools.ts):
```
"Returns retrospective accuracy metrics for Polymarket prediction signals — " +
  "how often volume_spike or probability_shift signals actually predicted VN stock moves. " +
  "Precision = confirmed / (confirmed + false_positive). " +
  "Outcomes are validated weekly by comparing signal direction against ±2% price moves in the 48h window."
```

EXPECTED (host HEAD, predictionTools.ts:164-174):
```
"Computed from Polymarket prediction signals only (predictionOutcomeJob). " +
  "Measures precision = confirmed/(confirmed+false_positive) for volume_spike/ " +
  "probability_shift signals vs ±2% price moves. Distinct from get_calibration_report " +
  "(Brier/machine accuracy) and get_label_accuracy_report (human-labelled quality). " +
  [+ original description follows]
```

DISTINCTION LIVE: NO — "Computed from Polymarket prediction signals only", "predictionOutcomeJob",
distinction block absent from container.

---

### 6. get_patterns

LIVE (container source, marketTools.ts):
```
"Query historical precedents from RAG memory for a specific stock and event keyword. " +
  "Returns aggregate statistics: average impact score, dominant direction, and a list of " +
  "matching past analyses. Useful for understanding how a stock has historically responded " +
  "to similar events."
```

EXPECTED (host HEAD, marketTools.ts:330-341):
```
"Reads from RAG memory (LanceDB rag_analyses). Semantic/keyword historical " +
  "precedent lookup — answers 'how did this stock respond to events like X in the past?' " +
  "Distinct from get_technical_indicators which computes price-derived quantitative " +
  "indicators (RSI/MACD/MA) from the Go TA service. " +
  [+ original description follows]
```

DISTINCTION LIVE: NO — "LanceDB rag_analyses", "Distinct from get_technical_indicators", distinction block absent.

---

## Summary Table

| Tool | Required distinction | In host HEAD | In live container |
|---|---|---|---|
| mark_alert_outcome | SQLite alerts table / POST-HOC | YES | NO |
| write_alert_verdict | alert-verdicts.json / AT FIRE TIME | YES | NO |
| get_calibration_report | calibration_snapshots / Brier | YES | NO |
| get_label_accuracy_report | market_messages / human-labelled | YES | NO |
| get_prediction_accuracy | Polymarket / prediction precision | YES | NO |
| get_patterns | LanceDB rag_analyses / semantic precedent | YES | NO |
| toolCount=154 | — | — | CONFIRMED |
| get_market_hexagram GONE | — | — | CONFIRMED |

---

## Root Cause

ops built and force-recreated the container BEFORE dev committed f4da532f. Timeline:
- `10:42:27Z` — image built (stale)
- `11:13:20Z` — commit f4da532f authored (31 min after image build)
- `11:14:35Z` — container started (already stale at start)

The description changes are committed to main HEAD and verified correct in host source files.
They are NOT compiled into the running container.

---

## Blocking Issue

**ops must rebuild + force-recreate the mcp-server container from the current HEAD.**

The container image must be rebuilt from source AFTER commit f4da532f is in HEAD (it is).
A simple `docker compose up -d --force-recreate mcp-server` is NOT sufficient — the image
itself must be rebuilt (e.g. `docker compose up -d --build mcp-server` or
`docker compose build --no-cache mcp-server && docker compose up -d --force-recreate mcp-server`).

File: `docker-compose.yml` — mcp-server service
Action required: ops-rebuild (new image build from current HEAD, then force-recreate)

---

## DDD / Security / Tests (Smart-Skip)

This task is a pure string-only description change. Per Smart-Skip:
- DDD scan: SKIP (no domain layer touched)
- Security scan: SKIP (no logic, no credentials, no SQL)
- Full suite + tsc: DEFERRED (ops rebuild required first; no point running against stale container)

Host source tsc status: last known clean (cycle-165 tsc=0 errors at d081ccde, no new .ts logic added
by f4da532f — string literals only). No tsc concern.

---

## Verdict: CHANGES_REQUESTED

All 6 descriptions carry their required distinctions in the committed source (f4da532f). The
container image predates the commit. The live MCP tool surface does NOT yet serve the updated
descriptions. Rebuild required.

## Next

ops: rebuild mcp-server image from HEAD + force-recreate container.
Then: re-run this QA gate to confirm all 6 live descriptions match expected strings.
