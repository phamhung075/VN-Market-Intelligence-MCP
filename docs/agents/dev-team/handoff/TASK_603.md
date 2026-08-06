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
