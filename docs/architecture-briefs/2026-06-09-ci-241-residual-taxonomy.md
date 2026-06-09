# CI-RED-RECONCILE — 241-Residual Failure Taxonomy (SUPERSEDES 629-era)

**Date:** 2026-06-09 (TUESDAY)
**Task:** RE-PROFILE-CI-241-RESIDUAL (SPIKE, architect, 120m)
**Baseline:** sha 91afe344, CI run 27185729719, bun job 80254121788
**Verdict:** 241 fail + 0 errors / Ran 11817 tests across 1037 files
**Status:** 629-era taxonomy (C1 mock-contam DONE, C2 symlink DONE, C5 reuters DONE) is RETIRED. This brief is the new SSOT.
**Cluster-6 schema-drift:** PARKED per standing decision — not revisited here.

---

## Cluster Table

| ID | Label | Count | Error Signature | Root-Cause | Prod-Risk | Attack Score |
|---|---|---|---|---|---|---|
| **C1** | MACRO_INJECT_SEAM | 71 | `expect(text).toContain("[Commodity Prices]")` / `toContain("[Dinh Gia]")` — section headers missing | `macroTools.ts registerMacroTools()` no longer accepts `_testSbvClient` / `_testCommodityClient` / `_testDinhGiaInputs` injection seams; tests still pass obsolete params; tool output sections not rendered | **HIGH** — `get_macro_snapshot` is a live production tool | 17.8 |
| **C2** | UNDEFINED_GETMARKETMESSAGEDIGEST | 21 | `TypeError: getMarketMessageDigest is not a function (undefined)` | Functions ARE implemented in `marketMessageStore.ts` (lines 239+, 349+). Test uses `require()` CJS interop on ESM module — Bun ESM/CJS boundary causes named exports to appear as `undefined` | **LOW** — test-only interop bug; functions exist in prod | 21.0 |
| **C3** | DB_SINGLETON_SIGNAL_OUTCOMES | 43 | `expect(row?.predicted_direction).toBe('BEARISH') → Received: undefined`; `getAccuracyStats` returns null; `resolveSignalOutcomes` row stays "pending" | `signal_outcomes`, `evidence_scores`, `prediction_claims` tables wiped by DB singleton pollution — one or more earlier test files call `closeDb()` without `initDatabase()` reinit, destroying the shared `:memory:` DB before evidence/signal test files run | **MEDIUM** — tables are prod tables; failure pattern is test isolation, not logic | 21.5 |
| **C4** | KINH_DICH_DIACRITICS | 24 | `toContain('Quẻ')` / `toContain('Tín hiệu:')` fail; `explain_hexagram` missing judgment/image/trading-context sections | `kinhDichTools.ts` uses ASCII fallback strings at lines 734, 1008, 1032, 1033, 1035, 1038 instead of UTF-8 Vietnamese diacritics; `explain_hexagram` handler missing required output sections | **LOW** — cosmetic output format; no logic correctness risk | 24.0 |
| **C5** | FILE_FIXTURE_ASSERTIONS | 12 | `schedulerFileCount === 43` fails; `cowork-schedule.json` lacks `policy_id`; `orch-state.json` v3 field missing; `docker-compose.yml` no named volume; `ttl_seconds: 180` not in cowork-team `main.md` | Config/fixture files evolved without syncing test assertions: scheduler file count changed, cowork-schedule schema evolved, orch-state v3 field not present, docker-compose diverged | **LOW** — test-only file-content guards | 12.0 |
| **C6** | FOREIGN_FLOW | 12 | `get_foreign_flow` returns "insufficient data" or "no data" when test seeds rows; `MSG-1 get_market_foreign_flow` returns no-data message | `daily_ohlcv` foreign-flow columns missing in test DB after singleton pollution, OR `get_foreign_flow` / `get_market_foreign_flow` tool logic changed without test update | **MEDIUM** — both tools are live production tools | 6.0 |
| **C7** | RAG_HTTP_CLIENT | 12 | `Expected promise that rejects / Received promise that resolved`; `entry_id 'my-entry-id' → Received 'mock'`; `AbortSignal.timeout` not set | `ragHttpClient.ts` refactored — `globalThis.fetch` mock injection no longer intercepts the actual call path (ESM module identity changed), or response shape changed from `{entry_id, ...}` to `{status: "ok", ...}` | **LOW-MEDIUM** — test-only mock break; prod RAG client likely functional | 6.0 |
| **C8** | CONVICTION_ALERTS | 8 | Conviction debounce table missing; `bbAlertScanJob` count != 3; `notifyTelegramAlert` severity gate not suppressing correctly | `conviction_debounce` table lost to DB singleton pollution; `bbAlertScanJob` logic or test fixture changed; `notifyTelegramAlert` severity routing refactored | **MEDIUM** — Telegram alerts and Bollinger Band scanner are production features | 4.0 |
| **C9** | MISC_ASSERTION_TIMEOUT | 38 | Mix: 3 x 5s timeouts (`FIX-H` insider, `FIX-A` company-profile — network calls without CI skip guard); `Task 235` `send_telegram` returns `true` not msgId `999`; `newsHeadlinesRefreshJob` E2E assertion changed; `1407b` SLA breach count off; `Bug1-pdfs` index.ts path refactored; `BCTC VCB hotfix` parser assertion drift; 16 other individual assertion drifts | Multiple independent causes across ~20 test files. Key sub-groups: (a) 3 network-timeout tests need `if (process.env.CI) return` guard; (b) `send_telegram` return type changed; (c) `newsHeadlinesRefreshJob` URL or fetch path changed; (d) individual test assertions not updated after prod refactors | **MIXED** — some expose prod behavior change (235, newsHeadlines), most are test-only | 19.0 |

**Total: 241**

---

## Summary Note on Cluster Sizes vs 629-era

The old 629-era C3 (~159 ASSERTION/LOGIC) and C4 (~21 UNDEFINED-FN) have SHIFTED:
- Old C4 (UNDEFINED-FN `getMarketMessageDigest` ~21): **CONFIRMED at 21** — function is now implemented but the test uses broken `require()` CJS interop.
- Old C3 (~159 ASSERTION/LOGIC): Now split across **C1** (71, macro seam), **C3** (43, DB singleton), **C4** (24, diacritics), **C7** (12, RAG mock), **C8** (8, conviction), and fragments of **C9** (38 misc).
- The unmasking of previously-hidden failures (Clusters 1+2 done = 388 fewer crashes) exposed the full 241.

---

## Ranked Attack Order (size × inverse-prod-risk)

| Attack Rank | Cluster | Score | Count | Owner Zone | Why First |
|---|---|---|---|---|---|
| **1** | **C3** DB_SINGLETON_SIGNAL_OUTCOMES | 21.5 | **43** | `apps/mcp-server/src/__tests__/` | Largest low-cost group — test isolation fix only (afterAll reinit), zero prod code changes |
| **2** | **C4** KINH_DICH_DIACRITICS | 24.0 | **24** | `apps/mcp-server/src/interface/mcp/tools/` | Pure LOW-risk; string constant fixes in `kinhDichTools.ts` + add missing sections to `explain_hexagram` |
| **3** | **C2** UNDEFINED_GETMARKETMESSAGEDIGEST | 21.0 | **21** | `apps/mcp-server/src/__tests__/` | LOW risk, single test file; change `require()` to `import()` or static import |
| **4** | **C9** MISC_ASSERTION_TIMEOUT | 19.0 | **38** | `apps/mcp-server/src/__tests__/` | MIXED; sub-group (a) network-timeout guard = trivial; (b-d) assertion updates = moderate |
| **5** | **C5** FILE_FIXTURE_ASSERTIONS | 12.0 | **12** | `apps/mcp-server/src/__tests__/` + config files | LOW risk; sync expected values to current fixture state |
| **6** | **C1** MACRO_INJECT_SEAM | 17.8 | **71** | `apps/mcp-server/src/interface/mcp/tools/macro/` | HIGH prod-risk lowers rank; requires understanding new seam API in macroTools.ts |
| **7** | **C6** FOREIGN_FLOW | 6.0 | **12** | `apps/mcp-server/src/__tests__/` | MEDIUM risk; may need singleton fix + tool logic audit |
| **8** | **C7** RAG_HTTP_CLIENT | 6.0 | **12** | `apps/mcp-server/src/__tests__/` | LOW-MEDIUM; update fetch mock pattern |
| **9** | **C8** CONVICTION_ALERTS | 4.0 | **8** | `apps/mcp-server/src/__tests__/` | MEDIUM; requires DB singleton + alert routing investigation |

**Recommended first attack:** C3 (43 fails, test-only isolation fix, MEDIUM prod-risk tables but zero prod code touch). Pattern identical to P7 fix — identify which test files call `closeDb()` before `signal_outcomes` / `evidence_scores` / `prediction_claims` tests run; add `afterAll(async () => { closeDb(); await initDatabase(); })`.

**Second attack:** C4 (24 fails, single file `kinhDichTools.ts`, purely cosmetic string corrections).

---

## Recurring-Bug Guard

**C1 MACRO_INJECT_SEAM flag:** `macroTools.ts` has removed injection seams for test isolation AND has output section format issues (missing `[Commodity Prices]`, `[Dinh Gia — Asset Valuation]`). This is the **second** major CI failure event rooted in `macroTools.ts` (old Class A from CI-TEST-ISOLATION-SPIKE also targeted this file). Two failure cycles in the same module triggers the recurring-bug escalation rule: **dispatch a dedicated SPIKE for `macroTools.ts` before treating C1 as a simple assertion fix.** The spike should pin whether: (a) seam removal was intentional and tests need new injection approach, or (b) the tool output sections were accidentally removed. Assigning to architect for a deeper SPIKE before dev touches C1.

---

## Representative Test Files per Cluster

| Cluster | Key Test File(s) |
|---|---|
| C1 | `apps/mcp-server/src/__tests__/089-tool-macro.test.ts`, `025-yahoo-finance.test.ts`, `028-sbv-rates.test.ts`, `1423a/d/e/f.test.ts`, `1426c-dinh-gia-integration.test.ts` |
| C2 | `apps/mcp-server/src/__tests__/1168-market-message-digest.test.ts` |
| C3 | `apps/mcp-server/src/__tests__/1124-evidence-tools.test.ts`, `1129-calibration-report.test.ts`, `1173-accuracy-report.test.ts`, signal-outcome tests |
| C4 | `apps/mcp-server/src/__tests__/285-kinh-dich.test.ts`, `1414-kinhDichTools-diacritics.test.ts`, `1416-diacritics-wave5.test.ts` |
| C5 | `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts`, `cron-registry.test.ts`, `1837a.test.ts`, `1839b.test.ts` |
| C6 | `apps/mcp-server/src/__tests__/1134-foreign-flow.test.ts`, `MSG-1-foreign-flow.test.ts`, `1503-writeForeignFlow.test.ts` |
| C7 | `apps/mcp-server/src/__tests__/ddd-1b-rag-http-client.test.ts`, `FA-FIX.test.ts`, `P2-F-G5b.test.ts` |
| C8 | `apps/mcp-server/src/__tests__/1792-conviction-debounce.test.ts`, `1309-bbAlert.test.ts`, `1328e-notify-alert.test.ts` |
| C9 | `apps/mcp-server/src/__tests__/FIX-H*.test.ts`, `FIX-A*.test.ts`, `235-send-telegram.test.ts`, `1407b-sla-market-hours.test.ts`, `newsHeadlines*.test.ts`, 16+ others |

---

## Source Verification

- Pulled from: `gh run view --job=80254121788 --log`
- Unique fail extraction: Python dedup on test-description strings (strip `[Xms]` timing suffix, strip timestamps)
- Spurious fragment excluded: `"with the correct implementation."` (CI log artifact, not a test name)
- Count: 242 raw unique strings → 241 real tests (1 spurious excluded) = matches bun summary line `241 fail`

---

## NOT In Scope

- Cluster-6 schema-drift: PARKED per standing decision (P4–P8 exhausted). Not reopened.
- Green tests (11534 pass): not analyzed.
- `0 errors` line: no native thrown errors this baseline. All 241 are test assertion failures or TypeErrors thrown within test bodies.
