# TASK_603: Full Test Suite + gcExpiredLocks Negative Control + Deploy

**Parent:** FIX-CRON-REGISTRATION-PREFIX-NOT-EXCLUDED-ORPHANEMIT-AND-D4-R1B (P2, size S)
**Zone:** apps/mcp-server/
**Scope:** Full test suite + 1 new test + deployment verification
**Estimated:** ~70 min

---

## Acceptance Criteria (AC-3a + AC-4 + AC-6 + AC-5 from parent)

**AC-3a (regression test, first half of AC-3):** A gcExpiredLocks test proving:
- An **EXPIRED** task_kind=sprint-task row with task_id `'cron-registration:cowork-team'` emits **NO** orphan-signal
- AND that same row **IS still deleted** from task_locks (both halves asserted)
- Positive control: a plain expired sprint-task row with an ordinary task_id **STILL emits** its orphan-signal (proves the fix cannot be shown green by disabling emission wholesale)

**AC-4 (blast-radius verification):** Run the **FULL** apps/mcp-server test suite (not a subset), report raw pass/fail counts. `pnpm` gates FIRST per the standing pre-push rule. Any pre-existing red must be named explicitly and shown to pre-date this diff.

**AC-6 (deployment):** After AC-4 passes:
- Single-service rebuild ONLY: `docker compose up -d --build mcp-server`
- **NEVER** `docker compose down` or fleet-wide `up` (destroys peer containers)
- RAW-verify the image ID actually changed via `docker inspect --format '{{.Image}}'` before vs after
- A cache-reused rebuild is a known false-green — verify real rebuild happened

**AC-5 (confirmation, out of scope for code changes):** DOC-SYNC is held by agent-father. Developer/QA must confirm:
- `docs/agents/system-auditor/handlers.md` was **NOT edited** by this task
- `docs/agents/system-auditor/audit-dimensions.md` was **NOT edited** by this task
- Both files are listed in the parent row's `lane1_addendum_for_agent_father` and will be updated by agent-father in Lane 1 before agent-father's code ships

---

## Steps

### Step 1: Write gcExpiredLocks Negative-Control Test (AC-3a)

**File:** `apps/mcp-server/src/__tests__/coordinationStore.test.ts` (or wherever gcExpiredLocks tests live)

Add a new test suite:

```typescript
describe('gcExpiredLocks cron-registration:* exclusion (AC-3a)', () => {
  it('should NOT emit orphan-signal for expired cron-registration:* markers', async () => {
    // Setup: insert an EXPIRED sprint-task with task_id 'cron-registration:cowork-team'
    const now = Date.now();
    const expiredMarker = {
      task_id: 'cron-registration:cowork-team',
      task_kind: 'sprint-task',
      expires_at: new Date(now - 3600000), // 1 hour in the past (expired)
      created_at: new Date(now - 7200000),
      owner_agent: 'cron-cowork-team',
      owner_client_session: 'test-session-123',
      payload: { jobs: [] },
      heartbeat_at: new Date(now - 3600000), // also expired
    };
    await db.insert('task_locks').values([expiredMarker]).execute();

    // Action: run gcExpiredLocks
    await gcExpiredLocks(db, 300, 'some-task-id');

    // Assert 1: no orphan-signal was minted for cron-registration:cowork-team
    const signals = await db.query(
      'SELECT * FROM orphan_signals WHERE task_id = ?',
      ['cron-registration:cowork-team']
    );
    expect(signals.length).toBe(0); // MUST be 0, not >0

    // Assert 2: the marker itself WAS deleted (Phase-2 still runs)
    const remaining = await db.query(
      'SELECT * FROM task_locks WHERE task_id = ?',
      ['cron-registration:cowork-team']
    );
    expect(remaining.length).toBe(0); // MUST be deleted
  });

  it('should STILL emit orphan-signal for ordinary expired sprint-task (positive control)', async () => {
    // Setup: insert an EXPIRED sprint-task with an ordinary task_id
    const now = Date.now();
    const ordinaryExpired = {
      task_id: 'some-ordinary-task-id',
      task_kind: 'sprint-task',
      expires_at: new Date(now - 3600000),
      created_at: new Date(now - 7200000),
      owner_agent: 'some-agent',
      owner_client_session: 'test-session-456',
      payload: { work: 'data' },
      heartbeat_at: new Date(now - 3600000),
    };
    await db.insert('task_locks').values([ordinaryExpired]).execute();

    // Action: run gcExpiredLocks
    await gcExpiredLocks(db, 300, 'some-task-id');

    // Assert: orphan-signal WAS minted (proves fix is not wholesale emission-kill)
    const signals = await db.query(
      'SELECT * FROM orphan_signals WHERE task_id = ?',
      ['some-ordinary-task-id']
    );
    expect(signals.length).toBeGreaterThan(0); // MUST have at least 1
  });
});
```

**Rationale:** This directly tests the Phase-1 WHERE clause change. The two assertions prove:
1. The fix works (cron-registration:* are filtered from orphan-emission)
2. The fix is not over-broad (Phase-2 DELETE still runs; ordinary tasks still emit signals)

### Step 2: Run Full Test Suite (AC-4)

**Gate 1:** `pnpm` first (pre-push rule)

```bash
cd /path/to/repo/apps/mcp-server
pnpm install
```

**Gate 2:** Run the full suite (not a subset)

```bash
pnpm test
```

**Record:** Copy the summary line showing pass/fail counts. Example:
```
Tests:  X passed, Y failed, Z skipped (N total)
```

**Pre-existing red check:** If any tests are RED:
- Run `git diff HEAD~1 HEAD -- '*.test.ts'` to identify if the test file itself changed in this PR
- If red tests pre-date this PR, name them explicitly in your handoff note (e.g., "FooBar.test.ts line 123 was already failing before this task")
- If the red was introduced by this task's changes, it is a FAIL and must be fixed before deployment

### Step 3: Deploy (AC-6)

**Pre-deploy verification:**
```bash
docker inspect mcp-server --format '{{.Image}}'
# Record: e.g., sha256:abc123def456...
```

**Build and run:**
```bash
docker compose up -d --build mcp-server
```

**Post-deploy verification:**
```bash
docker inspect mcp-server --format '{{.Image}}'
# Record: e.g., sha256:xyz789uvw012...
# MUST differ from pre-deploy image ID
```

**If the image IDs are the same:** The rebuild used a cached layer and the new code is NOT running. This is a false-green. Investigate and force a rebuild (e.g., `docker system prune`, or explicitly pass `--no-cache` to the build step if your compose version supports it).

**Health check:**
```bash
docker compose ps
# mcp-server should be "Up" (or "Up (healthy)" if health check is enabled)
```

If the container failed to start, investigate logs:
```bash
docker compose logs mcp-server
```

### Step 4: Confirm AC-5 (No Agent-Father Edits)

**Check 1:** Verify the two agent-father files were NOT edited by this task:
```bash
git diff HEAD -- docs/agents/system-auditor/handlers.md
git diff HEAD -- docs/agents/system-auditor/audit-dimensions.md
# Both MUST show no changes (or only from prior unrelated commits)
```

**Check 2:** If both are clean, add a note to your handoff: 
> "AC-5 confirmed: handlers.md and audit-dimensions.md were NOT edited by this task. Both files are flagged for agent-father's Lane 1 update (lane1_addendum_for_agent_father in parent row)."

---

## Test File Location Notes

- If `coordinationStore.test.ts` does not exist, create it in `apps/mcp-server/src/__tests__/`
- Follow the existing test pattern in the codebase (jest, same imports, same setup/teardown as sibling tests)
- Ensure the test database connection is properly isolated (use test fixtures, not live DB)

---

## What NOT to Do

- Do not edit `docs/agents/system-auditor/handlers.md` or `docs/agents/system-auditor/audit-dimensions.md` — those are agent-father's zone (AC-5)
- Do not use `docker compose down` (destroys peer containers)
- Do not merge if any test is RED due to this task's changes
- Do not accept a cache-reused image as proof of deployment (verify image ID changed)
- Do not run a subset of the test suite (run the full suite per AC-4)

---

## Sequencing

**Blocked by:** TASK_601 + TASK_602 (code changes must be complete before testing)
**Blocks:** None (this is the final gate before the hard sequencing constraint is satisfied)

After this task passes and is deployed, the parent row can move to `done_verified` and the sequencing constraint is satisfied — agent-father's Lane 1 can be unblocked for dispatch.

---

## Handoff to QA

After developer completes this task:
- Confirm image ID changed (deploy verification)
- Spot-check that pnpm test output shows no RED tests introduced by this diff
- Verify AC-5 note (agent-father files untouched)
- Move parent row to `REVIEW` stage and assign next_agent to `qa`

---

## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:** `apps/mcp-server/src/__tests__/task-lock-coordination-store.test.ts` — extended the existing `AC-11: gcExpiredLocks — orphan-signal emission` describe block with 2 new tests (real code convention, not the handoff's pseudo-ORM example — this file has no `orphan_signals` table; orphan-signals are `task_locks` rows with `task_id='orphan-signal:<original>'` / `task_kind='orphan-signal'`, matching how the sibling `cron:*`/`dev-team-cron-singleton` guard tests already assert): (1) negative control — expired `sprint-task` row `task_id='cron-registration:cowork-team'` emits NO orphan-signal AND IS still deleted from `task_locks` (both halves in one test); (2) positive control — an ordinary expired `sprint-task` id still emits its orphan-signal (proves the fix is task_id-prefix-scoped, not a wholesale emission kill). No source file changed — TASK_601's `coordinationStore.ts` fix (commit `951ddfdba`) was already correct and complete; this task only adds the deferred regression coverage.
- **Tests written:** `apps/mcp-server/src/__tests__/task-lock-coordination-store.test.ts` — 2 new tests, GREEN (scoped file: 46 pass / 0 fail / 146 expect(), up from 44 pass / 142 expect() baseline).
- **Non-vacuousness (manual, not committed):** temporarily removed the `AND task_id NOT LIKE 'cron-registration:%'` line from `coordinationStore.ts` (source matched `HEAD` exactly before and after — `git diff --stat` empty both times) → scoped test run went **45 pass / 1 fail (RED)**, the exact new negative-control test failing → restored the line → **46 pass / 0 fail (GREEN)**. Confirms the new assertion is load-bearing.
- **Git commits:** `814182608` test(mcp-server): AC-3a gcExpiredLocks cron-registration:* negative control + positive control
- **Type check:** clean (`pnpm --filter vn-market check` = `bun tsc --noEmit`, 0 errors — this repo's pre-push `pnpm` gate)
- **AC-4 full suite (`pnpm --filter vn-market test` = `bun test`, apps/mcp-server, NOT a subset):**
  - Run 1 (via `pnpm --filter vn-market test`, 467.87s): **15157 pass / 40 skip / 44 fail / 48041 expect()**, 15241 tests across 1265 files.
  - Run 2 (direct `bun test`, full capture, 466.32s): **15156 pass / 40 skip / 45 fail**, 15241 tests across 1265 files — 1-failure delta between runs is the repo's **documented order-dependent flaky full-suite red** (`FIX-MCP-SUITE-HEALTH-BASELINE`, standing/tracked per `docs/policies/dev-standards.md` §"BLOCK-PUSH-CRON-AUDIT-BATCH-NO-QA" CANONICAL reading — literal full-suite "0 fail" is permanently unsatisfiable in this repo; the merge-gate reading is zero NET NEW failures vs. base). Prior documented baseline (dev-mcp-server notebook, 2026-08-06, pre-TASK_601/602/603): 44 fail / below the 52-61 flaky floor. Both runs here (44 and 45) sit inside that same documented floor.
  - **All 45 failing test names in Run 2 inspected by file/suite** (`grep '^(fail)'`): spread across `send_telegram channel routing`, `News Polling Job`, `get_backtest_runs`/`getAllRuns`, `logVpsPush` (news), `get_insider_transactions`, `get_company_profile` foreign_holding_ratio, `record_signal_outcome` dispatch guard, `handlePushNews`, `get_market_cap`, `MCP Tool Registration /sse`, `push-prices upsert`, `VPS Proxy Health` (×6), `get_foreign_flow`, `handleVpsProxyHealth` — **zero overlap** with `coordinationStore.ts`, `task_locks`, `gcExpiredLocks`, `cron-registration`, `tasksMdJanitorJob.ts`, or `isKnownLegitPattern`. Independently confirmed via `awk` range-scan that `task-lock-coordination-store.test.ts`'s full 46-test block (incl. both new AC-3a tests) contains **zero** `(fail)` lines inside the Run-2 full-suite log — the new tests pass both standalone AND embedded in the full order-dependent run. **Net new failures introduced by this diff: 0.**
- **Tool count:** 183 (`bun scripts/gen-project-stats.ts --dry-run`, matches pre-task baseline, unchanged — no tool touched)
- **Scheduler count:** 88 (same generator, matches pre-task baseline, unchanged — no cron touched)
- **Gate 2b (server reachability):** live docker container `/health` → `{"status":"ok","name":"vn-market","toolCount":183,...}` (a local `bun run src/index.ts` probe found port 3000 already bound by the running container — confirmed via `docker ps`/`ps aux`, no port conflict left behind after cleanup). Real Gate-2b evidence is the post-deploy health check below (stronger signal — actual running artifact, not a throwaway local process).
- **AC-6 deploy (single-service rebuild ONLY, `docker compose up -d --build mcp-server` — never `down`, never fleet-wide `up`):**
  - Pre-deploy image ID: `sha256:824eeacf77bb1ffbc7867551a560eccca481d537d3eee1e971893e78f2e9b3c7`
  - Post-deploy image ID: `sha256:115700a86e65a2781a029b31ce66f67543b5cf535b23e5c8f38c4e271706973c`
  - **IDs differ — RAW-verified real rebuild, not a cache-reused false-green** (the `COPY apps/mcp-server/src/ ./src/` layer re-ran since the test file changed; all prior layers CACHED as expected).
  - `docker compose ps mcp-server`: `Up ... (health: starting)` → polled to `healthy` within ~5s.
  - Post-deploy `/health`: `{"status":"ok","toolCount":183,"sessions":0,"uptime":19.7s}` (fresh process, confirms the new container is actually serving, not a stale one).
  - Dashboard circular-dep check: `curl /api/bctc-inspect` → 200, `curl /dashboards/news-fetch/` → 200 — no barrel/route breakage.
  - `docker logs --since 2m | grep -iE "error|exception|fatal"` (excluding the known non-fatal `[coordinationStore] gcExpiredLocks error (non-fatal)` catch-log pattern) → empty. Zero startup errors.
- **AC-5 confirmed:** `docs/agents/system-auditor/handlers.md` and `docs/agents/system-auditor/audit-dimensions.md` were **NOT edited** by this task — verified twice: `git diff HEAD -- <both files>` before starting (empty) and `git diff HEAD~1 HEAD -- <both files>` after committing (empty, exit 0). Both files are flagged for agent-father's Lane 1 update per the parent row's `lane1_addendum_for_agent_father`.
- **Docs updated:** NONE — no `docs/architecture/microservice/` content references `gcExpiredLocks`/this exclusion mechanism (grep-confirmed, same finding as TASK_601).
- **Graphify:** skipped (no docs impacted)
- **Simplicity gate:** PASS — Q1 scope clean (2 tests, exactly the AC-3a spec, no source touched since TASK_601 was already complete), Q2 no new abstractions (reused existing `setExpired`/`allRows` helpers already in the describe block), Q3 senior-test clean (mirrors the immediately-preceding `cron:*`/`dev-team-cron-singleton` sibling tests byte-for-byte in structure), Q4 ratio N/A (100% of the diff satisfies AC-3a).

**Sequencing gate status: MET.** TASK_603 is now `REVIEW`/`next_agent=qa` with both AC-4 (full suite, 0 net-new failures) and AC-6 (image-ID diff confirmed real deploy) evidence attached. Once QA verifies and flips the parent row (`FIX-CRON-REGISTRATION-PREFIX-NOT-EXCLUDED-ORPHANEMIT-AND-D4-R1B`) to `done_verified`, the router's held agent-father Lane-1 dispatch (cron-rearm skill-file fix) is unblocked.

---

## [QA] Review Record
QA agent: qa | Date: 2026-08-07 | Round: 1 | Verdict: APPROVED (direct-commit verify — 814182608 already on main, no branch)

- [x] Diff scope: `git show --stat 814182608` — 1 file (`task-lock-coordination-store.test.ts`), 62 insertions only. No unrelated/source changes (matches TASK_601's `coordinationStore.ts` fix already being complete).
- [x] AC-3a tests read at source (lines 1141-1191): negative control asserts BOTH halves (no orphan-signal minted AND marker row deleted from `task_locks`) in one test; positive control asserts an ordinary expired sprint-task still emits its signal. Not the handoff's illustrative pseudo-ORM shape — real repo convention (raw SQL `INSERT INTO task_locks`), matching sibling `cron:*`/`dev-team-cron-singleton` tests structurally.
- [x] **Independent RED/GREEN reproduction** (did not trust developer's manual-revert prose): removed `AND task_id NOT LIKE 'cron-registration:%'` from `coordinationStore.ts` myself → scoped run **45 pass / 1 fail**, the exact negative-control test failing (`expect(signalRow).toBeNull()` received the minted signal row) → restored the line → `git diff --quiet` confirmed byte-identical to HEAD → re-ran → **46 pass / 0 fail**. Confirms the new assertion is load-bearing, exactly as claimed.
- [x] **Independent full-suite run** (did not trust the two self-reported runs alone): `bun test` (full apps/mcp-server, 473.80s) → **15157 pass / 40 skip / 44 fail / 48043 expect()**, 15241 tests / 1265 files. Pass/skip/fail counts match developer's own Run 1 exactly; expect()-count differs by 2 (48043 vs 48041), consistent with the same documented order-dependent flaky floor (`FIX-MCP-SUITE-HEALTH-BASELINE`) the developer used to explain their own Run1-vs-Run2 delta — not a regression. Grepped all 44 failing test names + `awk`-isolated the `task-lock-coordination-store.test.ts` block in my own log: **zero overlap** with `coordinationStore`/`task_locks`/`cron-registration`/`tasksMdJanitorJob`/`isKnownLegitPattern`/`gcExpiredLocks`. Net new failures vs pre-existing floor: **0**.
- [x] tsc: 0 errors (independently re-run). mock-guard: PASS (test-file-only diff, "No production source files to scan").
- [x] AC-6 deploy independently verified: `docker inspect vn-market-intelligence-mcp-mcp-server-1 --format '{{.Image}}'` → `sha256:115700a86e65a2781a029b31ce66f67543b5cf535b23e5c8f38c4e271706973c` (matches claim + router's prior check), container `healthy`, `Created` 2026-08-06T23:21:39Z. All 11 peer containers show unchanged multi-day/week `Created` timestamps in `docker compose ps` — confirms single-service rebuild only, no fleet `down`/`up`. `git log -- docker-compose.yml` shows no commit from this task or its neighbors.
- [x] AC-5 independently confirmed: `git show --stat` / `git diff <c>~1..<c>` for both `docs/agents/system-auditor/handlers.md` and `audit-dimensions.md` across all 4 named commits (`814182608`/`03af0f983`/`8e756c36d`/`7aa8247b4`) — zero touches. `git log -1` on both files shows last actual edit 2026-07-18 / 2026-07-25, well before this task.

smart_skip: test-only change — DDD + security scan skipped per Smart-Skip rule; full suite + tsc run regardless (never skipped).
Sequencing: parent row `FIX-CRON-REGISTRATION-PREFIX-NOT-EXCLUDED-ORPHANEMIT-AND-D4-R1B` flipped `READY`→`DONE_VERIFIED` in the same cycle (handoff's explicit "Handoff to QA" instruction) — brief §4.4 sequencing constraint now satisfied.
Report: reports/TASK_REPORT_603.md

---
