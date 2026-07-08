# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · dev-mcp-server

**Sprint goal:** Systemic remake P1 — root-cause fixes (idle-loops→verif→detector) per 07-04 systemic review.
**Agent:** dev-mcp-server
**Started:** 2026-07-04T00:00:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-04T00:00:00Z
**task-id:** FACTORY-INTERFACE-confidence-score-50-mask
**what-done:** Grepped apps/mcp-server for `confidence_score ?? 50` / `confidenceScore ?? 50` in the /api/signals/stock handler — zero matches. stockSignalsHandler.ts:224 already reads `row.confidence_score ?? null` (FIX-SIGNAL-CONFIDENCE-DEFAULT-50 marker present in comments).
**what-considered:**
- Assume stale detector output and implement anyway (rejected — would fabricate a diff on already-correct code)
- Search for a second/older stock-signals route that might still carry the mask (none found — server.ts:1359 has exactly one `/api/signals/stock/:code` route, delegating to this same handler)
- Verify via git history that the mask was already removed (confirmed: commit e3386bdfa "TASK-CONF-1 remove DEFAULT-50 confidence mask")
**why-decision:** Code, tests, and git history all converge on: this exact mask was fixed by a prior task (FIX-SIGNAL-CONFIDENCE-DEFAULT-50 / TASK-CONF-1). Editing would be a no-op diff or risk introducing churn on a correct file.
**why-change:** No implementation change made — reporting NO-CHANGE-NEEDED per detection-never-ran ≠ failed-fix policy. Ran scratch behavior-proof (absent confidence_score → null) + existing regression suite (47 pass) + `bun tsc --noEmit` (exit 0) to confirm current state is honest, not to fix a live bug.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-07T17:50:00Z
**task-id:** CI-RED-c5b5f885-FIX
**what-done:** Pulled real GH Actions logs (run 28689707086 + 2 prior runs) — 1410-tool-diacritics-sweep.test.ts failed 3/3, 262-mcp-tools-042.test.ts 2/3. Both call getClimateRiskSignals/getEnergyGridStatus with no DI, hitting real network (weatherVn/hydrologicalData fetchers, 15s axios timeout > bun-test 5s default) under CI's 16-way parallel isolation. Mocked both fetcher modules (freeze-before-mock + afterAll-restore pattern, matched 1355b precedent); un-skipped 262's 2 previously-flaky energy tests. Verified isolation + together-with-siblings (257/258/259, both orders) + full-suite via ci-per-file-isolation.sh (no regression vs before-fix baseline). Committed 1efb6f918, pushed; CI run 28886901289 = success (bun test job = success).
**what-considered:**
- `.it.skip` both flaky cases (matches existing 262 precedent) — rejected as incomplete: doesn't cover 1410's real culprit, leaves 262 cases 1-3 (weatherVn) still real-network-flaky
- Add httpClient DI param to climateTools/energyTools (broader prod-code refactor) — rejected: out of "minimal targeted fix" scope, touches interface layer unnecessarily
- mock.module() the 2 fetcher modules in both test files, un-skip 262's dead tests — chosen: root-causes both files, matches repo's own established mock.module + afterAll-restore convention, zero prod-code touched
**why-decision:** Empirically probed (scratch reproduction) that mock.module() must precede the static climateTools/energyTools import and that afterAll-restore needs a value-copy (not a live import-binding alias) to actually protect sibling files — verified both hold before applying to the real files.
**why-change:** 183-alert-accuracy.test.ts (failed 1/3 runs) is unrelated (no network dep) — left untouched, out of scope. Local plain `bun test` (bare, no isolation) surfaced ~62 unrelated fails + a Bun-engine crash; disregarded as non-authoritative per the isolation script's own "NEVER bare bun test" comment and its scope leak into src/_deprecated/ — used ci-per-file-isolation.sh (CI's actual mechanism) as the real gate instead.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-07-07T18:20:00Z
**task-id:** DATA-BACKFILL-PRICES-20260706-MONDAY-GAP
**what-done:** Backfilled all-ticker 2026-07-06 daily_ohlcv gap (Cloudflare Tunnel outage). Standard recovery (INSERT ohlcv_backfill_queue trigger, precedent c94b58da4, row id=559) confirmed BROKEN: VPS poller calls /api/ohlcv-backfill-done repeatedly with zero /api/push-ohlcv-history calls in container's entire uptime — VPS-side script not executing (separate infra defect, flagged to bug channel, out of zone to fix). Diagnostic probe found direct VNDirect fetch from inside the mcp-server container itself succeeds now (stale "geo-blocked" comment in ohlcvHistoryBackfillJob.ts no longer holds) — wrote scripts/migrations/backfill-ohlcv-gap-2026-07-06.ts, reusing writeOhlcvBatch SSOT path, targeting the 583 codes with real rows on 07-03+07-07 but missing 07-06, plus VNINDEX via vnmarket_prices. Ran --apply: 585 rows written, 0 fabricated, 6 transient SQLITE_BUSY retried clean.
**what-considered:**
- Wait for VPS systemd timer (30 min cadence) to self-heal — rejected: proved broken via log evidence (0 push-ohlcv-history lines), would spin forever
- Use priceBackfillService.backfillPrices() — rejected: fetchOhlcvData() inside it is an explicit Math.random() mock/stub, would fabricate data (NO FAKE DATA violation)
- Direct VNDirect fetch + SSOT write reusing ohlcvWriteService.writeOhlcvBatch (chosen) — real data, zero duplicated write/normalization logic, idempotent backfill conflictStrategy
**why-decision:** Live curl probe from the container proved VNDirect reachable + per-ticker + accurate before writing any code; verified against VCB/FPT/HPG/VNM/VIC (distinct, plausible, non-duplicate values) before declaring done.
**why-change:** Plan assumed VPS-queue mechanism would work (matches all prior precedent) — pivoted after log evidence showed it silently non-functional; this is a genuinely new, separate finding from INFRA-CLOUDFLARE-TUNNEL-OUTAGE-ROOT-CAUSE.

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-07-07T20:00:00Z
**task-id:** KD-OBS-01-FIX
**what-done:** Confirmed 5 kinhDichTools.ts catches + 3 kinh-dich route handlers (reading/signals/market) caught genuine DB/HTTP errors with logger-only, no Telegram. New `kinhDichErrorNotify.ts` (`notifyKinhDichError`, dynamic-import `sendTelegramBug`, non-fatal, 📋-category dedup reuses sendTelegramBug's built-in 4h window) wired via injectable `notifyError` param (defaults real) into all 8 catch blocks. Left `appendMarketHexagram`/`appendStockHexagram` (marketTools.ts) untouched — genuinely benign "service unreachable, omit block" by design, not silent-drop.
**what-considered:**
- mock.module() the telegram/HTTP-client modules for full integration coverage of all 5 tool catches — rejected: worker-scoped mock.module leak risk (flagged precedent in this repo); found a zero-mock deterministic trigger instead (DB_PATH→directory forces getDb() throw on the initDatabase() call every tool hits first)
- Thread deps through registerKinhDichTools/handlers via a broader deps object — rejected: single optional trailing param (matches accuracyDigestJob.ts/handleForeignFlow precedent) is minimal and non-breaking (2 real call sites, both grepped)
- Route to sendTelegramWork vs sendTelegramBug — chose BUG: every existing genuine-error precedent in this codebase (ohlcvBackfillHandler, tasksMdJanitorJob, bctcPdfPullJob, etc.) uses BUG; WORK is reserved for routine business content
**why-decision:** New KD-OBS-01-FIX-kinhdich-bug-notify.test.ts (11 tests, 43 expect) proves the wiring end-to-end per catch block via injected spy + deterministic DB-path-is-a-directory trigger — no reliance on live kinh-dich-service state.
**why-change:** No plan deviation. Targeted suite (kinh-dich + registry, 197/197) + full `bun test` (14290/14393, 63 pre-existing fails matching 2026-07-03 documented baseline, none kinh-dich-related) + tsc clean + server boot (toolCount=183 unchanged, health 200, dashboard route 200) all green.

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-07-08T01:35:00Z
**task-id:** CI-RED-0d28104a-FIX
**what-done:** Mocked hydrologicalData.js/fetchReservoirLevels in DSI-S3-sector-fin.test.ts (freeze-before-mock + afterAll-restore, copied verbatim from proven 1efb6f918 pattern) — 3rd recurrence of the same live-network-races-5s-timeout class, root cause confirmed via `gh run view 28910244855 --log-failed` on the exact commit 0d28104ac named in the task.
**what-considered:**
- Inject an HttpClient param through getEnergyGridStatus for full DI — rejected: larger surface change than task scope; precedent 1efb6f918 already established mock.module as the accepted fix shape for this exact class
- Mock at energyTools.js boundary instead of hydrologicalData.js — rejected: precedent mocks one level down (the fetcher), keeps getEnergyGridStatus's own reservoir-aggregation/estimate-labelling logic genuinely under test
- Fix 257/258 too (task's sweep instruction) — investigated first: both always pass an injected client to the fetcher, never reach the live-network branch, so mocking them would be a no-op; journaled as verified-out-of-scope, not silently skipped
**why-decision:** `gh run view --log-failed` on the actual failing CI run (not a guess) named DSI-S3-sector-fin.test.ts as the sole failed file; `scripts/ci-per-file-isolation.sh 16` (CI's real mechanism) re-run post-fix shows it absent from the 12 remaining (pre-existing, unrelated pollNews/RSS) FAILED FILES.
**why-change:** No plan deviation — task instructions matched the codebase's own established precedent exactly; only genuinely new finding was confirming 257/258 don't need the fix (DI already present), which the task asked to explicitly decide either way.

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-07-08T02:53:00Z
**task-id:** FACTORY-INTERFACE-sequential-confidence-05-mask
**what-done:** `sequential-market-analysis.ts:170` `result.confidence = input.confidence ?? 0.5` → only assigns when `input.confidence !== undefined`; init default changed `confidence: 0` → `undefined`; type `number` → `number | undefined`. Also fixed `generateRecommendations` mislabeling undefined confidence as "Low confidence" (same fabrication class one call deeper).
**what-considered:**
- Verified `AnalysisResult`/`confidence` is genuinely internal — `handle()` only returns `{status,thought,progress,nextSteps}`, never the result object; DoD's "served payload" language doesn't map to a live HTTP surface for this field today
- To make the fix testable added `_analysisState` (Map) as a test/introspection-only property on the returned tool object — additive, not consumed by `registerSequentialMarketAnalysisTools`/MCP SDK, zero risk to the real contract
- Leave prior real confidence intact if a later revision's hypothesis omits confidence (vs resetting to undefined) — matches "never fabricate," a real stated value shouldn't be nulled just because a later message didn't restate it
**why-decision:** DoD requires proof that omitted confidence stays undefined/null and unchanged-when-supplied; `_analysisState` introspection is the only way to observe this given the current return contract, so it's the minimal safe path to a real (non-vacuous) test.
**why-change:** Widened 1L beyond the literal "line ~170" pointer to also fix `generateRecommendations`'s undefined-confidence branch — same fabrication bug, same file/function, required for `number | undefined` to type-check cleanly anyway (exactOptionalPropertyTypes).

### STEP dev-mcp-server-S7 · dev-mcp-server · 2026-07-08T04:30:00Z
**task-id:** FACTORY-INTERFACE-source-confidence-10-mask
**what-done:** `finalizeBctcRefineTool.ts:398 row.source_confidence ?? 1.0` — investigated ground-truth first: `parseRefinedMarkdown` always computes a REAL per-row confidence (never absent), and existing `DV-HC-SC` suite + live DB (0.1×380, 0.4×2 rows found) already prove real values persist unchanged — the `?? 1.0` branch was provably unreachable dead code, not an active mask. Hardened anyway per required discipline: typed local row-shape `source_confidence` honestly as `number | undefined`, extracted INSERT-boundary resolution into exported `resolveSourceConfidence()` (propagates real value incl. edge-case 0/1.0 unchanged; falls to schema default 1.0 ONLY when genuinely undefined, NOT NULL preserved).
**what-considered:**
- Make the column nullable to let `undefined` flow straight to SQLite — rejected: explicit hard constraint in task, would relocate the mask into a different failure mode
- Skip the task as NO-CHANGE-NEEDED (mirrors S1 precedent) — rejected: unlike S1 (mask already provably removed by a NAMED prior commit), here the `??` literally still exists in the diff; the correct move is to hardstructurally close the anti-pattern + document the finding, not silently no-op
- Reproduce the "parser-absent" case through the real pipeline for an end-to-end test — rejected: parser genuinely never omits it (by design), so this would require fabricating an artificial parser defect; tested `resolveSourceConfidence`'s own honest `number|undefined` boundary directly instead
**why-decision:** DoD requires test coverage for BOTH "parser-provided" and "parser-absent → documented fallback" — only achievable by giving the resolver its own honest optional-typed unit boundary, since the full pipeline cannot produce the absent case today.
**why-change:** RAW-verify finding differs from the sibling's premise: current live DB rows already show non-1.0 confidence (0.1/0.4) even under the OLD pre-fix code — documented explicitly rather than claimed as "fixed a live bug," per no-fabrication policy. tsc clean; targeted+adjacent (HC-human-confirm/AR-parser-dv/W2-ROW-REPAIR/FU-5b/BANK-AWARE-1/FU-6f + new file) 167/167 pass; full `bun test` 14312 pass/58 fail/3 errors/1177 files (fail set = pre-existing VPS-push/RSS/insider/foreign-flow network-flaky class, zero overlap with changed files, matches S6's documented baseline). Image rebuilt (35c8117c1f85) but NOT swapped (still 180382145ee7) — ops-gated.
