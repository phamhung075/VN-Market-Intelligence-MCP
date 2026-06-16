# Decision Journal — Sprint WORKFLOW-FLUIDITY · qa

**Sprint goal:** WF-1 fail-loud-stop-release / WF-2 head-CAS+signal_queue retry / WF-3 gateway-binding SPIKE
**Agent:** qa
**Started:** 2026-06-06T22:45:00Z

---

### STEP qa-S3 · qa · 2026-06-16T14:35:00Z
**task-id:** FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS
**what-done:** Code + test quality review only (no live rebuild, no lane flip). Reviewed schema-alerts.ts fingerprint migration block and AC-7 fault-path test from commit ec03b6ee.
**what-considered:**
- grep -c "TEXT UNIQUE" schema-alerts.ts = 0 (no illegal DDL left in production file).
- Partial unique index placed OUTSIDE the try/catch loop (lines 72-76), at top-level of initAlertsTables — will surface real failures unswallowed.
- Index predicate: WHERE fingerprint IS NOT NULL — generic, no per-ticker, no date-literal, no allowlist.
- AC-7 (lines 323-418): builds legacy 18-col alerts table with NO fingerprint, seeds 2 NULL-fp rows, asserts col absent pre-migration, calls initAlertsTables(), then asserts (a) col present, (b) idx_alerts_fingerprint exists, (c) INSERT OR IGNORE dedup yields 1 row for same fingerprint, (d) 2 NULL-fp legacy rows survive. NON-self-confirming for the migration path.
- AC-1..AC-6 use buildTestDb() which hard-codes `fingerprint TEXT UNIQUE` and do NOT call initAlertsTables(). These test scan-job INSERT behavior, not migration. They are self-confirming with respect to the migration path but that is not their declared scope. AC-7 is the dedicated migration regression.
- Minor concern (non-blocking): AC-7 lines 388-394 use string-interpolated fingerprint in SQL (`'${fp}'`). Test-only code — not a production security concern, non-blocking per policy.
- Per-file test results: FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS.test.ts = 7 pass / 0 fail; 1307-ta-alert-scan-job.test.ts = 9 pass / 0 fail; 1309-bb-alert-scan-job.test.ts = 10 pass / 0 fail; 1309c + 002-db-schema + 1378 combined = 34 pass / 0 fail. tsc --noEmit = 0 errors. mock-guard = EXIT 0.
- Full CI per-file isolation: background run launched, not yet complete at report time — direct file verification covers all changed-file-touching tests.
**why-decision:** All mechanical checks pass. AC-7 is the correctly scoped non-self-confirming migration regression. The AC-1..AC-6 self-confirming concern (per task brief) applies to those tests with respect to migration only, but their scope is scan-job dedup, not migration. AC-7 closes the actual gap. Schema file clean. APPROVE-CODE.
**why-change:** no change from plan.

### STEP qa-S2 · qa · 2026-06-07T04:10:00Z
**task-id:** FIX-ORCH-KEY-NORMALIZE-TASKID
**what-done:** QA gate for one-shot task_id→id migration across orch-state.json task_board (189 rows) + coalesce read-path in tasksMdJanitorJob.ts + Write Rules in task-schema.md.
**what-considered:**
- All 8 checks: AC1-AC6 + special case + commit hygiene — all reproduced independently via jq/bun test/bun tsc/diff/git show.
- tsc error count: independently reproduced 3 post-fix; confirmed 2 tasksMdJanitorJob.ts errors were real violations (string|undefined→string) and are cleared.
**why-decision:** All ACs pass with evidence. No new tsc errors. DDD/security clean. Commit hygiene exact (4 files). APPROVED.
**why-change:** no change from plan.

### STEP qa-S1 · qa · 2026-06-06T22:45:00Z
**task-id:** FIX-ORCH-DONE-GRID-COLS
**what-done:** QA gate for frontend fix — DONE table column alignment + row height regression.
**what-considered:**
- Only path: single-file frontend-only change (no domain/infra/MCP scope), all mechanical checks green.
**why-decision:** 363/363 Vitest PASS, tsc 0 errors, mock-guard exit 0, DDD scan clean (no +/- infra imports in diff), security — process.env at L171-172 is pre-existing SSR-origin pattern not touched by this commit (zero +/- lines), container a7209d98af4c matches fresh build digest (layer-cache), HTTP 200 live, commit diff = exactly 1 file no force-adds. APPROVED.
**why-change:** no change from plan.
