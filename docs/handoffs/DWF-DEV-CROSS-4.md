---
sprint: DYN-WF-FOUNDATION
task: DWF-DEV-CROSS-4
branch: task/dwf-dev-cross-4-phase2-leader-lock
size: L
zone: developer
depends_on: [DWF-DEV-CROSS-3]
blocks: [DWF-DEV-CROSS-5]
---

# DWF-DEV-CROSS-4 — Phase 2 Leader Lock + Per-Work-Item Token

## TLDR

Rewrite `docs/agents/cowork-team/flow/main.md` Steps 0b, 4.6, 4.6b to implement (1) leader lock for cross-session dispatch coordination, (2) per-work-item suffix-free idempotent tokens (R3 blocking), (3) explicit short TTL enforcement (R1 blocking). Create `DWF-coordination-phase2.test.ts` with all DV-P2-1..7 tests (RED-before-GREEN). Closes the duplicate-publish SPOF.

## [PM] Planning Context

**Zone:** `developer` (cross-service)

**Acceptance Criteria — Leader Lock (FR-P2-5):**

- [ ] **AC-P2-5-1 (BLOCKING DV):** With two simulated concurrent leaders both attempting `task_claim(key="cowork-leader")`, exactly ONE wins and ONE loses. Deliberate-violation: a test asserting both callers `claimed: true` must go RED (proves single-winner enforcement).
- [ ] **AC-P2-5-2:** After leader session exits, standby session wins on next claim attempt.
- [ ] **AC-P2-5-3:** Leader TTL is exactly `1800` seconds (2 × 15-min heartbeat). Explicit `ttl_seconds: 1800` argument present in dispatch code (not relying on default).
- [ ] **AC-P2-5-4:** Non-leader session exits before spawning any agent (zero Agent() calls from losing session).

**Acceptance Criteria — Per-Work-Item Token (FR-P2-6 — BLOCKING R3/R1):**

- [ ] **AC-P2-6-1 (BLOCKING R3):** Retry of un-confirmed per-work-item spawn recomputes SAME key `cowork-slot:chef-morning` and is rejected by `task_claim`. Deliberate-violation: test showing tick-suffixed key (`cowork-slot:chef-morning@<tick>`) would allow duplicate (goes RED when suffix removed, proving suffix-free closes the window).
- [ ] **AC-P2-6-2 (BLOCKING R1 — code assertion):** Every per-work-item `task_claim` in dispatch code contains literal `ttl_seconds: 180` (not relying on default 3600). Lint/test asserts this; removing argument → test goes RED.
- [ ] **AC-P2-6-3 (BLOCKING R1 — crash frees within TTL):** Per-work-item claim with `ttl_seconds=180` expires within 180s without heartbeat. Test: claim, wait 181s without heartbeat, second claim succeeds. Deliberate-violation: TTL=3600 (default) → still locked at 181s (demonstrates default would starve for 1 hour).
- [ ] **AC-P2-6-4:** No per-work-item claim uses time-bucket, tick timestamp, or tick suffix in key. All keys are static `cowork-slot:<slot_id>` only (grep assertion).

**Acceptance Criteria — Published Marker (FR-P2-7):**

- [ ] **AC-P2-7-1:** First `send_telegram` for `work-id=chef-morning:2026-05-30` allowed (marker not set).
- [ ] **AC-P2-7-2 (BLOCKING DV):** Second `send_telegram` for same work-id blocked (marker already set). Deliberate-violation: removing marker check → both calls go through (test goes RED).
- [ ] **AC-P2-7-3:** Different work-id (e.g., `chef-morning:2026-05-31`) proceeds normally.
- [ ] **AC-P2-7-4:** Published marker stored server-side (in vn-market DB via task_claim mechanism, not in local file).

**Files to read first:**

- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § ARCH-DECIDE-B (leader lock renewal), § ARCH-DECIDE-C (published marker), § Detailed Test Strategy (DV-P2-1..7)
- `docs/REQ_DYN-WF-FOUNDATION.md` § FR-P2-5 (leader lock), § FR-P2-6 (per-work-item token with R3/R1 blocking), § FR-P2-7 (published marker), § Deliberate-Violation Test Matrix
- `docs/agents/cowork-team/flow/main.md` (current implementation to rewrite)
- Reference: `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` (task_claim/task_heartbeat/task_release primitives)

**Files to modify:**

- `docs/agents/cowork-team/flow/main.md` — Add/rewrite these steps:

  **Step 0b — Leader lock claim** (NEW, before Step 1):
  ```bash
  # Step 0b — Claim cowork-leader lock
  LEADER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: "cowork-leader",
    kind: "cowork-slot",
    ttl_seconds: 1800,
    owner_agent: "cowork-dispatcher"
  }))
  
  if [ "$(echo "$LEADER_CLAIM" | jq -r '.claimed')" != "true" ]; then
    log "[cowork] leader lock held by peer — silent exit"
    EXIT
  fi
  ```

  **Step 4.6 — Per-work-item token (REWRITE existing step):**
  - OLD key format: `"cowork-slot:" + slot.agent + ":" + nominal_tick` (FORBIDDEN — has tick suffix)
  - NEW key format: `"cowork-slot:" + slot.slot_id` (REQUIRED — suffix-free, uses slot_id not agent)
  - OLD TTL: `ttl_seconds: 900` (not explicitly short)
  - NEW TTL: `ttl_seconds: 180` (EXPLICIT, REQUIRED — R1 blocking)

  ```bash
  # Step 4.6 — Per-work-item idempotent token (REWRITTEN)
  SLOT_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
    task_id: "cowork-slot:" + slot.slot_id,    # ← CHANGED: no tick suffix, uses slot_id
    kind: "cowork-slot",
    ttl_seconds: 180,                           # ← CHANGED: explicit, mandatory, short TTL
    owner_agent: "cowork-dispatcher"
  }))
  
  if [ "$(echo "$SLOT_CLAIM" | jq -r '.claimed')" != "true" ]; then
    log "[cowork] slot " + slot.slot_id + " already claimed — skip duplicate spawn"
    continue  # skip this slot, proceed to next
  fi
  ```

  **Step 4.6b — Heartbeat leader lock (NEW, after Step 4.6 loop, before Step 5):**
  ```bash
  # Step 4.6b — Heartbeat leader lock after dispatch body
  call_tool(server="vn-market", tool="task_heartbeat", arguments={
    task_id: "cowork-leader"
  })
  ```

  **Step 4.8 — Pressure-state emitter (already done by DWF-DEV-CROSS-3):**
  - No changes here; already in place from CROSS-3

  **Step 5 — Published marker check (INSTRUCTION UPDATE, not code change):**
  - Add instruction: "Before Step 5 spawns agents, each spawned agent flow MUST include a task_claim call before send_telegram:
    ```
    task_claim(kind="cowork-slot", key="published:<slot_id>:<YYYY-MM-DD>", ttl_seconds=100800)
    ```
    This deduplicates publishes if a spawn somehow executes twice."

  **Remove nominal_tick variable:**
  - The bash block in Step 4.6 that computed `nominal_tick` (time-bucket suffix) is no longer used
  - Delete the `nominal_tick` variable assignment (keep drift_min tracking if present)

**Files to create:**

- `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts` — Integration test suite using in-memory DB:

  | Test ID | Maps to | Description | RED condition | GREEN condition |
  |---|---|---|---|---|
  | DV-P2-1 | AC-P2-5-1 | Single-winner leader lock | Two callers both assert `claimed: true` (WRONG) | Only one gets `claimed: true` |
  | DV-P2-2 | R3 proof | Suffix-free key blocks duplicate | Using `cowork-slot:chef-morning@<tick2>` succeeds (WRONG) | Using `cowork-slot:chef-morning` (no suffix) fails on second claim |
  | DV-P2-3 | R3 counter-test | Tick-suffix would recreate bug | No suffix: blocked correctly | With suffix: succeeds (demonstrates bug, proves suffix necessary) |
  | DV-P2-4 | R1 code assertion | Explicit TTL path | `ttl_seconds` absent from claim → no lint failure (WRONG) | Lint asserts presence; removing it → RED |
  | DV-P2-5 | R1 crash-frees-180 | 180s TTL frees at 181s | TTL=3600: held at 181s (WRONG for short case) | TTL=180: freed at 181s (correct) |
  | DV-P2-6 | R1 default-starves | Default-3600 would hold 1 hour | TTL=180 correct case | TTL=3600 still locked at 181s (demonstrates default starvation) |
  | DV-P2-7 | AC-P2-7-2 | Published marker blocks send | Marker absent: second send proceeds (WRONG) | Marker present: second send blocked |

  **Test helpers:**
  - Use `_injectCoordinationDb(new Database(':memory:'))` (same pattern as `232-cowork-resilience.test.ts`)
  - For clock mocking: directly manipulate SQLite `expires_at` column via raw SQL (UPDATE task_locks SET expires_at = unixepoch('now') - 1 WHERE task_id = ?)
  - Do NOT mock `Date.now()` — coordinationStore uses SQLite `unixepoch('now')`

**Dependencies:**

- Depends on DWF-DEV-CROSS-3 (pressure-state emitter must be done; Phase 0 complete before Phase 2)
- Blocks DWF-DEV-CROSS-5 (published marker documentation)

**Knowledge needed:**

- `docs/policies/dev-standards.md` — DV pattern, flow rewrite, testing
- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § Detailed Test Strategy (DV-P2-1..7 scope)
- `docs/REQ_DYN-WF-FOUNDATION.md` § Deliberate-Violation Test Matrix (RED-before-GREEN proof)
- Coordination primitives: `task_claim`, `task_heartbeat`, `task_release` from mcp-server tools

**Implementation notes:**

1. **Leader lock lifecycle:**
   - Claim at Step 0b (before dispatch body)
   - Win → proceed with dispatch
   - Lose → silent exit, no dispatch
   - Heartbeat at Step 4.6b (after all slots processed) to extend TTL
   - TTL = 1800s (never default 3600s)

2. **Per-work-item token lifecycle:**
   - Claim before each agent spawn (inside Step 4.6 loop)
   - Key = `cowork-slot:<slot_id>` (NO time suffix, uses slot_id not agent name)
   - TTL = 180s (EXPLICIT, never default)
   - Win → proceed with spawn
   - Lose → log and skip this slot (already running or processing)
   - Agent flow may renew via heartbeat at checkpoints (optional in Phase 2; required in future phases with long-running chains)

3. **Published marker gate (Step 5 instruction):**
   - Document pattern: before each `send_telegram`, call:
     ```
     task_claim(kind="cowork-slot", key="published:<slot_id>:<YYYY-MM-DD>", ttl_seconds=100800)
     ```
   - Only proceed with send if claim succeeds
   - Log on failure: "[cowork] publish blocked — already published work-id=<slot_id>:<date>"

4. **DV test structure (DWF-coordination-phase2.test.ts):**
   - Each DV test has two assertions:
     - Case A (RED test): assert the bug/absence of protection exists (test fails)
     - Case B (GREEN test): assert the fix works (test passes)
   - Both cases in same commit → RED-before-GREEN proof

5. **Code assertion for R1 (AC-P2-6-2):**
   - Add lint check or bun test that parses `docs/agents/cowork-team/flow/main.md`
   - Assert every `task_claim` for `cowork-slot:*` contains literal `ttl_seconds: 180`
   - Grep pattern: `task_claim.*ttl_seconds.*180`
   - Deliberate-violation: remove `ttl_seconds: 180` → lint test goes RED

6. **Update flow size-justification:**
   - Current: ~350L (after CROSS-3 pressure-state emitter)
   - After Phase 2 rewrite: expect ~380–400L
   - Update size-justification comment

---

## RETURN

Upon completion, developer will commit with trailers:

```
feat(cowork-team): Phase 2 leader lock + per-work-item idempotent token (R3+R1 blocking)

Rewrite cowork-team flow: (1) Step 0b leader lock claim (ttl=1800s, explicit);
(2) Step 4.6 per-work-item token (suffix-free key "cowork-slot:<slot_id>",
ttl=180s explicit, required); (3) Step 4.6b heartbeat after dispatch; (4) Step 5
instruction for published marker gate (before send_telegram). Create DWF-coordination-phase2.test.ts
with DV-P2-1..7 (all RED→GREEN). Closes duplicate-dispatch and published-send SPOF.

Task: DWF-DEV-CROSS-4
AC: AC-P2-5-1, AC-P2-5-2, AC-P2-5-3, AC-P2-5-4, AC-P2-6-1, AC-P2-6-2, AC-P2-6-3, AC-P2-6-4, AC-P2-7-1, AC-P2-7-2, AC-P2-7-3, AC-P2-7-4
```

Then PM will unblock DWF-DEV-CROSS-5 (published marker documentation + ops runbook).

---

## [Developer] Implementation Record

- **Files modified:**
  - `docs/agents/cowork-team/flow/main.md:472` — Add Step 0b (leader lock, ttl=1800s), rewrite Step 4.6 (suffix-free key cowork-slot:<slot_id>, ttl=180s), add Step 4.6b (heartbeat), update Step 5 (published marker gate instruction + fix release key to slot_id); remove nominal_tick from per-slot key; update size-justification to 472L
  - `apps/mcp-server/src/infrastructure/db/coordinationStore.ts:277` — Extend TTL cap from 86400s to 604800s to support published markers (28h = 100800s per ARCH-DECIDE-D)
- **Tests written:**
  - `apps/mcp-server/src/__tests__/DWF-coordination-phase2.test.ts` — 21 tests, all GREEN; covers DV-P2-1..7 (single-winner leader lock, suffix-free key blocks duplicate, tick-suffix bug demo, explicit TTL code assertion, 180s crash-frees, 3600s starvation demo, published marker dedup)
- **Git commits:** `288e8888 feat(cowork-team): Phase 2 leader lock + per-work-item idempotent token (R3+R1 blocking)`
- **tsc status:** clean (pre-existing DWF-routing-policy-fence.ts errors unrelated to this task)
- **DV matrix:** DV-P2-1 GREEN (single winner proven), DV-P2-2 GREEN (suffix-free blocks dup), DV-P2-3 GREEN (tick-suffix recreates bug as expected), DV-P2-4 GREEN (explicit ttl:180 present; nominal_tick absent from task_id), DV-P2-5 GREEN (180s frees at 181s), DV-P2-6 GREEN (3600s still held at 181s), DV-P2-7 GREEN (published marker blocks second send)
- **R3 proof:** Step 4.6 key is `cowork-slot:` + `slot.slot_id` — no nominal_tick, no tick suffix. DV-P2-3 demonstrates tick suffix allows duplicate; DV-P2-2 proves suffix-free blocks it.
- **R1 proof:** Step 4.6 contains literal `ttl_seconds: 180`. DV-P2-4 (grep assertion) goes RED if removed. DV-P2-5/DV-P2-6 prove 180s frees at 181s; 3600s does not.
- **Step 4.8 intact:** Step 4.8 (DWF-DEV-CROSS-3 pressure-state emitter) unchanged, verified at line 285.
- **Docs updated:** `docs/handoffs/DWF-DEV-CROSS-4.md` — this record
- **Graphify:** skipped (flow + test file changes; no docs impact beyond handoff)
