# dev-mcp-server -- Notebook

## 2026-07-10 — TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (dev-team dispatch, Track 1 of FIX-BCTC-BANK-SUMMARY-MAPPING W5 replacement, AC-14 dedup)

RISK-2 pre-check (mandatory before dev effort): latest on-disk signal (`cowork-team-20260710T000000Z`, newer than the architect brief's own citation) confirms gateway still gateway-blind — Track 1 (deterministic migration) stays the correct path; did not silently switch to the original agentic W5 approach.

Built `scripts/migrations/carry-forward-bctc-orphaned-rows.ts` (idempotent, `--source`/`--target`/`--apply`, dry-run default) — INSERT...SELECT copies orphaned `bctc_table_rows` onto the current `report_id`, then reuses the existing `buildBackfillBctcScalarsHandler` (zero duplicated aggregation logic) to reflow scalars. Ran live against the named-volume DB: 451 CTG 2026-Q1 rows carried forward `96e36139-...` → `e497f7d1-...` (RAW pre/post-verified via `docker exec`).

Finding (escalated, not silently claimed as fixed): the 451 carried rows are 208 income_statement + 173 cash_flow + 70 notes — ZERO balance_sheet/general rows. The BEQ-6 section-completeness gate correctly refused to promote to DONE (set `refine_status=PARTIAL`, left `total_assets=0`/`net_revenue=3910`/`net_margin_pct=~229157%` unchanged). AC-TRACK1-2 (row carry-forward) PASSED; AC-TRACK1-3 (scalars plausible) did NOT resolve — the defect is one level deeper than W2's row-repair scope: the balance-sheet page window was apparently never captured in the original agentic-refine pass that produced this orphan. Needs a fresh refine pass targeting that window once gateway-blind resolves.

AC-TRACK1-4/5/6 all PASS: VCB/FPT/VNM unaffected (RAW-verified live + by code inspection — writes scoped to source/target report_id only); CTG/VCB report_ids re-confirmed current (no churn since the architect brief); commit references sprint + AC-14 dedup note + brief path.

New test file 8/8 pass (24 expect()) — `:memory:` SQLite, zero live-DB dependency. tsc clean. Targeted financial-reports suite (BEQ-2/BEQ-SECTION-GUARD/FU-BACKFILL-DE-SYNC/LF-SERVE-REFLOW/TSU-DEV-U3) 39/39 pass. Full `bun test` 14426 pass/40 skip/59 fail/5 errors/1185 files (626s, known Bun 1.3.13 teardown crash after summary) — zero apps/mcp-server/src/ files touched by this task, so pre-existing/unrelated by construction. toolCount=183 unchanged. Live health/dashboard probes clean (no rebuild needed — server code untouched).

Commit: pending (this cycle). Board: `ready`→`review` via orch-apply.sh, `next_agent=qa`.

Zone health: tsc clean, tools=183 unchanged, new script 8/8 + targeted BCTC suite 39/39 pass, zero apps/mcp-server/src/ files touched, live migration RAW-verified (451 rows) with an honest AC-TRACK1-3 escalation (not a false-green) | HEALTHY.

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
