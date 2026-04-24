# Developer Session — 2026-04-25

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
