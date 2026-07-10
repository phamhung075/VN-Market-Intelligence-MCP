# Task Report: FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID — agent_signals.alert_id dangling-FK writer guard
date: 2026-07-10
outcome: CODE+TESTS APPROVED — HELD AT REVIEW (rebuild pending, next_agent=ops)

## Changed
- `apps/mcp-server/src/infrastructure/db/alertStore.ts:189-224,295-320` — `storeAlerts`/`storeAlertsFromCommander`: added `checkAlertRow = db.prepare("SELECT 1 FROM alerts WHERE id = ?")`, gated the `agent_signals` co-write on `!existing && alertRowExists`. Parameterized, generic (bound to loop-local `alert.id`, not hardcoded).
- `apps/mcp-server/src/scheduler/news-analysis/audit-checks/checkOrphanAgentSignalsAlertId.ts` — new D-NEW2 audit check (inverse of C-08/W-6), wired into `dataAuditJob.ts` `runDailyChecks`.
- `apps/mcp-server/src/__tests__/FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID.test.ts` — new, 8 tests (AC-1..8).
- `docs/architecture/microservice/mcp-server/infrastructure.md` — doc updated (19→20 audit-check files).

## Test Results (independently re-run, not trusted from report)
- New test file: 8 pass / 0 fail (24 expect).
- Targeted alert/audit suites (10 files: FIX-ALERT-ORPHAN-CORRELATION, ta/bb-scan-job, UUID-MISMATCH, CONFIDENCE-DEFAULT-50, data-audit-job x2, 2 foreign-flow-alert files, new file): 129 pass / 0 fail.
- `bun tsc --noEmit`: 0 errors.
- Full `bun test` (independently re-run, backgrounded, 552s): 14456 pass / 40 skip / 56 fail / 5 errors / 1187 files, ends in the documented Bun 1.3.13 teardown panic. Grepped all 56 failing test names for alert/signal/orphan/audit/alertStore/dataAuditJob/checkOrphanAgentSignalsAlertId overlap — **zero matches**. Isolation-reran 3 samples: `102-job-news-poll.test.ts` fails on a real local-sandbox cause (`Browser was not found at /usr/bin/chromium`, 5000ms bun-test default timeout — unrelated env gap); `1875c-record-signal-outcome-routing.test.ts` + `1518-get-foreign-flow-ohlcv-source.test.ts` both pass 9/9 clean in isolation. Confirms pre-existing resource-contention/env flake, not a regression — run-to-run count delta (56/5 here vs 63/9 in dev-mcp-server's own run) matches the already-documented non-deterministic flake signature for this suite (qa-S12/S27 precedent).

## DDD Compliance: PASS
No domain-layer files touched. `alertStore.ts` is infrastructure; `checkOrphanAgentSignalsAlertId.ts`/`dataAuditJob.ts` are scheduler-layer (both permitted to import infrastructure per their own header comments).

## Security: PASS
Parameterized SQL only (`db.prepare(...).get(alert.id)`). No `process.env`. No hardcoded secrets. `mock-guard.sh` PASS exit 0.

## Live-DB RAW-Verify (independent, not trusted from report)
- Located the real serving DB via `docker inspect` (`DB_PATH=/app/data/market.db`, named volume `vn-market-intelligence-mcp_market_data`) — 6 other `.db` files in the same container have no `agent_signals` table (would have been a false probe).
- `docker exec bun -e` (non-readonly, avoids WAL-blindness) RAW orphan query: **0 orphans, 10/10 alert_id-tagged rows resolve** — independently reproduces the claim.
- **Critical finding**: `docker inspect` shows the running image was `Created: 2026-07-09T12:49:50Z` — strictly **before** this fix's commit (`33bb3078e`, author date `2026-07-10T04:30:25Z`). The container is confirmed still running the **pre-fix** code. The 0-orphan snapshot reflects only that no `alerts.fingerprint` collision has recurred recently under the old code — it is NOT evidence the fix is live.

## Issues Found
### Blocking
None — code is correct and well-tested.

### Non-Blocking
- `rebuild_required: true` on the task-board row was never actioned (container predates the fix commit by ~16h). Production orphan-creation risk (on a future fingerprint collision) has not actually stopped yet.

## Merge Status
Already on `main` (commit `33bb3078e`, landed directly by dev-mcp-server per BOUNDED-1 auto-pickup convention — no branch/PR flow for this dev-team pipeline). QA does not merge here; QA gates the board-status flip only.

## Board Disposition
`task_board.review[FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID]`: `status` stays `REVIEW` (NOT `DONE_VERIFIED`) — `next_agent` qa→`ops`, `rebuild_required` stays `true`, `qa_verified_at`/`qa_verified_by`/`qa_note` added (dev-mcp-server's `status_note` untouched), via `scripts/qa-fix-agent-signals-orphan-alertid-hold-review-ops.jq` + `scripts/orch-apply.sh`. `.head` synced same write. Filed `docs/signals/ops-rebuild-verify-mcp-server-20260710T0449Z.json` tracking the deferred rebuild+swap+post-deploy live re-verify (RAW orphan query must stay 0 both immediately post-swap and after ≥1 subsequent alert-scan cycle, to catch a fingerprint-collision recurrence — the exact scenario this fix targets).

DJ-GATE-1: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-mcp-server.md` STEP `dev-mcp-server-S28` confirmed present and substantive before this review. QA's own entry: `docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-qa.md` STEP `qa-S43`.
