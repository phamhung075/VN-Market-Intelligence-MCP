---
sprint: CROSS-SESSION-MULTI-TEAM-ORCH
branch: task/1981-p1-regression-acceptance-tests
size: L
zone: apps/mcp-server/
depends_on: ["TASK_1980"]
blocks: []
---

## TLDR

Acceptance tests verifying P1 ships correctly. Two parts:
1. Regression test: two same-role sessions (identical `owner_agent`, distinct `owner_client_session`) cannot self-heartbeat-claim or release each other's locks (loser DEFERS).
2. Failure-mode matrix: verify all 8 scenarios from brief §7 P1 pass (double-claim race, self-held false-positive, stale reclaim, mcp-server rebuild, release-by-wrong-session, clock-source, db-unavailable, read-before-fire).

RAW-verify against the LIVE coordination.db in the Docker named volume (host ./data/coordination.db is a stale decoy).

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria (P1 done_verified gate):**
  - [ ] **Regression test (MANDATORY):** Two same-role sessions with identical `owner_agent` (e.g., both "dev-team") and distinct `owner_client_session` (UUIDs) cannot both proceed on the same work item. Test harness:
    - Session A: `task_claim("sprint-task:test-1", owner_agent="dev-team", owner_client_session="uuid-aaa", …)` → `{claimed:true}`
    - Session B (same tick): `task_claim("sprint-task:test-1", owner_agent="dev-team", owner_client_session="uuid-bbb", …)` → `{claimed:false, current_holder.owner_client_session="uuid-aaa"}`
    - Session B: DEFER (do NOT proceed), log SKIP to WORK channel
    - Outcome: exactly one session fires; no double-fire
  - [ ] **Failure-mode matrix (all 8 scenarios from brief §7 P1 pass):**
    1. Double-claim race: two sessions claim same task_id concurrently → exactly one gets `{claimed:true}`, other gets `{claimed:false, current_holder}` ✓
    2. Self-held false-positive (cowork double-fire): two cowork-dispatcher sessions, same tick, same leader key → loser sees peer session UUID → DEFER (NOT via heartbeat) ✓
    3. Stale reclaim after crash: Session A claims → killed → Session B claims after TTL → B gets `{claimed:true, stolen:true}`, row shows B's owner_client_session ✓
    4. Reclaim after mcp-server rebuild: Session A claims, container rebuilt (owner_session rotated), Session A heartbeats → succeeds (matches on owner_client_session, not owner_session) → no zombie ✓
    5. Release by wrong session: Session B tries to release Session A's live lock → `{ok:true, released:0}`, lock untouched; A's own release → `{ok:true, released:1}` ✓
    6. Clock source: inspect all DB writes → only `unixepoch('now')` server-side; no client `Date.now()` or ISO strings cross the wire ✓
    7. DB unavailable (fail-closed): unreadable coordination.db → `{claimed:false, error:"db_unavailable"}` → dispatcher fails closed (no spawn) ✓
    8. Read-before-fire cadence race: two sessions on `*/15`, claim mid-tick → `claimed:true` is authoritative → second EXITS; protocol trusts the claim, not a pre-read ✓
  - [ ] All tests use RAW mcp-server calls (no mocking), verified against LIVE coordination.db in the Docker named volume
  - [ ] Commit message cites the brief §7 P1 failure-mode table and lists all 8 test outcomes
  - [ ] Test results logged in a report (e.g., docs/signals/p1-acceptance-test-results.json or appended to the sprint_goal entry)

- **Files to read first:**
  - docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md §7 P1 (failure-mode test table)
  - apps/mcp-server/src/infrastructure/db/coordinationStore.ts — live behavior to verify
  - docs/protocols/task-lock-protocol.md (if exists) — contract details

- **Files to create:**
  - test file: apps/mcp-server/test/integration/coordinationStore.cross-session.test.ts (or similar)
  - Report: docs/signals/p1-acceptance-test-results.json (or append to sprint_goal)

- **Files to modify:**
  - If using existing test suite: add to apps/mcp-server/test/...
  
- **Dependencies:** TASK_1980 (P1-FINAL shipped, all changes live)
- **Knowledge needed:**
  - `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §7 P1 (failure-mode matrix)
  - Brief §3 (atomic claim protocol) — the contract being verified
  - MCP server docker setup: understand LIVE coordination.db is in the named volume, host ./data is a decoy

## [Developer] Implementation Notes

1. **Test harness structure:**
   - Tests can be shell scripts, TypeScript, or any language that can call the mcp-server via the gateway or directly via the coordinator module
   - Recommend: TypeScript integration tests using the existing test framework in apps/mcp-server/test/
   - Setup: start docker compose, create test tasks, verify outcomes

2. **Regression test (core scenario):**
   ```typescript
   describe('P1: Cross-Session Same-Role Locking', () => {
     it('two same-role sessions cannot both claim the same lock', async () => {
       const sessionA = 'uuid-aaaa-1111-bbbb-2222';
       const sessionB = 'uuid-cccc-3333-dddd-4444';
       const taskId = 'sprint-task:regression-test-1';

       // Session A claims
       const claimA = await coordinationStore.claimTask(db, {
         taskId,
         taskKind: 'sprint-task',
         ownerAgent: 'dev-team',
         ownerClientSession: sessionA,
         ttlSeconds: 3600,
       });
       assert(claimA.claimed === true, 'Session A should claim');

       // Session B tries to claim (same tick, fresh heartbeat)
       const claimB = await coordinationStore.claimTask(db, {
         taskId,
         taskKind: 'sprint-task',
         ownerAgent: 'dev-team',
         ownerClientSession: sessionB,
         ttlSeconds: 3600,
       });
       assert(claimB.claimed === false, 'Session B should not claim');
       assert(claimB.currentHolder?.ownerClientSession === sessionA, 'should show A is holder');

       // Session B MUST NOT heartbeat to check ownership (the anti-pattern is deleted)
       // Instead, Session B compares current_holder.ownerClientSession to its own and DEFERs
       console.log('[regression] Session B defers to peer session, no spawn occurs');
     });
   });
   ```

3. **Failure-mode matrix tests:**
   - One test per scenario (8 total)
   - Each test verifies the expected outcome per the matrix
   - Use `setTimeout` or similar to simulate crash (stop heartbeating), TTL expiry, rebuild

4. **Clock source verification:**
   - Inspect the database directly: `SELECT expires_at, heartbeat_at FROM task_locks;`
   - Verify values are Unix timestamps (seconds since epoch), not ISO strings or Date.now() milliseconds
   - Example check:
     ```typescript
     const row = db.exec('SELECT expires_at FROM task_locks LIMIT 1;')[0];
     const val = parseInt(row);
     assert(val > 1600000000, 'should be modern Unix timestamp');
     assert(val < 2000000000, 'should not be milliseconds (would be year ~2033)');
     ```

5. **DB unavailable test:**
   - Temporarily make coordination.db unreadable (e.g., `chmod 000 coordination.db` in the volume)
   - Call task_claim → expect `{claimed:false, error:"db_unavailable"}`
   - Restore permissions
   - Document this as the fail-closed behavior

6. **Testing cadence:**
   - Run tests locally against containers after code lands
   - Document all 8 outcomes in a report
   - RAW-verify (no mocking, live coordination.db)

---

## AC: Report Format

After tests pass, generate a report (docs/signals/p1-acceptance-test-results.json) like:

```json
{
  "sprint": "CROSS-SESSION-MULTI-TEAM-ORCH",
  "phase": "P1",
  "test_date": "2026-06-29T12:34:56Z",
  "status": "PASS",
  "regression_test": {
    "name": "Two same-role sessions cannot both claim",
    "outcome": "PASS",
    "detail": "Session A claimed, Session B deferred, no double-fire"
  },
  "failure_mode_matrix": [
    {
      "test_id": 1,
      "scenario": "Double-claim race",
      "outcome": "PASS",
      "evidence": "Session A got {claimed:true}, Session B got {claimed:false, current_holder.owner_client_session='uuid-aaa'}"
    },
    {
      "test_id": 2,
      "scenario": "Self-held false-positive (cowork double-fire)",
      "outcome": "PASS",
      "evidence": "Loser saw peer session UUID, deferred WITHOUT heartbeat probe"
    },
    ...
  ],
  "raw_verify": {
    "live_coordination_db": "USED",
    "host_data_decoy": "IGNORED",
    "db_path": "/var/lib/docker/volumes/<named-vol>/_data/coordination.db"
  }
}
```

## RETURN to PM

Once this task is DONE:
- All 8 failure-mode scenarios pass
- Regression test confirms no cross-session interference
- Report generated and logged
- **Mark P1 as done_verified**
- P1.5/P2/P3 remain HELD (pending architect and PO confirmation)

---

## [QA] Review Record — 2026-06-28

**Reviewer:** qa (TASK_1981 integrated gate)
**Verdict:** APPROVED

### Test Results
- AC-A (Zod REQUIRED): 4/4 tools reject missing `owner_client_session` (isError=true). PASS.
- AC-B (Session isolation): Session-B cannot heartbeat (`ok=false`) or release (`released:0`) Session-A's lock. PASS.
- AC-C (Claim mutex): INSERT OR IGNORE single-winner, stale-steal, claim-after-release. PASS.
- 8 failure-mode scenarios (brief §7 P1): 10 tests / 10 PASS. All 8 scenarios covered.
- Full P1 test scope (131 tests): 131 PASS / 0 FAIL.
- tsc: 0 errors. DDD: PASS. Security: PASS.

### Baseline Diff
- Baseline: c04f1819 (commit immediately before 9b6c0e33/P1-MCP-1)
- P1-introduced failures in committed code: **ZERO**
- 53 pre-existing failures in full suite: all timeout/network/VPS schema/refine-isolation — none P1-caused
- DV-P2-4 was failing only due to uncommitted slot-claim.md P1 whitespace — fixed by QA (test regex + commit)

### Deliverables
- `apps/mcp-server/src/__tests__/1981-p1-failure-mode-matrix.test.ts` (8 scenarios, 10 tests)
- `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts:322` (whitespace-tolerant regex fix)
- `docs/agents/cowork-team/flow/slot-claim.md` (committed with `owner_client_session`)
- `docs/agents/cowork-team/flow/spawn-fanout.md` (committed with `owner_client_session`)
- `reports/TASK_REPORT_1981.md` (full verification record)

### RAW Live Verify
- Named-volume `coordination.db`: `owner_client_session` column at cid:9. Non-null values present for post-P1 claims.
- Two-session collision test: ClaimA=1, ClaimB=0 (mutex holds), wrong-release no-op, correct-release confirmed.

### Tasks Flipped
TASK_1974, 1975, 1976, 1977, 1978, 1979, 1980, 1981 → DONE via orch-apply.sh. P1.5 UNBLOCKED.

---

## P1 Complete

All 9 atomic tasks (MCP-1/2/3, AF-1/2/3/4, FINAL, REGRESSION) are DONE.
P1 ships. P1.5/P2/P3 decomposition HELD.
