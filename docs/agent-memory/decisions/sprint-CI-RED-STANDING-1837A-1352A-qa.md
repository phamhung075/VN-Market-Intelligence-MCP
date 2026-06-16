# Decision Journal — Sprint FIX-CI-RED-STANDING-1837A-1352A · qa

**Sprint goal:** Fix 2 deterministic standing CI-red files (1837a head.status enum + 1352a async-extraction-race) so origin `bun test` per-file-isolation goes green
**Agent:** qa
**Started:** 2026-06-16T18:30:00Z

---

### STEP qa-S1 · qa · 2026-06-16T18:30:00Z
**task-id:** FIX-CI-RED-STANDING-1837A-1352A
**what-done:** QA gate APPROVED — all 4 DoD green; board advanced REVIEW→done (done_verified WITHHELD pending GitHub Actions Linux CI post-push).
**what-considered:**
- DoD-1: `apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts` — GREEN (5 pass / 0 fail). Fix adds 'ready' + the full 7-value status set sourced from orch-state-access.md §5 SSOT — NOT a bare literal append. Generic mandate met.
- DoD-2: `apps/mcp-server/src/__tests__/1352a-async-extraction-race.test.ts` — GREEN (8 pass / 0 fail). Race/fixture root cause addressed; no test-skip; fail-loud preserved.
- DoD-3: bctcPdfPullJob no-regression — confirmed GREEN. The additive try/catch guard in bctcPdfPullJob.ts is a noop under the full-schema production DB; OCR-worker-crash path logs `non-fatal`, tests remain green.
- DoD-4: Genericness PASS — 1837a fix sources valid-status set from orch-state-access.md §5 SSOT table (7 values), not a hardcoded literal. Future-proof against new legitimate statuses.
- Router RAW independent re-verify (first-hand, bj83h3qdj): 13 pass / 0 fail / 43 expect() / 381ms across both files simultaneously. No regression on any companion suite.
- impl_commit: 1c8467f9
**why-decision:** All 4 DoD met. Broader 20-file/49-fail local suite = HOST WEATHER (Bun-JIT SIGILL sdk1.29.0+zod3.25.76 + live-data flaps) — disjoint from change files, NOT Linux-CI failures, NOT regressions per [[feedback_ci_red_can_be_flaky_confirm_before_blame]]. done_verified WITHHELD: requires GitHub Actions Linux CI green AFTER PO's out-of-band push (push-gate HELD per board annotation).
**why-change:** no change from plan. Finalize-only cycle (prior run died on ENOSPC disk-full deadlock, now resolved with 19–23GiB free).
**downstream-gates:** This task gates 4 ci_green_on_subsequent_push tasks — CI-RED-b7b84d9b-FIX, CI-RED-d20468c0-FIX, VMT-8-MACRO-GRACEFUL-FAILCLOSE, FIX-FOREIGN-FLOW-DEAD-ENDPOINT — they stay BLOCKED until done_verified is flipped post-push.
