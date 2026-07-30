# dev-mcp-server -- Notebook

## 2026-07-30 — FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD (BOUNDED-1 auto-pickup, found by own prior SPIKE) → REVIEW, next_agent=qa

**Session:** 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae. Mirrored `FIX-BASE-RATE-COMPUTATION-CRON-DEAD` exactly (same defect class, precedent explicitly named in the row): `runBctcReparseWithDb` (`startupHelpers.ts`) double-wrapped `recordJobRun` — its default `fn` discarded `runBctcReparseJob()`'s real `ReparseRunResult` (`Promise<void>`, RAW-confirmed live 100% NULL `rows_written` across ~90 sampled rows) AND had no guard of its own, so a guard-skipped inner invocation still wrote a fresh `'success'` row, re-arming its own 21.6h window (best-supported explanation for the 2026-07-10 incident ops "fixed" by falsifying `cron_job_runs` timestamps).

**AC-1/2:** added `shouldSkipRecoveryReplay(db,'bctcReparseJob',86400000)` BEFORE `recordJobRun`; default `fn` now calls `runBctcReparseJob({ db })` mapping `resolved+failed → rowsWritten`. Passing `{ db }` has a second effect: it makes `runBctcReparseJob`'s own trailing `if(!options.db)` self-record block a no-op — kills the 2nd `recordJobRun` call on real runs WITHOUT editing `bctcReparseJob.ts` at all (file-touch footprint identical to the base-rate precedent: 2 src files + 1 test file).

**AC-3:** `startScheduler.ts`'s unconditional 30s-post-boot catch-up now gated by `shouldRunCatchup(db,'bctcReparseJob',2,30,now,false)` (02:30 UTC = 09:30 ICT, matches `CRONS.bctcReparseJob`'s `Asia/Ho_Chi_Minh` registration) — same pattern as the other 6 hardened catch-ups in that file.

**AC-4:** new `FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD.test.ts`, 13 tests incl. explicit T4b (2 back-to-back invocations within cadence window → exactly 1 row). Deliberately kept the mapping-mechanism proof (T6b) to a controlled `fn` rather than exercising the real `reparseSingle`/`makeProductionDeps` pipeline — matches the precedent's own T6 scope (pure-SQL core, no dynamic app/infra imports), avoiding new flakiness the precedent didn't have either.

**AC-5 (deferred, not silently dropped):** RAW-verify of post-fix production rows-per-day requires ≥1 real day of cron history AFTER this fix is deployed — does not exist yet (code not rebuilt/deployed). Documented as the standing follow-up for whoever verifies post-deploy.

**Evidence:** `bun tsc --noEmit` clean. Targeted regression (9 files incl. 1019/1068/1196/1945d/1420/1915/FACTORY-SCHEDULER/FIX-BASE-RATE-COMPUTATION-CRON-DEAD + new file): 114/114 pass. tool/cron probes unchanged (184/88). Full `bun test`: 14906 pass/40 skip/58 fail/1 error (566.6s) — within the standing pre-existing-flake band (52-59 this sprint); grep-confirmed zero of the 58 named fails reference `bctcReparse`/`startupHelpers`/`startScheduler`/`cron_job_runs`, and the new test file's own section in the full-suite log shows all 13 passing inline.

Zone health: tsc clean, file-touch footprint matches precedent exactly (no invented approach), full-suite fail-set keyword-scanned clean, AC-5 explicitly deferred (not fabricated) pending real deploy+monitor cycle | HEALTHY.

## 2026-07-30 — FU-CNYVND-DEAD-FIELD-REMOVE (BOUNDED-1 auto-pickup, P3) → NOT PROCEEDED, escalate to architect/po

**Session:** 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae. AC required re-confirming zero-live-readers before removing `cny_vnd_rate` (col + field). Re-check found a live reader the original finding missed: `apps/macro-indicators` (separate Go service, container `Up 17h healthy`) reads the SAME `market.db` directly — `SJCGoldFXAdapter.fetchSJCFXInputsFromDB` (`adapters_vmt_sjc_fx.go`) runs `SELECT gold_usd_per_oz, usd_vnd_rate, dxy, cny_vnd_rate, fetched_at FROM commodity_prices WHERE source='yahoo'` — plumbed end-to-end through `BuildFXCoupling`→`FXCoupling.CNYVNDRate` (json `cny_vnd_rate`) into mcp-server's OWN registered `get_vn_liquidity_state` tool (`registry.ts:262`, tool #168, live), whose `FXCouplingSchema` (`liquidityStateTools.ts:53`) requires `cny_vnd_rate: z.number()`. This IS a `get_*` tool surfacing the field — the exact condition the original finding claimed absent.

**Live-curled** `/liquidity-state` on the running `macro-indicators` container: real response includes `"fx_coupling":{"usd_vnd_center":26110,"dxy":99.974,"cny_vnd_rate":0,"is_estimate":false,...}` — same row/scan as the live, legitimately-populated `dxy` value.

**Blast-radius if removed anyway:** the Go adapter reads all 4 columns in ONE `Scan()`; a dropped column → `no such column` SQL error → the fail-closed code path (lines 126-144) zeroes the WHOLE row, not just `cny_vnd_rate` — collaterally killing the currently-live `gold_usd_per_oz`/`usd_vnd_rate`/`dxy` fields too. Column removal is NOT a zero-consumer-break change as scoped.

**Disposition:** stopped per the task's own escape-hatch AC ("do not remove if you find a live consumer... stop and report"). Zero code/schema changes made. No REVIEW flip — DJ-GATE-1 entry written (sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md S31) documenting the finding, but this is a report-back, not a completed fix. Needs an architect/PO call: repoint to a real CNY/VND source (both this table AND the macro-indicators consumer), OR formalize `cny_vnd_rate` as a permanently-`0`/`is_estimate` cross-service field with an explicit honesty annotation (matches the DSI-INV-1 pattern already used for the TS-layer `cnyVndRate: null`), rather than removing a column a live cross-service SQL query depends on.

Zone health: no code touched this cycle (verification-only), tsc/tool/scheduler counts unaffected by construction | HEALTHY.

## 2026-07-30 — CCATO-MCP-T1-DOMAIN-ENGINE (Ready-Lane Consumer, P0, epic SPRINT-CCATO-TRUTHGATE-MCP-NATIVE) → REVIEW, next_agent=qa

**Session:** 64c7c677-0f0f-4cee-a3ce-dba79d70b7ae. Spec: `docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md` §3.2/§5.1 (T1 of 8, depends: none). Port the pure scan/classify/quarter-resolve engine from `scripts/narrative-truth-gate.sh` (python) into `apps/mcp-server/src/domain/services/narrativeTruthGate/` (TS), zero I/O.

**New files:** `claimCandidateScanner.ts` (scanClaimCandidates/findTickers/splitParagraphs/splitSentences — byte-faithful port of script L144-163+280-323, incl. the ≤1-candidate-per-(paragraph,dimension) dedup ordering quirk), `verdictClassifier.ts` (classifyVerdict/flattenText/summarizeVerdict — port of L251-278), `quarterResolver.ts` (resolveLatestElapsedYoyPeriods — port of L236-247, injectable `now: Date`, Jan-Mar rolls back to prior-year Q4).

**§5.1 hard AC (side-by-side fixture parity):** new `CCATO-MCP-T1-DOMAIN-ENGINE.test.ts`, 28 tests. Spins up a local `Bun.serve` MCP-gateway stub (fixed non-null response forces every candidate to FAIL so `claim_text` is recoverable from stdout), spawns the REAL unmodified `scripts/narrative-truth-gate.sh` (`NTG_SKIP_SIGNAL_EMIT=1` — no orch-state write, no jq dep) against the REAL `docs/social/fb-post-2026-06-30.md` + `docs/data/claim-tool-map.json`, parses its `[FAIL]` lines, asserts IDENTICAL dimension/ticker_or_dim/claim_text triples vs. the new TS scanner on the same 2 files. Passed first run — no JS/python regex divergence on this fixture (R-1 closed empirically).

**Evidence:** `bun tsc --noEmit` clean. New test file 28/28 pass. Full `bun test`: 14946-14947 pass/40 skip/52-53 fail (566s) — within the standing pre-existing-flake band (52-59); grep-confirmed zero named fails reference `narrativeTruthGate`/CCATO/scanner/classifier/resolver (zero existing files touched — pure addition, regression structurally impossible). Tool/scheduler probes unchanged (184/88 — T1 registers no MCP tool, that's T6). Server boot log: clean import, `toolCount:184`, before an unrelated pre-existing :3000 port conflict (environment artifact). `domain-model.md`+`testing.md` updated (doc-review).

Zone health: tsc clean, new-file-only diff, full-suite fail-set keyword-scanned clean, §5.1 parity ran against the real bash engine not a hand-derived fixture | HEALTHY.
