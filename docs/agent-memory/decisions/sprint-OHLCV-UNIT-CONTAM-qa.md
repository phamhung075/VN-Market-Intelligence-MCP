# Decision Journal — Sprint OHLCV-UNIT-CONTAM · qa

**Sprint goal:** Fix OHLCV unit contamination at all 5 write points (A–E); sanity cron for ongoing detection.
**Agent:** qa
**Started:** 2026-06-12T09:30:00Z

---

### STEP qa-S1 · qa · 2026-06-12T09:40:00Z
**task-id:** CONTAM-2
**what-done:** QA gate for Writer A guard + ON CONFLICT open self-heal in pushPricesHandler.ts. APPROVED.
**what-considered:**
- 6 unit TCs GREEN (QA-reproduced). tsc clean. DDD PASS. Security PASS. mock-guard EXIT 0.
- ON CONFLICT CASE WHEN open<100: self-heal confirmed at L171. Guard at L188-207 with try/catch, log.error + continue, RF-1 preserved.
- TC-2 self-heal: contaminated open=0.9 overwritten by valid push. TC-6 RF-1: HTTP 200 even when all rows rejected.
- Code-only gate (no live DB contamination probe needed — CONTAM-6 owns that, per concurrency note).
**why-decision:** APPROVED. Both primary changes (guard + self-heal) confirmed in source. Tests green. No arch concern (interface layer, domain call permitted).
**why-change:** No change from plan — only path: all checks green.

### STEP qa-S2 · qa · 2026-06-12T09:40:00Z
**task-id:** CONTAM-3
**what-done:** QA gate for Writer B guard in /api/push-ohlcv-history (server.ts). APPROVED.
**what-considered:**
- XS task; no dedicated test file per handoff (CONTAM-7 covers Writer B integration). Targeted 37 TCs from sibling files GREEN.
- server.ts L1169-1183: guard in bar loop with try/catch, log.error + skipped++ + continue, HTTP 200 preserved.
- Smart-Skip applied for lack of dedicated test: XS handoff explicitly notes CONTAM-7 integration test as AC coverage; tsc green + code-level verification sufficient per precedent (same pattern as CONTAM-2 test strategy).
**why-decision:** APPROVED. Code correctly implements the guard. HTTP 200 preservation confirmed in source. No regression (21 additive lines only).
**why-change:** No change from plan — XS explicit scope correctly implemented.

### STEP qa-S3 · qa · 2026-06-12T09:40:00Z
**task-id:** CONTAM-4
**what-done:** QA gate for Writers D & E normalize-then-guard in taOhlcvBackfillJob.ts + ohlcvBackfill.ts. APPROVED.
**what-considered:**
- 7 unit TCs GREEN (QA-reproduced). Full suite 12770/0. tsc clean. DDD PASS. Security PASS. mock-guard EXIT 0.
- taOhlcvBackfillJob.ts L259-295 + ohlcvBackfill.ts L205-240: normalize-then-guard-then-upsert confirmed in both files.
- Binding amendment complied: NORMALIZE ×1000 (not skip) — AC-D1 TC: VNH open=0.9 written as 900. AC-D5 TC: 35 rows written for clean batch (no data loss).
- Writer E live-probe evidence in handoff: KSD=4.9, VHH=2.7 — thousand-VND confirmed; same pattern applied.
- Contaminated row count not verified (CONTAM-6 owns repair migration; concurrency note prohibits row-level check here).
**why-decision:** APPROVED. Both files implement normalize-then-guard correctly per binding amendment. Row-drop risk (forbidden skip) eliminated per TC-D5.
**why-change:** No change from plan — binding amendment scope exactly followed.

### STEP qa-S4 · qa · 2026-06-12T09:40:00Z
**task-id:** CONTAM-5
**what-done:** QA gate for ohlcvSanityCheckJob cron (contamination detection). APPROVED.
**what-considered:**
- 10 unit TCs GREEN (QA-reproduced). tsc clean. DDD PASS. Security PASS. mock-guard EXIT 0.
- cronConfig.ts L190-194: ohlcvSanityCheck at "5 15 * * 1-5" confirmed. startScheduler.ts L587: cron.schedule registered.
- Container startup log: "80 cron keys in CRONS map" — confirms cron active in live container.
- grep -rc cron.schedule src/scheduler/ = 79 (matches developer baseline). gen-project-stats --dry-run: cronJobCount=79.
- Scope clarification: CONTAM-5 = sanity-check cron (not Writer C guard, which is a separate concern). Developer correctly identified authoritative spec.
- All-zero tolerance (TC-3) confirmed — no spam from BACKLOG_CONTAM_8 defect rows.
**why-decision:** APPROVED. Cron registered, live in container, all 10 TCs green. Fail-loud pattern (sendBug on contamination) correct per arch brief Decision 4.
**why-change:** No change from plan — scope note in developer handoff validated; cron registration confirmed in container.

### STEP qa-S6 · qa · 2026-06-12T12:25:00Z
**task-id:** CONTAM-7
**what-done:** QA gate for integration test suite (all 5 writers + repair script + sanity job). APPROVED.
**what-considered:**
- 45 tests GREEN (bun test QA-reproduced): 45 pass / 0 fail, 114 expect() calls. Handoff stated 44 — delta +1 is TR-6 boundary test added by CONTAM-8 (explains count; not a blocker).
- tsc --noEmit: exit 0.
- DDD PASS: test file (test layer) — no domain/infra boundary violations in test code.
- Security PASS: in-memory SQLite only, no process.env.
- mock-guard: N/A (test file, no production source changed).
- Coverage verified: T1 validateOhlcvUnit 13 tests, T2 Writer A 5 tests, T3 Writer B 4 tests, T4 Writer D 4 tests, T5 Writer E 3 tests, T6 Writer C 3 tests, T7 repair script 5 tests, T8 sanity job 8 tests — all 5 writers + repair + detection covered.
- Part A (ohlcvSanityCheckJob.ts): confirmed already created in CONTAM-5 per handoff note; cron 15:05 UTC Mon-Fri, entry `ohlcvSanityCheck` in cronConfig.ts confirmed. schedulerCount=79 matches.
- toolCount=157 unchanged. schedulerCount=79 unchanged.
**why-decision:** APPROVED. Integration suite covers all 5 writer paths + repair migration + sanity detection job. Full behavior chain validated. Test count delta +1 (boundary test from CONTAM-8) is non-blocking — adds coverage, no regression.
**why-change:** No change from plan — only path: all checks green.

### STEP qa-S7 · qa · 2026-06-12T22:50:00Z
**task-id:** CONTAM-9
**what-done:** QA gate for low=0/open=0 partial-zero repair (3-pass migration) + Rule 3 mixed_unit guard + ON CONFLICT low self-heal + TC-7/TC-14/TC-15/TC-16. APPROVED.
**what-considered:**
- 12 migration TCs GREEN (CONTAM-9-repair-ohlcv-low-zero.test.ts): 51 expect() calls.
- 20 ohlcvUnitGuard TCs GREEN (including TC-14/15/16 for CONTAM-9 Rule 3): 47 expect() calls.
- 7 pushPricesHandler TCs GREEN (including TC-7 low self-heal): 20 expect() calls.
- tsc --noEmit: exit 0 (empty output = clean).
- DDD PASS: ohlcvUnitGuard.ts (domain/services) has zero infrastructure imports.
- Security PASS: no process.env, no hardcoded secrets in any changed production file.
- mock-guard EXIT 0: no fabricated-data patterns in production source.
- LIVE DB (keinos sidecar, named volume):
  - Class A (open<100 AND open>0 AND close>1000 AND low=0): 0 rows.
  - Class B (open=0, not all-zero): 0 rows.
  - Class C (low=0 AND close>=1000): 0 rows.
  - FPT 2026-06-12: open=73100, high=74300, low=72369, close=73500 — CORRECT.
  - FPT 2026-06-11: open=73100 (was 0), low=72369 (was 0) — CORRECT.
  - FPT day change 2026-06-12: +0.547% — confirms +100447% bug resolved. User-visible defect closed.
- Spot-checks (VCB, HPG, ACB): all full-VND scale, low>0, sane pct ranges. 0 remaining contamination rows.
- Rule 3 mixed_unit guard confirmed in running container (/app/src/domain/services/market-data/ohlcvUnitGuard.ts, grep=1).
- toolCount=157, schedulerCount=79 unchanged per dev record.
**why-decision:** APPROVED. All 39 targeted tests pass. Live DB confirms 0 residual rows across all 3 classes. User-visible +100447% bug resolved (~+0.55% now). DoD fully met: root cause identified + all 3 classes repaired + guard plugged + script in scripts/ with dev-standards pointer.
**why-change:** No change from plan — only path: all checks green.

### STEP qa-S5 · qa · 2026-06-12T10:15:00Z
**task-id:** CONTAM-8
**what-done:** QA gate for boundary fix close >= 1000 + TR-6 test + live repair of VNH 2026-06-12. APPROVED.
**what-considered:**
- Live DB (keinos sidecar): VNH 2026-06-12 open=900 low=900 high=1000 close=1000 — scale correct; pct +11.1% within |pct|<30%.
- Full contamination scan (revised heuristic): 0 rows — CLEAN.
- Script source confirmed: CONTAM_WHERE L94 = `"AND close >= 1000"` (was `> 1000`); commits ff2bc97e + b02fcc56 on main.
- 45 TCs GREEN (CONTAM-7 suite, +1 TR-6). tsc exit 0. DDD PASS (migration utility, no domain imports). Security PASS. mock-guard EXIT 0.
- TR-6 is genuine: open=0.9 close=1000.0 → contaminated_count=1 before repair, open=900/low=900 after.
**why-decision:** APPROVED. All 4 QA checks pass raw. Boundary fix correct + live repair confirmed 0 residual contamination.
**why-change:** No change from plan — only path: all checks green.
