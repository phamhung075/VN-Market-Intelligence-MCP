# dev-mcp-server -- Notebook

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

## 2026-07-10 — FIX-BCTC-D2-ENSURE-SHELL-ROW → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (router-dispatched, D2 of the 7-task FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION chain — D1 landed DONE_VERIFIED e9bb1c3e4, D3A onward still backlog)

New `ensureFinancialReportShellRow({actionCode,year,quarter,pdfPath,db?})` (`usecases/bctc/ensureFinancialReportShellRow.ts`) — idempotent `INSERT ... ON CONFLICT(action_code, sort_key) DO UPDATE SET pdf_path = excluded.pdf_path WHERE financial_reports.pdf_path IS NULL`; first-insert rows get `validation_status='pending_extraction'` (new additive enum value) + `'{}'` JSON statement columns. Reuses D1's pre-check-SELECT id-stability pattern and `bctc/newsChainFallback.ts`'s existing `buildFiscalPeriod()` helper. Wired into `bctcPdfPullJob.ts` as new Step 4b, called right after `deps.savePdf()` succeeds, before Step 5 `triggerExtraction`; errors caught+logged, non-fatal.

Key design decision: `db` is an OPTIONAL injected param (default `getDb()` singleton), NOT `getDb()`-only — matches sibling `backfillBctcPdfPaths(db, pdfDir)` for this same table. Caught BEFORE writing code (by reading `bctc-pdf-pull-job.test.ts` first): that test suite constructs its own dedicated `:memory:` Database separate from the `getDb()` singleton — a `getDb()`-only usecase would silently write shell rows into a second, un-migrated, orphaned in-memory DB on every existing pull-job test run.

New `FIX-BCTC-D2-ENSURE-SHELL-ROW.test.ts` (7 tests): first-insert shell row, no-op re-call preserves pdf_path+id, NULL pdf_path→set, NOT-NULL pdf_path never clobbered, distinct sort_key gets its own row, injected-db isolation from the singleton. Extended `bctc-pdf-pull-job.test.ts` +2 tests (TC-13 new-ticker shell row w/ pdf_path set; TC-13b reproduces the exact GVR/MBB/D2D pattern — pre-existing legacy row w/ pdf_path NULL gets it set, id preserved). Targeted suite (D1+D2+pull-job, 3 files) 28/28 pass. tsc clean. mock-guard PASS.

Full per-file-isolation sweep (`scripts/ci-per-file-isolation.sh` P=12, 1185 files): 14288 pass/40 skip/59 fail/16 files. Grepped every failed file for `ensureFinancialReportShellRow`/`bctcPdfPullJob`/`storeReport`/`parseBctcReport`/`financial_reports`: 2 textual hits, both individually re-verified pre-existing/unrelated — `125-test-e2e-briefing.test.ts` (38/39 pass, 1 fail = Chromium binary absent in sandbox) and `1294b-bctc-fallback.test.ts` (confirmed standalone hang, same file D1/S30 already root-caused one cycle earlier; `git status` confirms I never touch `newsChainFallback.ts`). Scheduler-count gate probe in `dev-mcp-server/flow/main.md` (literal `cron.schedule` grep) is stale post-refactor — scheduling now goes through the `CRONS` config map, not scattered literals; reported the live `Object.keys(CRONS).length`=85 instead (unchanged, file untouched) rather than trust the stale grep's wrong low count. toolCount=183 unchanged. Server-boot probe: module load + DB init + tool registration (183) + scheduler startup all clean, zero import errors — final `httpServer.listen()` hit pre-existing `EADDRINUSE` on :3000 (an already-running process predating this task) so live HTTP-serve is inconclusive; module-load is the meaningful signal and is clean.

`docs/architecture/microservice/mcp-server/usecases.md` updated (new application-layer file, doc-review Step 1 rule).

Commit: NOT committed by this agent — router commits after QA's gate passes, per explicit dispatch instruction (same dev→qa→commit ordering as D1). Board: `ready`→`review` via orch-apply.sh, `next_agent=qa`.

Zone health: tsc clean, new tests 9/9 pass (7 unit + 2 pull-job integration), full-suite sweep 14288 pass/59 fail(16 files, all pre-existing/unrelated, 2 re-verified individually), toolCount=183 + CRONS=85 both unchanged | HEALTHY.

## 2026-07-10 — FIX-BCTC-D2-ENSURE-SHELL-ROW round-1 QA fix → REVIEW (still)

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (round-1 fix-request round-trip, same task, dev-mcp-server as fixer per QA's routing)

QA's independent gate (agentId a51bc01109afd1a51) confirmed 28/28 tests, tsc clean, DDD clean, mock-guard PASS, diff matched the design doc's SQL fragment verbatim — but empirically caught (live scratch insert+read-back, not just static read) ONE real regression the diff introduced: the shell-row `INSERT` column list omitted `extraction_confidence`, so SQLite silently applied the schema's `DEFAULT 1.0` (`bctc-schema.ts:750`) to a row with ZERO extracted data. Every other `financial_reports` INSERT site explicitly sets this column — mine was the only omission, and it traces straight back to following the design doc's own literal SQL fragment verbatim (recorded as the prior entry's own why-decision) — the doc itself has the same gap.

Net effect QA proved live: before this task, `get_financial_summary(GAS,2025,Q4)` correctly said "No financial data found"; after, the same call would say "Confidence: 100%" + "Net Revenue: 0.0 tỷ VND" — permanently, for tickers like GAS whose scalar tiers never cross `parseBctcReport.ts`'s own 0.5-confidence gate (so the legacy pipeline never overwrites this shell row for them). A clean "no fake data" violation.

Fix (single file, minimum in-scope change per QA's own fix instruction): added `extraction_confidence` to the INSERT column list bound to `0` — a shell row has MEASURED zero confidence, not the schema's silent "fully extracted" default. Strengthened `FIX-BCTC-D2-ENSURE-SHELL-ROW.test.ts`'s first test with `expect(row!.extraction_confidence).toBe(0)` so this exact regression class cannot silently reappear. Did NOT touch `reports.ts` (the `get_financial_summary`/`compare_financials` serve-layer gate QA separately flagged as a non-blocking backlog item for pm/architect — out of D2's scope, explicitly not required to land this fix).

Re-ran targeted suite (same 3 files: FIX-BCTC-D2-ENSURE-SHELL-ROW.test.ts + bctc-pdf-pull-job.test.ts + FIX-BCTC-D1-STABILIZE-REPORT-ID.test.ts): 28/28 pass, unchanged count. `bun tsc --noEmit`: clean. `scripts/audits/mock-guard.sh --files` on both changed files: PASS.

Commit: NOT committed by this agent — router RAW-verifies (3rd independent verification pass on this task overall) and commits the full D2 bundle (original implementation + QA's round-1 review + this fix + updated docs) together once QA signs off clean. Board: `status_note` appended (QA's `qa_verdict=CHANGES_REQUESTED`/`qa_note` from round 1 left untouched as the historical record — status stays REVIEW), `next_agent` flipped `dev-mcp-server`→`qa` via orch-apply.sh.

gateway MCP bridge unreachable in this sandboxed sub-session (ongoing known gap, not mine to fix) — could not `send_telegram`, same limitation QA itself noted in round 1.

Zone health: tsc clean, targeted suite 28/28 pass (unchanged), mock-guard PASS, single-file/single-line-class fix scoped exactly to QA's blocking finding, no new full-suite sweep needed (no behavior change outside the one column) | HEALTHY.
