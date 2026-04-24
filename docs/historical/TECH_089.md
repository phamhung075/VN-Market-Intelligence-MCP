# TECH-089: Fix sector-dedup data bug + parallel test isolation

status: APPROVED_BY_ARCHITECT
req_ref: REQ-089

---

## Brownfield Impact

- Files modified: `mcp.config.json` (1 line removed), 66 test files in `src/__tests__/` (line-1 guard inserted or guard moved)
- Files created: none
- Files deleted: none
- Breaking changes: no — no TypeScript source modified; no production runtime behaviour changed beyond removing duplicate alert fan-out

---

## Architecture Decision

Both fixes are purely data/test-infrastructure changes with zero production TypeScript changes required. FR-1 targets a config-layer duplicate key that bypassed the sector rename cleanup; removing it collapses alert fan-out from 2→1 for DHG/IMP/DMC/TRA/DBD. FR-2 exploits the ES-module hoisting contract: setting `process.env["DB_PATH"]` before the first `import` statement is the only position that guarantees the SQLite singleton picks up `:memory:` during static module evaluation, giving each Bun parallel worker its own isolated DB handle.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|---|---|---|---|
| referenceStocks pharma key | domain (config) | `mcp.config.json` | MODIFY (1 line delete) |
| DB_PATH guard — high-priority targets (11 files) | test infra | `src/__tests__/034,064,102,105,106,122,131,222,278,1115,1255-*.test.ts` | MODIFY |
| DB_PATH guard — remaining 55 DB-touching test files | test infra | `src/__tests__/[see full list below]` | MODIFY |

---

## Task Breakdown

### Task 1300 — pharma key removal (`mcp.config.json`)

**Single atomic change:**

File: `mcp.config.json`
Section: `market.referenceStocks` (around line 75)
Remove: entire line `"pharma": ["DHG", "IMP", "DMC", "TRA", "DBD"],`
Retain: `"pharmaceutical": ["DHG", "IMP", "DMC", "DBD", "PME", "TRA", "OPC"]` untouched

**Do NOT touch:**
- `src/domain/services/sectorPeers.ts` — its `pharma` block (5 tickers) is domain-layer cascade classification, not config. Intentionally kept.
- Any `.ts` source file — task 1300 is config-only.

**Verification:** `bun test src/__tests__/1282-sector-classification-dedup.test.ts` — all 7 tests pass.

---

### Task 1301 — DB_PATH guard sweep (`src/__tests__/`)

**Guard placement rule:** `process.env["DB_PATH"] = ":memory:";` MUST be line 1, before all `import` statements. ES module static imports are hoisted and can trigger `getDb()` at module evaluation time; any later placement (including inside `beforeAll`) is too late.

**closeDb rule:** Every file that calls `initDatabase()` must also call `closeDb()` in `afterAll` or `afterEach`. Verify and add where missing.

#### Exception list (do NOT modify these files)

| File | Reason |
|---|---|
| `137-fix-alert-pipeline.test.ts` | Uses `new Database(":memory:")` directly + per-test `Bun.env["DB_PATH"]` + `closeDb()`. Correct pattern. |
| `167-prediction-market-job.test.ts` | Sets `DB_PATH` to `tmpPath` inside specific test cases. Guard would conflict. |
| `1181-financial-reports-persist.test.ts` | Saves/restores `ORIGINAL_DB_PATH` for real-file test. Leave as-is. |
| `278-kinhdich-allzero-differentiation.test.ts` | Special: MOVE the `process.env["DB_PATH"] = ":memory:"` from inside `beforeAll` to line 1 (before imports). Do not add a duplicate. |

#### Full list of 66 files requiring guard (source: brownfield grep)

All files produced by:
```
grep -rL 'process.env["DB_PATH"] = ":memory:"' src/__tests__/ \
  | xargs grep -l 'infrastructure/db\|initDatabase\|getDb' \
  | grep -v helpers
```

Files confirmed at design time (66 total):

```
001-project-setup.test.ts
024-trading-economics.test.ts
034-telegram-notifier.test.ts          [HIGH PRIORITY]
064-alert-generator.test.ts            [HIGH PRIORITY]
102-job-news-poll.test.ts              [HIGH PRIORITY]
103-job-market-scan.test.ts
105-job-evening-summary.test.ts        [HIGH PRIORITY]
106-intelligence-cycle.test.ts         [HIGH PRIORITY]
122-domain-services.test.ts            [HIGH PRIORITY]
131-alert-quality.test.ts              [HIGH PRIORITY]
137-fix-alert-pipeline.test.ts         [EXCEPTION — do not modify]
167-prediction-market-job.test.ts      [EXCEPTION — do not modify]
172-prediction-briefing.test.ts
179-position-tracking.test.ts
182-portfolio-risk.test.ts
219-custom-alerts.test.ts
222-alert-mute.test.ts                 [HIGH PRIORITY]
226-telegram-report-store.test.ts
227-report-webhook.test.ts
228-read-telegram-reports.test.ts
229-process-telegram-report.test.ts
231-claim-telegram-report.test.ts
233-system-changelog.test.ts
236-alert-mute-merge.test.ts
242-agent-signals.test.ts
243-bond-maturity.test.ts
244-signal-outcome.test.ts
247-cascade-metrics.test.ts
249-ssc-insider.test.ts
265-velocity-store.test.ts
266-signal-integration.test.ts
267-mcp-tool-043.test.ts
269-dav-fetcher.test.ts
271-mcp-tool-044.test.ts
277-sector-comparison-tool.test.ts
278-kinhdich-allzero-differentiation.test.ts  [SPECIAL — move, not add]
283-portfolio-conviction-batch.test.ts
915-broker-credibility.test.ts
1005-superseded-alert-marker.test.ts
1037-reputation-store-ddl-dedup.test.ts
1070-position-ledger.test.ts
1071-telegram-position-commands.test.ts
1072-ask-queue-store.test.ts
1073-telegram-ask-command.test.ts
1074-ask-queue-check-job.test.ts
1076-market-scan-noise-retirement.test.ts
1078-ask-queue-mcp-tools.test.ts
1079-positions-for-analysis-tool.test.ts
1081-sprint-054-smoke.test.ts
1082-market-prices-ohlcv-fallback.test.ts
1100-cron-job-run-store.test.ts
1101-record-job-run-wrapper.test.ts
1102-get-cron-health-tool.test.ts
1104-sprint055-cron-smoke.test.ts
1105-causal-root-tagging.test.ts
1109-agent-work-log-tools.test.ts
1113-vps-proxy-health.test.ts
1115-news-alert-dedup.test.ts          [HIGH PRIORITY]
1116-evidence-fragment-store.test.ts
1121-likelihood-ratio-store.test.ts
1128-calibration-report-job.test.ts
1131-upsert-foreign-flow.test.ts
1136-summary-jobs-observability.test.ts
1137-critical-briefing-observability.test.ts
1138-market-portfolio-observability.test.ts
1139-utility-observability.test.ts
1140-trycatch-replacement-observability.test.ts
1146-get-insider-transactions.test.ts
1154-prediction-resolution-loop.test.ts
1181-financial-reports-persist.test.ts [EXCEPTION — do not modify]
1224-portfolio-risk-ohlcv-fallback.test.ts
1255-alert-off-hours-send.test.ts      [HIGH PRIORITY]
1284-schema-bun-env.test.ts
chain-synthesizer.test.ts
vnstock-3statement.test.ts
```

After subtracting the 3 full exceptions (137, 167, 1181), the net files requiring modification: **63** (62 add guard at line 1 + 1 move from beforeAll to line 1 for 278).

#### Per-file procedure

For each non-exception file:
1. Insert `process.env["DB_PATH"] = ":memory:";` as the very first line of the file (before the file's opening comment block if any — guard must precede all `import` statements at evaluation time).
2. Verify `closeDb()` is called in `afterAll` or `afterEach`. Add if missing.
3. For `278-kinhdich-allzero-differentiation.test.ts`: remove `process.env["DB_PATH"] = ":memory:";` from inside `beforeAll`, add it as line 1. The existing `delete process.env["DB_PATH"]` in cleanup remains valid.

**Note on files that already set DB_PATH but not at line 1** (e.g., `082-tool-watchlist.test.ts` sets it inside `beforeEach`): treat these the same as unguarded files — add the line-1 guard and remove the redundant inner assignment to avoid double-set confusion.

---

## Interface Contracts

No new interfaces. No new domain services. No production TypeScript source files created or modified.

---

## Suggested Task Sequence (dependency order)

| Order | Task | Depends On | Notes |
|---|---|---|---|
| 1 | 1300 — remove pharma key from mcp.config.json | — | Config-only, single line delete |
| 2 | 1301 — DB_PATH guard sweep (high-priority 11 first) | 1300 | Run `bun test` after adding high-priority guards to confirm 22-failure set collapses |
| 3 | 1301 continued — remaining 52 files | step 2 passing | Bulk sweep; verify `closeDb()` in each |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Guard added inside comment block instead of before imports | Medium | High | Developer must insert at line 1 of file content, not inside JSDoc. Verify with `head -1` after each edit. |
| `closeDb()` missing in newly-guarded file — singleton stays open, next test in same worker inherits dirty state | Medium | Medium | Explicitly grep for `closeDb` in each modified file after edit; add to `afterAll` if absent. |
| 278 gets a duplicate guard (one at line 1 + old one in beforeAll) | Low | Low | Explicitly remove beforeAll assignment when adding line-1 guard. |
| New file added to test suite after this sprint without guard | Low | Medium | No automated enforcement yet — acceptable risk for single-user repo. |
| `mcp.config.json` JSON syntax error after pharma line removal | Low | High | Validate with `bun tsc --noEmit` and/or `JSON.parse` check immediately after edit. Trailing-comma check: verify preceding line does not now have a dangling comma. |

---

## Security Review

- SQL parameterized? n/a — no SQL changes
- File paths validated? n/a — no file path changes
- External HTTP rate-limited? n/a — no HTTP changes
- Secrets via Bun.env only? n/a — no secrets touched
