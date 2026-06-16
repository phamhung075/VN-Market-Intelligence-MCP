---
task-id: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
date: 2026-06-16
agent: qa
cycle: 275
verdict: APPROVED
---

# Decision Journal — FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 QA Gate

## what-considered

Verified 7 commits (a719c138..8f087043 + e4801dcc) implementing:
- SUBTASK-1: ohlcvWriteService.ts SSOT choke-point (application/usecases layer)
- SUBTASK-2: taOhlcvBackfillJob migrated to writeOhlcvBatch (Writer D)
- SUBTASK-3: pushPricesHandler migrated to writeOhlcvBatch (Writer A, double-scale fix)
- SUBTASK-4: ohlcvSanityCheckJob FR-G2 cross-day scale + FR-G3 synthetic seed detector
- SUBTASK-5: cronConfig ohlcvSanityCheckEarly at 00:45 UTC Mon-Fri (FR-G4)
- SUBTASK-6: repair-ohlcv-seed-candle-2026-06-16.ts (fingerprint-scoped DELETE, already applied)
- SUBTASK-7: 29-test regression suite

## checks-run

### CI Full Suite (scripts/ci-per-file-isolation.sh P=4)
Command: `cd apps/mcp-server && bash ../../scripts/ci-per-file-isolation.sh 4`
Result: 13050 pass / 42 skip / 17 fail (10 files reported initially failing)

Contamination analysis (re-run each file individually):
- 083-tool-analysis: PASS on re-run (parallel isolation noise)
- 102-job-news-poll: te-chromium-news TIMEOUT — Chromium not present in test env (/usr/bin/chromium). PRE-EXISTING, unrelated to fix.
- 1227-source-health: PASS on re-run
- 125-test-e2e-briefing: PASS on re-run
- 1288-poll-news-shape: PASS on re-run
- 1324-push-news-all-sources: te-chromium-news TIMEOUT — same Chromium env issue. PRE-EXISTING.
- 1352a-async-extraction-race: SQLiteError: no such table bctc_table_rows — PRE-EXISTING schema migration gap, tracked separately.
- 1821a-pollnews-cold-start-retry: PASS on re-run
- 1837a-pipeline-state: 'ready' missing from valid head.status enum — PRE-EXISTING. head.status IS 'ready' in live orch-state.json; test enum stale. Separate fix.
- 1898b-rss-degradation: PASS on re-run

Genuine pre-existing failures: 4 (102, 1324 = Chromium timeout; 1352a = missing bctc_table_rows; 1837a = enum drift).
NONE of the 4 genuine failures touch any file changed in this fix's 7 commits. Disjoint file set confirmed.

### Fix-specific test suites (all direct):
- FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts: 29 pass / 0 fail
- 1970-ta-ohlcv-backfill.test.ts: 10 pass / 0 fail
- CONTAM-5-ohlcv-sanity-check.test.ts: 10 pass / 0 fail
- CONTAM-7-ohlcv-unit-contam-integration.test.ts + 1987-contam2: 52 pass / 0 fail
- 1972-vndirect-ohlcv-null-coercion.test.ts: 5 pass / 0 fail

### TSC
Single error: FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:270 TS2367 — the KNOWN pre-existing error (separate push-unblocker chain). Zero new errors from this fix.

### DDD Scan
- ohlcvWriteService.ts: application/usecases — imports from domain/services (ohlcvUnitGuard) and bun:sqlite only. Correct DDD direction.
- taOhlcvBackfillJob.ts: scheduler — imports from infrastructure (logger, fetchDeadline) + application/usecases (writeOhlcvBatch). Correct.
- pushPricesHandler.ts: interface — imports from infrastructure + application/usecases. Correct.
- ohlcvSanityCheckJob.ts: scheduler — imports from domain/services (validateOhlcvUnit). Correct.
- ohlcvUnitGuard.ts (domain): zero imports. Pure. Domain golden rule: PASS.
- No domain file imports from application or infrastructure. PASS.

### Security Scan
- process.env: NONE in any changed production file. All use Bun.env.
- Hardcoded secrets: NONE.
- SQL injection: ALL SQL uses bound params (?). ohlcvWriteService fetchPrevCloseMap uses ...codes, beforeDate spread (standard bun:sqlite parameterization). upsertStmt.run() uses positional params. repair script uses db.query/db.prepare with [string] typed bound param. PASS.
- mock-guard: EXIT 0 on all 5 production files.

### DDD Choke-Point Verification
- Single application-layer SSOT: ohlcvWriteService.ts confirmed sole upsert path for Writers A and D.
- No duplicate guard logic left in taOhlcvBackfillJob: confirmed — normalizeOhlcvToVnd/detectAndNormalizeScaleFromPrevClose/validateOhlcvUnit appear only in JSDoc comments (not code calls).
- No duplicate guard logic left in pushPricesHandler: confirmed — OHLCV upsert delegated entirely to writeOhlcvBatch.
- Dead code removed: insertMany, UPSERT_SQL, prevClose tracking loop, local ohlcvUnitGuard.js import — all gone from taOhlcvBackfillJob.

### Live Data Verification (named-volume DB, keinos/sqlite3 sidecar)
- VHM 2026-06-16: close=136300, open=137000, volume=121880 — full 6-figure REAL data. Healed.
- VIC 2026-06-16: close=193400, open=193900, volume=122470 — full 6-figure REAL data. Healed.
- VJC 2026-06-16: close=138200, open=143500, volume=47690 — full 6-figure REAL data. Healed.
- Synthetic seed row count WHERE fingerprint (vol=0 AND O=H=L=C AND data_env IS NULL): 11 rows remain.
  These are NOT the incident class: 5 are all-zero stubs (BCG/DAG/DFF/DMC/POM — separate CONTAM-all-zero defect out of scope per architect §1.2 and dev-standards), 6 are global index snapshots (^GSPC/^DJI/etc — volume=0 is correct for index reference prices). The actual VHM/VIC/VJC flat-136.1 incident rows were deleted by the repair at 02:13Z.

### Rebuild Status
Image created: 2026-06-16T00:10:01Z. Fix commits: 2026-06-16T02:10-02:31Z UTC (04:10-04:31 CEST). Image is 2h older than commits. REBUILD REQUIRED before behavioral proof (writers A and D running through the new service pipeline).

## why-change

No change from plan: all checks green on fix scope. Pre-existing failures (Chromium env, bctc_table_rows, enum drift) are genuinely disjoint from this fix's file set. Residual 11 rows are non-incident class. DDD, security, and choke-point architecture are sound.

## verdict

APPROVED. Rebuild required (ops). Behavioral proof (no re-corruption) pends next Writer D/A cycle post-rebuild — deferred per handoff scope.
