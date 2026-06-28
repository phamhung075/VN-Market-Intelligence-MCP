# Decision Journal — Sprint CROSS-SESSION-MULTI-TEAM-ORCH · qa

**Sprint goal:** Cross-session multi-team orchestration — P1 foundational layer
**Agent:** qa
**Started:** 2026-06-28T09:00:00Z

---

### STEP qa-S3 · qa · 2026-06-28T14:10:00Z
**task-id:** FIX-VNM-BCTC-ROWS-DATA-LOSS-RECOVER
**what-done:** Independent raw verification of VNM 2025Q4 data recovery — 94 rows confirmed on live named-volume, APPROVED.
**what-considered:**
- Raw bun:sqlite /app/data/market.db: 94 rows, BS=46/IS=22/CF=26 — PASS
- Real labels: "Tài sản ngắn hạn", "Doanh thu bán hàng...", "Lợi nhuận kế toán trước thuế" — non-zero plausible values — PASS
- financial_reports.refine_status=DONE, extraction_confidence=1 — PASS
- 14 reports, ZERO with 0 rows, no collateral damage — PASS
- BCTC eval Stage 4: total_rows=94, overall_status=yellow (dev said "red" — label-grouping mismatch, not data defect, non-blocking)
- No code changes → bun test / tsc / DDD / security / mock-guard not applicable
**why-decision:** All 5 raw verification checks pass. Eval=yellow is non-blocking per QA flow. Recovery goal achieved.
**why-change:** no change from plan

---

### STEP qa-S2 · qa · 2026-06-28T12:55:00Z
**task-id:** TASK_1981
**what-done:** Integrated QA gate for P1 attribution fix (TASK_1973→1980). 8 failure-mode scenarios authored and all green. Baseline diff confirmed zero P1-introduced failures. Flipped TASK_1974/1975/1976/1977/1978/1979/1980/1981 → DONE.
**what-considered:**
- AC-A/B/C (1980-p1-final-required-flip.test.ts): 12/12 PASS — Zod REQUIRED rejection, session isolation, claim mutex
- 8 failure-mode scenarios (1981-p1-failure-mode-matrix.test.ts): 10/10 PASS — double-claim, cowork double-fire, stale-steal, rebuild, wrong-release, clock-source, db-unavailable, cadence-race
- T3/T4 (FIX-REFINE) rewritten to assert NEW sole-key isolation (not deleted-to-go-green): 29/29 PASS
- bctcRefineJob.ts: owner_client_session = process.env["CLAUDE_CODE_SESSION_ID"] ?? fallback — never null — confirmed
- Agent-father edits (CLAUDE.md step 2.5, leader-lock.md, task-lock SKILL, dispatch-claim SKILL): behaviorally consistent — PRE-CLAIM gate correct, self-held-heartbeat deleted
- RAW live named-volume: owner_client_session column present cid:9; two-session collision proof passed
- Pre-sprint baseline diff: all 53 current failures are pre-existing (timeout/network/VPS schema/refine-isolation); P1 introduced zero regressions in committed code
- DV-P2-4 (DWF test): failing in working tree due to uncommitted slot-claim.md P1 change (whitespace alignment). Fixed: updated test regex to /ttl_seconds:\s+180/ + committed slot-claim.md and spawn-fanout.md P1 updates
- tsc: 0 errors; DDD: PASS; security: PASS (no process.env exposure, no hardcoded secrets)
**why-decision:** All 8 failure-mode scenarios pass. Core acceptance criteria met: two sessions same role cannot cross-steal/heartbeat/release; missing field REJECTED; claim mutex sound; router PRE-CLAIM gate defers on peer-held lock. P1 is done_verified.
**why-change:** no change from plan

---

### STEP qa-S1 · qa · 2026-06-28T09:05:00Z
**task-id:** TASK_1973
**what-done:** RAW-verified TASK_1973 (P1-MCP-1) against live named-volume DB and committed test suite — APPROVED.
**what-considered:**
- only path: all checks green (schema RAW-probe, NOT UNIQUE proof, NULL backfill, idempotency, 90/90 tests, tsc 0 errors, DDD PASS, security PASS)
- 1 apparent regression (DWF ttl_seconds spacing) — isolated to dirty working-tree TASK_1978 WIP; committed HEAD clear
**why-decision:** All 4 AC gates passed on committed code; dirty-tree failure is extrinsic to task scope
**why-change:** no change from plan
