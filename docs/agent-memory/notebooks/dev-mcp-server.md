# dev-mcp-server -- Notebook

## 2026-07-16 — FR-DEGRADE-01-FIX (dev-team dispatch, FIX) → REVIEW, returned to router

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatch; flipped `FR-DEGRADE-01-FIX` IN_PROGRESS→REVIEW + `.head`→idle via `scripts/orch-apply.sh`)

Root-cause gap in `get_bctc_full` (`bctcFullTools.ts`): the 2026-06-10 fix (`815ccaed`, signal `qc-FR-DEGRADE-01-4004`, quality-checklist status=PASS) only wired the VPS bctc SLA-staleness check into the "no `financial_reports` row at all" branch. RAW-verified the far more common production case — a report row DOES exist (last-known-good) but the VPS bctc push pipeline has stopped delivering fresh reports — fell through to the ordinary success path completely UNFLAGGED (silently-stale, not an error, but the AC explicitly forbids unflagged stale data). Threaded the already-computed `bctcVpsStaleSince` (+ new `bctcVpsStaleAgeHours`) into the success-path response: content[1] structured JSON gains `stale`(bool)/`stale_since`/`stale_age_hours`; content[0] text gains a human `[FR-DEGRADE-01]` note. Also added `stale_age_hours` to the pre-existing no-data branch for shape consistency.

Added 3 tests to `240-bctc-full.test.ts` (describe `FR-DEGRADE-01 — get_bctc_full degrades gracefully when VPS bctc push is stale (data present)`): stale-flagged when push >48h old (never throws, still serves last-known-good), fresh-push → `stale=false`, no-push-log-rows → `stale=false` (fail-open, not a crash).

Verified: targeted `bun test src/__tests__/240-bctc-full.test.ts src/__tests__/1982-quality-burndown-CHIJ.test.ts` → **38 pass / 0 fail**. `bun tsc --noEmit` exit 0. Full-suite bg run reds (1518 foreign-flow timeouts, 1407b coverage-map `market_messages`) confirmed as the pre-existing flaky class already documented in the S20/UC-MDH-P1 journal entry (`vps_push_log`/insider-tx/OCR-cache/foreign-flow) — zero overlap with the changed files.

Committed `00dca96fe` (explicit pathspec: `bctcFullTools.ts` + `240-bctc-full.test.ts`). Flipped orch-state `FR-DEGRADE-01-FIX`→REVIEW, `.head`→idle/next_agent=qa.

Zone health: tsc clean, 38/38 targeted pass (3 new), no tool/scheduler count change (handler-internals-only edit) | HEALTHY.

## 2026-07-16 — FR-OBS-01-FIX (dev-team dispatch, FIX) → REVIEW, returned to router

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatch; flipped `FR-OBS-01-FIX` IN_PROGRESS→REVIEW + `.head`→idle via `scripts/orch-apply.sh`)

Root-cause (sibling of FR-DEGRADE-01-FIX, same audit batch, signal `qc-FR-OBS-01-4005`): `bctcOverdueCheckJob` only inserts a batch `alerts` row (severity=high) and relies on the shared HIGH/CRITICAL dispatch (`intelligenceCycleJob` Step E → `notifyTelegramAlert`), which routes ALL high/critical severities to BUG by design — never WORK. So the AC question was answered NO before this fix: mis-channeled, not silently swallowed. Confirmed by direct read of `telegram.ts` (`notifyTelegramAlert` → `coreSend("bug", ...)`), corroborated by the sibling precedent `bctcBatchSweepJob.ts`, which already posts its own status directly to WORK via `sendTelegramWork`.

Fix: `runBctcOverdueCheck` now sends an explicit WORK-channel message (new injectable `opts.sendWorkAlertFn`, default `sendTelegramWork`) whenever the batch insert is a genuinely NEW row (`info.changes > 0` — the existing per-week dedup id already prevents re-firing, no separate cooldown needed). The `alerts` row is unchanged (still feeds `get_alerts`/cascade). Updated stale "Alert Commander" doc comments in `schedulerJobTable.ts` + `financial-reports.md`.

Verified: extended `316-bctc-overdue-check.test.ts` with 3 tests (overdue→WORK send; not-overdue→no send; same-week re-run→no re-send) — 11/11 pass. Targeted incl. `1358a`/`1303i`/`1050` siblings: 26/26 pass. `bun tsc --noEmit` exit 0. Full-suite: 14575 pass/40 skip/46 fail — zero overlap with changed files (pre-existing flaky class: vps_push_log/insider-tx/OCR-cache/foreign-flow timeouts + 1 deprecated-folder test). Scheduler cron.schedule count A/B via git-stash: 3→3 unchanged; tool count 183 unaffected.

Committed `<SHA>` (explicit pathspec: `bctcOverdueCheckJob.ts` + `schedulerJobTable.ts` + `316-bctc-overdue-check.test.ts` + `financial-reports.md`). Flipped orch-state `FR-OBS-01-FIX`→REVIEW, `.head`→idle/next_agent=qa.

Zone health: tsc clean, 11/11 targeted pass (3 new), scheduler/tool counts unchanged (added 1 direct Telegram send, no new job/tool) | HEALTHY.

## 2026-07-16 — FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER (dev-team dispatch, FIX) → REVIEW, returned to router

**Session:** 69b0312e-df43-43a9-9e0b-bddf66d374e3 (dev-team dispatch; flipped `FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER` IN_PROGRESS→REVIEW + `.head`→idle via `scripts/orch-apply.sh`)

Churn-stopper for a report-storm: `bctcExtractReconcileJob.ts` was firing one fail-loud Telegram BUG per exhausted `(ticker*quarter)` row inside the per-row terminal `enrich_failed` block — a 76+ report storm (~1 dup/30-min tick) when the shared PEK producer goes systemically dormant, each dup burning a full router→PO archive cycle. Added a post-loop circuit breaker: exhausted rows are now collected during the loop (not bugged inline); after the loop, if the run exhausted `>= RECONCILE_DORMANCY_ROW_THRESHOLD` (new named const/env, default 3) rows OR the shared producer (`bctc_layout_units`) hasn't landed a row in `RECONCILE_PRODUCER_STALE_DAYS` (new named const/env, default 2), ALL of the run's exhausted rows fold into ONE run-summary BUG (lists the ticker*quarter set, total count, shared 0-rows/cap-8 symptom, and which dormancy signal tripped). Below threshold with a healthy producer, per-row emission is unchanged — isolated one-offs are never muted. `updateEnrichFailed.run()` status transition is untouched in either path, exactly per the mint note's constraint — only the notification shape changes.

Freshness check reuses the same-file precedent (`last_attempt < datetime('now', '-5 minutes')`) — a SQL string comparison against `datetime('now', '-N days')`, not a JS `Date` parse, avoiding the SQLite-datetime/timezone parsing pitfalls documented elsewhere in this codebase. `MAX(extracted_at)` on an empty table is NULL, deliberately treated as not-stale (no evidence of dormancy on a cold/empty table) — this is what keeps every pre-existing single-row exhaustion test passing unchanged.

Added 4 tests to `bctc-extract-reconcile-job.test.ts`: below-threshold isolated failures still fire per-row BUGs (2 rows, 2 calls); `>= threshold` rows in one run → exactly 1 summary BUG; producer-freshness-alone (1 row, stale producer) → exactly 1 summary BUG; healthy producer + 1 row → per-row (no trip). Targeted suite: 19/19 pass (15 pre-existing + 4 new). Full mcp-server suite: 14581 pass/40 skip/45 fail — zero hits for `bctc-extract-reconcile`/`bctcExtractReconcile` in the fail list; the 45 fails are the same pre-existing flaky class documented at prior cycles (vps_push_log/insider-tx/OCR-cache/foreign-flow timeouts + 1 deprecated technical-indicators test). `bun tsc --noEmit` exit 0 (pre-push hook re-confirmed on push). Tool count 183 unchanged; `schedulerJobTable.ts` untouched (git diff empty) so job/cron registration is unaffected by this change.

**Gate-doc drift observed (not fixed, out of scope):** the G12 gate's `grep -rc "cron\.schedule" apps/mcp-server/src/scheduler/` probe now returns 3, not its documented baseline of 76 — job registration has since moved to one declarative table (`schedulerJobTable.ts`, 61 named jobs, confirmed via `grep -c "^\s*name: '"`) wrapped through a single shared `cron.schedule()` call site (`startupHelpers.ts`). Pre-existing architecture drift unrelated to this fix (confirmed `schedulerJobTable.ts` has zero diff) — flagging for a future gate-doc hygiene pass, did not fix inline (P0 90-min timeboxed churn-stopper, single-file scope per the mint note).

Committed `e5a70ab44` (code: `bctcExtractReconcileJob.ts` + `bctc-extract-reconcile-job.test.ts`) + `ce2456122` (docs: `financial-reports.md` scheduler-jobs row + invariant #8) — both pushed to `origin/main`. Flipped orch-state `FIX-BCTC-RECONCILE-EMISSION-CIRCUIT-BREAKER`→REVIEW (`4c7f6b0ae`), `.head`→idle/next_agent=router, row's own `next_agent`=qa.

Zone health: tsc clean, 19/19 targeted pass (4 new breaker tests), full-suite 14581/45 fail (zero overlap, pre-existing flaky class), tool count 183 unaffected, scheduler job-table count 61 unaffected (probe-doc drift flagged, not a regression) | HEALTHY.
