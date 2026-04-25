# Developer Session — 2026-04-25

### Fix 1265: batch_review_market_messages verdict persistence
- **Files**: `apps/mcp-server/src/infrastructure/db/schema-news.ts` (L158: `reviewed_at INTEGER` → `reviewed_at TEXT`), `apps/mcp-server/src/__tests__/FIX-1265-batch-review-persist.test.ts` (new, 7 tests), `apps/mcp-server/src/__tests__/1311a-schema-migration.test.ts` (test updated to use datetime string not unix int)
- **Finding**: ALTER TABLE migration (Task 1311a) added `reviewed_at` column with type `INTEGER` on pre-migration DBs, while `CREATE TABLE` DDL defined it as `TEXT`. Although SQLite flexible affinity stores datetime('now') text in both cases, on TEXT-affinity columns integers are coerced to strings. The existing test in 1311a encoded the wrong behavior by asserting `reviewed_at === 1714000000` (integer). Fixed column type to TEXT throughout. Full round-trip regression test added covering insert → batchReview → re-query → verify gone.
- **Status**: Ready for QA. Commit `7b37c2d2`. Branch `fix/batch-review-persist`.


### Fix 1270/1276: USD/VND alert quality
- **Files**: `apps/mcp-server/src/domain/services/macroThresholds.ts` (L137: minAbsDeviation 10→50), `apps/mcp-server/src/infrastructure/config.ts` (AlertQualityConfig + macroCooldownMinutes field), `mcp.config.json` (macroCooldownMinutes:360), `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts` (step E: MACRO uses 6h cooldown, history query widened 2h→7h), `src/__tests__/FIX-1270-usdvnd-alert-quality.test.ts` (new), `1270`/`1269`/`1326`/`1307a` tests updated for 50 VND guard
- **Finding**: Three root causes. (1) 50 VND threshold: `minAbsDeviation` was 10 VND — 2.8 VND at σ=0.76 still returned "elevated" (not high/extreme), so no alert fired. But 10 VND would fire (zScore -13σ). Raised to 50 VND. (2) Cooldown history window was 2h but macro cooldown config was 30min — mismatch meant MACRO alerts could not be suppressed across cycles. Widened history to macroCooldownMinutes+1h=7h. (3) MACRO alerts now use separate 6h config from `alertQuality.macroCooldownMinutes`. (4) Tests in 1269/1326/1307a used stdDev=12 with 31-42 VND deviations — below new 50 VND guard. Updated to stdDev=20 + 55/75 VND deviations.
- **Status**: Ready for QA. Commit `952e011c`. Branch `fix/usdvnd-alert-quality`.

### Task 1329c: wal-shutdown-settle
- **Files**: `apps/mcp-server/src/infrastructure/db/checkpoint.ts` (L113: shutdown callback `async`, L120: `await Bun.sleep(200)` added), `apps/mcp-server/src/__tests__/1329a-wal-hardening.test.ts` (1329c describe block appended)
- **Finding**: Parallel task 1329a had already replaced the test file with its own content when the 1329c session ran. Appended 1329c's describe block to the shared file rather than overwriting. Commit landed on `task/1329b-wal-sentinel` (parallel branch active) — PM should note for rebase sequence.
- **Status**: Ready for QA. Commit `5c82dace`. Branch `task/1329b-wal-sentinel`.

### Task 1328h: cowork-routing
- **Files**: `cowork-workspace-team-claude-desktop/01-news-scout.md`, `02-financial-analyst.md`, `04-market-watcher.md`, `05-alert-commander.md`, `06-digest-predict.md`, `07-qa-responder.md`, `unified-agent.md`, `CHANNEL_STRATEGY.md`
- **Finding**: All 7 cowork agents were missing explicit Telegram Routing sections. Agents 01/02/04/unified had no channel guidance at all; 05 had "Send Decision" but no three-channel routing table; 06/07 had `channel="market"` calls but no routing section documenting the exception rules.
- **Pattern**: Documentation-only task (no TS changes) — routing tables added as `## Telegram Routing` section in each agent file following the three-channel strategy (WORK=status, BUG=errors, MARKET=user-facing only via Alert Commander + named exceptions).
- **Status**: Ready for QA

### Task 1327c: merge-to-main (feature/ddd-phase-0)

- **Files**:
  - `apps/mcp-server/src/scheduler/alerts/alertScanParallelJob.ts` (fix `.reason` narrowing)
  - `apps/mcp-server/src/__tests__/1309-bb-alert-scan-job.test.ts` (fix mock exactOptionalPropertyTypes)
  - `apps/mcp-server/src/__tests__/1323-pdf-extractor-client.test.ts` (fix typeof fetch cast)
  - `TASKS.md` (1327c → Done, 1327-bun-crash → Done)

- **Finding**:
  - feature/ddd-phase-0 was already fast-forward merged into main before this session
  - Three TypeScript errors blocked G-1 (tsc --noEmit):
    1. `PromiseSettledResult.reason` accessed without status narrowing — fix: add `&& results[n].status === "rejected"` guard
    2. `exactOptionalPropertyTypes: true` forbids `field: undefined` on optional properties in test mocks — fix: omit fields entirely, use spread conditional `...(x != null ? {field: x} : {})`
    3. Partial mock `fetch` objects missing `preconnect` property — fix: `(fn) as unknown as typeof fetch`
  - Note: `ComputeTAResponse.bb` uses `middle` (not `mid`) — test helper input used `mid` as internal name, mapping required

- **Gates**:
  - G-1: EXIT 0 ✓
  - G-2: 13 fail lines (≤15) ✓
  - G-3: 17 pass, 0 fail scaffold test ✓
  - G-4/G-5/G-6: scaffold dirs + docker-compose + pnpm-workspace verified ✓
  - G-7: Bun 1.3.11 panic documented in commit message ✓

- **Bun panic**: Confirmed post-test-suite C++ exception at RSS ~1.41GB. Not a code bug. URL: https://bun.report/1.3.11/mt1af24e28in

- **Status**: Done. Commit `537a24c3`. Branch `feature/ddd-phase-0` deleted.

### Task 1328i: diacritics-normalize

- **Files**:
  - `apps/mcp-server/src/infrastructure/notifiers/telegram.ts` (L176–181: add normalizedText = text.normalize("NFC") before splitMessage)
  - `apps/mcp-server/src/__tests__/1328i-nfc-normalize.test.ts` (4 new tests: TC-01–TC-04)

- **Finding**:
  - coreSend() was calling splitMessage(text) directly without normalization
  - NFD input (Vietnamese combining characters from macOS RSS) passed to Telegram as-is
  - Single-point fix: one line added in coreSend() covers all three channels (market/work/bug)
  - TC-04 fixture: U+1B1B is not a base character for combining marks — had to use "o" + U+031B (combining horn) to produce a valid NFD→NFC conversion test for "ơ"
  - All 13 pre-existing failures confirmed unrelated (BCTC queue, OCR, watchdog)

- **Status**: Ready for QA. Commit `a8493c68`. Branch `task/1328i-diacritics-normalize`.

### Task 1328a: add-signal-fields

- **Files**:
  - `apps/mcp-server/src/domain/signals/signalTypes.ts` (L70–82: 3 new optional fields in interface + 3 Zod validators in schema)
  - `apps/mcp-server/src/__tests__/1328a-signal-fields.test.ts` (9 new tests: boundary values, invalid inputs, backward compat)

- **Finding**:
  - `exactOptionalPropertyTypes: true` in tsconfig requires optional fields to be typed as `T | undefined` (not just `T?`) to match Zod's `.optional()` inferred type (`T | undefined`)
  - Existing `imfSentiment` already used `| undefined` pattern — followed same convention for the 3 new fields
  - `kinhDichConfidence` range is [0, 100] (not [0, 1]) per handoff spec — Kinh Dich hexagram confidence is 0–100 scale
  - Full suite Bun 1.3.11 panic (same crash URL as previous session) is a pre-existing Bun OOM issue, not caused by this change

- **Status**: Ready for QA. Commit `58b3c132`. Branch `task/1328i-diacritics-normalize` (note: branch was already active, committed there).

### Task 1328d: conviction-enrichment

- **Files**:
  - `apps/mcp-server/src/domain/services/convictionScorer.ts` (3 new optional fields on ConvictionInput; `enrichDimensionScores()` exported; `computeConviction()` calls enricher at top, uses `enriched.*` throughout; `scoreSentiment`/`scoreCascade` handle `priceDirection === "neutral"` by expressing signal strength directly)
  - `apps/mcp-server/src/__tests__/1328d-conviction-enrichment.test.ts` (10 new tests covering all ACs)

- **Finding**:
  - `scoreSentiment` and `scoreCascade` previously returned flat 0.5 when `priceDirection === "neutral"`. This caused handoff AC1/AC2/AC3 to fail because enriched sentiment/cascade had no price direction to agree with. Fix: when price is neutral, the dimension stands on its own (bullish → above 0.5, bearish → below 0.5). This is semantically correct — if no price move, sentiment/cascade signal is the only directional evidence.
  - WEIGHTS unchanged per PO decision.
  - All 3 new fields are optional — backward compatible (no new fields = identical scores to pre-1328d).

- **Status**: Ready for QA. Commit `22a11f04`. Branch `task/1328d-conviction-enrichment`.

### Task 1328k: threshold-analysis

- **Files**:
  - `scripts/analyze-signal-distribution.ts` (new — read-only analysis script)
  - `docs/data/signal-distribution-report.json` (new — output report)
  - `TASKS.md` (1328k → Review)

- **Finding**:
  - Handoff spec referenced `agent_signals.impact_score` which does not exist as a column. The correct table is `rag_analyses.impact_score` — the only place impact scores are stored. `agent_signals.payload` has a JSON field by that name but is not the canonical source.
  - Bun `import.meta.dir` resolves to `project-root/scripts` (not the physical script path) when invoked via the `apps/mcp-server/scripts → ../../scripts` symlink. Used `resolve(import.meta.dir, "..", "data/docs")` accordingly.
  - Results: 223 signals total (all within 7-day window). Score=7 bucket = 40 signals (17.9%). Critical tickers FPT, VIC, HPG present in bucket 7.
  - PO recommendation: CAUTION — raise to 7.5 rather than 8, since critical tickers are in the suppression zone.

- **Status**: Ready for QA. Commit `422b5134`. Branch `task/1328k-threshold-analysis`.

### Task 1328c: db-migration

- **Files**:
  - `apps/mcp-server/src/infrastructure/db/schema-news.ts` (L92–94: 3 idempotent ALTER TABLE blocks after signal_class column)
  - `apps/mcp-server/src/infrastructure/db/agentSignalStore.ts` (PostSignalInput: 3 new optional fields; postSignal(): hasContextColumns check + full-path INSERT extended to 20 columns)
  - `apps/mcp-server/src/__tests__/1328c-db-migration.test.ts` (6 tests: PRAGMA column check x3, idempotency, INSERT with/without new fields)

- **Finding**:
  - Existing postSignal() uses nested if-branches (hasChainColumns → hasCausalRootColumns → hasSignalClassColumn → hasValidationColumns) for legacy DB compatibility. Added hasContextColumns as innermost branch wrapping the new 20-column INSERT — old-schema DBs fall through to the 17-column path.
  - All 8 pre-existing failures confirmed unrelated (BCTC OCR, SSC pipeline, watchdog — deferred in Sprint 1327).

- **Status**: Ready for QA. Commit `4aa160d8`. Branch `task/1328c-db-migration`.


### Task: Task 1300b: Memory Update Tools
- **Finding**: Agents need update_memory tool
- **Fix**: Implemented append_session_record
- **Status**: Ready for QA

### Task 1329b: wal-sentinel
- **Files**: `apps/mcp-server/src/scheduler/walCheckpointAlert.ts` (two-tier thresholds: 5k WARNING / 10k CRITICAL, replaces 50k single-threshold), `apps/mcp-server/src/infrastructure/db/checkpoint.ts` (added `checkWalFileSize()` — disk size guard, fires WORK alert at >10 MB WARNING / >40 MB CRITICAL), `apps/mcp-server/src/scheduler/jobs.ts` (added `checkWalFileSize` import + call before `runWalCheckpoint`), `apps/mcp-server/src/__tests__/1329b-wal-sentinel.test.ts` (10 new tests)
- **Finding**: `checkpoint.ts` and `jobs.ts` were already committed on this branch by 1329a/1329c parallel sessions. `checkWalFileSize` was inserted into the same file that 1329a already modified — no conflict. walCheckpointAlert.ts was the only file that needed threshold logic change. Pre-existing failure count: 12 on main, 10 on this branch (improvement). Bun 1.3.11 C++ panic is a known OOM issue unrelated to this task.
- **Status**: Ready for QA. Commit `255f8898`. Branch `task/1329b-wal-sentinel`.

### Task 1329g: imf-wire
- **Files**: `apps/mcp-server/src/application/usecases/scanMarket.ts` (import + hoist imfMacroScore before loop + inject into convictionInput), `apps/mcp-server/src/application/usecases/assembleBriefing.ts` (dynamic import + hoist + spread-conditional inject), `apps/mcp-server/src/interface/mcp/tools/portfolio/portfolioTools.ts` (static import + hoist + inject), `apps/mcp-server/src/__tests__/1329b-imf-conviction-dimension.test.ts` (4 new tests in Task 1329g describe)
- **Finding**: Handoff had wrong import path for assembleBriefing.ts — `../../services/` should be `../services/` (assembleBriefing is in application/usecases, bridge is in application/services). Also `exactOptionalPropertyTypes: true` forbids passing `undefined` as a value for optional field — used spread conditional `...(x !== undefined ? { field: x } : {})` pattern. All 8 pre-existing failures confirmed unrelated.
- **Status**: Ready for QA. Commit `7388f427`. Branch `task/1329b-imf-conviction-dimension`.

### Task 1329a: wal-checkpoint-freq
- **Files**: `apps/mcp-server/src/infrastructure/db/checkpoint.ts` (mode param + backupDatabase already in HEAD via 1329c parallel commit), `apps/mcp-server/src/scheduler/jobs.ts` (cron default `0 */6` → `*/30`, mode-aware handler with isOffHours logic), `apps/mcp-server/src/__tests__/1329a-wal-hardening.test.ts` (7 new tests), `apps/mcp-server/src/__tests__/1447-checkpoint-restart-mode.test.ts` (updated 5 calls from old single-arg to `runWalCheckpoint('TRUNCATE', deps)`)
- **Finding**: `checkpoint.ts` and 1329a test file were already committed by the parallel 1329c agent on branch `task/1329b-wal-sentinel`. Task 1329a committed the remaining jobs.ts + 1447 fix in commit `64e6f509`. 8 tests pass, 0 fail. 0 TS errors.
- **Status**: Ready for QA. Commit `64e6f509`. Branch `task/1329b-wal-sentinel`.