# dev-mcp-server -- Notebook

## 2026-07-10 — FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

Root cause (SSH RAW-verify report 3256, 2026-06-19T16:20Z): `freshnessSlaMonitorJob.ts`'s bctc check escalated CRASH/CRITICAL to alert-commander on `financial_reports.parsed_at` age alone, firing a false BCTC P0 every ~2h whenever the queue was legitimately empty (no filings due). Of the 3 BCTC health surfaces in the codebase, this was the only one that never checked live queue-depth/service-state — `vpsHealthPoller.ts` (FIX-BCTC-FRESHNESS-GATE) already gates on `bctc_vps_queue` active-count, and `freshnessSlaChecker.ts` (FIX-BCTC-SLA-THRESHOLD-360) already has calendar-earnings-window awareness — neither of those touches actual runtime state.

Fix: added a generic `PipelineRuntimeState{serviceActive,queueDepth}` gate to `checkSignalSla`/`checkDataFreshnessSla` (`freshnessSlaChecker.ts`, domain/pure) — service-down→CRASH unconditionally; queue-depth=0+service-active→IDLE unconditionally (never a crash, regardless of push-age); queue>0+active→existing age-vs-threshold logic unchanged. New scheduler-side reader `queryBctcPipelineRuntimeState` (`freshnessSlaMonitorJob.ts`) sources queue-depth from `bctc_vps_queue` and service-state from the latest `vps_service_health` row (reuses the existing poll table — no new SSH/systemd probe, matches the task's generic_mandate). Fail-open (`undefined`) on any DB error so environments/tests without the new tables see zero behavior change.

New `FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.test.ts` (19 tests, 3 groups): Group A/B pure-domain DoD cases (idle→IDLE, service-down→CRASH, queue-backlog+stale→CRASH, ungated signals unaffected); Group C scheduler-wiring end-to-end via `runFreshnessSlaMonitor` (idle→no escalation, service-down→escalates CRITICAL, queue-backlog→escalates as before, missing-tables→fail-open/legacy-unchanged). All 19 pass. Targeted SLA/BCTC-health suite (9 pre-existing files, 129 tests) still 129/129 pass, run twice.

Full `bun test` full-suite is flaky in this environment (two runs: 55 fail/3 err then 62 fail/7 err, non-deterministic counts, both end in the known Bun 1.3.13 teardown panic) — grepped every failing test name across both runs: zero overlap with freshnessSla/bctc/vpsHealth; re-ran 3 sampled full-suite-only failures (1113-vps-proxy-health/1146-get-insider-transactions/RAPID-B2-get-market-cap, 35 tests) in isolation → 35/35 pass, confirming pre-existing resource-contention flake, not a regression from this change. tsc clean. Server-boot probe: health 200, toolCount=183 unchanged, boot log confirms "SLA monitor" still registered among the 85 cron keys, `bctc-inspect`/`news-fetch` dashboard routes clean (no circular-dep break).

Commit: pending (this cycle). Board: `ready`→`in_progress`→`review` via orch-apply.sh, `next_agent=qa`.

Zone health: tsc clean, tools=183 unchanged, new test 19/19 + targeted SLA/BCTC suite 129/129 pass (run twice), full-suite flakiness isolated and confirmed pre-existing/unrelated, live server-boot + dashboard probes clean | HEALTHY.

## 2026-07-10 — FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

Live RAW-verify against the named-volume DB found 0 orphans now (10/10 alert_id-tagged `agent_signals` rows resolve, table churns via 2h TTL + `cleanExpired()`) — the 124 historical rows (06-22/23) are long self-expired, unrecoverable to inspect directly. Root-caused via git archaeology instead: `alertStore.ts` `storeAlerts`/`storeAlertsFromCommander` co-write the `agent_signals` correlation row whenever no existing row shares `alert_id` — WITHOUT confirming the paired `INSERT OR IGNORE INTO alerts` actually persisted a row. That insert can silently no-op not only on an `id` (PK) collision but also on the `alerts.fingerprint` UNIQUE-index collision (`idx_alerts_fingerprint`, FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS 06-16). taAlertScanJob/bbAlertScanJob paired a **deterministic** fingerprint with a **random** `crypto.randomUUID()` id pre-06-25 — a repeat fire (same fingerprint) got a fresh id whose `alerts` insert was ignored while the `agent_signals` insert still fired, producing the dangling FK (confirmed by commit `57a781a14`'s own message: "220 rows, +96/day" as of 06-25). That commit already fixed the CALLER side (deterministic id) for those 2 jobs. `e3386bdf` (TASK-CONF-1, confidence-score plumbing only) is unrelated — ruled out as a contributing regression.

Fix applied at the WRITER (defense in depth, not just caller discipline): both `storeAlerts`/`storeAlertsFromCommander` now confirm `SELECT 1 FROM alerts WHERE id = ?` before writing the correlation row — `agent_signals.alert_id` can never dangle regardless of any future caller's id/fingerprint correctness. Added `checkOrphanAgentSignalsAlertId` (D-NEW2, `dataAuditJob.ts`) as an ongoing regression tripwire — the INVERSE of C-08/W-6 `checkOrphanAlerts`.

New `FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID.test.ts` (8 tests, TDD RED→GREEN — RED reproduced the exact dangling-FK defect at the writer level before the fix): fingerprint-collision AC-1/2/3, legit-write AC-4, idempotent-refire AC-5, null-fingerprint callers AC-6, audit-tripwire clean/dirty AC-7/8. Targeted alert suites (FIX-ALERT-ORPHAN-CORRELATION, ta/bb-scan-job, foreign-flow, UUID-MISMATCH, CONFIDENCE-DEFAULT-50, data-audit-job) 110/110 pass. tsc clean. Full `bun test` 14449 pass/40 skip/63 fail/9 errors/1187 files (599s, known Bun 1.3.13 teardown crash) — grepped all failures for alert/signal/orphan/audit: zero matches, confirmed pre-existing/unrelated. toolCount=183 unchanged, scheduler files untouched (no new cron.schedule). Server-boot probe: health 200, `bctc-inspect`/`news-fetch` dashboard routes clean.

Verification-gate caveat (honest, not silently claimed): live re-check of "0 NEW orphans post-deploy" requires an ops rebuild+swap (container swaps are user-gated, not run by this agent) — `rebuild_required: true`. Historical 124 orphans no longer exist to backfill/NULL — self-expired via TTL before this task began; documented here as the answer to fix-spec point 4, not a skipped step.

Commit: pending (this cycle). Board: `in_progress`→`review` via orch-apply.sh, `next_agent=qa`.

Zone health: tsc clean, tools=183 unchanged, new test 8/8 + targeted alert suites 110/110 pass, full-suite flakiness isolated/unrelated, live server-boot + dashboard probes clean, live DB re-verified 0 current orphans | HEALTHY.

## 2026-07-10 — FIX-BCTC-D1-STABILIZE-REPORT-ID → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (router-dispatched, D1 of 7-task FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION decomposition chain — D2/D3 out of scope, backlog pending this task DONE_VERIFIED)

Verified live schema first (not just the architect's cited test-file copies): `financial_reports` DDL lives in `apps/mcp-server/bctc-schema.ts:727-822` (`SQLITE_DDL`), wired via `initFinancialReportsTables` (`schema-financial-reports.ts:28`) → `schema.ts initDatabase()`. Confirmed `UNIQUE(action_code, sort_key)` (line 821) is the live constraint — not the `UNIQUE(action_code, period_year, period_quarter)` some sibling fixtures use for the unrelated `bctc_vps_queue` table.

Root cause: `storeReport()` used `INSERT OR REPLACE INTO financial_reports`, which SQLite resolves any UNIQUE conflict via DELETE-then-INSERT — minting a fresh `randomUUID()` id on every re-parse of the same (action_code, sort_key). `bctc_layout_units`/`bctc_page_zones` (PEK extraction tables) reference `financial_reports.id` via a plain TEXT column, no real FK — a replaced id silently orphans any rows a prior PEK run already wrote.

Fix: rewrote the write as `INSERT INTO financial_reports (...) VALUES (...) ON CONFLICT(action_code, sort_key) DO UPDATE SET <60 cols except id>` — `id` deliberately absent from SET so SQLite never touches it on conflict. Also added a pre-check `SELECT id FROM financial_reports WHERE action_code=? AND sort_key=?` inside `parseBctcReport()` itself, before assembling the returned object, so the in-memory `report.id` handed back to callers stays stable too (not just the DB column) — closes a gap the SQL-only trick alone would leave (architect's full D1 design specified this pre-check).

New `FIX-BCTC-D1-STABILIZE-REPORT-ID.test.ts` (3 tests, 17 assertions): parse #1 captures DB id + net_revenue; parse #2 (same action_code+sort_key, different net_revenue via a modified fixture) asserts DB row id UNCHANGED, in-memory `report.id` UNCHANGED, net_revenue DID update, exactly 1 row exists; 3rd test proves a genuinely different sort_key gets its own distinct id. Grepped every existing caller/test for a double-call-same-key pattern — none exist, zero regression risk to the pre-existing suite.

Full `bun test` hung indefinitely twice in this sandbox (killed both after >10min with near-0% CPU — network-hung, not slow; matches S29's already-filed SPIKE-CI-PERFILE-ISOLATION-FLAKE finding). Switched to `scripts/ci-per-file-isolation.sh` (P=12, canonical per-file isolation runner) — completed all 1184 files: 14286 pass/40 skip/37 fail. Of the 18 non-clean files: 3 rc=137 (my kill after confirmed hangs — re-verified 1, `1294b-bctc-fallback.test.ts`, hangs even standalone with zero contention, unrelated to `storeReport`), 3 rc=132/SIGILL pass-then-crash (matches the S26-S29-documented recurring Bun 1.3.13 teardown crash), 12 genuine fails all in pollNews/Chromium/SSC-breaker/pdf-extractor/RAG files with zero reference to `parseBctcReport`/`storeReport`/`financial_reports`. BCTC/financial-reports-scoped subset (106 files): 1220 pass/0 fail (only the 1 pre-existing-hung file inconclusive). tsc clean. toolCount unchanged (no interface/tool file touched).

`docs/architecture/microservice/mcp-server/usecases.md` updated (application layer changed — doc-review Step 1 rule).

Commit: NOT committed by this agent — router/dev-team commits per explicit task-dispatch instruction (overrides this zone's normal RUN-SOLO direct-commit default for this cycle). Board: `ready`→`review` via orch-apply.sh, `next_agent=qa`.

Zone health: tsc clean, new test 3/3 pass, BCTC/financial-reports-scoped suite 1220/0 fail (106 files), full-suite hang isolated to 1 pre-existing unrelated file (independently re-confirmed hung in total isolation), zero overlap between any genuine failure and this diff's touched files | HEALTHY.
