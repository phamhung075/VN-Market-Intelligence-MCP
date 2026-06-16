# Task Report: FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
date: 2026-06-16
outcome: APPROVED
qa-agent: qa (cycle-275)
zone: apps/mcp-server/

## Changed Files

| File | Commits | Lines |
|---|---|---|
| `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` | a719c138, ac8e28a6 | +385 (SSOT choke-point; SUBTASK-1 skeleton + SUBTASK-3 intraday SQL) |
| `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` | 31306d76 | +55/-143 (Writer D migration; dead code removed) |
| `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` | ac8e28a6 | +65/-44 (Writer A migration; double-scale fix) |
| `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts` | 866dc899 | +156/-15 (FR-G2 cross-day scale + FR-G3 synthetic seed detectors) |
| `apps/mcp-server/src/scheduler/cronConfig.ts` | 647e773e | +5 (ohlcvSanityCheckEarly 00:45 UTC) |
| `apps/mcp-server/src/scheduler/startScheduler.ts` | 647e773e | +13 (cron wiring for ohlcvSanityCheckEarly) |
| `apps/mcp-server/src/__tests__/FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts` | 8f087043 | +1116 (29-test regression suite) |
| `apps/mcp-server/src/__tests__/1987-contam2-push-prices-ohlcv-guard.test.ts` | ac8e28a6 | +11 (TC-4/TC-A4 updated for FR-S1 filter path) |
| `apps/mcp-server/src/__tests__/CONTAM-7-ohlcv-unit-contam-integration.test.ts` | ac8e28a6 | +6 (TC-A4 path update) |
| `scripts/migrations/repair-ohlcv-seed-candle-2026-06-16.ts` | e4801dcc | +298 (fingerprint-scoped DELETE; already applied at 02:13Z) |
| `docs/agents/dev-mcp-server/flow/main.md` | e4801dcc | +20 (repair script flow-doc pointer) |

## Test Results

### Fix-Specific Suites (direct, per-file)
| Suite | Pass | Fail | Notes |
|---|---|---|---|
| FIX-OHLCV-SEED-CANDLE-UNIT-SCALE.test.ts | 29 | 0 | AC-T1..T8 all green |
| 1970-ta-ohlcv-backfill.test.ts | 10 | 0 | Writer D migration regression |
| CONTAM-5-ohlcv-sanity-check.test.ts | 10 | 0 | FR-G2/G3 sanity detectors |
| CONTAM-7 + 1987-contam2 | 52 | 0 | Writer A regression (CONTAM-2/9 preserved) |
| 1972-vndirect-ohlcv-null-coercion | 5 | 0 | Prior fix regression |

### Full CI Per-File Isolation Suite
Command: `cd apps/mcp-server && bash ../../scripts/ci-per-file-isolation.sh 4`
Result: **13050 pass / 42 skip / 17 fail**

10 files flagged — contamination probe result:
- **6 false positives** (pass on sequential re-run; parallel isolation noise): 083-tool-analysis, 1227-source-health, 125-test-e2e-briefing, 1288-poll-news-shape, 1821a-pollnews-cold-start-retry, 1898b-rss-degradation
- **4 genuine pre-existing failures** (no overlap with fix file set):
  - `102-job-news-poll` + `1324-push-news-all-sources`: te-chromium-news TIMEOUT — Chromium absent in test env (/usr/bin/chromium). Pre-existing environment constraint.
  - `1352a-async-extraction-race`: `SQLiteError: no such table: bctc_table_rows` — pre-existing BCTC schema migration gap (tracked separately, out of scope).
  - `1837a-pipeline-state`: `head.status 'ready'` missing from valid enum array — pre-existing enum drift (live orch-state.json uses 'ready'; test enum stale).

Disjoint file set confirmed: none of the 4 genuine failures touch any file in the 7 commits under review.

## TypeScript
`bun tsc --noEmit` exit: 2 (expected)
Single error: `FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts:270 TS2367` — the **known pre-existing error** (separate push-unblocker chain FIX-SIGNAL-CONFIDENCE-SLA-TEST-TS2367). Zero new errors from this fix.
TSC verdict: **PASS (only known pre-existing error present)**

## DDD Compliance: PASS

| File | Layer | Import direction |
|---|---|---|
| ohlcvWriteService.ts | application/usecases | imports domain/services (ohlcvUnitGuard) + bun:sqlite only — correct |
| taOhlcvBackfillJob.ts | scheduler | imports infrastructure + application/usecases — correct |
| pushPricesHandler.ts | interface | imports infrastructure + application/usecases — correct |
| ohlcvSanityCheckJob.ts | scheduler | imports domain/services (validateOhlcvUnit) only — correct |
| ohlcvUnitGuard.ts (domain) | domain/services | zero imports — pure — correct |

Golden rule check: domain/ does not import from application/ or infrastructure/. PASS.
Application layer not imported by domain/. PASS.
SSOT choke-point: ohlcvWriteService is the sole OHLCV upsert path for Writers A and D. No duplicate guard logic found in taOhlcvBackfillJob or pushPricesHandler (confirmed via grep — only JSDoc references).

## Security: PASS

- `process.env`: absent from all changed production files. All runtime env reads use `Bun.env`. PASS.
- Hardcoded secrets: none. PASS.
- SQL injection: all SQL uses bound params (`?` positional). fetchPrevCloseMap uses `db.prepare(sql).all(...codes, beforeDate)` — standard bun:sqlite parameterization. upsertStmt.run() positional. Repair script: `db.query<{ cnt }, [string]>(SQL.count).get(TARGET_DATE)` — typed bound param. PASS.
- mock-guard: EXIT 0 on all 5 production files (ohlcvWriteService, taOhlcvBackfillJob, pushPricesHandler, ohlcvSanityCheckJob, cronConfig). PASS.

## DDD/Architecture — Choke-Point Integrity: PASS

1. ohlcvWriteService.ts is the single application-layer SSOT for all OHLCV upserts.
2. Writer D (taOhlcvBackfillJob): dead code removed — insertMany transaction, UPSERT_SQL, prevClose tracking loop, ohlcvUnitGuard.js import all deleted. Routes through writeOhlcvBatch(conflictStrategy='backfill').
3. Writer A (pushPricesHandler): inline OHLCV upsert loop removed. Routes through writeOhlcvBatch(conflictStrategy='intraday'). Double-scale fix: raw VPS prices passed to service; no pre-multiplication by 1000 for OHLCV path (market_prices and market_prices_history writes unchanged — those still use priceVal=p.price*1000, correct per their separate purpose).
4. Intraday conflict semantics (CONTAM-2/CONTAM-9): open self-heal + accumulate-high + protected-low preserved exactly in UPSERT_INTRADAY_SQL (verified against architect §4.2 R-2 contract).
5. Repair script WHERE: fingerprint-scoped (`date=?` bound param, `AND volume=0 AND open=high AND high=low AND low=close AND data_env IS NULL`). Idempotent. Dry-run default.

## Known Residual: Acceptable Boundary (SUBTASK-3 partial)

`detectAndNormalizeScaleFromPrevClose` corrects the **÷1000 direction at write-time** (prevClose/current >= 50 → ×1000). This addresses VHM/VIC/VJC class (confirmed by test AC-T2 + AC-T6).

The **×1000 direction** (current/prevClose >= 50, i.e. inflated AAA/ADS class): SUBTASK-3 kills the incident **source** — pushPricesHandler no longer pre-multiplies raw VPS prices by 1000 before writing OHLCV. If VPS sends a full-VND reference (7,260), it is passed raw to the service which correctly detects max(OHLC)=7260 >= 100 → no ×1000 normalization. The double-write race is resolved.

FR-G2 in ohlcvSanityCheckJob (ratio > 500 flag) will **detect** any residual ×1000-class rows post-write and emit a BUG alert. There is no auto-repair for the ×1000 direction — that was not in scope per architect §2.1 (post-write defense-in-depth is FR-G2, not auto-correction). The 74-ticker ×1000 incident rows (already healed by repair script at 02:13Z) will not re-appear because the source double-write is fixed.

**Judgment: ACCEPTABLE BOUNDARY.** The P0 incident source is killed. Residual ×1000 detection-only (no auto-repair) is appropriate for an edge class that requires human review (threshold-crossing price anomaly). Recommend follow-on task to add auto-repair in ohlcvWriteService for ratio > 500 class if FR-G2 fires in practice.

**Follow-on recommendation:** FIX-OHLCV-SCALE-X1000-AUTO-REPAIR — extend detectAndNormalizeScaleFromPrevClose to handle the ×1000 direction (current/prevClose >= 50 → ÷1000 at write-time). Low urgency; FR-G2 provides BUG alert coverage.

## Live Data Confirmation (2026-06-16)

Named-volume DB (keinos/sqlite3 sidecar), queried directly:

| Ticker | Date | Close | Open | Volume | Status |
|---|---|---|---|---|---|
| VHM | 2026-06-16 | 136,300 | 137,000 | 121,880 | HEALED — real 6-figure data |
| VIC | 2026-06-16 | 193,400 | 193,900 | 122,470 | HEALED — real 6-figure data |
| VJC | 2026-06-16 | 138,200 | 143,500 | 47,690 | HEALED — real 6-figure data |

Remaining synthetic-fingerprint rows (volume=0 AND O=H=L=C AND data_env IS NULL, date=2026-06-16): **11 rows**.
These are NOT the incident class:
- 5 all-zero stubs (BCG/DAG/DFF/DMC/POM, close=0.0): separate CONTAM-all-zero defect, out of scope per architect §1.2 and dev-standards repair note.
- 6 global index snapshots (^GSPC/^DJI/^IXIC/^FTSE/^GDAXI/^FCHI): volume=0 is correct for index reference prices; these are not stock seed-bar contamination.

The VHM/VIC/VJC flat-136.1 incident rows (÷1000 class) and the 74-ticker ×1000 class were deleted by the repair script at 02:13Z. Zero incident rows confirmed.

## Rebuild Status: REQUIRED

mcp-server image created: `2026-06-16T00:10:01Z`
Fix commits: `2026-06-16T02:10–02:31Z UTC` (2+ hours newer than image)
Behavioral proof (writers A and D routing through ohlcvWriteService in production) pends rebuild.

Rebuild command:
```bash
docker compose build mcp-server && docker compose up -d --force-recreate mcp-server
```
Post-rebuild: verify image `.Created` > `02:31Z`. Behavioral gate (no re-corruption) confirmed on next Writer D cycle (01:30 UTC Mon-Fri) and Writer A intraday push.

## Merge Status

This task has no branch (commits on main per project NO-BRANCHES policy). Push is HELD by PO pending this QA gate. PO authorizes push on APPROVE verdict.

## Verdict: APPROVED

All fix-specific tests green (29+10+10+52+5 = 106 tests, 0 fail). TSC: only known pre-existing TS2367. DDD: PASS. Security: PASS. Mock-guard: PASS. Choke-point integrity: PASS. Live data: healed. Pre-existing CI failures: 4, all disjoint from fix file set.
