## Task Report FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE
date: 2026-07-08
role: qa — Docker Microservice Code-Change Close Gate, Step 5 (domain-specific RAW-verify)
outcome: RAW-VERIFIED — routed to po for Step 6 (DONE_VERIFIED)

## Scope
Prior steps (not re-litigated here):
- dev-mcp-server ported D4 exclusion whitelist + live-concurrent-session guard + 2-cycle
  debounce into `apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts` (commit `e109f49f8`).
- Router independently verified source + re-ran `FIX-D4-HELD-LOCK-NO-BOARD-ROW-RECONCILE.test.ts`
  (26 pass / 0 fail / 65 assertions).
- ops completed Close Gate Steps 1-4: rebuild from HEAD `7920b5bcb`, deploy, SHA-gate,
  `/health` RAW-verify (toolCount=183, status=ok) — independently re-confirmed by router.

This report covers Step 5 only: does the LIVE deployed container actually suppress the
real false-positive batch, and is the fix not over-broad, against the LIVE coordination.db —
not a re-run of the already-green unit suite.

## Step 5 evidence

### 1. Deployed image carries the fix (not stale)
- `docker inspect` label `vn.market.git_sha` = `7920b5bcb084fe9d6f4b342bd236308e3a72d577`.
- `git diff 7920b5bcb HEAD -- apps/` = empty (only `docs/data/orch/orch-state.json` changed
  between the deployed SHA and current HEAD — the board-row commit `71da6909b`, no app code).
  `verify-deploy-sha.sh mcp-server` reports drift only because current HEAD advanced past
  the deployed SHA via that docs-only commit — zero `apps/` delta, so this is NOT a stale
  image relative to the actual fix.
- `git merge-base --is-ancestor e109f49f8 7920b5bcb` → true (fix commit is an ancestor of
  the deployed SHA).
- Container runs `bun run src/index.ts` directly (no separate compiled `dist/` to go stale
  against). `sha256sum` of the live `/app/src/scheduler/system/tasksMdJanitorJob.ts` inside
  the running container == `sha256` of `git show 7920b5bcb:apps/mcp-server/src/scheduler/system/tasksMdJanitorJob.ts`
  (`359c5ba8af20ad6c4990facdbc7c206636f910340ca8da8a806958fe1b963e83`, byte-identical).
  Confirmed `isKnownLegitPattern`/`isLiveConcurrentSession`/`applyR1bFilter`/`applyR4bDebounce`/
  `expired: false` all present in the live file via `docker exec ... grep`.

### 2. Live suppression of the real 7-lock batch
Queried the LIVE `/app/data/coordination.db` (`task_locks` table, `WHERE task_kind='sprint-task'
AND expires_at > now`) inside the running `vn-market-intelligence-mcp-mcp-server-1` container
at 2026-07-08T20:41:49Z. The exact same false-positive class from the `2026-07-08T03:00Z` batch
is live right now: 5x `esc-datacov:{ACB,HPG,GVR,HVN,MBB}:Q1-2026:ESC-3` + `dev-team-cron-singleton`
(the 7th member, `cron:dev-team:<ts>`, is a per-tick ephemeral lock not held at probe time — its
pattern was verified via a synthetic timestamped instance of the same `cron:` prefix).

Ran the LIVE deployed module's actual exported functions (imported directly from
`/app/src/scheduler/system/tasksMdJanitorJob.ts` inside the container, not reimplemented)
against these real rows:
- `isKnownLegitPattern` → `true` for all 6 live members + the synthetic `cron:dev-team:*` variant.
- `applyR1bFilter(heldRows, liveSessionIds, now)` on the full live held-lock array →
  `surviving: []`, `skipped:` all 6 real locks (`reason: "known-legit-pattern"`) plus this
  task's own current lock (`reason: "live-concurrent-session:..."`, a distinct, also-correct
  suppression path).
- Full end-to-end dry-run of the exported `runTasksMdJanitor()` — real `listHeld`/
  `listSessionPresence` bound to the live DB, real `readFile` of the live `orch-state.json`,
  `writeFile`/`sendBug` sandboxed (captured, never applied) — returned:
  `{ heldLocks: 7, divergences: [], pipelineState: { activeTaskId: "FACTORY-INFRA-split-vnstockBridge" }, concurrentCommits: [], errors: [] }`
  and logged `"D4 pass clean — no orch-state/lock divergence"`. Zero signal rows would be
  emitted for this batch by the live deployed code, run against live data, right now.
- No live cron 03:00Z tick has fired since the 20:36Z redeploy (next scheduled tick is
  2026-07-09T03:00Z) — the last `sau-d4-*` signal_queue rows on record are the pre-fix
  `2026-07-08T03:00Z` batch (14 rows, all `status: READ`, none newer). The direct
  function-level + full-pipeline invocation above is the decisive evidence for this step;
  the absence of a new post-deploy cron tick is corroborating but not itself proof.

### 3. Negative control — not over-broad
Ran `applyR1bFilter` against synthetic lock rows shaped like genuine orphans
(`FACTORY-INTERFACE-sequential-confidence-05-mask`, `TASK_1996`, `IND-P1-ROC-MOMENTUM`,
`owner_client_session` deliberately NOT in the live roster) → `surviving:` all 3,
`skipped: []`. None matched the known-legit-pattern whitelist or the live-concurrent-session
guard. Also confirmed (informational) that a genuine-orphan-shaped id sharing session-string
with a currently-live roster entry legitimately trips the live-concurrent-session guard
(by design, distinct mechanism from the pattern whitelist) — not a false suppression, an
intentional N-sprint-concurrency guard per the doc spec.

## Verdict
Step 5 PASS. Deployed code == fixed commit (byte-identical, not stale). Live coordination.db
real batch: 100% suppressed by the actual deployed detection logic, invoked directly against
live data. Negative-control genuine-orphan IDs: 0% suppressed. Not over-broad.

Routed to po for Close Gate Step 6 (DONE_VERIFIED) — qa does not self-close.
