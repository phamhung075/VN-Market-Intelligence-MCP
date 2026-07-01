## Task Report TASK-EVIDENCE-HOP1-MCP

**Sprint:** BA-PREDICTION-EVIDENCE-REVIVAL (hop1) | **Zone:** apps/mcp-server/ | **Specialist:** dev-mcp-server | **Commit:** 24d1a4b5 (15 files)

changed:
- apps/mcp-server/src/interface/mcp/tools/macro/evidenceTools.ts (FR-1.1 — get_evidence_summary hardcoded (bullish,10) LR lookup → direction+horizon-aware, reuses `getLikelihoodRatios`)
- apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts (FR-2.2 — 5th freshness source `readLatestInsiderTimestamp`, `INSIDER_STALE_MS=4d`)
- apps/mcp-server/src/scheduler/cronConfig.ts:62 + apps/mcp-server/src/scheduler/macro/baseRateComputationJob.ts:299 (FR-1.2 — cron weekly→daily + `WEEKLY_CADENCE_MS`→`DAILY_CADENCE_MS`, same commit — RISK-1 coupling closed)
- docs/standards/cron-jobs.md (cadence + watchdog doc update)
- 8 test files (7 existing extended + 1 new `TASK-EVIDENCE-HOP1-MCP-watchdog-insider.test.ts`)

tests: targeted 74 pass / 0 fail (8 touched test files, RAW) | full suite 14025 pass / 64 fail / 4 err (exit non-zero due to known Bun v1.3.13 JIT C++ panic post-run, not a test failure) | tsc: 0 errors | mock-guard: exit 0 PASS

verdict: **APPROVED**

### Verification detail

- **FR-1.1** — diff confirmed: raw hand-rolled `database.prepare(...).get(f.evidence_type, "bullish", 10)` replaced by `getLikelihoodRatios(database, f.evidence_type, f.direction)` (bound params, no new SQL — retires a pre-existing DDD violation per brief). Horizon-selection: prefer shortest horizon with `sample_size>=10` (TRUSTED); else largest-sample row shown UNTRUSTED with real `n` (no interpolation, confirmed no blend/average code path); display now includes `horizon=Nd`. 3 new regression tests in `1124-evidence-tools-phase-bc.test.ts`.
- **FR-2.2** — `readLatestInsiderTimestamp()` mirrors the existing `readLatestPriceTimestamp` try/catch-null pattern; `INSIDER_STALE_MS=4d` added to `stale[]` + Telegram body; alert text explicitly states "NOT a VPS systemd unit... A systemctl restart will not fix this... tracked separately: BACKLOG FIX-VPS-SSC-INSIDER-502" — confirmed observability-only, does not attempt the VPS↔SSC fix. Confirmed `insiderCheckJob.ts`, `leadershipSignal.ts`, `sscInsider.ts`, `vps-proxy-server.js` are NOT in this commit's file list (no scope balloon).
- **FR-1.2 (RISK-1)** — `git show --name-only` confirms `cronConfig.ts` (`'7 19 * * 0'`→`'7 19 * * *'`) AND `baseRateComputationJob.ts` (`WEEKLY_CADENCE_MS`→`DAILY_CADENCE_MS=86_400_000`, feeding `shouldSkipRecoveryReplay`) both landed in commit 24d1a4b5 — both halves of the coupling present in the SAME commit, T4 dedup guard will not silently no-op the upgrade. `docs/standards/cron-jobs.md` updated correctly to daily cadence.
- **Full-suite reconciliation** — 64 fail / 4 err vs dev's claimed "60 pre-existing + Bun panic". Extracted the 21 distinct failing files (083/102/1113/1146/1193/125/1324/1345a/1405b/1518/1821a/1858c/1875c/1892a/1898b/235/251/RAPID-B2/TSU-DEV-U5/VPT-1/_deprecated-1302) — none touch evidenceTools.ts, vpsProxyWatchdogJob.ts, cronConfig.ts, or baseRateComputationJob.ts. Isolation-probed 4 (1146-get-insider-transactions, 1518-get-foreign-flow-ohlcv-source, 1875c-record-signal-outcome-routing, 1898b-rss-degradation-regression) standalone → all GREEN. Confirms full-suite parallel/network flakiness (VPS/news/foreign-flow fetch class, consistent with prior QA cycles 06-30/07-01 documenting 40-65-fail variance run-to-run on this same infra class), NOT a hop1 regression. Bun C++ JIT panic at suite end is the known pre-existing `feedback_restart_masks_bun_jit_corruption` class, not a test failure.
- **DDD/Security** — zero `process.env`, zero secrets/passwords in modified production files; zero hand-rolled SQL remaining in `get_evidence_summary` (only bound-param store call). tsc exit 0. mock-guard exit 0.

### Non-blocking follow-up
`docs/data/cron-registry.json:36` + `system-map.json .project.microservices[mcp-server].crons[baseRateComputation]` still describe the OLD weekly cadence (not in this commit's file list — `docs/standards/cron-jobs.md` was correctly updated). Filed as BACKLOG `FIX-CRON-REGISTRY-BASERATE-CADENCE-DRIFT` (low priority, pure doc-registry text drift, not a code defect).

### Board
`TASK-EVIDENCE-HOP1-MCP`: REVIEW → DONE_VERIFIED via orch-apply.sh, qa_verdict=APPROVED.
