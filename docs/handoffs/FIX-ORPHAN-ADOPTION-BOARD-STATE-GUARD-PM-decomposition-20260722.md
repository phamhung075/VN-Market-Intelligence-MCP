# PM Decomposition — FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (fix_spec(a)+(c)/AC1+AC3)

**PM Date:** 2026-07-22T01:21:08Z  
**Decomposed into:** 6 atomic ready tasks + 1 supervised successor row (fix_spec(b)/AC2)  
**Input:** 
- BA spec: `docs/handoffs/FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD-BA-spec.md` (FR-1..FR-8)
- Architect brief: `docs/architecture-briefs/2026-07-22-fix-orphan-adoption-board-state-guard-design.md` (ruling §2-4)
- PO ruling: `docs/data/orch/orch-state.json` .task_board.in_progress[id==FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD].po_ruling

---

## PO Closure Gate — SATISFIED ✓

**Hard precondition:** FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD may NOT flip DONE until a fix_spec(b)/AC2 successor row EXISTS on the board.

**Status:** **SATISFIED** — FIX-SPRINT-TASK-HEARTBEAT-LOCK minted in backlog with supervised:true, P0, inheriting proper lineage and cross-refs.

This decomposition directly addresses the PO ruling's anti-silent-drop mechanism: the successor is now a first-class tracked row under supervision, not an open residual or a stale parent-epic footnote.

---

## 6 Atomic Ready Tasks (fix_spec(a)+(c)/AC1+AC3)

All tasks created in `.task_board.ready[]` with status=READY, priority=P0, supervised=false.

### Task 1: FIX-ORPHAN-FR1-FR2-INFRA-HEARTBEAT-LADDER

**Zone:** `apps/mcp-server/`  
**File:** `apps/mcp-server/src/infrastructure/db/coordinationStore.ts`  
**Implements:** FR-1 (ttl_seconds/payload_patch) + FR-2 (null-session ladder)

**Subtasks:**
1. Add ttl_seconds (60-691200) + payload_patch (JSON string) optional params to `heartbeatTask()`
   - When ttl_seconds supplied → `UPDATE ... SET ttl_seconds = ?, heartbeat_at = ..., expires_at = unixepoch('now') + ?`
   - When payload_patch supplied → SELECT payload, JSON.parse (catch → {} per EC-6), shallow-merge, UPDATE
   - Two statements (not CTE) to preserve existing single-writer pattern

2. Add null-session ladder to `heartbeatTask` + `releaseTask` for orphan-signal rows only
   - Gate: `task_kind === 'orphan-signal' AND owner_client_session IS NULL` (checked via SELECT first)
   - Match: caller `owner_agent === row.owner_agent AND caller.original_owner_client_session === JSON.parse(row.payload).original_owner_client_session`
   - Pattern: SELECT-then-conditional-mutate (mirrors `releaseOrphanTask()` at :864-900)

3. Implement two-statement UPDATE pattern per FR-1 file-level design
   - First UPDATE: ttl_seconds if supplied
   - Second UPDATE: payload_patch merge if supplied
   - Unpatched fields survive unchanged

**Acceptance criteria:**
- heartbeatTask accepts optional ttl_seconds, persists when supplied, reuses existing column when omitted
- payload_patch shallow-merges into payload JSON
- Malformed/absent existing payload handled non-fatally → build fresh object from patch
- Backward compatible: existing callers passing neither param reproduce byte-identical behavior

---

### Task 2: FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS

**Zone:** `apps/mcp-server/`  
**File:** `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts`  
**Implements:** FR-2 (null-session params) + FR-6 (escalation owner_agent) + FR-7 (SSOT prose sync)

**Subtasks:**
1. Add optional `ttl_seconds` to task_heartbeat Zod schema
   - Min: 60, Max: 691200 (same bounds as task_claim)
   - Backward compatible: omitting param = no change
   - Update .describe() prose to document new capability

2. Add optional `payload_patch` to task_heartbeat Zod schema
   - JSON string format, mirrors task_claim's payload convention
   - Backward compatible: omitting = no change
   - Update .describe() prose

3. Add optional `owner_agent` + `original_owner_client_session` to both task_heartbeat + task_release schemas
   - Both params optional
   - .describe() prose documents use for null-session orphan-signal ladder only
   - Live-session locks (owner_client_session NOT NULL) never use these params — they remain gated on sole-key match per P1-FINAL

**Acceptance criteria:**
- Zod schemas match backend params added in Task 1
- .describe() prose does not contradict flow-doc usage (FR-7 SSOT sync)
- NFR-2 backward compat: omitting new params reproduces existing behavior for all existing call sites

---

### Task 3: FIX-ORPHAN-FR1-FR3-FR6-SKILL-DISPATCH-CLAIM

**Zone:** `flow-docs/`  
**File:** `.claude/skills/dispatch-claim/SKILL.md`  
**Implements:** FR-1 (doc-sync) + FR-3 (board-state guard) + FR-6 (escalation call update)

**Subtasks:**
1. Fix SKILL.md :182-184 prose
   - Currently says "no payload_patch in the current MCP surface"
   - Update to document payload_patch now available as optional param to task_heartbeat
   - Aligns prose with escalation block :354-359 which already calls it (contradiction resolved)

2. Implement Orphan-Adoption Probe guard logic (lines 339-373, § Orphan-Adoption Probe)
   - FR-3 step 2: Resolve bare id against `.task_board`, checking **both** shapes:
     * Flat lanes: backlog/ready/in_progress/review/qa/done/done_verified (`.task_board.<lane>[] | select(.id == $bare_id)`)
     * Nested: `.task_board.active_sprints[].tasks[] | select(.id == $bare_id)`
   - FR-3 step 3: Classify by **lane membership**, not bare `.status`:
     * `ready` or `in_progress` (flat) OR nested with `.status` in {TODO, IN_PROGRESS, READY, BLOCKED} → **active** → proceed to adopt
     * `review`, `qa`, `done`, `done_verified` (flat) OR nested with `.status` in {REVIEW, DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED} → **terminal** → skip, best-effort-release
     * `backlog` (flat) → **terminal** (not-yet-dispatched) — per architect §3, no status carve-out for BLOCKED in backlog
     * Not found in any lane → **terminal** (archived/cold-evicted) — never default to active on absence
   - EC-8: Batch-read `.task_board` once per dispatcher tick, not per orphan-signal
   - Run guard **once per signal**, **before** redispatch_count >= N_MAX branch (EC-3)

3. Add owner_agent to escalation heartbeat call at :354-359 (FR-6)
   - Currently: `call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "orphan-signal:" + original_task_id, owner_client_session: $CLAUDE_CODE_SESSION_ID, ttl_seconds: 86400, payload_patch: {"status": "ESCALATED"} })`
   - Add: `owner_agent: <dispatcher-role>`
   - Enables null-session ladder to match this call site

**Acceptance criteria:**
- Board-state guard runs ONCE per signal before escalation/adoption branching
- Guard correctly classifies by lane membership (flat lanes don't default to active on BLOCKED)
- Orphan-signal with lane=backlog routes to terminal (no re-dispatch)
- Not found routes to terminal (no silent default-to-active)
- Batch-read optimization implemented (one jq pass per tick)

---

### Task 4: FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD

**Zone:** `flow-docs/`  
**Files:** 
- Create: `scripts/agents-flow/resolve-task-lane-by-id.jq` (new)
- Update: `docs/agents/dev-team/flow/main.md` Step 0a-B (:280-414)

**Implements:** FR-4 (read-guard) + FR-5 (board-flip write) + shared resolver (architect §2)

**Subtasks:**
1. Create `scripts/agents-flow/resolve-task-lane-by-id.jq` per architect ruling §2
   - Single, shared jq filter for "find a task_board row by id across both shapes"
   - Resolves task_id with or without "task:" prefix (EC-1)
   - Returns `{lane, status}` map indexed by bare id (one pass, reusable for both READ and WRITE)
   - Canonicalize as SSOT per Script Persistence rule, add pointer in owning flow doc

2. Implement FR-4 read-guard in Step 0a-B (before :365-370 release branch)
   - Per FR-4: guard text must be a **pointer to dispatch-claim/SKILL.md** (not re-pasted copy — EC-4 pattern)
   - Apply identical lane-resolution as FR-3 SKILL.md guard
   - Run BEFORE redispatch_count >= N_MAX branch
   - Use resolve-task-lane-by-id.jq output

3. Fix board-flip write at :383-388 (FR-5)
   - **Current defect:** only targets `.task_board.active_sprints[].tasks[]` (EC-2: misses 95%+ of board on flat lanes)
   - **Current defect:** never strips "task:" prefix from $tid (EC-1: always no-op match)
   - **Fix:** use resolve-task-lane-by-id.jq to get lane → target `.task_board[$lane][] | select(.id == $bare_id)`
   - **Fix:** strip prefix in jq before lookup (no second ltrimstr call — shared resolver already handles it)
   - Both defects byte-identical to FR-3/FR-4 guard defects → bundling justifies same commit (architect §2 rationale: same file, same developer context, low marginal cost)

4. Update task_release call sites for orphan-signal cleanup (FR-2 now functional)
   - `:365-370` (git_sha invalid branch): task_release("orphan-signal:" + original_task_id, owner_client_session)
   - `:391-394` (normal cleanup): same call
   - These now succeed via null-session ladder (previously no-ops)

**Acceptance criteria:**
- resolve-task-lane-by-id.jq script exists and is SSOT for lane resolution
- dev-team Step 0a-B read-guard points to SKILL.md (no duplicate copy)
- Board-flip write targets correct lane via shared resolver (flat lanes now work)
- Prefix stripping handled in shared resolver (no duplication)
- task_release calls include owner_agent for orphan-signal ladder
- Adoptions to flat-lane tasks now leave board trace (assigned_to/adopted_at/tree_hygiene_note populate)

---

### Task 5: FIX-ORPHAN-FR8-TEST-COORDINATION-STORE

**Zone:** `apps/mcp-server/`  
**File:** `apps/mcp-server/src/infrastructure/__tests__/coordinationStore.test.ts` (new)  
**Implements:** FR-8 (test coverage) + NFR-1 (regression gate)

**Subtasks:**
1. Test heartbeat with ttl_seconds
   - Verify: new TTL persists to row.ttl_seconds
   - Verify: unpatched fields survive
   - Verify: backward compat (omitting ttl_seconds = no change)

2. Test heartbeat with payload_patch
   - Verify: payload_patch shallow-merges into existing payload JSON
   - Verify: malformed existing payload handled non-fatally (build fresh from patch)
   - Verify: null existing payload handled non-fatally
   - Verify: unpatched payload fields survive merge

3. Test null-session ladder
   - Verify: orphan-signal:* with owner_client_session=NULL matches on (owner_agent + original_owner_client_session echo)
   - Verify: wrong owner_agent fails
   - Verify: wrong original_owner_client_session echo fails
   - Verify: correct params succeed

4. **Regression guard for NFR-1** (load-bearing)
   - Verify: null-session ladder NEVER matches a row with owner_client_session NOT NULL
   - Verify: even if caller-supplied owner_agent/echo happen to match, live-session rows stay protected
   - Verify: P1-FINAL sole-key match invariant cannot be bypassed via task_kind or caller-supplied flags

5. Test-before-ship gate (FR-8, architect brief Risk note)
   - Live integration round-trip against running container:
     * Claim → heartbeat with ttl_seconds/payload_patch → list_held shows updated values
     * Orphan-signal claim → heartbeat via null-session ladder → list_held shows patch
   - **Gate:** FR-3/FR-4/FR-6 prose cannot ship as "available" until this passes
   - Depends on user-approved container rebuild (NFR-3)

**Acceptance criteria:**
- All 5 subtasks implemented and passing
- Test suite covers edge cases (malformed payload, null payload, backward compat)
- NFR-1 regression guard explicitly tested (cannot bypass via caller tricks)
- Live integration round-trip documented and passing before prose flips to "available"

---

### Task 6: FIX-ORPHAN-FR7-VERIFY-TOOL-REGISTRY

**Zone:** `docs/`  
**File:** `docs/data/tool-registry.json`  
**Implements:** FR-7 (SSOT verification)

**Subtasks:**
1. Verify tool-registry.json entries for task_heartbeat and task_release
   - Tool-registry uses name-only references (not per-tool schema payload duplication)
   - Confirm no edit needed (expected: tool entries stay current via existing registration at tool registration time)
   - If any edit needed, document and apply

**Acceptance criteria:**
- tool-registry.json verified (likely no-op, confirmed)
- If changes needed, documented and committed in this subtask

---

## Successor Row — fix_spec(b)/AC2

**ID:** FIX-SPRINT-TASK-HEARTBEAT-LOCK  
**Status:** BACKLOG (awaiting FIX-ORPHAN ship + QA-verify)  
**Priority:** P0  
**Supervised:** true  
**Depends on:** FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD  
**Minted by:** PM decomposition, 2026-07-22T01:21:08Z

**Scope:**
- I10 precursor: bind owner_client_session to execute-tier.md claim + release (both :42-48 and :64)
- AC2 core: raise sprint-task TTL + implement heartbeat loop in try block
- Doc-sync: update TTL references across 3 SSOT docs (task-lock/SKILL.md, developer.md, fail-loud-protocol.md)
- INV-GATEWAY-1 cleanup: remove dead lock calls from developer/qa flows

**Subtasks (ordered per architect §4):**

1. **I10 PRECURSOR** (seq 1, required_before_qa)
   - Add `owner_client_session: $CLAUDE_CODE_SESSION_ID` to execute-tier.md:42-48 claim call
   - Add `owner_client_session: $CLAUDE_CODE_SESSION_ID` to execute-tier.md:64 release call
   - **Why first:** cannot correctly heartbeat a lock using a session key never bound at claim time; this is hard implementation precondition for AC2 heartbeat-loop

2. **TTL + HEARTBEAT LOOP** (seq 2, depends_on_seq=[1])
   - Raise TTL at execute-tier.md:46 from 3600 to configurable (recommend 7200 or higher)
   - Implement heartbeat loop inside `try` block (not main.md Step 3)
   - Heartbeat every TTL/3 interval, calling `task_heartbeat(task_id, owner_client_session)` with same session key bound at claim time
   - **Why depends on seq 1:** heartbeat loop only works if lock was claimed with valid session key

3. **DOC SYNC** (seq 3, depends_on_seq=[2], SAME commit as seq 2)
   - `.claude/skills/task-lock/SKILL.md:33` quick-ref → update TTL
   - `docs/agents/tools/package/developer.md:69` → update TTL
   - `docs/protocols/fail-loud-protocol.md:71` → update TTL ("dev-* rely on TTL expiry (3600s max)")
   - All three move together, no separate defer (code ships, doc keeps in sync — FR-1 anti-pattern)
   - **Why same commit:** TTL value change requires coordinated doc updates

4. **INV-GATEWAY-1 CLEANUP** (seq 4, independent)
   - `docs/agents/developer/flow/main.md:69` task_release call → DELETE
   - `docs/agents/developer/flow/main.md:91-95` task_heartbeat calls → DELETE
   - `docs/agents/qa/flow/main.md:139` task_release call → DELETE
   - Dispatcher now owns TTL/heartbeat end-to-end; specialists never hold gateway tool
   - **Why independent:** different files, no shared runtime state, no ordering dependency on 1-3 (but sequence last so cleanup note truthfully says "dispatcher now owns")

**Rationale for separate row:**
- Two independent deploy/QA cycles: (a)+(c) is container-rebuild-gated, addresses MATERIALIZED incident; (b) is flow-doc/TTL prophectic
- I10 precursor is hard implementation dependency for heartbeat correctness
- TTL raise has NFR-3 user-gated container rebuild gate
- INV-GATEWAY-1 cleanup is independently shippable (different files, different owners)
- Separate supervised row keeps PO/architect discipline visible: both waves supervised, both P0, both explicit

**Closure gate:**
- This row's DONE flip unblocks FIX-ORPHAN from its hard precondition (PO ruling)
- FIX-ORPHAN can only flip DONE once this successor EXISTS (check ✓) AND completes

---

## File-Level Change Summary

### New files
- `scripts/agents-flow/resolve-task-lane-by-id.jq` — shared lane-resolution SSOT

### Modified files
- `apps/mcp-server/src/infrastructure/db/coordinationStore.ts` — FR-1/FR-2 impl
- `apps/mcp-server/src/interface/mcp/tools/system/coordinationTools.ts` — FR-2/FR-6/FR-7
- `.claude/skills/dispatch-claim/SKILL.md` — FR-1/FR-3/FR-6
- `docs/agents/dev-team/flow/main.md` — FR-4/FR-5
- `docs/data/tool-registry.json` — FR-7 verification (likely no-op)
- `apps/mcp-server/src/infrastructure/__tests__/coordinationStore.test.ts` — FR-8 (new)

### Follow-on (successor row, fix_spec(b)/AC2)
- `docs/agents/dev-team/flow/execute-tier.md` — I10, TTL, heartbeat
- `.claude/skills/task-lock/SKILL.md` — TTL doc-sync
- `docs/agents/tools/package/developer.md` — TTL doc-sync
- `docs/protocols/fail-loud-protocol.md` — TTL doc-sync
- `docs/agents/developer/flow/main.md` — INV-GATEWAY-1 cleanup
- `docs/agents/qa/flow/main.md` — INV-GATEWAY-1 cleanup

---

## Ordering Guidance for Developers

**Parallel tiers (no cross-file conflicts):**
- Task 1 + Task 3 can run parallel (Task 1: coordinationStore.ts, Task 3: SKILL.md)
- Task 6 can run parallel with others (tool-registry.json verification)

**Sequential dependencies:**
- Task 2 depends on Task 1 (Zod schemas consume heartbeatTask params)
- Task 4 depends on Task 1 + Task 2 (board-flip jq depends on functional FR-2)
- Task 5 depends on Task 1 + Task 2 (tests cover FR-1/FR-2 impl)

**Recommended sequence:**
1. Task 1 (FR-1/FR-2 infra) — unblocks Task 2, Task 4, Task 5
2. Task 3 (SKILL.md) — parallel with Task 1 if two devs available
3. Task 2 (Zod schemas) — after Task 1
4. Task 4 (dev-team flow) — after Task 1 + Task 2
5. Task 5 (tests) — after Task 1 + Task 2 (includes live container round-trip gate)
6. Task 6 (tool-registry) — anytime (likely no-op verification)

**Container rebuild gate (NFR-3):**
- Server code (Task 1, 2) lands and rebuilds BEFORE flow-doc prose (Task 3, 4, 6) flips to "available"
- Test-before-ship gate (Task 5, step 5) must pass before FR-3/FR-4/FR-6 prose describes new capability as live

---

## Return & Handoff

**DONE:** PM decomposition complete (6 atomic ready tasks + 1 supervised successor).

**RETURN CONDITION:** This row (FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD) flips status → IN_PROGRESS after these tasks finish, OR flips status → REVIEW after QA-verify of Tasks 1-6, per dev-team's board-state machine (SSOT-STATUSFLIP-LANEMOVE rule: status flip MUST move lane-membership in same write).

**NEXT AGENT:** developer/qa (tasks 1-6 execute via dev-team dispatch); architect (successor design when ready).

**CRITICAL REMINDER:**
- Successor row (FIX-SPRINT-TASK-HEARTBEAT-LOCK) EXISTENCE satisfies PO hard closure_gate — FIX-ORPHAN cannot flip DONE without it (now minted ✓)
- Successor row must complete to fully resolve supervision hold
- No silent drop: each task is explicit, tracked, and cross-linked

---

**Commit:** fd401f51e chore(pm): decompose FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD into 6 atomic tasks + mint fix_spec(b)/AC2 successor
