---
id: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-qa-report
version: "2026-06-16"
authored_by: qa
status: APPROVED
zone: apps/mcp-server/
task_ref: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
qa_cycle: 275
---

# [QA] Review Record — FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0

## Verdict: APPROVED

## Commits Verified
- a719c138 ohlcvWriteService SSOT skeleton (SUBTASK-1)
- 31306d76 taOhlcvBackfillJob → writeOhlcvBatch (SUBTASK-2)
- ac8e28a6 ohlcvWriteService UPSERT_INTRADAY_SQL + pushPricesHandler migration (SUBTASK-3)
- 866dc899 ohlcvSanityCheckJob FR-G2 + FR-G3 (SUBTASK-4)
- 647e773e cronConfig ohlcvSanityCheckEarly (SUBTASK-5)
- 8f087043 29-test regression suite (SUBTASK-7)
- e4801dcc repair script (SUBTASK-6 — already applied at 02:13Z)

## Gate Results

### FULL CI Suite
Command: `cd apps/mcp-server && bash ../../scripts/ci-per-file-isolation.sh 4`
Result: 13050 pass / 42 skip / 17 fail (10 files flagged)

Contamination probe: 6 of 10 pass on sequential re-run (parallel isolation noise). 4 genuine pre-existing failures — all disjoint from fix file set:
- `102-job-news-poll`, `1324-push-news-all-sources`: Chromium absent at /usr/bin/chromium — env-only, pre-existing
- `1352a-async-extraction-race`: missing bctc_table_rows table — separate BCTC schema migration gap
- `1837a-pipeline-state`: 'ready' status missing from test enum — enum drift vs live orch-state.json

### Fix-Specific Tests (direct)
- FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts: **29/29 PASS** (AC-T1..T8)
- 1970-ta-ohlcv-backfill.test.ts: **10/10 PASS**
- CONTAM-5-ohlcv-sanity-check.test.ts: **10/10 PASS**
- CONTAM-7 + 1987-contam2: **52/52 PASS**
- 1972-vndirect-ohlcv-null-coercion: **5/5 PASS**

### TSC
One error: `FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:270 TS2367` — KNOWN pre-existing (separate chain). **Zero new errors from this fix.**

### DDD: PASS
- ohlcvWriteService (application/usecases): imports domain/services + bun:sqlite only
- Domain golden rule: ohlcvUnitGuard.ts has zero imports — pure functions
- No domain → application or domain → infrastructure imports introduced
- Choke-point: ohlcvWriteService is sole upsert path for Writers A and D

### Security: PASS
- No process.env in any production file (all Bun.env)
- No hardcoded secrets
- All SQL uses bound params (?)
- mock-guard: EXIT 0 on all 5 production files

### Dead Code: CONFIRMED REMOVED
taOhlcvBackfillJob: insertMany transaction, UPSERT_SQL, prevClose tracking loop, ohlcvUnitGuard.js import — all deleted. No duplicate guard logic in any caller.

## Live Data
VHM 2026-06-16: close=136,300 open=137,000 vol=121,880 — HEALED (was 136.1, ÷1000 class)
VIC 2026-06-16: close=193,400 open=193,900 vol=122,470 — HEALED (was 192.6, ÷1000 class)
VJC 2026-06-16: close=138,200 open=143,500 vol=47,690 — HEALED (was 141.3, ÷1000 class)

Repair already applied 02:13Z by router. 11 rows match fingerprint WHERE — all pre-existing non-incident class (5 all-zero stubs, 6 global index snapshots).

## Residual Judgment: ACCEPTABLE BOUNDARY
÷1000 direction: fixed at write-time by detectAndNormalizeScaleFromPrevClose (DB-seeded prevClose).
×1000 direction: incident source killed (pushPricesHandler no longer pre-multiplies); FR-G2 provides post-write BUG detection. No auto-repair for ×1000 class at write-time — within P0 scope boundary per architect §2.1.
Follow-on recommended: FIX-OHLCV-SCALE-X1000-AUTO-REPAIR (extend service to ÷1000 correction when current/prevClose >= 50).

## Rebuild: REQUIRED
Image created 00:10:01Z; fix commits 02:10-02:31Z UTC. Image is stale.
Command: `docker compose build mcp-server && docker compose up -d --force-recreate mcp-server`
Behavioral proof (writers no longer re-corrupt) pends rebuild + next Writer D/A cycle.

## BCTC Eval Gate
Not applicable — no BCTC report touched in this task.

## Issues Found
### Blocking: NONE
### Non-Blocking: NONE
### Pre-Existing (NOT blocking this approval):
1. `102-job-news-poll` / `1324-push-news-all-sources` — Chromium env timeout (separate infra concern)
2. `1352a-async-extraction-race` — bctc_table_rows schema gap (tracked separately)
3. `1837a-pipeline-state` — 'ready' enum drift (test stale vs live orch-state)
4. `FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:270` TS2367 — separate push-unblocker chain

## Decision Journal
`docs/agent-memory/decisions/sprint-FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0-qa.md`
